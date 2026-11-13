import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

const COLOR_SYNC_TRACK = 0x2A2A2A;
const SYNC_CLOSE_MS = 3000;

//! UI-26: matches and tracks on their way, in full: a ring for how far it's got and what's going now.
//! Back leaves it to carry on. It says when it's done and closes itself; if it stops, it says why.
class SyncView extends WatchUi.View {
    private var _timer as Timer.Timer? = null;
    private var _ended as Boolean = false;
    private var _closeIn as Number = SYNC_CLOSE_MS;

    function initialize() {
        View.initialize();
        // UI-26: it may come up just to say a sync that ran under a menu went through.
        _ended = !Sync.isRunning();
    }

    function onShow() as Void {
        var timer = new Timer.Timer();
        timer.start(method(:onTimer), 500, true);
        _timer = timer;
    }

    function onHide() as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
        }
        _timer = null;
    }

    function onTimer() as Void {
        if (!Sync.isRunning()) {
            _ended = true;
            // A problem stays, to be read.
            if (Sync.lastProblem == null) {
                _closeIn -= 500;
                if (_closeIn <= 0) {
                    WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
                    return;
                }
            }
        }
        WatchUi.requestUpdate();
    }

    function isEnded() as Boolean {
        return _ended;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        // UI-25: lower than on other screens, inside the ring.
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.14).toNumber(), Graphics.FONT_XTINY, timeOfDay(), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        var problem = _ended ? Sync.lastProblem : null;
        var fraction = _ended && problem == null ? 1.0 : Sync.stepsTotal > 0 ? Sync.stepsDone.toFloat() / Sync.stepsTotal : 0.0;
        var thick = (w * 0.025).toNumber() + 2;
        var r = w / 2 - thick;
        dc.setPenWidth(thick);
        dc.setColor(COLOR_SYNC_TRACK, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(w / 2, h / 2, r);
        if (fraction >= 1.0) {
            dc.setColor(problem == null ? COLOR_ICON_CIRCLE : COLOR_SYNC_TRACK, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(w / 2, h / 2, r);
        } else if (fraction > 0.0) {
            dc.setColor(COLOR_ICON_CIRCLE, Graphics.COLOR_TRANSPARENT);
            dc.drawArc(w / 2, h / 2, r, Graphics.ARC_CLOCKWISE, 90, (450 - (360 * fraction).toNumber()) % 360);
        }
        dc.setPenWidth(1);

        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        var title = problem != null ? "Sync paused" : _ended ? "All synced" : "Syncing";
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.30).toNumber(), Graphics.FONT_SMALL, title, center);
        if (problem != null) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 0.47).toNumber(), Graphics.FONT_XTINY, problem, center);
            dc.drawText(w / 2, (h * 0.58).toNumber(), Graphics.FONT_XTINY, "Nothing's lost: it tries again", center);
        } else if (_ended) {
            var sent = Sync.matchesSentLast;
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 0.50).toNumber(), Graphics.FONT_XTINY, sent == 1 ? "1 match sent" : sent > 1 ? sent + " matches sent" : "Tracks sent", center);
        } else {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 0.44).toNumber(), Graphics.FONT_XTINY, Sync.stepLabel, center);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, (h * 0.57).toNumber(), Graphics.FONT_MEDIUM, Sync.stepCount, center);
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.78).toNumber(), Graphics.FONT_XTINY, _ended ? "Back: close" : "Back: it keeps going", center);
    }
}

class SyncViewDelegate extends WatchUi.BehaviorDelegate {
    private var _view as SyncView;

    function initialize(view as SyncView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        return true;
    }

    //! A tap or Start closes it once it's finished; until then there's nothing to press by accident.
    function onSelect() as Boolean {
        if (_view.isEnded()) {
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        }
        return true;
    }
}

//! UI-26: called every second. Comes up once a sync, when matches or tracks are going and the
//! home screen or the full-time screen is showing, so it never takes over a match being played or a
//! menu in use. With no phone at full time it stays away, as the full-time screen already says so.
function offerSyncView() as Void {
    if (!Sync.wantsScreen()) {
        return;
    }
    var match = getLawFiveApp().match;
    var menu = StartMenu.current;
    var free = match == null
        ? menu != null && menu.onScreen
        : match.phase == PHASE_DONE && MatchView.onScreen && System.getDeviceSettings().phoneConnected;
    if (free) {
        Sync.screenShown();
        var view = new SyncView();
        WatchUi.pushView(view, new SyncViewDelegate(view), WatchUi.SLIDE_IMMEDIATE);
    }
}
