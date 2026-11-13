import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

//! SYNC-9: Link account starts with the server to link to: LawFive's hosted service, or your own,
//! typed on the watch (Garmin's keyboard on touch watches, its letter scroller on button watches)
//! and checked to be a LawFive server before it's kept.
class LinkMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("Link account")});
        addItem(new WatchUi.MenuItem("Server", serverLabel(), :server, null));
        addItem(new WatchUi.MenuItem("Get a code", "Website or LawFive app", :code, null));
        setFocus(listFocus(1));
    }

    //! Back from choosing the server: show the new one.
    function onShow() as Void {
        var item = getItem(0);
        if (item != null) {
            item.setSubLabel(serverLabel());
        }
        Menu2.onShow();
    }
}

function serverLabel() as String {
    return Sync.isHosted() ? "LawFive (hosted)" : Sync.serverHost();
}

class LinkMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        if (item.getId() == :server) {
            var menu = systemMenu("Server");
            menu.addItem(new WatchUi.MenuItem("LawFive (hosted)", "lawfive.app", :hosted, null));
            menu.addItem(new WatchUi.MenuItem("My own server", Sync.isHosted() ? "Type its address" : Sync.serverHost(), :own, null));
            menu.setFocus(listFocus(Sync.isHosted() ? 0 : 1));
            WatchUi.pushView(menu, new ServerMenuDelegate(), WatchUi.SLIDE_LEFT);
        } else {
            var view = new LinkView();
            WatchUi.pushView(view, new LinkDelegate(view), WatchUi.SLIDE_LEFT);
        }
    }
}

class ServerMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        if (item.getId() == :hosted) {
            Sync.chooseServer(Sync.DEFAULT_SERVER);
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        } else {
            typeServer();
        }
    }
}

//! Opens the watch's text entry for a server address, starting from the current one.
function typeServer() as Void {
    var current = Sync.isHosted() ? "https://" : Sync.serverUrl();
    WatchUi.pushView(new WatchUi.TextPicker(current), new ServerTextDelegate(), WatchUi.SLIDE_LEFT);
}

class ServerTextDelegate extends WatchUi.TextPickerDelegate {
    function initialize() {
        TextPickerDelegate.initialize();
    }

    function onTextEntered(text as String, changed as Boolean) as Boolean {
        var url = Sync.typedServer(text);
        if (url != null) {
            // The text entry closes itself after this returns, so the check opens just after.
            new ServerCheckStarter(url).start();
        }
        return true;
    }

    function onCancel() as Boolean {
        return true;
    }
}

class ServerCheckStarter {
    private var _url as String;
    private var _timer as Timer.Timer = new Timer.Timer();

    function initialize(url as String) {
        _url = url;
    }

    function start() as Void {
        _timer.start(method(:open), 100, false);
    }

    //! In place of the Server menu (or an earlier check), so Back returns to Link account.
    function open() as Void {
        var view = new ServerCheckView(_url);
        WatchUi.switchToView(view, new ServerCheckDelegate(view), WatchUi.SLIDE_IMMEDIATE);
    }
}

//! Asks the typed address for /v1/meta and keeps it only if a LawFive server answers.
class ServerCheckView extends WatchUi.View {
    var state as Symbol = :checking;
    var url as String;
    private var _message as String = "";

    function initialize(address as String) {
        View.initialize();
        url = address;
    }

    function onShow() as Void {
        if (state == :checking) {
            Communications.makeWebRequest(url + "/v1/meta", null, {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            }, method(:onMeta));
        }
    }

    function onMeta(code as Number, data as Dictionary or String or Null) as Void {
        var product = data instanceof Dictionary ? data["product"] : null;
        if (code == 200 && product instanceof String && product.equals("LawFive")) {
            Sync.chooseServer(url);
            state = :found;
        } else {
            state = :problem;
            _message = code == 200 || code == 404 ? "No LawFive server there" : Sync.problemFor(code);
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.24).toNumber(), Graphics.FONT_XTINY, "Server", center);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        var at = url.find("://");
        var host = at != null ? url.substring(at + 3, url.length()) as String : url;
        var hostLines = wrap(dc, host, Graphics.FONT_XTINY, (w * 0.7).toNumber());
        var y = (h * 0.24).toNumber() + dc.getFontHeight(Graphics.FONT_XTINY);
        for (var i = 0; i < hostLines.size() && i < 2; i++) {
            dc.drawText(w / 2, y, Graphics.FONT_XTINY, hostLines[i], center);
            y += dc.getFontHeight(Graphics.FONT_XTINY);
        }
        var title = state == :checking ? "Checking…" : state == :found ? "Found LawFive" : _message;
        var detail = state == :checking ? "Keep your phone nearby" : state == :found ? "Start: continue" : "Start: type again";
        dc.setColor(state == :found ? COLOR_START : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        var lines = wrap(dc, title, Graphics.FONT_SMALL, (w * 0.75).toNumber());
        y = (h * 0.55).toNumber();
        for (var i = 0; i < lines.size(); i++) {
            dc.drawText(w / 2, y, Graphics.FONT_SMALL, lines[i], center);
            y += dc.getFontHeight(Graphics.FONT_SMALL);
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, y + 4, Graphics.FONT_XTINY, detail, center);
    }
}

//! Start (or a tap) carries on once found, or types the address again; Back returns to Link account.
class ServerCheckDelegate extends TapAwareDelegate {
    private var _view as ServerCheckView;

    function initialize(view as ServerCheckView) {
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
        if (_view.state == :found) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        } else if (_view.state == :problem) {
            typeServer();
        }
        return true;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
