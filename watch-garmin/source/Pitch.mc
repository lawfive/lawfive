import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// Marking the pitch's corners (TRK-13): walk to each corner and press Start (or tap); a few
// seconds of GPS there are averaged into it. Two to four corners, in any order: after the second,
// Back saves them, and the fourth saves them straight away. They go to LawFive at the next sync
// (SYNC-12), which places and turns the pitch for heatmaps.

const PITCH_MAX_CORNERS = 4;
//! How long each corner's position is averaged over.
const PITCH_AVERAGE_MS = 5000;

class PitchMarkView extends WatchUi.View {
    var corners as Array<Dictionary> = [] as Array<Dictionary>;
    //! While a corner is being averaged: its fixes so far and when it started.
    var sampling as Boolean = false;
    // Doubles: a single-precision float holds a longitude only to about a metre, and sums lose more.
    private var _sum as Array<Double> = [0.0d, 0.0d] as Array<Double>;
    private var _count as Number = 0;
    private var _quality as Number = Position.QUALITY_NOT_AVAILABLE;
    private var _message as String? = null;
    //! When the corner being averaged is done (System.getTimer()).
    private var _until as Number = 0;
    //! The one timer (watches allow few): it reads the position, and ends a corner's averaging.
    private var _poll as Timer.Timer? = null;
    private var _target as Dictionary;

    //! `target` names the match: {"matchId"} for a planned one, {"created"} for a quick one.
    function initialize(target as Dictionary) {
        View.initialize();
        _target = target;
    }

    function onShow() as Void {
        Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        // The position is also read once a second, as events can be sparse while standing still.
        var poll = new Timer.Timer();
        poll.start(method(:poll), 1000, true);
        _poll = poll;
    }

    function onHide() as Void {
        sampling = false;
        var poll = _poll;
        if (poll != null) {
            poll.stop();
            _poll = null;
        }
        Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));
    }

    function poll() as Void {
        onPosition(Position.getInfo());
        if (sampling && System.getTimer() >= _until) {
            sampled();
        }
    }

    function onPosition(info as Position.Info) as Void {
        var accuracy = info.accuracy;
        _quality = accuracy != null ? accuracy : Position.QUALITY_NOT_AVAILABLE;
        if (_quality >= Position.QUALITY_USABLE && "Waiting for GPS".equals(_message)) {
            _message = null;
        }
        var position = info.position;
        if (sampling && position != null && _quality >= Position.QUALITY_USABLE) {
            var degrees = position.toDegrees();
            _sum[0] += degrees[0].toDouble();
            _sum[1] += degrees[1].toDouble();
            _count += 1;
        }
        WatchUi.requestUpdate();
    }

    //! Start (or a tap): average the next few seconds of GPS into this corner.
    function mark() as Void {
        if (sampling || corners.size() >= PITCH_MAX_CORNERS) {
            return;
        }
        if (_quality < Position.QUALITY_USABLE) {
            _message = "Waiting for GPS";
            WatchUi.requestUpdate();
            return;
        }
        sampling = true;
        _sum = [0.0d, 0.0d] as Array<Double>;
        _count = 0;
        _message = null;
        _until = System.getTimer() + PITCH_AVERAGE_MS;
        WatchUi.requestUpdate();
    }

    function sampled() as Void {
        sampling = false;
        if (_count == 0) {
            _message = "No GPS fix: try again";
        } else {
            corners.add({"lat" => _sum[0] / _count, "lon" => _sum[1] / _count});
            Alerts.vibrate([new Attention.VibeProfile(60, 200)]);
            if (corners.size() >= PITCH_MAX_CORNERS) {
                save();
                return;
            }
        }
        WatchUi.requestUpdate();
    }

    //! Two or more corners go to the outbox and off at the next sync; fewer are dropped.
    function save() as Void {
        sampling = false;
        if (corners.size() >= 2) {
            Sync.queuePitch(_target, corners);
            Sync.run(null);
        }
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        var done = corners.size();

        dc.drawText(w / 2, (h * 0.21).toNumber(), Graphics.FONT_SMALL, done >= PITCH_MAX_CORNERS ? "Pitch marked" : "Corner " + (done + 1), center);

        // A small pitch with its corners: the marked ones filled in green.
        var pw = (w * 0.36).toNumber();
        var ph = (pw * 0.62).toNumber();
        var left = (w - pw) / 2;
        var top = (h * 0.42).toNumber() - ph / 2;
        dc.setPenWidth(2);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawRectangle(left, top, pw, ph);
        dc.drawLine(w / 2, top, w / 2, top + ph);
        var spots = [[left, top], [left + pw, top], [left + pw, top + ph], [left, top + ph]] as Array<Array<Number>>;
        for (var i = 0; i < PITCH_MAX_CORNERS; i++) {
            if (i < done) {
                dc.setColor(COLOR_START, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(spots[i][0], spots[i][1], 7);
            } else {
                dc.setColor(i == done && sampling ? Graphics.COLOR_WHITE : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.fillCircle(spots[i][0], spots[i][1], 5);
            }
        }

        var line = _message;
        if (line == null) {
            line = sampling ? "Hold still…" : "Stand on a corner, then Start";
        }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.62).toNumber(), Graphics.FONT_XTINY, line, center);
        dc.setColor(_quality >= Position.QUALITY_GOOD ? COLOR_START : _quality >= Position.QUALITY_USABLE ? Graphics.COLOR_YELLOW : Graphics.COLOR_LT_GRAY,
            Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.71).toNumber(), Graphics.FONT_XTINY, gpsText(), center);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.81).toNumber(), Graphics.FONT_XTINY, done >= 2 ? "Back saves " + done + " corners" : "Back to leave", center);
    }

    private function gpsText() as String {
        if (_quality >= Position.QUALITY_GOOD) {
            return "GPS good";
        } else if (_quality >= Position.QUALITY_USABLE) {
            return "GPS usable";
        } else if (_quality >= Position.QUALITY_POOR) {
            return "GPS poor";
        }
        return "Finding GPS…";
    }
}

class PitchMarkDelegate extends TapAwareDelegate {
    private var _view as PitchMarkView;

    function initialize(view as PitchMarkView) {
        TapAwareDelegate.initialize();
        _view = view;
    }

    function onStartButton() as Boolean {
        _view.mark();
        return true;
    }

    function onScreenTap(x as Number, y as Number) as Boolean {
        _view.mark();
        return true;
    }

    function onBack() as Boolean {
        _view.save();
        return true;
    }
}
