import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

//! SYNC-1: linking the watch to a LawFive account. The watch asks the server for a code and shows
//! it with the address to enter it at; someone signed in approves it there; the watch, checking
//! every few seconds, then gets its token, downloads the next matches and says so.
class LinkView extends WatchUi.View {
    //! What the screen is showing.
    var state as Symbol = :asking;
    var code as String = "";
    var address as String = "";
    var message as String = "";
    private var _deviceCode as String = "";
    //! SYNC-2: the server the code came from, which the token is asked from and kept with.
    private var _server as String = "";
    private var _intervalMs as Number = 5000;
    private var _expiresAt as Number = 0;
    private var _timer as Timer.Timer? = null;
    private var _active as Boolean = false;

    function initialize() {
        View.initialize();
    }

    //! SYNC-13: the phone app is linking this watch to `host`; no code.
    function byPhone(host as String) as Void {
        state = :phone;
        address = host;
        message = "";
    }

    //! SYNC-13: the phone sent the token; the watch is linked and gets its matches.
    function linkedByPhone() as Void {
        state = :linked;
        message = "Getting your matches…";
        WatchUi.requestUpdate();
        Sync.run(method(:onSynced));
    }

    //! SYNC-13: linking through the phone didn't work.
    function phoneProblem(text as String) as Void {
        state = :phoneProblem;
        message = text;
        WatchUi.requestUpdate();
    }

    function onShow() as Void {
        _active = true;
        if (state == :asking) {
            requestCode();
        }
    }

    function onHide() as Void {
        // Leaving the screen stops the checking; coming back asks for a fresh code.
        _active = false;
        stopTimer();
        if (state == :waiting) {
            state = :asking;
        }
    }

    function requestCode() as Void {
        state = :asking;
        message = "";
        WatchUi.requestUpdate();
        _server = Sync.unlinkedServerUrl();
        Communications.makeWebRequest(_server + "/v1/auth/device/code", {"client_id" => Sync.CLIENT_ID}, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {"Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON, "X-LawFive-Device" => Sync.deviceHeader()},
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, method(:onCode));
    }

    function onCode(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (!_active) {
            return;
        }
        if (responseCode != 200 || !(data instanceof Dictionary) || !(data["user_code"] instanceof String)) {
            showProblem(Sync.problemFor(responseCode));
            return;
        }
        var userCode = data["user_code"] as String;
        code = userCode.length() == 8 ? userCode.substring(0, 4) + "-" + userCode.substring(4, 8) : userCode;
        address = withoutScheme(stringOr(data["verification_uri"] as String?, _server + "/link"));
        _deviceCode = data["device_code"] as String;
        var interval = data["interval"];
        _intervalMs = (interval instanceof Number ? interval : 5) * 1000;
        var expires = data["expires_in"];
        _expiresAt = Time.now().value() + (expires instanceof Number ? expires : 600);
        state = :waiting;
        WatchUi.requestUpdate();
        scheduleCheck();
    }

    private function scheduleCheck() as Void {
        stopTimer();
        var timer = new Timer.Timer();
        timer.start(method(:check), _intervalMs, false);
        _timer = timer;
    }

    function check() as Void {
        if (!_active || state != :waiting) {
            return;
        }
        if (Time.now().value() > _expiresAt) {
            state = :expired;
            message = "Code expired";
            WatchUi.requestUpdate();
            return;
        }
        Communications.makeWebRequest(_server + "/v1/auth/device/token", {
            "grant_type" => "urn:ietf:params:oauth:grant-type:device_code",
            "device_code" => _deviceCode,
            "client_id" => Sync.CLIENT_ID
        }, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {"Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON, "X-LawFive-Device" => Sync.deviceHeader()},
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, method(:onToken));
    }

    function onToken(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (!_active || state != :waiting) {
            return;
        }
        if (responseCode == 200 && data instanceof Dictionary && data["access_token"] instanceof String) {
            Sync.linkWith(data["access_token"] as String, _server);
            state = :linked;
            message = "Getting your matches…";
            WatchUi.requestUpdate();
            Sync.run(method(:onSynced));
            return;
        }
        var error = data instanceof Dictionary ? data["error"] : null;
        if (error instanceof String && error.equals("access_denied")) {
            showProblem("Not linked");
        } else if (error instanceof String && error.equals("expired_token")) {
            state = :expired;
            message = "Code expired";
            WatchUi.requestUpdate();
        } else {
            if (error instanceof String && error.equals("slow_down")) {
                _intervalMs += 5000;
            }
            // Still waiting (or the phone missed a beat): check again.
            scheduleCheck();
        }
    }

    function onSynced(ok as Boolean) as Void {
        var count = Sync.matches().size();
        message = ok ? (count == 1 ? "1 match on the watch" : count + " matches on the watch") : Sync.status();
        WatchUi.requestUpdate();
    }

    private function showProblem(text as String) as Void {
        state = :problem;
        message = text;
        WatchUi.requestUpdate();
    }

    private function stopTimer() as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
            _timer = null;
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25

        if (state == :waiting) {
            // Short lines: the top and bottom of a round screen are narrow.
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            // SYNC-1: the website, or Link a watch in either phone app, takes the code.
            dc.drawText(w / 2, (h * 0.24).toNumber(), Graphics.FONT_XTINY, "Enter this code at", center);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            var addressLines = wrap(dc, address, Graphics.FONT_XTINY, (w * 0.78).toNumber());
            var y = (h * 0.33).toNumber();
            for (var i = 0; i < addressLines.size(); i++) {
                dc.drawText(w / 2, y, Graphics.FONT_XTINY, addressLines[i], center);
                y += dc.getFontHeight(Graphics.FONT_XTINY);
            }
            // The code, large, on a dark band so it reads at a glance.
            var font = dc.getTextWidthInPixels(code, Graphics.FONT_LARGE) < w * 0.78 ? Graphics.FONT_LARGE : Graphics.FONT_MEDIUM;
            var bandH = dc.getFontHeight(font) + 16;
            var bandY = (h * 0.55).toNumber() - bandH / 2;
            dc.setColor(0x1E2A24, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle((w * 0.08).toNumber(), bandY, (w * 0.84).toNumber(), bandH, 12);
            dc.setColor(COLOR_START, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 0.55).toNumber(), font, code, center);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            // The shorter words where the longer don't fit the round screen's narrowing foot.
            var phone = "or in the LawFive phone app";
            if (dc.getTextWidthInPixels(phone, Graphics.FONT_XTINY) > w * 0.8) {
                phone = "or in the LawFive app";
            }
            dc.drawText(w / 2, (h * 0.75).toNumber(), Graphics.FONT_XTINY, phone, center);
            dc.drawText(w / 2, (h * 0.84).toNumber(), Graphics.FONT_XTINY, "Waiting…", center);
            return;
        }

        var title = state == :linked ? "Linked" : state == :asking ? "Getting a code…" : state == :phone ? "Linking…" : message;
        var detail = state == :linked ? message
            : state == :asking || state == :phone ? "Keep your phone nearby"
            : state == :phoneProblem ? "Try again from the phone app"
            : "Press Start to try again";
        if (state != :linked) {
            // Which server it's asking (SYNC-8), so a wrong one is plain to see.
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 0.24).toNumber(), Graphics.FONT_XTINY, "Server", center);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            var hostLines = wrap(dc, state == :phone || state == :phoneProblem ? address : Sync.serverHost(), Graphics.FONT_XTINY, (w * 0.7).toNumber());
            var hostY = (h * 0.24).toNumber() + dc.getFontHeight(Graphics.FONT_XTINY);
            for (var i = 0; i < hostLines.size() && i < 2; i++) {
                dc.drawText(w / 2, hostY, Graphics.FONT_XTINY, hostLines[i], center);
                hostY += dc.getFontHeight(Graphics.FONT_XTINY);
            }
        }
        if (state == :linked) {
            dc.setColor(COLOR_START, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(w / 2, (h * 0.32).toNumber(), (w * 0.09).toNumber());
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(4);
            var cx = w / 2;
            var cy = (h * 0.32).toNumber();
            var s = (w * 0.04).toNumber();
            dc.drawLine(cx - s, cy, cx - s / 3, cy + s * 2 / 3);
            dc.drawLine(cx - s / 3, cy + s * 2 / 3, cx + s, cy - s * 2 / 3);
            dc.setPenWidth(1);
        }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        var lines = wrap(dc, title, Graphics.FONT_SMALL, (w * 0.75).toNumber());
        var y = (h * 0.52).toNumber();
        for (var i = 0; i < lines.size(); i++) {
            dc.drawText(w / 2, y, Graphics.FONT_SMALL, lines[i], center);
            y += dc.getFontHeight(Graphics.FONT_SMALL);
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        var detailLines = wrap(dc, detail, Graphics.FONT_XTINY, (w * 0.7).toNumber());
        y += 4;
        for (var i = 0; i < detailLines.size(); i++) {
            dc.drawText(w / 2, y, Graphics.FONT_XTINY, detailLines[i], center);
            y += dc.getFontHeight(Graphics.FONT_XTINY);
        }
    }

    private function withoutScheme(url as String) as String {
        var at = url.find("://");
        return at != null ? url.substring(at + 3, url.length()) as String : url;
    }
}

//! Start (or a tap) tries again after a problem, or closes the screen once linked; Back leaves.
class LinkDelegate extends TapAwareDelegate {
    private var _view as LinkView;

    function initialize(view as LinkView) {
        TapAwareDelegate.initialize();
        _view = view;
    }

    function onStartButton() as Boolean {
        return act();
    }

    function onScreenTap(x as Number, y as Number) as Boolean {
        return act();
    }

    private function act() as Boolean {
        if (_view.state == :problem || _view.state == :expired) {
            _view.requestCode();
        } else if (_view.state == :linked) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        }
        return true;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
