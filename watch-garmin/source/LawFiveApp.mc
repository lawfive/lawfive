import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

class LawFiveApp extends Application.AppBase {
    var match as Match? = null;
    var gpsQuality as Number = Position.QUALITY_NOT_AVAILABLE;
    private var _timer as Timer.Timer? = null;
    private var _shownMinute as Number = -1;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // UI-21: a watch updated from the six layouts gets the four choices.
        Screen.migrate();
        // SYNC-2: a watch linked before the server was kept at linking keeps the one it uses now.
        Sync.keepLinkedServer();
        // PRE-9: a different coin toss sequence every time the app starts.
        Math.srand(Time.now().value() + System.getTimer());
        var stored = loadMatch();
        match = stored;
        if (stored != null) {
            // DIAG-1: a match already running means the app went away mid-match.
            if (stored.phase != PHASE_DONE && stored.startedAt.size() > 0) {
                stored.restarts += 1;
            }
            stored.resumeRecording();
            enableGps(true);
        }
        var timer = new Timer.Timer();
        timer.start(method(:onTick), 1000, true);
        _timer = timer;
        // SYNC-13: the phone app can offer to link this watch at any time.
        Phone.listen();
        // SYNC-6: links unlinked away from the phone, signed out now it may be near.
        Sync.sendSignOuts();
        // SYNC-3, SYNC-4: fresh matches and any waiting uploads, unless a match is under way or
        // the user syncs only with Sync now (UI-16).
        if (stored == null && Settings.getBoolean("syncOnOpen", true)) {
            Sync.run(new Lang.Method(self, :onSynced));
        }
    }

    function onSynced(ok as Boolean) as Void {
        refreshStartMenu(ok);
    }

    //! INP-11: when the screen turns on, so the Back press that turned it on can be told apart.
    function onDisplayModeChanged() as Void {
        Wake.changed(Wake.currentlyOn(), System.getTimer());
    }

    function onStop(state as Dictionary?) as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
        }
        enableGps(false);
        var current = match;
        if (current != null) {
            current.save();
        }
        TrackLog.save();
        // Keep what was recorded if the app is closed mid-match (R-5).
        Recorder.save();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        if (match != null) {
            var view = new MatchView();
            return [view, new MatchDelegate(view)];
        }
        return startMenu();
    }

    function onTick() as Void {
        // UI-25: menus and other still screens keep the time of day current.
        var minute = System.getClockTime().min;
        if (minute != _shownMinute) {
            _shownMinute = minute;
            WatchUi.requestUpdate();
        }
        // APP-7: a request the phone app hasn't answered goes straight to the server.
        Phone.tick();
        offerSyncView();
        PhoneLink.tick();
        var current = match;
        if (current != null) {
            var now = Clock.nowMs();
            current.tick(now);
            // ET-6: the golden goal's screen is still play, until End match.
            if (current.recordTrack && (current.phase == PHASE_RUNNING || current.phase == PHASE_GOLDEN)) {
                var hadFix = TrackLog.sample(current.created, now);
                if (hadFix != null) {
                    current.noteGps(hadFix, now);
                }
            }
            if (current.wantsScreenOn(now)) {
                Alerts.screenOn();
            }
        }
        WatchUi.requestUpdate();
    }

    function onPosition(info as Position.Info) as Void {
        var accuracy = info.accuracy;
        if (accuracy != null) {
            gpsQuality = accuracy;
        }
    }

    //! Creates a new match from a setup (Settings.matchSetup, or Create match) and turns on GPS so
    //! it can lock while the kickoff team is chosen.
    function newMatch(setup as MatchData) as Void {
        Settings.rememberFormat(setup);
        // TRK-7: kept for LawFive, linked or not (a watch linked later sends it with the match, SYNC-4).
        setup["recordTrack"] = Settings.getBoolean("recordTrack", true);
        var created = new Match(setup);
        created.save();
        match = created;
        enableGps(true);
    }

    function closeMatch() as Void {
        match = null;
        clearStoredMatch();
        enableGps(false);
    }

    private function enableGps(enable as Boolean) as Void {
        Position.enableLocationEvents(enable ? Position.LOCATION_CONTINUOUS : Position.LOCATION_DISABLE, method(:onPosition));
        if (!enable) {
            gpsQuality = Position.QUALITY_NOT_AVAILABLE;
        }
    }
}

function getLawFiveApp() as LawFiveApp {
    return Application.getApp() as LawFiveApp;
}
