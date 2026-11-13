import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! Input on the match screen (INP-1 to INP-7).
//! Start/Stop: primary action (Start, stoppage or the game menu when stoppage is not tracked, start
//! a due break, the recommended ET-1 choice, or the highlighted shoot-out result). Back: game menu,
//! except the press that turns the screen on (INP-11). Up/Down: home/away controls, except on the
//! kickoff and shoot-out screens. Swipe down/up: home/away controls. Swipe sideways: game menu. With
//! sideways team swipes (INP-10): swipe right/left for home/away, and up for the game menu.
class MatchDelegate extends TapAwareDelegate {
    //! INP-10: how long after a drag ends the Back it turned into still counts as that swipe.
    private const SWIPE_BACK_MS = 500;

    private var _view as MatchView;
    //! INP-10: the drag in progress or just finished, from where it started, and when it ended.
    private var _dragFrom as Array<Number>? = null;
    private var _dragTo as Array<Number> = [0, 0] as Array<Number>;
    private var _dragStartMs as Number = 0;
    private var _dragEndMs as Number = -100000;

    function initialize(view as MatchView) {
        TapAwareDelegate.initialize();
        _view = view;
    }

    function onOtherKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        var match = getLawFiveApp().match;
        if (match == null) {
            return false;
        }
        var key = keyEvent.getKey();
        // VIB-6: Back and Menu silence the alert in their behaviours and still open the game menu.
        if (key == WatchUi.KEY_ESC || key == WatchUi.KEY_MENU) {
            return false;
        }
        if (silencedAlert(match)) {
            return true;
        }
        if (key != WatchUi.KEY_UP && key != WatchUi.KEY_DOWN) {
            return false;
        }
        if (match.phase == PHASE_GOLDEN) {
            // ET-6: Up/Down move the highlight between End match and Undo.
            _view.goldenChoice = 1 - _view.goldenChoice;
            WatchUi.requestUpdate();
            return true;
        }
        if (match.phase == PHASE_PENALTIES) {
            // ET-3: Up/Down choose the team kicking first, then move the Scored/Missed highlight.
            if (!match.penStarted) {
                match.selectPenaltyFirst(key == WatchUi.KEY_UP ? TEAM_HOME : TEAM_AWAY);
            } else {
                _view.kickChoice = 1 - _view.kickChoice;
            }
            WatchUi.requestUpdate();
            return true;
        }
        return teamAction(match, key == WatchUi.KEY_UP ? TEAM_HOME : TEAM_AWAY);
    }

    //! Start/Stop button.
    function onStartButton() as Boolean {
        var match = getLawFiveApp().match;
        if (match == null) {
            return false;
        }
        var now = Clock.nowMs();
        // EVT-12: "can return" only goes, whatever else is waiting.
        if (match.showsSinBinReturn() && silencedAlert(match)) {
            return true;
        }
        // TMR-7: while a break is due, Start/Stop accepts it rather than only silencing the alert.
        if (match.phase == PHASE_RUNNING && match.breakDue) {
            match.startBreak(now);
            WatchUi.requestUpdate();
            return true;
        }
        if (silencedAlert(match)) {
            return true;
        }
        if (match.phase == PHASE_READY) {
            match.start(now);
        } else if (match.phase == PHASE_RUNNING && match.trackStoppage) {
            match.toggleStoppage(now);
        } else if (match.phase == PHASE_RUNNING) {
            // INP-7: without stoppage tracking (TMR-10), Start/Stop opens the game menu like Back.
            openGameMenu();
            return true;
        } else if (match.phase == PHASE_BREAK) {
            match.endHalftime();
        } else if (match.phase == PHASE_NEXT_KICKOFF) {
            match.startNextPeriod(now);
        } else if (match.phase == PHASE_DECIDE) {
            decide(match, match.recommendedDecision());
        } else if (match.phase == PHASE_PENALTIES) {
            penaltyAction(match, _view.kickChoice);
        } else if (match.phase == PHASE_GOLDEN) {
            goldenAction(match, _view.goldenChoice);
        } else if (match.phase == PHASE_SUSPENDED) {
            // TMR-13: Resume, as Start/Stop ends half-time.
            match.resume(now);
        } else if (match.phase == PHASE_DONE) {
            showEvents(match);
        }
        WatchUi.requestUpdate();
        return true;
    }

    //! ET-6: End match finishes it as full time does; Undo takes the goal back and play goes on.
    private function goldenAction(match as Match, choice as Number) as Void {
        if (choice == 0) {
            match.finish(Clock.nowMs());
        } else {
            match.undoGoldenGoal();
            Alerts.tick();
        }
        _view.goldenChoice = 0;
    }

    //! ET-1: carries out a choice; ending the match asks for confirmation (TMR-9).
    private function decide(match as Match, choice as Symbol) as Void {
        if (choice == :extraTime) {
            match.chooseExtraTime(Clock.nowMs());
        } else if (choice == :penalties) {
            match.choosePenalties();
        } else {
            var view = new ConfirmView("End match?", null, false);
            WatchUi.pushView(view, new ConfirmDelegate(view, :endMatch), WatchUi.SLIDE_IMMEDIATE);
        }
    }

    //! ET-3: Start begins the shoot-out once the first team is chosen, then records the chosen
    //! result for each kick; once there is a winner it ends the match (ET-4).
    private function penaltyAction(match as Match, result as Number) as Void {
        if (!match.penStarted) {
            match.startPenalties();
        } else if (match.penaltyWinner() >= 0) {
            match.finish(Clock.nowMs());
        } else {
            match.recordKick(result == KICK_SCORED);
            _view.kickChoice = KICK_SCORED;
            Alerts.tick();
        }
    }

    //! INP-10: touch watches such as the Venu turn a swipe right into Back, after the drag itself
    //! has come here, so the drag tells that swipe apart from the Back button.
    function onDrag(dragEvent as WatchUi.DragEvent) as Boolean {
        var type = dragEvent.getType();
        var at = dragEvent.getCoordinates();
        if (type == WatchUi.DRAG_TYPE_START) {
            _dragFrom = at;
            _dragStartMs = System.getTimer();
        } else if (type == WatchUi.DRAG_TYPE_STOP) {
            _dragEndMs = System.getTimer();
        }
        _dragTo = at;
        return false;
    }

    //! A drag to the right, in progress or just ended, that the watch has sent as Back.
    private function swipedRight() as Boolean {
        var from = _dragFrom;
        var dragging = _dragEndMs < _dragStartMs;
        if (from == null || !dragging && System.getTimer() - _dragEndMs > SWIPE_BACK_MS) {
            return false;
        }
        var dx = _dragTo[0] - from[0];
        var dy = (_dragTo[1] - from[1]).abs();
        return dx > System.getDeviceSettings().screenWidth / 8 && dx > dy;
    }

    //! INP-12: with Touch lock on, the running screen takes no taps or swipes, so only the buttons work.
    private function touchLocked(match as Match?) as Boolean {
        return match != null && match.phase == PHASE_RUNNING && Settings.touchLock();
    }

    function onBack() as Boolean {
        var match = getLawFiveApp().match;
        // INP-12: a swipe right that the watch sent as Back does nothing while touch is locked.
        if (touchLocked(match) && swipedRight()) {
            _dragFrom = null;
            return true;
        }
        if (match != null && Sync.sidewaysSwipes() && swipedRight()) {
            _dragFrom = null;
            // EVT-12: a swipe on "can return" only dismisses it.
            if (!(match.showsSinBinReturn() && silencedAlert(match))) {
                openTeamMenu(match, TEAM_HOME);
            }
            return true;
        }
        if (match != null) {
            silencedAlert(match);
        }
        // INP-11: the press that turns the screen on only shows the match screen.
        if (Wake.wakingPress(System.getTimer())) {
            WatchUi.requestUpdate();
            return true;
        }
        if (match != null && match.phase == PHASE_DONE) {
            leaveMatch();
        } else {
            openGameMenu();
        }
        return true;
    }

    function onMenu() as Boolean {
        var match = getLawFiveApp().match;
        if (match != null) {
            silencedAlert(match);
        }
        openGameMenu();
        return true;
    }

    function onScreenTap(x as Number, y as Number) as Boolean {
        var match = getLawFiveApp().match;
        if (match == null) {
            return false;
        }
        // INP-12: taken, so it does nothing, not even silencing an alert.
        if (touchLocked(match)) {
            return true;
        }
        var settings = System.getDeviceSettings();
        var team = x < settings.screenWidth / 2 ? TEAM_HOME : TEAM_AWAY;
        var upperArea = y < settings.screenHeight * 0.45;
        var now = Clock.nowMs();
        // EVT-12, VIB-6: a tap on "can return" only dismisses it.
        if (match.showsSinBinReturn() && silencedAlert(match)) {
            return true;
        }

        // Starting the match or the next half needs a tap on the Start pill itself, so a stray
        // tap or a swipe read as a tap cannot start it by accident.
        if ((match.phase == PHASE_PRE || match.phase == PHASE_NEXT_KICKOFF) && upperArea) {
            match.selectKickoff(team);
        } else if (match.phase == PHASE_READY && upperArea) {
            // PRE-3: tapping the selected team again clears the choice.
            if (team == match.kickoff) {
                match.clearKickoff();
            } else {
                match.selectKickoff(team);
            }
        } else if (match.phase == PHASE_READY && _view.hits(_view.startTarget, x, y)) {
            match.start(now);
        } else if (match.phase == PHASE_RUNNING) {
            if (match.breakDue && _view.hits(_view.breakTarget, x, y)) {
                match.startBreak(now);
            } else if (Settings.getBoolean("tapStoppage", false)) {
                match.toggleStoppage(now);
            }
        } else if (match.phase == PHASE_BREAK && _view.hits(_view.startTarget, x, y)) {
            match.endHalftime();
        } else if (match.phase == PHASE_SUSPENDED && _view.hits(_view.startTarget, x, y)) {
            // TMR-13, INP-8: Resume needs a tap on its pill.
            match.resume(now);
        } else if (match.phase == PHASE_NEXT_KICKOFF && _view.hits(_view.startTarget, x, y)) {
            match.startNextPeriod(now);
        } else if (match.phase == PHASE_DECIDE) {
            for (var i = 0; i < _view.decisionTargets.size(); i++) {
                if (_view.hits(_view.decisionTargets[i], x, y)) {
                    decide(match, _view.decisionOptions[i]);
                    break;
                }
            }
        } else if (match.phase == PHASE_PENALTIES) {
            if (!match.penStarted && upperArea) {
                match.selectPenaltyFirst(team);
            } else if (_view.hits(_view.startTarget, x, y)) {
                penaltyAction(match, KICK_SCORED);
            } else {
                for (var i = 0; i < _view.kickTargets.size(); i++) {
                    if (_view.hits(_view.kickTargets[i], x, y)) {
                        penaltyAction(match, i);
                        break;
                    }
                }
            }
        } else if (match.phase == PHASE_GOLDEN) {
            for (var i = 0; i < _view.kickTargets.size(); i++) {
                if (_view.hits(_view.kickTargets[i], x, y)) {
                    goldenAction(match, i);
                    break;
                }
            }
        } else if (match.phase == PHASE_DONE) {
            showEvents(match);
        }
        WatchUi.requestUpdate();
        return true;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Boolean {
        var match = getLawFiveApp().match;
        if (match == null) {
            return false;
        }
        // INP-12.
        if (touchLocked(match)) {
            return true;
        }
        // EVT-12: as a tap, a swipe on "can return" only dismisses it.
        if (match.showsSinBinReturn() && silencedAlert(match)) {
            return true;
        }
        var direction = swipeEvent.getDirection();
        // INP-10: down for home and up for away, or with sideways swipes right for home and left for away.
        var sideways = Sync.sidewaysSwipes();
        // Swipes open the team controls in every phase, so cards can be given before kickoff,
        // at half-time and after full time (EVT-7).
        if (direction == (sideways ? WatchUi.SWIPE_RIGHT : WatchUi.SWIPE_DOWN)) {
            openTeamMenu(match, TEAM_HOME);
            return true;
        } else if (direction == (sideways ? WatchUi.SWIPE_LEFT : WatchUi.SWIPE_UP)) {
            openTeamMenu(match, TEAM_AWAY);
            return true;
        } else if (sideways && direction != WatchUi.SWIPE_UP) {
            // A swipe down does nothing.
            return true;
        }
        // Sideways swipes, or a swipe up with sideways team swipes, open the game menu instead of the
        // system Back (R-1).
        if (match.phase == PHASE_DONE) {
            leaveMatch();
        } else {
            openGameMenu();
        }
        return true;
    }

    //! VIB-6: a button press while an alert repeats only silences it, except Back and Menu, which
    //! silence it and open the game menu as well. Checked in onKey and in each button behaviour,
    //! because some keys (such as Back in the simulator) skip onKey.
    private function silencedAlert(match as Match) as Boolean {
        if (match.acknowledgeAlerts(Clock.nowMs())) {
            WatchUi.requestUpdate();
            return true;
        }
        return false;
    }

    //! On the kickoff screens Up/Down pick the kickoff team; otherwise they open that team's controls.
    private function teamAction(match as Match, team as Number) as Boolean {
        if (match.phase == PHASE_PRE || match.phase == PHASE_READY || match.phase == PHASE_NEXT_KICKOFF) {
            match.selectKickoff(team);
            WatchUi.requestUpdate();
        } else {
            openTeamMenu(match, team);
        }
        return true;
    }

    //! UI-9: home controls slide down from the top, away controls up from the bottom.
    private function openTeamMenu(match as Match, team as Number) as Void {
        WatchUi.pushView(teamMenu(match, team), new TeamMenuDelegate(team), teamSlideIn(team));
    }

    private function openGameMenu() as Void {
        var match = getLawFiveApp().match;
        if (match != null && match.phase != PHASE_DONE) {
            WatchUi.pushView(gameMenu(match), new GameMenuDelegate(), WatchUi.SLIDE_LEFT);
        }
    }

    private function showEvents(match as Match) as Void {
        WatchUi.pushView(eventsMenu("Events", match.events, match.home, match.away, match.numPeriods, match.stoppageLabel,
            match.periodStarts()),
            new WatchUi.Menu2InputDelegate(), WatchUi.SLIDE_LEFT);
    }

    private function leaveMatch() as Void {
        getLawFiveApp().closeMatch();
        var start = startMenu();
        WatchUi.switchToView(start[0], start[1], WatchUi.SLIDE_RIGHT);
    }
}
