import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Test;
import Toybox.WatchUi;

// Unit tests, compiled only with `monkeyc -t` and run with `monkeydo <prg> <device> -t`.
// They drive the match with fake timestamps, so a 45-minute half runs instantly.

const T0 = 1000000000l;

(:debug)
function makeTestMatch(breakAtSec as Number, breakLenSec as Number) as Match {
    var match = new Match({
        "home" => "HOM",
        "away" => "AWY",
        "numPeriods" => 2,
        "periodSec" => 45 * 60,
        "halftimeSec" => 10 * 60,
        "breakAtSec" => breakAtSec,
        "breakLenSec" => breakLenSec,
        "repeatSec" => 10,
        "reminderSec" => 10,
        "vibeFullTime" => true,
        "vibeStoppage" => true,
        "vibeBreak" => true
    } as MatchData);
    match.selectKickoff(TEAM_HOME);
    return match;
}

(:debug)
function at(periodStart as Long, minutes as Number, seconds as Number) as Long {
    return periodStart + (minutes * 60 + seconds) * 1000;
}

//! Ticks once a second from `from` to `to` (inclusive), as the app's timer does.
(:debug)
function tickThrough(match as Match, from as Long, to as Long) as Void {
    for (var t = from; t <= to; t += 1000) {
        match.tick(t);
    }
}

//! Break time remaining, or -1 when no break clock is running.
(:debug)
function left(match as Match, now as Long) as Long {
    var remaining = match.breakRemainingMs(now);
    return remaining == null ? -1l : remaining;
}

(:debug)
function cleanUp() as Void {
    Recorder.discard();
    clearStoredMatch();
}

//! TMR-7: at 21:30 the break becomes due in each half; it only counts down once accepted.
(:test)
function testScheduledBreakDueInEachHalf(logger as Logger) as Boolean {
    var match = makeTestMatch(21 * 60 + 30, 120);
    match.start(T0);

    // First half: nothing before 21:30.
    tickThrough(match, T0, at(T0, 21, 29));
    Test.assertMessage(!match.breakDue, "1H: not due before 21:30");

    // Due at 21:30, with a repeating alert but no countdown yet.
    tickThrough(match, at(T0, 21, 30), at(T0, 21, 30));
    Test.assertMessage(match.breakDue, "1H: due at 21:30");
    Test.assertMessage(match.hasActiveAlert(at(T0, 21, 30)), "1H: alert active when due");
    Test.assertEqualMessage(left(match, at(T0, 21, 30)), -1l, "1H: no countdown until accepted");

    // Still waiting at 22:10 (play has not stopped); accepted at 22:10, runs 2:00 from then.
    tickThrough(match, at(T0, 21, 31), at(T0, 22, 10));
    Test.assertMessage(match.breakDue, "1H: still due until accepted");
    match.startBreak(at(T0, 22, 10));
    Test.assertMessage(!match.breakDue, "1H: no longer due once started");
    Test.assertMessage(!match.hasActiveAlert(at(T0, 22, 10)), "1H: alert stops once started");
    Test.assertEqualMessage(left(match, at(T0, 22, 10)), 120000l, "1H: 2:00 from acceptance");
    tickThrough(match, at(T0, 22, 11), at(T0, 24, 9));
    Test.assertEqualMessage(left(match, at(T0, 24, 9)), 1000l, "1H: 0:01 left at 24:09");
    tickThrough(match, at(T0, 24, 10), at(T0, 24, 10));
    Test.assertEqualMessage(left(match, at(T0, 24, 10)), -1l, "1H: break over at 24:10");

    // Not due again in the same half.
    tickThrough(match, at(T0, 24, 11), at(T0, 44, 59));
    Test.assertMessage(!match.breakDue, "1H: only one break per half");

    // Half-time: never due; the break clock shows half-time.
    var halftime = at(T0, 46, 0);
    match.endPeriod(halftime);
    tickThrough(match, halftime, halftime + 5 * 60 * 1000);
    Test.assertMessage(!match.breakDue, "half-time: not due");
    Test.assertEqualMessage(left(match, halftime + 5 * 60 * 1000), 5 * 60 * 1000l, "half-time clock 5:00 left");

    // Second half: due again at 21:30 of that half.
    var t1 = halftime + 10 * 60 * 1000;
    match.endHalftime();
    match.startNextPeriod(t1);
    tickThrough(match, t1, at(t1, 21, 29));
    Test.assertMessage(!match.breakDue, "2H: not due before 21:30");
    tickThrough(match, at(t1, 21, 30), at(t1, 21, 30));
    Test.assertMessage(match.breakDue, "2H: due at 21:30");

    cleanUp();
    return true;
}

//! VIB-6: another button silences the "due" alert, but the break stays due until accepted.
(:test)
function testSilenceKeepsBreakDue(logger as Logger) as Boolean {
    var match = makeTestMatch(21 * 60 + 30, 120);
    match.start(T0);
    tickThrough(match, at(T0, 21, 30), at(T0, 21, 35));
    Test.assertMessage(match.acknowledgeAlerts(at(T0, 21, 35)), "acknowledge returns true while alerting");
    Test.assertMessage(!match.hasActiveAlert(at(T0, 21, 36)), "alert silenced");
    Test.assertMessage(match.breakDue, "still due after silencing");
    match.startBreak(at(T0, 21, 50));
    Test.assertEqualMessage(left(match, at(T0, 21, 50)), 120000l, "accepted later, full length");
    cleanUp();
    return true;
}

//! TMR-7: the break can be skipped, or reset once running; either way it does not come back that half.
(:test)
function testSkipAndResetBreak(logger as Logger) as Boolean {
    var skipped = makeTestMatch(21 * 60 + 30, 120);
    skipped.start(T0);
    tickThrough(skipped, at(T0, 21, 30), at(T0, 21, 31));
    skipped.skipBreak();
    Test.assertMessage(!skipped.breakDue && !skipped.hasActiveAlert(at(T0, 21, 31)), "skip clears due and alert");
    tickThrough(skipped, at(T0, 21, 32), at(T0, 30, 0));
    Test.assertMessage(!skipped.breakDue && left(skipped, at(T0, 30, 0)) == -1l, "skipped break does not return");
    cleanUp();

    var reset = makeTestMatch(21 * 60 + 30, 120);
    reset.start(T0);
    tickThrough(reset, at(T0, 21, 30), at(T0, 21, 31));
    reset.startBreak(at(T0, 21, 40));
    reset.resetBreak();
    Test.assertEqualMessage(left(reset, at(T0, 22, 0)), -1l, "reset clears the countdown");
    Test.assertMessage(reset.breakDue, "a reset break is due again");
    Test.assertMessage(!reset.hasActiveAlert(at(T0, 22, 0)), "without buzzing again");
    reset.startBreak(at(T0, 22, 0));
    Test.assertEqualMessage(left(reset, at(T0, 22, 30)), 90000l, "it can be started again");
    cleanUp();

    var ended = makeTestMatch(21 * 60 + 30, 120);
    ended.start(T0);
    tickThrough(ended, at(T0, 21, 30), at(T0, 21, 31));
    ended.startBreak(at(T0, 21, 40));
    ended.endBreakEarly(at(T0, 21, 50));
    Test.assertEqualMessage(left(ended, at(T0, 22, 0)), -1l, "ending clears the countdown");
    tickThrough(ended, at(T0, 22, 0), at(T0, 30, 0));
    Test.assertMessage(!ended.breakDue, "an ended break does not return");
    cleanUp();
    return true;
}

//! TMR-12: with the setting on, a halfway break's time is added on as a stoppage that ends with
//! the break (or when it is reset); a stoppage the referee started already stays theirs to end.
(:test)
function testBreakCountsAsStoppage(logger as Logger) as Boolean {
    var counted = makeTestMatch(21 * 60 + 30, 120);
    counted.breakStoppage = true;
    counted.start(T0);
    tickThrough(counted, at(T0, 21, 30), at(T0, 21, 31));
    counted.startBreak(at(T0, 21, 40));
    Test.assertMessage(counted.isStoppageActive(), "the break starts a stoppage");
    tickThrough(counted, at(T0, 21, 41), at(T0, 23, 45));
    Test.assertMessage(!counted.isStoppageActive(), "it ends with the break");
    Test.assertEqualMessage(counted.stoppageTotalMs(at(T0, 23, 45)), 120000l, "the break's length is added");
    var last = counted.events[counted.events.size() - 1];
    Test.assertMessage((last[EV_TYPE] as String).equals(EVENT_STOPPAGE) && (last[5] as Number) == 120, "recorded as a stoppage");
    cleanUp();

    var off = makeTestMatch(21 * 60 + 30, 120);
    off.start(T0);
    tickThrough(off, at(T0, 21, 30), at(T0, 21, 31));
    off.startBreak(at(T0, 21, 40));
    tickThrough(off, at(T0, 21, 41), at(T0, 23, 45));
    Test.assertEqualMessage(off.stoppageTotalMs(at(T0, 23, 45)), 0l, "off: nothing added");
    cleanUp();

    var own = makeTestMatch(21 * 60 + 30, 120);
    own.breakStoppage = true;
    own.start(T0);
    tickThrough(own, at(T0, 21, 30), at(T0, 21, 31));
    own.toggleStoppage(at(T0, 21, 35));
    own.startBreak(at(T0, 21, 40));
    tickThrough(own, at(T0, 21, 41), at(T0, 23, 45));
    Test.assertMessage(own.isStoppageActive(), "the referee's own stoppage keeps running after the break");
    own.toggleStoppage(at(T0, 23, 50));
    Test.assertEqualMessage(own.stoppageTotalMs(at(T0, 23, 50)), 135000l, "counted once");
    cleanUp();

    var reset = makeTestMatch(21 * 60 + 30, 120);
    reset.breakStoppage = true;
    reset.start(T0);
    tickThrough(reset, at(T0, 21, 30), at(T0, 21, 31));
    reset.startBreak(at(T0, 21, 40));
    reset.endBreakEarly(at(T0, 22, 10));
    Test.assertMessage(!reset.isStoppageActive(), "ending it ends the stoppage");
    Test.assertEqualMessage(reset.stoppageTotalMs(at(T0, 22, 10)), 30000l, "the time it took is added");
    cleanUp();

    var mistake = makeTestMatch(21 * 60 + 30, 120);
    mistake.breakStoppage = true;
    mistake.start(T0);
    tickThrough(mistake, at(T0, 21, 30), at(T0, 21, 31));
    mistake.startBreak(at(T0, 21, 40));
    mistake.resetBreak();
    Test.assertMessage(!mistake.isStoppageActive(), "a reset ends the stoppage too");
    Test.assertEqualMessage(mistake.stoppageTotalMs(at(T0, 22, 10)), 0l, "and adds nothing");
    cleanUp();
    return true;
}

//! TMR-7: a due break not taken before the end of the half is dropped at half-time.
(:test)
function testDueBreakClearedAtHalfTime(logger as Logger) as Boolean {
    var match = makeTestMatch(21 * 60 + 30, 120);
    match.start(T0);
    tickThrough(match, at(T0, 21, 30), at(T0, 21, 31));
    match.endPeriod(at(T0, 46, 0));
    Test.assertMessage(!match.breakDue, "not due during half-time");
    cleanUp();
    return true;
}

//! TMR-8: if the app was closed across 21:30, the break is due when it reopens, not already running.
(:test)
function testBreakAfterRestart(logger as Logger) as Boolean {
    var match = makeTestMatch(21 * 60 + 30, 120);
    match.start(T0);
    tickThrough(match, T0, at(T0, 20, 0));
    match.save();

    var reloaded = loadMatch();
    Test.assertMessage(reloaded != null, "match reloaded from storage");
    if (reloaded != null) {
        reloaded.tick(at(T0, 22, 0));
        Test.assertMessage(reloaded.breakDue, "due after reopening");
        Test.assertEqualMessage(left(reloaded, at(T0, 22, 0)), -1l, "not counting down until accepted");
    }
    cleanUp();
    return true;
}

//! TMR-13, TMR-8: a match saved while suspended for lightning, with a card given then, loads still
//! suspended, with its reason, its countdown and its frozen clock, and resumes from where it stopped.
(:test)
function testSuspendedSurvivesRestart(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    Test.assertMessage(match.suspend(REASON_LIGHTNING, at(T0, 20, 0)), "suspended for lightning");
    match.addEvent(EVENT_YELLOW, TEAM_AWAY, 4, at(T0, 22, 0));
    Test.assertMessage(!match.addEvent(EVENT_GOAL, TEAM_HOME, 9, at(T0, 23, 0)) && match.score[TEAM_HOME] == 0, "no goal while suspended");

    var reloaded = loadMatch();
    Test.assertMessage(reloaded != null, "match reloaded from storage");
    if (reloaded != null) {
        var now = at(T0, 30, 0);
        Test.assertEqualMessage(reloaded.phase, PHASE_SUSPENDED as Number, "still suspended");
        Test.assertEqualMessage(reloaded.suspendReason, REASON_LIGHTNING, "for lightning");
        Test.assertEqualMessage(reloaded.matchMs(now), 20 * 60 * 1000l, "the clock stands at 20:00");
        Test.assertEqualMessage(reloaded.clockDisplay(now)[0], "20:00", "and shows it");
        Test.assertEqualMessage(reloaded.lightningLeftMs(now) as Long, 20 * 60 * 1000l, "the countdown carries on: 20:00 left");
        Test.assertEqualMessage(reloaded.suspendedMs(now) as Long, 10 * 60 * 1000l, "suspended 10:00");
        Test.assertEqualMessage(reloaded.events.size(), 2, "the suspension and the card");
        var card = reloaded.lastUndoableEvent();
        Test.assertMessage(card != null && (card[EV_TYPE] as String).equals(EVENT_YELLOW) && (card[EV_SECONDS] as Number) == 1200, "the card, at 20:00, can be undone");
        var su = reloaded.events[0];
        Test.assertEqualMessage(describeEvent(su, "HOM", "AWY", 2, "stoppage", null)[0], "Suspended", "SU label");
        Test.assertEqualMessage(describeEvent(su, "HOM", "AWY", 2, "stoppage", null)[1], "Lightning · 1H 20:00", "SU detail");

        // Lightning at 50:00 alerts once; nothing else fires while suspended.
        Alerts.last = null;
        tickThrough(reloaded, at(T0, 49, 58), at(T0, 50, 5));
        Test.assertEqualMessage(Alerts.last as Symbol, :lightning, "the countdown's vibration");
        Test.assertMessage(reloaded.lightningAlerted && reloaded.phase == PHASE_SUSPENDED, "once, still suspended");

        reloaded.resume(at(T0, 52, 0));
        Test.assertEqualMessage(reloaded.phase, PHASE_RUNNING as Number, "resumed");
        var rs = reloaded.events[reloaded.events.size() - 1];
        Test.assertEqualMessage(rs[EV_DURATION] as Number, 32 * 60, "32:00 suspended");
        Test.assertEqualMessage(describeEvent(rs, "HOM", "AWY", 2, "stoppage", null)[0], "Resumed after 32:00", "RS label");
        Test.assertEqualMessage(reloaded.matchMs(at(T0, 53, 0)), 21 * 60 * 1000l, "the clock carries on from 20:00");
        Test.assertEqualMessage(reloaded.startedAt[0], (T0 / 1000).toNumber(), "the kickoff time for the track stays");
        var again = loadMatch();
        Test.assertMessage(again != null && again.suspendedAt == null && again.suspendReason == -1 && again.lightningFrom == null, "the suspension is cleared");
    }
    cleanUp();
    return true;
}

//! EVT-12, TMR-8: a sin bin over waits for its button through an app restart, without coming again once
//! dismissed; a second for the number is a send-off; the event list names both.
(:test)
function testCardReasons(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    Test.assertEqualMessage(match.reasonScheme, misconductScheme(Sync.accountScheme()), "a quick match takes the account's codes");
    match.reasonScheme = "ussf";
    match.start(T0);
    match.addEvent(EVENT_YELLOW, TEAM_HOME, 4, at(T0, 10, 0));
    var before = Sync.uploadFor(match)["misconduct"] as Dictionary?;
    Test.assertMessage(before == null, "no reasons until one's given");
    match.giveReason("UB");
    match.addEvent(EVENT_GOAL, TEAM_AWAY, 9, at(T0, 11, 0));
    var upload = Sync.uploadFor(match);
    var misconduct = upload["misconduct"] as Dictionary?;
    Test.assertMessage(misconduct != null, "the upload has the reasons");
    if (misconduct != null) {
        Test.assertEqualMessage(misconduct["scheme"] as String, "ussf", "with the match's codes");
        Test.assertMessage(caseSame(misconduct["codes"] as Object?, [[0, "UB"]]), "by the card's index");
    }
    var sent = upload["events"] as Array<Array>;
    Test.assertEqualMessage(sent[0].size(), 6, "the events keep six fields");
    Test.assertEqualMessage(match.events[0].size(), 7, "the watch keeps the reason with the card");
    Test.assertEqualMessage(describeEvent(match.events[0], "HOM", "AWY", 2, "stoppage", null)[1], "UB · 1H 10:00", "shown under the card");

    var reloaded = loadMatch();
    Test.assertMessage(reloaded != null, "match reloaded from storage");
    if (reloaded != null) {
        Test.assertEqualMessage(reloaded.reasonScheme, "ussf", "the codes survive a restart");
        Test.assertMessage(caseSame(reloaded.cardReasons(), [[0, "UB"]]), "and so does the reason");
    }
    Test.assertEqualMessage(misconductScheme("mars"), "ifab", "codes the watch doesn't know are listed as IFAB's");
    Test.assertEqualMessage(misconductCodes("ussf", true)[0], "SFP", "a send-off's list");
    Test.assertEqualMessage(misconductCodes("fa", false)[1], "Unsporting behavior", "with the meaning after each code");
    cleanUp();
    return true;
}

(:test)
function testSinBinSurvivesRestart(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.sinBins = true;
    match.sinBinSec = 60;
    match.start(T0);
    Test.assertMessage(!match.addEvent(EVENT_SIN_BIN, TEAM_AWAY, 7, at(T0, 10, 0)), "a first sin bin");
    Test.assertEqualMessage(match.sinBinPill(at(T0, 10, 30)) as String, "AWY 7 0:30", "the pill");
    Test.assertEqualMessage(match.sinBinPillText(at(T0, 10, 30), false) as String, "7 0:30", "the pill without the team");
    Alerts.last = null;
    tickThrough(match, at(T0, 10, 58), at(T0, 11, 1));
    Test.assertEqualMessage(Alerts.last as Symbol, :sinBinEnd, "its vibration");
    Test.assertMessage(match.showsSinBinReturn(), "can return");

    var reloaded = loadMatch();
    Test.assertMessage(reloaded != null, "match reloaded from storage");
    if (reloaded != null) {
        Test.assertEqualMessage(reloaded.sinBinReturns.size(), 1, "still waiting");
        Test.assertEqualMessage(reloaded.sinBinReturnText() as String, "AWY #7 can return", "for the same player");
        tickThrough(reloaded, at(T0, 11, 2), at(T0, 11, 5));
        Test.assertEqualMessage(reloaded.sinBinReturns.size(), 1, "and only once");
        Test.assertMessage(reloaded.acknowledgeAlerts(at(T0, 11, 6)), "a button dismisses it");
        Test.assertMessage(!reloaded.showsSinBinReturn(), "gone");
    }
    var again = loadMatch();
    Test.assertMessage(again != null, "match reloaded again");
    if (again != null) {
        tickThrough(again, at(T0, 11, 7), at(T0, 11, 10));
        Test.assertEqualMessage(again.sinBinReturns.size(), 0, "a dismissed return doesn't come back");
        Test.assertMessage(again.addEvent(EVENT_SIN_BIN, TEAM_AWAY, 7, at(T0, 20, 0)), "the second for #7 is a send-off");
        var second = again.events[again.events.size() - 1];
        Test.assertEqualMessage(second[EV_TYPE] as String, EVENT_SECOND_SIN_BIN, "recorded as SB2");
        Test.assertEqualMessage(second[EV_DURATION] as Number, 60, "with the length");
        Test.assertEqualMessage(describeEvent(again.events[0], "HOM", "AWY", 2, "stoppage", null)[0], "Sin bin AWY #7", "SB label");
        Test.assertEqualMessage(describeEvent(second, "HOM", "AWY", 2, "stoppage", null)[0], "2nd sin bin AWY #7", "SB2 label");
        Test.assertEqualMessage(describeEvent(second, "HOM", "AWY", 2, "stoppage", null)[1], "Sent off · 1H 20:00", "SB2 detail");
        again.addEvent(EVENT_SIN_BIN, TEAM_HOME, null, at(T0, 21, 0));
        Test.assertEqualMessage(describeEvent(again.events[again.events.size() - 1], "HOM", "AWY", 2, "stoppage", null)[0], "Sin bin HOM", "no number");
        Test.assertEqualMessage(Sync.uploadFor(again)["sinBins"] as Boolean, true, "the upload has the format's sin bins");
        Test.assertEqualMessage(Sync.uploadFor(again)["sinBinSec"] as Number, 60, "and their length");
    }
    cleanUp();
    return true;
}

//! TMR-14, TMR-8: a corrected clock and added time are saved as they're made, so a restart keeps them,
//! and Undo still takes each back after it.
(:test)
function testAdjustedClockSurvivesRestart(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    Test.assertMessage(match.adjustClock(40, at(T0, 20, 0)), "clock adjusted");
    Test.assertMessage(match.adjustAdded(30, at(T0, 21, 0)), "added time adjusted");
    Test.assertMessage(!match.adjustClock(0, at(T0, 21, 0)), "no change, nothing recorded");

    var reloaded = loadMatch();
    Test.assertMessage(reloaded != null, "match reloaded from storage");
    if (reloaded != null) {
        var now = at(T0, 25, 0);
        Test.assertEqualMessage(reloaded.matchMs(now), (25 * 60 + 40) * 1000l, "the clock keeps its correction");
        Test.assertEqualMessage(reloaded.stoppageTotalMs(now), 30000l, "the added time keeps its correction");
        Test.assertEqualMessage(reloaded.events.size(), 2, "both recorded");
        var clock = reloaded.events[0];
        Test.assertEqualMessage(clock[EV_TYPE] as String, EVENT_CLOCK_ADJUSTED, "CK");
        Test.assertEqualMessage(clock[EV_SECONDS] as Number, 1240, "at 20:40");
        Test.assertEqualMessage(clock[EV_DURATION] as Number, 40, "+40");
        Test.assertEqualMessage(describeEvent(clock, "HOM", "AWY", 2, "stoppage", null)[0], "Clock +0:40", "CK label");
        Test.assertEqualMessage(describeEvent(clock, "HOM", "AWY", 2, "stoppage", null)[1], "1H 20:40", "CK time");
        Test.assertEqualMessage(describeEvent(reloaded.events[1], "HOM", "AWY", 2, "stoppage", null)[0], "Added time +0:30", "CA label");

        reloaded.undoLastEvent(now);
        Test.assertEqualMessage(reloaded.stoppageTotalMs(now), 0l, "added time taken back");
        reloaded.undoLastEvent(now);
        Test.assertEqualMessage(reloaded.matchMs(now), 25 * 60 * 1000l, "clock taken back");
        Test.assertEqualMessage(reloaded.events.size(), 0, "nothing left");
        Test.assertEqualMessage(Format.change(-65), "-1:05", "a change back");
    }
    cleanUp();
    return true;
}

//! No scheduled break when the setting is blank.
(:test)
function testNoBreakWhenOff(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 120);
    match.start(T0);
    tickThrough(match, T0, at(T0, 45, 0));
    Test.assertMessage(!match.breakDue && left(match, at(T0, 45, 0)) == -1l, "no break when breakAt is blank");
    cleanUp();
    return true;
}

//! PRE-3: the kickoff team can be cleared before Start and changed after it.
(:test)
function testChangeKickoff(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.clearKickoff();
    Test.assertEqualMessage(match.phase, PHASE_PRE as Number, "clearing returns to team selection");
    match.selectKickoff(TEAM_AWAY);
    match.start(T0);
    match.swapKickoff();
    Test.assertEqualMessage(match.kickoffFor(0), TEAM_HOME, "home kicked off after the change");
    Test.assertEqualMessage(match.kickoffFor(1), TEAM_AWAY, "away kicks off the second half");
    cleanUp();
    return true;
}

//! PRE-6: restart during the first half goes back to kickoff with a clean clock, score and events.
(:test)
function testRestartMatch(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    match.addEvent(EVENT_GOAL, TEAM_HOME, 9, at(T0, 0, 30));
    match.restart();
    Test.assertEqualMessage(match.phase, PHASE_READY as Number, "back to the kickoff screen");
    Test.assertEqualMessage(match.score[TEAM_HOME], 0, "score cleared");
    Test.assertEqualMessage(match.events.size(), 0, "events cleared");
    Test.assertEqualMessage(match.kickoff, TEAM_HOME, "kickoff choice kept");
    match.start(T0 + 60000);
    Test.assertEqualMessage(match.matchMs(T0 + 61000), 1000l, "clock starts from the new kickoff");
    cleanUp();
    return true;
}

//! EVT-5: the same numbered player's second yellow is recorded as a second yellow (sending-off).
(:test)
function testSecondYellowSameNumberedPlayer(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    Test.assertMessage(!match.addEvent(EVENT_YELLOW, TEAM_HOME, 7, at(T0, 10, 0)), "first yellow is not a send-off");
    Test.assertMessage(match.addEvent(EVENT_YELLOW, TEAM_HOME, 7, at(T0, 30, 0)), "second yellow is a send-off");
    Test.assertEqualMessage(match.events[0][EV_TYPE] as String, EVENT_YELLOW, "first stays a yellow");
    Test.assertEqualMessage(match.events[1][EV_TYPE] as String, EVENT_SECOND_YELLOW, "second recorded as second yellow");
    cleanUp();
    return true;
}

//! EVT-5: other teams, other numbers and cards without a number never count as a second yellow.
(:test)
function testSecondYellowNeedsSameTeamAndNumber(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    match.addEvent(EVENT_YELLOW, TEAM_HOME, 7, at(T0, 10, 0));
    Test.assertMessage(!match.addEvent(EVENT_YELLOW, TEAM_AWAY, 7, at(T0, 11, 0)), "same number, other team");
    Test.assertMessage(!match.addEvent(EVENT_YELLOW, TEAM_HOME, 8, at(T0, 12, 0)), "same team, other number");
    Test.assertMessage(!match.addEvent(EVENT_YELLOW, TEAM_HOME, null, at(T0, 13, 0)), "no number");
    Test.assertMessage(!match.addEvent(EVENT_YELLOW, TEAM_HOME, null, at(T0, 14, 0)), "two unnumbered yellows");
    Test.assertMessage(!match.addEvent(EVENT_GOAL, TEAM_HOME, 7, at(T0, 15, 0)), "a goal is never a send-off");
    cleanUp();
    return true;
}

//! EVT-5 across halves, and undo (INP-6) removes the second yellow without touching the first,
//! which, being the first half's, can't be undone in the second.
(:test)
function testSecondYellowAcrossHalvesAndUndo(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    match.addEvent(EVENT_YELLOW, TEAM_AWAY, 4, at(T0, 40, 0));
    var halftime = at(T0, 46, 0);
    match.endPeriod(halftime);
    var t1 = halftime + 10 * 60 * 1000;
    match.endHalftime();
    match.startNextPeriod(t1);
    Test.assertMessage(match.addEvent(EVENT_YELLOW, TEAM_AWAY, 4, at(t1, 5, 0)), "second yellow in the second half");

    match.undoLastEvent(at(t1, 6, 0));
    Test.assertEqualMessage(match.events[match.events.size() - 1][EV_TYPE] as String, EVENT_PERIOD_END, "the second yellow is gone");
    Test.assertEqualMessage(match.events[0][EV_TYPE] as String, EVENT_YELLOW, "first yellow remains after undo");
    Test.assertMessage(match.lastUndoableEvent() == null, "and, from the first half, can't be undone now");
    Test.assertMessage(match.addEvent(EVENT_YELLOW, TEAM_AWAY, 4, at(t1, 6, 0)), "re-entering it is a second yellow again");
    cleanUp();
    return true;
}

//! SET-8: custom timer names are kept with the match; matches saved without names use the defaults.
(:test)
function testTimerNames(logger as Logger) as Boolean {
    var defaults = makeTestMatch(-1, 0);
    Test.assertEqualMessage(defaults.stoppageLabel, "stoppage", "default stoppage name");
    Test.assertEqualMessage(defaults.breakLabel, "break", "default break name");

    defaults.breakLabel = "water";
    defaults.start(T0);
    var reloaded = loadMatch();
    Test.assertMessage(reloaded != null, "match reloaded from storage");
    if (reloaded != null) {
        Test.assertEqualMessage(reloaded.breakLabel, "water", "custom break name survives a restart");
    }
    cleanUp();
    return true;
}

//! PRE-7: "End HT" leads to the kickoff screen with the other team selected; it can be changed.
(:test)
function testEndHalftimeShowsNextKickoff(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    var halftime = at(T0, 46, 0);
    match.endPeriod(halftime);
    match.startNextPeriod(halftime + 1000);
    Test.assertEqualMessage(match.phase, PHASE_BREAK as Number, "second half cannot start before End HT");

    match.endHalftime();
    Test.assertEqualMessage(match.phase, PHASE_NEXT_KICKOFF as Number, "kickoff screen after End HT");
    Test.assertEqualMessage(match.kickoffTeamOnScreen(), TEAM_AWAY, "other team selected for the second half");
    Test.assertEqualMessage(left(match, halftime + 2000), -1l, "half-time clock gone");

    match.selectKickoff(TEAM_HOME);
    Test.assertEqualMessage(match.kickoffTeamOnScreen(), TEAM_HOME, "second-half kickoff can be changed");
    var t1 = halftime + 10 * 60 * 1000;
    match.startNextPeriod(t1);
    Test.assertEqualMessage(match.phase, PHASE_RUNNING as Number, "second half running");
    Test.assertEqualMessage(match.period, 1, "period 2");
    Test.assertEqualMessage(match.kickoffFor(1), TEAM_HOME, "the changed choice is used");
    cleanUp();
    return true;
}

//! EVT-7: cards can be given before kickoff, at half-time and after full time; goals cannot.
(:test)
function testCardsOutsidePlay(logger as Logger) as Boolean {
    var savedHistory = Application.Storage.getValue(History.STORAGE_KEY);
    var match = makeTestMatch(-1, 0);
    Test.assertMessage(!match.addEvent(EVENT_GOAL, TEAM_HOME, null, T0) && match.events.size() == 0, "no goal before kickoff");
    match.addEvent(EVENT_YELLOW, TEAM_HOME, 4, T0);
    Test.assertEqualMessage(match.events[0][EV_SECONDS] as Number, SECONDS_BEFORE_KICKOFF, "card before kickoff");

    match.start(T0 + 1000);
    Test.assertMessage(match.addEvent(EVENT_YELLOW, TEAM_HOME, 4, at(T0, 10, 0)), "pre-match yellow counts towards a second yellow");

    match.endPeriod(at(T0, 46, 0));
    match.addEvent(EVENT_RED, TEAM_AWAY, null, at(T0, 50, 0));
    Test.assertEqualMessage(match.events[match.events.size() - 1][EV_SECONDS] as Number, SECONDS_AT_BREAK, "card at half-time");
    match.endHalftime();
    match.addEvent(EVENT_YELLOW, TEAM_AWAY, 8, at(T0, 55, 0));
    Test.assertEqualMessage(match.events[match.events.size() - 1][EV_SECONDS] as Number, SECONDS_AT_BREAK, "card before the second-half kickoff");

    match.startNextPeriod(at(T0, 56, 0));
    match.finish(at(T0, 102, 0));
    Test.assertMessage(!match.addEvent(EVENT_GOAL, TEAM_HOME, null, at(T0, 103, 0)), "no goal after full time");
    match.addEvent(EVENT_YELLOW, TEAM_AWAY, 2, at(T0, 103, 0));
    Test.assertEqualMessage(match.events[match.events.size() - 1][EV_SECONDS] as Number, SECONDS_AFTER_FULL_TIME, "card after full time");
    var saved = History.all()[0]["events"] as Array<Array>;
    Test.assertEqualMessage(saved.size(), match.events.size(), "saved record includes the card after full time");

    Application.Storage.setValue(History.STORAGE_KEY, savedHistory);
    cleanUp();
    return true;
}

//! PRE-6: restarting keeps cards given before kickoff but clears in-play events.
(:test)
function testRestartKeepsPreKickoffCards(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.addEvent(EVENT_YELLOW, TEAM_AWAY, 3, T0);
    match.start(T0 + 1000);
    match.addEvent(EVENT_YELLOW, TEAM_HOME, 5, at(T0, 1, 0));
    match.restart();
    Test.assertEqualMessage(match.events.size(), 1, "only the pre-kickoff card remains");
    Test.assertEqualMessage(match.events[0][EV_SECONDS] as Number, SECONDS_BEFORE_KICKOFF, "it is the pre-kickoff card");
    cleanUp();
    return true;
}

//! A two-half match with extra time and/or penalties switched on (ET-1 to ET-4). No mid-period break.
(:debug)
function makeCupMatch(extraTime as Boolean, penalties as Boolean) as Match {
    var match = new Match({
        "home" => "HOM",
        "away" => "AWY",
        "numPeriods" => 2,
        "periodSec" => 45 * 60,
        "halftimeSec" => 15 * 60,
        "midBreak" => false,
        "breakLenSec" => 120,
        "extraTime" => extraTime,
        "etPeriods" => 2,
        "etPeriodSec" => 15 * 60,
        "penalties" => penalties,
        "repeatSec" => 10,
        "reminderSec" => 10,
        "vibeFullTime" => true,
        "vibeStoppage" => true,
        "vibeBreak" => true
    } as MatchData);
    match.selectKickoff(TEAM_HOME);
    return match;
}

//! Plays both regular halves from `t`; returns the time regular time ended.
(:debug)
function playRegularTime(match as Match, t as Long) as Long {
    match.start(t);
    match.endPeriod(at(t, 46, 0));
    match.endHalftime();
    var t2 = at(t, 61, 0);
    match.startNextPeriod(t2);
    var end = at(t2, 47, 0);
    match.endPeriod(end);
    return end;
}

//! ET-1, ET-2: a level score after regular time leads to the choice; extra time has its own
//! period length, uses the break duration before and between its periods, and is followed by the
//! choice again (penalties) rather than full time.
(:test)
function testExtraTimeFlow(logger as Logger) as Boolean {
    var match = makeCupMatch(true, true);
    var end = playRegularTime(match, T0);
    Test.assertEqualMessage(match.phase, PHASE_DECIDE as Number, "choice after regular time");
    Test.assertMessage(match.recommendedDecision() == :extraTime, "level: extra time recommended");

    match.chooseExtraTime(end);
    Test.assertEqualMessage(match.phase, PHASE_BREAK as Number, "break before extra time");
    Test.assertEqualMessage(left(match, end), 15 * 60 * 1000l, "uses the break duration");
    Test.assertMessage(!match.isHalftime(), "not called half-time");
    match.endHalftime();
    Test.assertEqualMessage(match.phase, PHASE_NEXT_KICKOFF as Number, "ET1 kickoff screen");
    // ET-7: a new toss, so no team is chosen and it can't start until one is.
    Test.assertEqualMessage(match.kickoffTeamOnScreen(), -1, "no ET1 kickoff team yet");
    var t = end + 16 * 60 * 1000;
    match.startNextPeriod(t);
    Test.assertEqualMessage(match.phase, PHASE_NEXT_KICKOFF as Number, "ET1 waits for its kickoff team");
    match.selectKickoff(TEAM_AWAY);             // AWY won the toss; HOM kicked off the match
    Test.assertEqualMessage(match.kickoffTeamOnScreen(), TEAM_AWAY, "ET1 kickoff team chosen");
    Test.assertEqualMessage(match.kickoff, TEAM_HOME, "the match's own kickoff team is kept");
    match.startNextPeriod(t);
    Test.assertMessage(match.isExtraTime(), "in extra time");
    Test.assertEqualMessage(match.firstKickoff(), TEAM_AWAY, "Change kickoff names the ET1 team");
    Test.assertEqualMessage(Format.periodLabel(match.period, match.numPeriods), "ET1", "labelled ET1");
    Test.assertEqualMessage(match.currentPeriodSec(), 15 * 60, "extra-time period length");
    // VIB-1: with stoppage tracked (as saved before TMR-10) but no stoppage time, full time repeats.
    match.tick(at(t, 14, 59));
    Test.assertMessage(!match.hasActiveAlert(at(t, 14, 59)), "no full-time alert before 15:00");
    match.tick(at(t, 15, 0));
    Test.assertMessage(match.hasActiveAlert(at(t, 15, 0)), "full-time alert at 15:00");
    Test.assertMessage(!match.periodEndsMatch(), "ET1 does not end the match");

    match.endPeriod(at(t, 16, 0));
    Test.assertEqualMessage(match.phase, PHASE_BREAK as Number, "break between extra-time periods");
    Test.assertEqualMessage(match.kickoffFor(match.period + 1), TEAM_HOME, "the other team kicks off ET2");
    match.endHalftime();
    Test.assertEqualMessage(match.kickoffTeamOnScreen(), TEAM_HOME, "ET2's team already selected");
    var t2 = at(t, 18, 0);
    match.startNextPeriod(t2);
    Test.assertEqualMessage(Format.periodLabel(match.period, match.numPeriods), "ET2", "labelled ET2");
    match.swapKickoff();                        // HOM took the ET1 kickoff after all
    Test.assertEqualMessage(match.etKickoff, TEAM_HOME, "the ET1 kickoff team changes");
    Test.assertEqualMessage(match.kickoff, TEAM_HOME, "not the match's");
    match.endPeriod(at(t2, 16, 0));
    Test.assertEqualMessage(match.phase, PHASE_DECIDE as Number, "choice again after extra time");
    Test.assertMessage(!match.canExtraTime(), "extra time cannot be chosen twice");
    Test.assertMessage(match.recommendedDecision() == :penalties, "level: penalties recommended");
    match.choosePenalties();
    Test.assertEqualMessage(match.phase, PHASE_PENALTIES as Number, "shoot-out");
    cleanUp();
    return true;
}

//! ET-1: a winner after regular time is offered End match; with extra time and penalties both off,
//! the last period ends the match as before.
(:test)
function testDecisionWhenNotLevel(logger as Logger) as Boolean {
    var match = makeCupMatch(true, false);
    match.start(T0);
    match.addEvent(EVENT_GOAL, TEAM_AWAY, 9, at(T0, 10, 0));
    match.endPeriod(at(T0, 46, 0));
    match.endHalftime();
    match.startNextPeriod(at(T0, 61, 0));
    match.endPeriod(at(T0, 108, 0));
    Test.assertEqualMessage(match.phase, PHASE_DECIDE as Number, "still asked: could be an aggregate tie");
    Test.assertMessage(match.recommendedDecision() == :endMatch, "not level: end match recommended");
    cleanUp();

    var plain = makeCupMatch(false, false);
    Test.assertMessage(!plain.periodEndsMatch(), "first half does not end the match");
    plain.start(T0);
    plain.endPeriod(at(T0, 46, 0));
    plain.endHalftime();
    plain.startNextPeriod(at(T0, 61, 0));
    Test.assertMessage(plain.periodEndsMatch(), "second half ends the match without extra time or penalties");
    cleanUp();
    return true;
}

//! ET-3, ET-4: teams alternate from the chosen first kicker; the shoot-out ends once a team cannot
//! catch up within five kicks each, otherwise in sudden death. Kicks can be undone.
(:test)
function testPenaltyShootout(logger as Logger) as Boolean {
    var match = makeCupMatch(false, true);
    playRegularTime(match, T0);
    match.choosePenalties();
    match.recordKick(true);
    Test.assertEqualMessage(match.penaltyKicks(TEAM_HOME) + match.penaltyKicks(TEAM_AWAY), 0, "no kicks before the first kicker is chosen");
    match.selectPenaltyFirst(TEAM_AWAY);
    match.startPenalties();
    Test.assertEqualMessage(match.nextKicker(), TEAM_AWAY, "away kicks first");

    // Away score 3, home miss 3: decided after six kicks (3-0 with two left for home).
    for (var i = 0; i < 3; i++) {
        match.recordKick(true);
        if (i < 2) {
            Test.assertEqualMessage(match.nextKicker(), TEAM_HOME, "home kicks second");
        }
        match.recordKick(false);
    }
    Test.assertEqualMessage(match.penaltyWinner(), TEAM_AWAY, "away win 3-0 after three each");
    match.recordKick(true);
    Test.assertEqualMessage(match.penaltyKicks(TEAM_AWAY), 3, "no kicks after the winner is known");

    match.undoLastEvent(T0);
    Test.assertEqualMessage(match.penaltyWinner(), -1, "undoing a kick reopens the shoot-out");
    Test.assertEqualMessage(match.nextKicker(), TEAM_HOME, "and home kicks again");
    cleanUp();

    // Five each at 4-4, then sudden death: level after six each, decided after seven.
    var sudden = makeCupMatch(false, true);
    playRegularTime(sudden, T0);
    sudden.choosePenalties();
    sudden.selectPenaltyFirst(TEAM_HOME);
    sudden.startPenalties();
    var kicks = [true, true, true, true, true, true, true, true, false, false, true, true, true, false];
    for (var i = 0; i < kicks.size(); i++) {
        if (i == 10) {
            Test.assertEqualMessage(sudden.penaltyWinner(), -1, "4-4 after five each: sudden death");
        } else if (i == 12) {
            Test.assertEqualMessage(sudden.penaltyWinner(), -1, "5-5 after six each: still level");
        }
        sudden.recordKick(kicks[i]);
    }
    Test.assertEqualMessage(sudden.penaltyWinner(), TEAM_HOME, "home win 6-5 in sudden death");
    var pens = sudden.penaltyScore() as Array<Number>;
    Test.assertMessage(pens[0] == 6 && pens[1] == 5, "shoot-out score 6-5");
    cleanUp();
    return true;
}

//! ET-5: the shoot-out score is kept in the saved match.
(:test)
function testPenaltiesSavedInHistory(logger as Logger) as Boolean {
    var savedHistory = Application.Storage.getValue(History.STORAGE_KEY);
    var match = makeCupMatch(false, true);
    var end = playRegularTime(match, T0);
    match.choosePenalties();
    match.selectPenaltyFirst(TEAM_HOME);
    match.startPenalties();
    for (var i = 0; i < 3; i++) {
        match.recordKick(true);
        match.recordKick(false);
    }
    match.finish(end + 10 * 60 * 1000);
    var pens = History.all()[0]["pens"] as Array<Number>;
    Test.assertMessage(pens[0] == 3 && pens[1] == 0, "3-0 on penalties saved");
    Application.Storage.setValue(History.STORAGE_KEY, savedHistory);
    cleanUp();
    return true;
}

//! ET-6: plays to the start of ET1 for a golden goal match; returns its kickoff.
(:debug)
function playToGoldenGoal(match as Match, t as Long) as Long {
    var end = playRegularTime(match, t);
    match.chooseExtraTime(end);
    match.endHalftime();
    match.selectKickoff(TEAM_HOME);       // ET-7: the new toss
    var et = end + 16 * 60 * 1000;
    match.startNextPeriod(et);
    return et;
}

(:debug)
function makeGoldenMatch(golden as Boolean) as Match {
    var setup = {
        "home" => "HOM", "away" => "AWY", "numPeriods" => 2, "periodSec" => 45 * 60, "halftimeSec" => 15 * 60,
        "midBreak" => false, "breakLenSec" => 120, "extraTime" => true, "etPeriods" => 2, "etPeriodSec" => 15 * 60,
        "goldenGoal" => golden, "penalties" => true, "repeatSec" => 10, "reminderSec" => 10,
        "vibeFullTime" => true, "vibeStoppage" => true, "vibeBreak" => true
    } as MatchData;
    var match = new Match(setup);
    match.selectKickoff(TEAM_HOME);
    return match;
}

//! ET-6: a goal in extra time ends the match with End match, or Undo takes it back and play goes
//! on; goals in regular time don't, and nor does one without golden goal.
(:test)
function testGoldenGoal(logger as Logger) as Boolean {
    var match = makeGoldenMatch(true);
    match.start(T0);
    match.addEvent(EVENT_GOAL, TEAM_HOME, 9, at(T0, 10, 0));
    Test.assertEqualMessage(match.phase, PHASE_RUNNING as Number, "a goal in regular time is just a goal");
    match.addEvent(EVENT_GOAL, TEAM_AWAY, 7, at(T0, 20, 0));
    var et = playRegularTimeFrom(match, at(T0, 46, 0));
    Test.assertEqualMessage(match.phase, PHASE_DECIDE as Number, "1-1: the choice");
    match.chooseExtraTime(et);
    match.endHalftime();
    match.selectKickoff(TEAM_HOME);       // ET-7: the new toss
    var t = et + 16 * 60 * 1000;
    match.startNextPeriod(t);

    match.addEvent(EVENT_GOAL, TEAM_AWAY, 11, at(t, 6, 52));
    Test.assertEqualMessage(match.phase, PHASE_GOLDEN as Number, "a goal in extra time: the golden goal screen");
    Test.assertEqualMessage(match.goldenWinner(), TEAM_AWAY, "away win");
    match.addEvent(EVENT_YELLOW, TEAM_HOME, 4, at(t, 7, 10));
    match.undoGoldenGoal();
    Test.assertEqualMessage(match.phase, PHASE_RUNNING as Number, "Undo: play goes on");
    Test.assertMessage(match.score[0] == 1 && match.score[1] == 1, "the goal is gone, 1-1");
    Test.assertEqualMessage(match.events[match.events.size() - 1][EV_TYPE] as String, EVENT_YELLOW, "the card given since stays");
    Test.assertEqualMessage(match.matchMs(at(t, 8, 0)), 8 * 60 * 1000l, "the clock ran on");
    Test.assertEqualMessage(match.goldenWinner(), -1, "no winner now");

    match.addEvent(EVENT_OWN_GOAL, TEAM_HOME, null, at(t, 12, 0));
    Test.assertEqualMessage(match.phase, PHASE_GOLDEN as Number, "an own goal counts for the team it's given to");
    match.undoLastEvent(at(t, 12, 0));
    Test.assertEqualMessage(match.phase, PHASE_RUNNING as Number, "Undo last event in the game menu takes it back too");
    match.addEvent(EVENT_GOAL, TEAM_HOME, 10, at(t, 12, 30));
    var restored = new Match(Application.Storage.getValue(STORAGE_MATCH) as MatchData);
    Test.assertEqualMessage(restored.phase, PHASE_GOLDEN as Number, "kept if the app closes");

    var savedHistory = Application.Storage.getValue(History.STORAGE_KEY);
    var savedOutbox = Application.Storage.getValue(Sync.STORAGE_OUTBOX);
    match.finish(at(t, 13, 0));
    Test.assertEqualMessage(match.phase, PHASE_DONE as Number, "End match: full time");
    Test.assertMessage(match.endedGolden, "on a golden goal");
    var last = match.events[match.events.size() - 1];
    Test.assertEqualMessage(last[EV_TYPE] as String, EVENT_PERIOD_END, "ET1 ended");
    Test.assertEqualMessage(last[EV_SECONDS] as Number, 13 * 60, "at 13:00");
    var entry = History.all()[0];
    Test.assertEqualMessage(History.title(entry), "HOM 2-1 AWY (GG)", "history says so");
    Test.assertMessage(entry["golden"] as Boolean, "the upload says it ended on one");
    Test.assertMessage(entry["goldenGoal"] as Boolean, "and has the format's golden goal");
    Application.Storage.setValue(History.STORAGE_KEY, savedHistory);
    if (savedOutbox != null) {
        Application.Storage.setValue(Sync.STORAGE_OUTBOX, savedOutbox as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_OUTBOX);
    }
    cleanUp();

    var plain = makeGoldenMatch(false);
    playToGoldenGoal(plain, T0);
    plain.addEvent(EVENT_GOAL, TEAM_HOME, 9, at(T0, 130, 0));
    Test.assertEqualMessage(plain.phase, PHASE_RUNNING as Number, "without golden goal, extra time plays on");
    cleanUp();

    var setup = Settings.matchSetup(false);
    setup["goldenGoal"] = true;
    Test.assertMessage(!(new Match(setup)).goldenGoal, "only with extra time");
    return true;
}

//! TMR-7: the halfway break is centred on halfway, so it is due half its length earlier.
(:test)
function testMidBreakHalfway(logger as Logger) as Boolean {
    var setup = Settings.matchSetup(false);
    setup["periodSec"] = 45 * 60;
    setup["breakLenSec"] = 2 * 60;
    setup["midBreak"] = true;
    Test.assertEqualMessage(new Match(setup).breakAtSec, 21 * 60 + 30, "due at 21:30 for 2 minutes in a 45-minute half");
    setup["periodSec"] = 40 * 60;
    setup["breakLenSec"] = 3 * 60;
    Test.assertEqualMessage(new Match(setup).breakAtSec, 18 * 60 + 30, "due at 18:30 for 3 minutes in a 40-minute half");
    setup["midBreak"] = false;
    Test.assertEqualMessage(new Match(setup).breakAtSec, -1, "no break when off");
    return true;
}

//! UI-4: from kickoff the break pill counts down to the scheduled break, and disappears once it is due.
(:test)
function testCountdownToBreak(logger as Logger) as Boolean {
    var match = makeTestMatch(21 * 60 + 30, 120);
    Test.assertMessage(match.breakDueInMs(T0) == null, "nothing before kickoff");
    match.start(T0);
    Test.assertEqualMessage(match.breakDueInMs(T0) as Long, (21 * 60 + 30) * 1000l, "21:30 to go at kickoff");
    tickThrough(match, T0, at(T0, 20, 0));
    Test.assertEqualMessage(match.breakDueInMs(at(T0, 20, 0)) as Long, 90 * 1000l, "1:30 to go at 20:00");
    tickThrough(match, at(T0, 20, 1), at(T0, 21, 30));
    Test.assertMessage(match.breakDue && match.breakDueInMs(at(T0, 21, 30)) == null, "due at 21:30; countdown gone");

    // Second half: counting down again from its kickoff.
    match.endPeriod(at(T0, 46, 0));
    Test.assertMessage(match.breakDueInMs(at(T0, 50, 0)) == null, "nothing at half-time");
    match.endHalftime();
    var t1 = at(T0, 61, 0);
    match.startNextPeriod(t1);
    Test.assertEqualMessage(match.breakDueInMs(t1) as Long, (21 * 60 + 30) * 1000l, "21:30 to go in the second half");
    cleanUp();

    var none = makeTestMatch(-1, 0);
    none.start(T0);
    Test.assertMessage(none.breakDueInMs(T0) == null, "no countdown without a scheduled break");
    cleanUp();
    return true;
}

//! SET-5: the alias, else the first three letters of the name, else the default.
(:test)
function testTeamAlias(logger as Logger) as Boolean {
    Test.assertEqualMessage(Settings.teamAlias("", "Riverside FC", "HOM"), "RIV", "first three letters, capitals");
    Test.assertEqualMessage(Settings.teamAlias("RivFC", "Riverside FC", "HOM"), "RivF", "alias cut to four characters");
    Test.assertEqualMessage(Settings.teamAlias("RFC", "Riverside FC", "HOM"), "RFC", "alias as given");
    Test.assertEqualMessage(Settings.teamAlias("", "", "AWY"), "AWY", "default");
    return true;
}

//! The planned match's row in New match: the names when they fit, else the short names.
(:test)
function testPlannedTitle(logger as Logger) as Boolean {
    var kept = [Application.Properties.getValue("homeAlias"), Application.Properties.getValue("awayAlias")];
    Application.Properties.setValue("homeAlias", "");
    Application.Properties.setValue("awayAlias", "ROV");
    Test.assertEqualMessage(Settings.plannedTitle(["Strikers", "Rovers"] as [String, String]), "STR v ROV", "short names when they don't fit");
    Test.assertEqualMessage(Settings.plannedTitle(["STR", "ROV"] as [String, String]), "STR v ROV", "names that fit");
    Test.assertEqualMessage(Settings.plannedTitle(["Strikers U12", "Rovers U12"] as [String, String]), "STR v ROV", "the alias set, else the first three letters");
    Application.Properties.setValue("homeAlias", kept[0] as Application.Properties.ValueType);
    Application.Properties.setValue("awayAlias", kept[1] as Application.Properties.ValueType);
    return true;
}

//! UI-10: hex colours parse, and the text colour is whichever of black or white contrasts more.
(:test)
function testTeamColors(logger as Logger) as Boolean {
    Test.assertEqualMessage(Colors.parse("#C8102E"), 0xC8102E, "#RRGGBB");
    Test.assertEqualMessage(Colors.parse("1d428a"), 0x1D428A, "without # and lower case");
    Test.assertEqualMessage(Colors.parse("#fff"), 0xFFFFFF, "#RGB");
    Test.assertEqualMessage(Colors.parse(""), -1, "blank");
    Test.assertEqualMessage(Colors.parse("red"), -1, "not hex");
    Test.assertEqualMessage(Colors.textOn(0xFFCC00), Graphics.COLOR_BLACK, "black on yellow");
    Test.assertEqualMessage(Colors.textOn(0x1D428A), Graphics.COLOR_WHITE, "white on navy");
    Test.assertEqualMessage(Colors.textOn(0xC8102E), Graphics.COLOR_WHITE, "white on red");
    Test.assertEqualMessage(Colors.textOn(0x87CEEB), Graphics.COLOR_BLACK, "black on sky blue");
    Test.assertMessage(Colors.needsOutline(0x000033) && !Colors.needsOutline(0xC8102E), "only very dark colours get an outline");
    Test.assertEqualMessage(Colors.name(0xD71920), "Red", "colour from the Create match list");
    Test.assertEqualMessage(Colors.name(-1), "None", "no colour");
    Test.assertEqualMessage(Colors.name(0xC8102E), "Custom", "hex colour from the phone");
    return true;
}

//! UI-10: a kit's cut leans as "/" (right of its edge at the top, as far left at the bottom), only on
//! the sides asked for; a team without a color is a kit in the board's blank, with white text.
(:test)
function testKits(logger as Logger) as Boolean {
    // 100 tall, so the cut leans 21 either side of the edge.
    var home = Kit.points(10.0, 110.0, 0, 100, false, true);
    Test.assertMessage(home[0][0] == 10 && home[3][0] == 10, "home's outer edge is straight");
    Test.assertMessage(home[1][0] == 131 && home[2][0] == 89, "home's right edge is cut as /");
    var away = Kit.points(120.0, 220.0, 0, 100, true, false);
    Test.assertMessage(away[0][0] == 141 && away[3][0] == 99, "away's left edge is cut as /");
    Test.assertMessage(away[1][0] == 220 && away[2][0] == 220, "away's outer edge is straight");
    Test.assertMessage(away[3][0] - home[2][0] == 10 && away[0][0] - home[1][0] == 10, "one diagonal, the same gap all the way");
    Test.assertEqualMessage(Kit.fill(-1), COLOR_KIT_BLANK, "no color: the board's blank");
    Test.assertEqualMessage(Kit.fill(0xD71920), 0xD71920, "a color: its own");
    Test.assertEqualMessage(Colors.textOn(Kit.fill(-1)), Graphics.COLOR_WHITE, "white on the blank");
    Test.assertMessage(!Colors.needsOutline(COLOR_KIT_BLANK), "the blank needs no edge");
    return true;
}

//! ET-2: with one extra-time period, ending it leads straight to the choice (or full time).
(:test)
function testSingleExtraTimePeriod(logger as Logger) as Boolean {
    var match = makeCupMatch(true, true);
    match.etPeriods = 1;
    var end = playRegularTime(match, T0);
    match.chooseExtraTime(end);
    match.endHalftime();
    match.selectKickoff(TEAM_HOME);       // ET-7: the new toss
    var t = end + 16 * 60 * 1000;
    match.startNextPeriod(t);
    Test.assertMessage(match.isLastPeriod() && !match.periodEndsMatch(), "ET1 is the last period; penalties may follow");
    match.endPeriod(at(t, 16, 0));
    Test.assertEqualMessage(match.phase, PHASE_DECIDE as Number, "choice after the only extra-time period");
    cleanUp();

    var noPens = makeCupMatch(true, false);
    noPens.etPeriods = 1;
    end = playRegularTime(noPens, T0);
    noPens.chooseExtraTime(end);
    noPens.endHalftime();
    noPens.selectKickoff(TEAM_HOME);       // ET-7: the new toss
    noPens.startNextPeriod(t);
    Test.assertMessage(noPens.periodEndsMatch(), "without penalties, ending ET1 ends the match");
    cleanUp();
    return true;
}

//! TMR-10: with stoppage not tracked, Start/Stop never starts a stoppage. Matches saved before the
//! setting existed (no key) still track it.
(:test)
function testStoppageNotTracked(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    Test.assertMessage(match.trackStoppage, "older saved matches track stoppage");
    match.trackStoppage = false;
    match.start(T0);
    match.toggleStoppage(at(T0, 5, 0));
    Test.assertMessage(!match.isStoppageActive(), "no stoppage when not tracked");
    Test.assertEqualMessage(match.stoppageTotalMs(at(T0, 6, 0)), 0l, "no stoppage time");
    cleanUp();

    var setup = Settings.matchSetup(false);
    setup["trackStoppage"] = false;
    var fromSetup = new Match(setup);
    Test.assertMessage(!fromSetup.trackStoppage, "the setting is copied into a new match");
    return true;
}

//! EVT-8: every goal type counts for the team it is recorded for and can be undone.
(:test)
function testGoalTypes(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    Test.assertMessage(!match.addEvent(EVENT_OWN_GOAL, TEAM_HOME, 4, T0) && match.events.size() == 0, "no own goal before kickoff");
    match.start(T0);
    match.addEvent(EVENT_OWN_GOAL, TEAM_HOME, 4, at(T0, 10, 0));
    match.addEvent(EVENT_PEN_GOAL, TEAM_AWAY, 9, at(T0, 20, 0));
    match.addEvent(EVENT_DFK_GOAL, TEAM_AWAY, 10, at(T0, 30, 0));
    Test.assertMessage(match.score[TEAM_HOME] == 1 && match.score[TEAM_AWAY] == 2, "1-2 from an own goal, a penalty and a free kick");
    Test.assertEqualMessage(describeEvent(match.events[0], "HOM", "AWY", 2, "stoppage", null)[0], "Own goal HOM #4", "own goal label");
    Test.assertEqualMessage(describeEvent(match.events[1], "HOM", "AWY", 2, "stoppage", null)[0], "Pen goal AWY #9", "penalty goal label");
    match.undoLastEvent(at(T0, 30, 0));
    Test.assertEqualMessage(match.score[TEAM_AWAY], 1, "undoing a free-kick goal takes it off the score");
    cleanUp();
    return true;
}

//! SET-13: Create match offers the last match's format (teams are not carried over).
(:test)
function testSameAsLastMatch(logger as Logger) as Boolean {
    var saved = Application.Storage.getValue(Settings.STORAGE_LAST_FORMAT);
    var last = Settings.matchSetup(true);
    last["home"] = "RIV";
    last["periodSec"] = 30 * 60;
    last["extraTime"] = true;
    last["trackStoppage"] = true;
    last["goalTypes"] = true;
    last["goalScorers"] = false;
    last["homeColor"] = 0xD71920;
    Settings.rememberFormat(last);

    var setup = newSetup();
    Test.assertMessage(setup["sameAsLast"] as Boolean, "switch on when there is a last match");
    Test.assertEqualMessage(setup["periodSec"] as Number, 30 * 60, "last period length");
    Test.assertMessage((setup["extraTime"] as Boolean) && (setup["trackStoppage"] as Boolean), "last switches");
    Test.assertMessage(setup["goalTypes"] as Boolean, "goal types carried over");
    Test.assertMessage(!(setup["goalScorers"] as Boolean), "goal scorers carried over");
    Test.assertEqualMessage(setup["home"] as String, "HOM", "teams are not carried over");
    Test.assertEqualMessage(setup["homeColor"] as Number, -1, "colours are not carried over");

    Application.Storage.deleteValue(Settings.STORAGE_LAST_FORMAT);
    Test.assertMessage(!newSetup().hasKey("sameAsLast"), "no switch before the first match");
    if (saved != null) {
        Application.Storage.setValue(Settings.STORAGE_LAST_FORMAT, saved);
    }
    return true;
}

//! SET-13: New match leaves out Same as last when it's Quick match over again, whatever the teams and colors.
(:test)
function testSameAsLastHiddenWhenQuick(logger as Logger) as Boolean {
    var quick = Settings.matchSetup(false);
    var last = Settings.matchSetup(true);
    last["home"] = "RIV";
    last["homeColor"] = 0xD71920;
    Test.assertMessage(Settings.sameFormat(last, quick), "same format, other teams: the same");
    last["trackStoppage"] = !(quick["trackStoppage"] as Boolean);
    Test.assertMessage(!Settings.sameFormat(last, quick), "a switch differs");
    last = Settings.matchSetup(false);
    last["periodSec"] = (quick["periodSec"] as Number) + 60;
    Test.assertMessage(!Settings.sameFormat(last, quick), "the period length differs");
    var older = {"numPeriods" => quick["numPeriods"], "periodSec" => quick["periodSec"]} as MatchData;
    Test.assertMessage(Settings.sameFormat(older, quick), "a field an older format lacks is taken as the same");
    return true;
}

//! UI-12: the screen stays on from 30 s before the period's time is up until it is ended, and while a
//! halfway break is due.
(:test)
function testScreenOnWindow(logger as Logger) as Boolean {
    var match = makeTestMatch(21 * 60 + 30, 120);
    Test.assertMessage(!match.wantsScreenOn(T0), "not before kickoff");
    match.start(T0);
    Test.assertMessage(!match.wantsScreenOn(at(T0, 10, 0)), "not mid-period");
    tickThrough(match, at(T0, 21, 30), at(T0, 21, 30));
    Test.assertMessage(match.wantsScreenOn(at(T0, 21, 31)), "while the break is due");
    match.skipBreak();
    Test.assertMessage(!match.wantsScreenOn(at(T0, 21, 32)), "not once the break is skipped");
    Test.assertMessage(!match.wantsScreenOn(at(T0, 44, 29)), "not 31 s before time is up");
    Test.assertMessage(match.wantsScreenOn(at(T0, 44, 30)), "from 30 s before time is up");
    Test.assertMessage(match.wantsScreenOn(at(T0, 48, 0)), "in added time");
    match.endPeriod(at(T0, 48, 0));
    Test.assertMessage(!match.wantsScreenOn(at(T0, 48, 1)), "not at half-time");
    cleanUp();
    return true;
}

(:debug)
function closeTo(value as Float, expected as Numeric) as Boolean {
    var diff = value - expected.toFloat();
    return diff < 0.001 && diff > -0.001;
}

//! PRE-8: the second-half kickoff team attacks the same way as the first-half kickoff team (ends
//! swap and the other team kicks off); choosing the other team flips it; correcting the kickoff
//! team after saving keeps the teams' ends; none in extra time.
(:test)
function testKickoffDirection(logger as Logger) as Boolean {
    var match = makeCupMatch(true, false);
    Test.assertMessage(match.attackHeading(1) == null, "nothing until recorded");
    match.setKickoffHeading((Math.PI / 2).toFloat());       // HOM kicks off attacking east
    match.start(T0);
    Test.assertMessage(match.canRecordDirection(), "can still record during the first period");
    match.endPeriod(at(T0, 46, 0));
    match.endHalftime();
    var east = match.attackHeading(1) as Float;
    Test.assertMessage(closeTo(east, Math.PI / 2), "AWY kicks off the second half attacking east");

    match.selectKickoff(TEAM_HOME);             // the referee changes it: HOM kicks off again
    var west = match.attackHeading(1) as Float;
    Test.assertMessage(closeTo(west, 3 * Math.PI / 2), "HOM kicking off the second half attacks west");
    match.selectKickoff(TEAM_AWAY);
    var back = match.attackHeading(1) as Float;
    Test.assertMessage(closeTo(back, Math.PI / 2), "changing back restores east");

    match.startNextPeriod(at(T0, 61, 0));
    Test.assertMessage(!match.canRecordDirection(), "not recorded after the first period");
    Test.assertMessage(match.attackHeading(2) == null, "no arrow for extra time until it's recorded");

    // ET-7: extra time's own toss and direction, recorded on ET1's kickoff screen.
    match.endPeriod(at(T0, 108, 0));
    match.chooseExtraTime(at(T0, 108, 0));
    match.endHalftime();
    Test.assertMessage(!match.canRecordDirection(), "not before ET1's kickoff team is chosen");
    match.selectKickoff(TEAM_AWAY);
    Test.assertMessage(match.canRecordDirection(), "on ET1's kickoff screen");
    Test.assertMessage(!match.hasDirection(), "extra time's not saved yet");
    match.setKickoffHeading(0.0);                               // AWY attacks north in ET1
    Test.assertMessage(match.hasDirection(), "extra time's saved");
    Test.assertMessage(closeTo(match.homeHeading as Float, Math.PI / 2), "the match's own direction is kept");
    match.startNextPeriod(at(T0, 124, 0));
    Test.assertMessage(match.canRecordDirection(), "during ET1");
    match.endPeriod(at(T0, 140, 0));
    match.endHalftime();
    Test.assertEqualMessage(match.kickoffFor(3), TEAM_HOME, "HOM kicks off ET2");
    Test.assertMessage(closeTo(match.attackHeading(3) as Float, 0), "HOM attacks north in ET2 (ends changed)");
    Test.assertMessage(!match.canRecordDirection(), "not after ET1");
    cleanUp();

    // Saved while HOM was the kickoff team, then corrected to AWY: the arrow follows the teams.
    var swapped = makeCupMatch(false, false);
    swapped.setKickoffHeading((Math.PI / 2).toFloat());     // the goal HOM attacks is east
    swapped.start(T0);
    swapped.swapKickoff();                                  // AWY actually kicked off
    swapped.endPeriod(at(T0, 46, 0));
    swapped.endHalftime();
    Test.assertEqualMessage(swapped.kickoffFor(1), TEAM_HOME, "HOM kicks off the second half");
    Test.assertMessage(closeTo(swapped.attackHeading(1) as Float, 3 * Math.PI / 2), "HOM attacks west after half-time");
    cleanUp();
    return true;
}

//! PRE-9: the spin always ends on the face that was picked, shows both faces on the way, and
//! random picks come out roughly half and half.
(:test)
function testCoinToss(logger as Logger) as Boolean {
    var results = [true, false];
    for (var i = 0; i < 2; i++) {
        var turns = CoinToss.halfTurns(results[i]);
        Test.assertEqualMessage(CoinToss.headsAt(CoinToss.angleAt(1.0, turns)), results[i], "lands on the picked face");
        Test.assertMessage(CoinToss.headsAt(CoinToss.angleAt(0.0, turns)), "starts on heads");
        var sawTails = false;
        for (var t = 0.0; t < 1.0; t += 0.05) {
            if (!CoinToss.headsAt(CoinToss.angleAt(t, turns))) {
                sawTails = true;
            }
        }
        Test.assertMessage(sawTails, "both faces show during the flip");
    }
    // Half heads, and not a pattern: about half of the flips repeat the one before (a generator
    // whose lowest bit just alternates would pass the first check but never repeat).
    var heads = 0;
    var repeats = 0;
    var last = CoinToss.pick();
    for (var i = 0; i < 1000; i++) {
        var result = CoinToss.pick();
        if (result) {
            heads += 1;
        }
        if (result == last) {
            repeats += 1;
        }
        last = result;
    }
    Test.assertMessage(heads > 430 && heads < 570, "about half heads in 1000 flips: " + heads);
    Test.assertMessage(repeats > 430 && repeats < 570, "about half the flips repeat the last: " + repeats);
    return true;
}

//! UI-22: the second clock in each style, held at the period's end, and never a copy of the main clock.
(:test)
function testSecondClock(logger as Logger) as Boolean {
    var match = makeCupMatch(true, false);
    match.start(T0);
    match.clockStyle = CLOCK_UP;
    match.secondClock = CLOCK_DOWN;
    Test.assertEqualMessage(match.secondClockText(at(T0, 12, 0)), "33:00", "time remaining");
    Test.assertEqualMessage(match.secondClockText(at(T0, 47, 5)), "0:00", "time remaining holds at 0:00");
    match.secondClock = CLOCK_UP_EACH;
    Test.assertEqualMessage(match.secondClockText(at(T0, 47, 5)), "45:00", "from 0 holds at the period length");
    match.secondClock = CLOCK_UP;
    Test.assertEqualMessage(match.secondClockText(at(T0, 12, 0)), "33:00", "same as the main clock: time remaining");
    match.clockStyle = CLOCK_DOWN;
    match.secondClock = CLOCK_DOWN;
    Test.assertEqualMessage(match.secondClockText(at(T0, 12, 0)), "12:00", "main counts down: from 0");
    cleanUp();
    return true;
}

//! UI-23: the ring's progress runs from 0 to 1 in each period and stays at 1 in added time.
(:test)
function testPeriodProgress(logger as Logger) as Boolean {
    var match = makeCupMatch(true, false);
    match.start(T0);
    Test.assertMessage(match.periodProgress(T0) == 0.0, "empty at kickoff");
    Test.assertMessage(match.periodProgress(at(T0, 22, 30)) == 0.5, "half way");
    Test.assertMessage(match.periodProgress(at(T0, 47, 5)) == 1.0, "full through added time");
    cleanUp();
    return true;
}

//! The match screen's properties, kept and put back by the tests that change them.
(:debug)
const SCREEN_TEST_KEYS = ["faceLayout", "clockStyle", "screenClocks", "mainClock", "secondClock", "breakClock", "screenEdge", "screenNames"] as Array<String>;

(:debug)
function keepScreen() as Array {
    var kept = [] as Array;
    for (var i = 0; i < SCREEN_TEST_KEYS.size(); i++) {
        kept.add(Application.Properties.getValue(SCREEN_TEST_KEYS[i]));
    }
    kept.add(Application.Storage.getValue(Sync.STORAGE_SCREEN_AT));
    kept.add(Application.Storage.getValue(Sync.STORAGE_SCREEN_CHANGE));
    return kept;
}

(:debug)
function restoreScreen(kept as Array) as Void {
    for (var i = 0; i < SCREEN_TEST_KEYS.size(); i++) {
        Application.Properties.setValue(SCREEN_TEST_KEYS[i], kept[i] as Application.Properties.ValueType);
    }
    var seen = kept[SCREEN_TEST_KEYS.size()];
    var change = kept[SCREEN_TEST_KEYS.size() + 1];
    if (seen != null) { Application.Storage.setValue(Sync.STORAGE_SCREEN_AT, seen as Application.Storage.ValueType); } else { Application.Storage.deleteValue(Sync.STORAGE_SCREEN_AT); }
    if (change != null) { Application.Storage.setValue(Sync.STORAGE_SCREEN_CHANGE, change as Application.Storage.ValueType); } else { Application.Storage.deleteValue(Sync.STORAGE_SCREEN_CHANGE); }
}

//! UI-24: the account's match screen applies only if it's newer than this watch's choice; an older
//! server's layout changes the clocks but not how they count.
(:test)
function testApplyScreen(logger as Logger) as Boolean {
    var kept = keepScreen();
    Application.Properties.setValue("mainClock", CLOCK_DOWN);
    Application.Storage.setValue(Sync.STORAGE_SCREEN_AT, 1000);
    Test.assertMessage(!Sync.applyScreen({"layout" => "ring", "secondClock" => "up", "at" => 900}), "older than the watch's");
    Test.assertMessage(!Sync.applyScreen({"layout" => "future", "secondClock" => "up", "at" => 2000}), "a layout it doesn't know");
    Test.assertMessage(Sync.applyScreen({"layout" => "ring", "secondClock" => "up", "at" => 2000}), "from an older server");
    Test.assertEqualMessage(Screen.clocks(), CLOCKS_ONE, "one clock");
    Test.assertEqualMessage(Screen.edge(), EDGE_RING, "with the ring");
    Test.assertEqualMessage(Screen.mainClock(), CLOCK_DOWN, "the match clock as it was");
    Test.assertEqualMessage(Screen.secondClock(), CLOCK_UP, "second clock set");
    Test.assertMessage(!Sync.applyScreen({"layout" => "default", "secondClock" => "down", "clocks" => "sideways", "mainClock" => "up",
        "breakClock" => "up", "edge" => "time", "names" => false, "at" => 3000}), "choices it doesn't know");
    Test.assertMessage(Sync.applyScreen({"layout" => "minimal", "secondClock" => "down", "clocks" => "stacked", "mainClock" => "upEach",
        "breakClock" => "up", "edge" => "time", "names" => false, "at" => 3000}), "every choice");
    Test.assertEqualMessage(Screen.clocks(), CLOCKS_STACKED, "stacked");
    Test.assertEqualMessage(Screen.mainClock(), CLOCK_UP_EACH, "each half from 0");
    Test.assertEqualMessage(Screen.breakClock(), BREAK_UP, "time taken");
    Test.assertEqualMessage(Screen.edge(), EDGE_TIME, "time of day");
    Test.assertMessage(!Screen.names(), "scores only");
    Sync.screenChanged();
    var sent = Sync.screenChange() as Dictionary;
    Test.assertEqualMessage(sent["layout"] as String, "stacked", "the nearest old layout, for older servers");
    Test.assertEqualMessage(sent["clocks"] as String, "stacked", "queued under the server's names");
    Test.assertEqualMessage(sent["mainClock"] as String, "upEach", "match clock queued");
    Test.assertEqualMessage(sent["edge"] as String, "time", "edge queued");
    Test.assertMessage(!(sent["names"] as Boolean), "names queued");
    restoreScreen(kept);
    return true;
}

//! UI-21: a watch updated from the six layouts reads its layout and match clock into the choices,
//! once; Scoreboard becomes one clock with names.
(:test)
function testScreenMigration(logger as Logger) as Boolean {
    var kept = keepScreen();
    Application.Properties.setValue("screenClocks", -1);
    Application.Properties.setValue("faceLayout", LAYOUT_MINIMAL);
    Application.Properties.setValue("clockStyle", CLOCK_DOWN);
    Screen.migrate();
    Test.assertEqualMessage(Screen.clocks(), CLOCKS_ONE, "minimal: one clock");
    Test.assertMessage(!Screen.names(), "minimal: scores only");
    Test.assertEqualMessage(Screen.mainClock(), CLOCK_DOWN, "the format's clock style");
    Application.Properties.setValue("faceLayout", LAYOUT_SIDE_BY_SIDE);
    Screen.migrate();
    Test.assertEqualMessage(Screen.clocks(), CLOCKS_ONE, "only once");
    Application.Properties.setValue("screenClocks", -1);
    Application.Properties.setValue("faceLayout", LAYOUT_SCOREBOARD);
    Screen.migrate();
    Test.assertEqualMessage(Screen.clocks(), CLOCKS_ONE, "scoreboard: one clock");
    Test.assertMessage(Screen.names(), "scoreboard: names");
    Test.assertEqualMessage(Screen.edge(), EDGE_NONE, "no ring");
    restoreScreen(kept);
    return true;
}

//! UI-24: a new install, or a watch that never changed the old layout or match clock, gets the
//! default screen: two clocks stacked, the time left over the match time, with the time of day.
(:test)
function testScreenDefault(logger as Logger) as Boolean {
    var kept = keepScreen();
    Application.Properties.setValue("screenClocks", -1);
    Application.Properties.setValue("faceLayout", LAYOUT_DEFAULT);
    Application.Properties.setValue("clockStyle", CLOCK_UP);
    Application.Properties.setValue("mainClock", CLOCK_UP);
    Application.Properties.setValue("screenEdge", EDGE_NONE);
    Screen.migrate();
    Test.assertEqualMessage(Screen.clocks(), CLOCKS_STACKED, "two clocks stacked");
    Test.assertEqualMessage(Screen.mainClock(), CLOCK_DOWN, "time left");
    Test.assertEqualMessage(Screen.secondClock(), CLOCK_UP, "match time under it");
    Test.assertEqualMessage(Screen.breakClock(), BREAK_DOWN, "the break counts down");
    Test.assertEqualMessage(Screen.edge(), EDGE_TIME, "the time of day");
    Test.assertMessage(Screen.names(), "names");
    restoreScreen(kept);
    return true;
}

//! UI-21, TMR-11: the screen and the match clock are fixed at kickoff and kept when the match is
//! saved and restored; a match saved by an older build reads its layout.
(:test)
function testLayoutKeptWithMatch(logger as Logger) as Boolean {
    var kept = keepScreen();
    Application.Properties.setValue("screenClocks", CLOCKS_SIDE_BY_SIDE);
    Application.Properties.setValue("mainClock", CLOCK_DOWN);
    Application.Properties.setValue("secondClock", CLOCK_DOWN);
    Application.Properties.setValue("screenEdge", EDGE_RING);
    Application.Properties.setValue("breakClock", BREAK_UP);
    var match = makeCupMatch(true, false);
    match.start(T0);
    restoreScreen(kept);
    Test.assertEqualMessage(match.clockStyle, CLOCK_DOWN, "match clock from the screen at kickoff");
    Test.assertEqualMessage(match.secondClock, CLOCK_UP_EACH, "never the match clock's style (UI-22)");
    Test.assertEqualMessage(match.screenClocks, CLOCKS_SIDE_BY_SIDE, "clocks");
    match.save();
    var restored = new Match(Application.Storage.getValue(STORAGE_MATCH) as MatchData);
    Test.assertEqualMessage(restored.screenClocks, CLOCKS_SIDE_BY_SIDE, "clocks restored");
    Test.assertEqualMessage(restored.screenEdge, EDGE_RING, "edge restored");
    Test.assertEqualMessage(restored.breakClock, BREAK_UP, "break clock restored");
    Test.assertEqualMessage(restored.clockStyle, CLOCK_DOWN, "match clock restored");
    var older = Application.Storage.getValue(STORAGE_MATCH) as MatchData;
    older.remove("screenClocks");
    older.remove("screenEdge");
    older.remove("screenNames");
    older["faceLayout"] = LAYOUT_MINIMAL;
    var old = new Match(older);
    Test.assertEqualMessage(old.screenClocks, CLOCKS_ONE, "an older build's Minimal: one clock");
    Test.assertMessage(!old.screenNames, "scores only");
    Test.assertEqualMessage(old.screenEdge, EDGE_NONE, "no ring");
    cleanUp();
    return true;
}

//! TMR-4: the break clock counts down, or up when chosen, for half-time and the halfway break.
(:test)
function testBreakClockStyles(logger as Logger) as Boolean {
    var match = makeTestMatch(20 * 60, 120);
    match.start(T0);
    match.breakClock = BREAK_DOWN;
    tickThrough(match, T0, at(T0, 20, 0));
    match.startBreak(at(T0, 20, 0));
    Test.assertEqualMessage(match.breakClockText(at(T0, 20, 30)) as String, "1:30", "time left");
    match.breakClock = BREAK_UP;
    Test.assertEqualMessage(match.breakClockText(at(T0, 20, 30)) as String, "0:30", "time taken");
    Test.assertEqualMessage(match.breakClockText(at(T0, 25, 0)) as String, "2:00", "holds at the break's length");
    match.endPeriod(at(T0, 46, 0));
    Test.assertEqualMessage(match.breakClockText(at(T0, 49, 0)) as String, "3:00", "half-time, time taken");
    match.breakClock = BREAK_DOWN;
    Test.assertEqualMessage(match.breakClockText(at(T0, 49, 0)) as String, "7:00", "half-time, time left");
    cleanUp();
    return true;
}

//! VIB-7: with stoppage tracked, the added time alert comes when the stoppage total has run out
//! after the period's length, later for a stoppage in added time, once a period.
(:test)
function testAddedTimeAlert(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.trackStoppage = true;
    match.vibeAdded = true;
    match.start(T0);
    match.toggleStoppage(at(T0, 10, 0));
    match.toggleStoppage(at(T0, 12, 0));
    // VIB-1: with stoppage tracked, full time is one vibration with nothing to answer.
    Test.assertMessage(!match.hasActiveAlert(at(T0, 45, 0)), "full time waits for no press");
    Test.assertMessage(!match.hasActiveAlert(at(T0, 46, 59)), "nothing before 47:00");
    // A stoppage in added time moves it later.
    match.toggleStoppage(at(T0, 46, 0));
    match.toggleStoppage(at(T0, 46, 30));
    Test.assertMessage(!match.hasActiveAlert(at(T0, 47, 15)), "not at 47:00 after another 30 s");
    Test.assertMessage(match.hasActiveAlert(at(T0, 47, 30)), "at 47:30");
    match.acknowledgeAlerts(at(T0, 47, 30));
    Test.assertMessage(!match.hasActiveAlert(at(T0, 48, 30)), "once a period");
    var none = makeTestMatch(-1, 0);
    none.trackStoppage = true;
    none.start(T0);
    // VIB-1: with no stoppage time at the length, full time repeats and stands for this alert.
    none.tick(at(T0, 45, 0));
    var restored = new Match(Application.Storage.getValue(STORAGE_MATCH) as MatchData);
    Test.assertMessage(restored.hasActiveAlert(at(T0, 45, 10)), "still repeating if the app closes");
    Test.assertMessage(none.acknowledgeAlerts(at(T0, 45, 0)), "full time repeats with no stoppage");
    none.toggleStoppage(at(T0, 46, 0));
    none.toggleStoppage(at(T0, 46, 30));
    Test.assertMessage(!none.hasActiveAlert(at(T0, 50, 0)), "no stoppage at the length, no alert");
    var off = makeTestMatch(-1, 0);
    off.trackStoppage = true;
    off.vibeAdded = false;
    off.start(T0);
    off.toggleStoppage(at(T0, 10, 0));
    off.toggleStoppage(at(T0, 11, 0));
    off.acknowledgeAlerts(at(T0, 45, 0));
    Test.assertMessage(!off.hasActiveAlert(at(T0, 47, 0)), "switched off");
    cleanUp();
    return true;
}

//! TMR-11: the three clock styles in the first half, the second half and extra time, with added time.
(:test)
function testClockStyles(logger as Logger) as Boolean {
    var match = makeCupMatch(true, false);
    match.start(T0);
    match.clockStyle = CLOCK_UP;
    Test.assertEqualMessage(match.clockDisplay(at(T0, 12, 34))[0], "12:34", "1H up");
    match.clockStyle = CLOCK_DOWN;
    Test.assertEqualMessage(match.clockDisplay(at(T0, 12, 34))[0], "32:26", "1H down");
    Test.assertEqualMessage(match.clockDisplay(at(T0, 47, 5))[0], "0:00", "down stops at 0:00");
    Test.assertEqualMessage(match.clockDisplay(at(T0, 47, 5))[1] as String, "+2:05", "added time after 0:00");
    Test.assertMessage(match.clockDisplay(at(T0, 44, 59))[1] == null, "no added time before the period length");

    var end = playRegularTimeFrom(match, at(T0, 47, 5));
    match.chooseExtraTime(end);
    match.endHalftime();
    match.selectKickoff(TEAM_HOME);       // ET-7: the new toss
    match.startNextPeriod(end + 16 * 60 * 1000);
    var t = end + 16 * 60 * 1000;
    match.clockStyle = CLOCK_UP;
    Test.assertEqualMessage(match.clockDisplay(at(t, 3, 0))[0], "93:00", "ET1 up runs from 90:00");
    match.clockStyle = CLOCK_UP_EACH;
    Test.assertEqualMessage(match.clockDisplay(at(t, 3, 0))[0], "3:00", "ET1 up from 0");
    match.clockStyle = CLOCK_DOWN;
    Test.assertEqualMessage(match.clockDisplay(at(t, 3, 0))[0], "12:00", "ET1 down from 15:00");
    match.clockStyle = CLOCK_UP;
    Test.assertEqualMessage(match.clockDisplay(at(t, 16, 0))[0], "105:00", "ET1 up stops at 105:00");
    cleanUp();
    return true;
}

//! TMR-11: counting up through the match, the second half starts at 45:00 whatever the added time,
//! and event times in the list are match time.
(:test)
function testContinuousSecondHalf(logger as Logger) as Boolean {
    var match = makeCupMatch(false, false);
    match.clockStyle = CLOCK_UP;
    match.start(T0);
    match.endPeriod(at(T0, 47, 13));
    match.endHalftime();
    var t1 = at(T0, 63, 0);
    match.startNextPeriod(t1);
    Test.assertEqualMessage(match.clockDisplay(t1)[0], "45:00", "2H starts at 45:00, not 47:13");
    match.addEvent(EVENT_GOAL, TEAM_AWAY, 9, at(t1, 22, 14));
    var when = describeEvent(match.events[match.events.size() - 1], "HOM", "AWY", 2, "stoppage", match.periodStarts())[1];
    Test.assertEqualMessage(when, "2H 67:14", "goal at match time 67:14");
    Test.assertEqualMessage(describeEvent(match.events[match.events.size() - 1], "HOM", "AWY", 2, "stoppage", null)[1],
        "2H 22:14", "per-period time without period starts");
    match.clockStyle = CLOCK_DOWN;
    Test.assertMessage(match.periodStarts() == null, "event times per period for a countdown");
    cleanUp();
    return true;
}

//! Plays the rest of the first half (ending at `firstEnd`) and the second half; returns when it ended.
(:debug)
function playRegularTimeFrom(match as Match, firstEnd as Long) as Long {
    match.endPeriod(firstEnd);
    match.endHalftime();
    var t2 = firstEnd + 15 * 60 * 1000;
    match.startNextPeriod(t2);
    var end = at(t2, 47, 0);
    match.endPeriod(end);
    return end;
}

//! TMR-11: older saved matches without the setting keep counting from 0.
(:test)
function testClockStyleDefaults(logger as Logger) as Boolean {
    Test.assertEqualMessage(makeTestMatch(-1, 0).clockStyle, CLOCK_UP_EACH, "saved matches without the setting");
    cleanUp();
    return true;
}

// ---- Sync (SYNC-1 to SYNC-7) ----

//! A match as GET /v1/watch/matches sends it.
(:debug)
function syncedMatch() as Dictionary {
    return {
        "id" => "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", "kickoff" => 1793520000, "title" => "STR v ROV",
        "where" => "Twin Creeks, Field 3", "home" => "STR", "away" => "ROV", "homeName" => "Strikers U12", "awayName" => "Rovers U12",
        "homeColor" => 0xC8102E, "awayColor" => -1, "numPeriods" => 2, "periodSec" => 1800, "halftimeSec" => 300, "teamSize" => 9,
        "midBreak" => true, "breakLenSec" => 120, "extraTime" => false, "etPeriods" => 2, "etPeriodSec" => 600, "penalties" => false,
        "clockStyle" => CLOCK_DOWN, "trackStoppage" => true, "goalTypes" => false, "weather" => "54° rain"
    };
}

//! SYNC-3: a downloaded match starts with its teams and format, this watch's alerts, and its id kept.
(:test)
function testSyncedMatchSetup(logger as Logger) as Boolean {
    var match = new Match(Sync.setupFor(syncedMatch()));
    Test.assertEqualMessage(match.home, "STR", "short name");
    Test.assertEqualMessage(match.homeName, "Strikers U12", "team name");
    Test.assertEqualMessage(match.homeColor, 0xC8102E, "colour");
    Test.assertEqualMessage(match.periodSec, 1800, "2 x 30");
    Test.assertEqualMessage(match.teamSize, 9, "9 a side");
    Test.assertEqualMessage(match.breakAtSec, 840, "halfway break due at 14:00 (TMR-7)");
    Test.assertEqualMessage(match.details["id"] as String, "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", "planned match id kept");
    Test.assertMessage(match.vibeFullTime, "alerts from this watch's settings");
    var text = Sync.describe(syncedMatch());
    Test.assertEqualMessage(text[0], "STR v ROV", "menu label");
    Test.assertMessage(text[1].find("Twin Creeks, Field 3") != null, "menu line has the place: " + text[1]);
    Test.assertMessage(text[1].find("54° rain · Twin") != null, "and the forecast before it (WX-7): " + text[1]);
    cleanUp();
    return true;
}

//! SYNC-11: marking a fee paid shows on the downloaded match at once and queues one change per
//! match, the newest; a sent change leaves, but not a newer one made while it was going.
(:test)
function testFeePaidQueues(logger as Logger) as Boolean {
    var savedMatches = Application.Storage.getValue(Sync.STORAGE_MATCHES);
    var savedFees = Application.Storage.getValue(Sync.STORAGE_FEES);
    var match = syncedMatch();
    match["fee"] = {"text" => "$40", "paid" => false};
    Application.Storage.setValue(Sync.STORAGE_MATCHES, [match] as Array<Application.Storage.ValueType>);
    Application.Storage.deleteValue(Sync.STORAGE_FEES);
    var id = match["id"] as String;

    Sync.setFeePaid(id, true);
    var fee = Sync.matches()[0]["fee"] as Dictionary;
    Test.assertMessage((fee["paid"] as Boolean) == true, "shown paid straight away");
    Sync.setFeePaid(id, false);
    Sync.setFeePaid(id, true);
    var queued = Sync.feeOutbox();
    Test.assertEqualMessage(queued.size(), 1, "one change a match");
    Test.assertMessage((queued[0]["paid"] as Boolean) == true, "the newest");
    var sending = queued[0];
    // Changed again while the first was on its way: the newer one stays.
    Application.Storage.setValue(Sync.STORAGE_FEES, [{"matchId" => id, "paid" => false, "at" => (sending["at"] as Number) + 5}] as Array<Application.Storage.ValueType>);
    Sync.feeSent(sending);
    Test.assertEqualMessage(Sync.feeOutbox().size(), 1, "a newer change isn't taken off");
    Sync.feeSent(Sync.feeOutbox()[0]);
    Test.assertEqualMessage(Sync.feeOutbox().size(), 0, "sent changes leave");

    if (savedMatches != null) {
        Application.Storage.setValue(Sync.STORAGE_MATCHES, savedMatches as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_MATCHES);
    }
    if (savedFees != null) {
        Application.Storage.setValue(Sync.STORAGE_FEES, savedFees as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_FEES);
    }
    return true;
}

//! SYNC-12: pitch corners wait to be sent, one marking per match (a planned match's id, else a
//! quick match's start); a newer marking replaces the older; a sent one leaves.
(:test)
function testPitchCornersQueue(logger as Logger) as Boolean {
    var saved = Application.Storage.getValue(Sync.STORAGE_PITCHES);
    Application.Storage.deleteValue(Sync.STORAGE_PITCHES);
    var corners = [{"lat" => 37.5, "lon" => -122.3}, {"lat" => 37.501, "lon" => -122.3}] as Array<Dictionary>;
    var planned = {"matchId" => "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b"};
    var quick = {"created" => 1793520000};
    Sync.queuePitch(planned, corners);
    Sync.queuePitch(quick, corners);
    corners.add({"lat" => 37.501, "lon" => -122.299});
    Sync.queuePitch(planned, corners);
    var queued = Sync.pitchOutbox();
    Test.assertEqualMessage(queued.size(), 2, "one marking a match");
    Test.assertEqualMessage(Sync.pitchQueued(planned), 3, "the newest, with three corners");
    Test.assertEqualMessage(Sync.pitchQueued(quick), 2, "the quick match's, by its start");
    Test.assertMessage(queued[0].hasKey("matchId") && !queued[0].hasKey("created") && queued[1].hasKey("created") && !queued[1].hasKey("matchId"), "each names its match one way");
    Sync.pitchSent(queued[1]);
    Test.assertEqualMessage(Sync.pitchQueued(quick), 0, "sent markings leave");
    Test.assertEqualMessage(Sync.pitchQueued(planned), 3, "the other stays");
    if (saved != null) {
        Application.Storage.setValue(Sync.STORAGE_PITCHES, saved as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_PITCHES);
    }
    return true;
}

//! UI-20: a planned match's fee goes with it when it starts, so History can mark it paid later.
(:test)
function testFeeKeptWithFinishedMatch(logger as Logger) as Boolean {
    var savedHistory = Application.Storage.getValue(History.STORAGE_KEY);
    var savedFees = Application.Storage.getValue(Sync.STORAGE_FEES);
    var savedMatches = Application.Storage.getValue(Sync.STORAGE_MATCHES);
    Application.Storage.deleteValue(History.STORAGE_KEY);
    Application.Storage.deleteValue(Sync.STORAGE_MATCHES);
    var synced = syncedMatch();
    synced["fee"] = {"text" => "$40", "paid" => false};
    var match = new Match(Sync.setupFor(synced));
    var fee = match.details["fee"] as Dictionary;
    Test.assertEqualMessage(fee["text"] as String, "$40", "the fee goes with the match");
    match.selectKickoff(TEAM_HOME);
    match.start(T0);
    History.add(match);
    Sync.setFeePaid(synced["id"] as String, true);
    var entry = History.all()[0];
    Test.assertMessage((((entry["details"] as Dictionary)["fee"] as Dictionary)["paid"] as Boolean) == true, "marked paid in History");
    History.update(match);
    entry = History.all()[0];
    Test.assertMessage((((entry["details"] as Dictionary)["fee"] as Dictionary)["paid"] as Boolean) == true, "and stays so when the match is saved again");
    if (savedHistory != null) {
        Application.Storage.setValue(History.STORAGE_KEY, savedHistory as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(History.STORAGE_KEY);
    }
    if (savedFees != null) {
        Application.Storage.setValue(Sync.STORAGE_FEES, savedFees as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_FEES);
    }
    if (savedMatches != null) {
        Application.Storage.setValue(Sync.STORAGE_MATCHES, savedMatches as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_MATCHES);
    }
    cleanUp();
    return true;
}

//! EVT-12: a downloaded match's sin bins; without them (an older server), off and 10 minutes.
(:test)
function testSyncedSinBins(logger as Logger) as Boolean {
    var none = new Match(Sync.setupFor(syncedMatch()));
    Test.assertMessage(!none.sinBins, "missing: off");
    Test.assertEqualMessage(none.sinBinSec, 600, "missing: 10 minutes");
    var synced = syncedMatch();
    synced["sinBins"] = true;
    synced["sinBinSec"] = 300;
    var match = new Match(Sync.setupFor(synced));
    Test.assertMessage(match.sinBins, "sin bins on");
    Test.assertEqualMessage(match.sinBinSec, 300, "5 minutes");
    Test.assertMessage(!none.addEvent(EVENT_SIN_BIN, TEAM_HOME, 4, T0), "no Sin bin without them");
    Test.assertMessage(match.events.size() == 0 && none.events.size() == 0, "nothing recorded");
    cleanUp();
    return true;
}

//! SYNC-4: a finished match goes up with its planned match's id; a newer copy replaces the queued one.
(:test)
function testOutboxReplacesAndRemoves(logger as Logger) as Boolean {
    var saved = Application.Storage.getValue(Sync.STORAGE_OUTBOX);
    Application.Storage.deleteValue(Sync.STORAGE_OUTBOX);
    var match = new Match(Sync.setupFor(syncedMatch()));
    match.selectKickoff(TEAM_HOME);
    match.start(T0);
    match.addEvent(EVENT_GOAL, TEAM_HOME, 9, at(T0, 5, 12));
    var upload = Sync.uploadFor(match);
    Test.assertEqualMessage(upload["matchId"] as String, "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", "linked to the planned match");
    Test.assertEqualMessage((upload["events"] as Array).size(), 1, "the goal");
    Test.assertEqualMessage((upload["score"] as Array)[0] as Number, 1, "score");

    Sync.queue(upload);
    Sync.queue({"created" => 1, "events" => []});
    upload["score"] = [2, 0];
    Sync.queue(upload);
    var queued = Sync.outbox();
    Test.assertEqualMessage(queued.size(), 2, "the same match only once");
    Test.assertEqualMessage((queued[0]["score"] as Array)[0] as Number, 2, "the newest copy");
    Sync.sent(1);
    Test.assertEqualMessage(Sync.outbox().size(), 1, "sent matches leave the outbox");
    for (var i = 0; i < Sync.MAX_OUTBOX + 3; i++) {
        Sync.queue({"created" => 100 + i, "events" => []});
    }
    Test.assertEqualMessage(Sync.outbox().size(), Sync.MAX_OUTBOX, "the outbox is capped");

    if (saved != null) {
        Application.Storage.setValue(Sync.STORAGE_OUTBOX, saved as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_OUTBOX);
    }
    cleanUp();
    return true;
}

//! SYNC-2: the server address from the phone settings, without a trailing slash; the hosted service when blank.
(:test)
function testServerUrl(logger as Logger) as Boolean {
    var saved = Application.Properties.getValue("serverUrl");
    // Without a server chosen on the watch (SYNC-9), or one kept from linking (SYNC-2).
    var chosen = Application.Storage.getValue(Sync.STORAGE_SERVER);
    var linked = Application.Storage.getValue(Sync.STORAGE_LINKED_SERVER);
    Application.Storage.deleteValue(Sync.STORAGE_SERVER);
    Application.Storage.deleteValue(Sync.STORAGE_LINKED_SERVER);
    Application.Properties.setValue("serverUrl", "https://lawfive.example.com/");
    Test.assertEqualMessage(Sync.serverUrl(), "https://lawfive.example.com", "trailing slash dropped");
    Application.Properties.setValue("serverUrl", "");
    Test.assertEqualMessage(Sync.serverUrl(), Sync.DEFAULT_SERVER, "blank means the hosted service");
    Application.Properties.setValue("serverUrl", saved instanceof String ? saved : Sync.DEFAULT_SERVER);
    if (chosen != null) {
        Application.Storage.setValue(Sync.STORAGE_SERVER, chosen);
    }
    restoreStorage(Sync.STORAGE_LINKED_SERVER, linked);
    return true;
}

//! SYNC-8: a built-in server wins over whatever the setting holds; without one, the setting is used.
(:test)
function testBuiltInServer(logger as Logger) as Boolean {
    var mine = "https://lawfive.example.com";
    Test.assertEqualMessage(Sync.serverFrom("", mine), mine, "blank setting");
    Test.assertEqualMessage(Sync.serverFrom(Sync.DEFAULT_SERVER, mine), mine, "hosted default kept from an earlier install");
    Test.assertEqualMessage(Sync.serverFrom("https://old-tunnel.example.com", mine), mine, "any old setting");
    Test.assertEqualMessage(Sync.serverFrom("https://other.example.com/", ""), "https://other.example.com", "no built-in server: the setting");
    Test.assertEqualMessage(Sync.serverFrom("", ""), Sync.DEFAULT_SERVER, "no built-in server or setting");
    return true;
}

//! TRK-7: samples as text; deltas from the chunk's last position, one second written as nothing.
(:test)
function testTrackSampleText(logger as Logger) as Boolean {
    Test.assertEqualMessage(TrackLog.encode(10, 51500000, -120000, null, null, 345, 142), ",51500000,-120000,345,142;", "first position whole");
    Test.assertEqualMessage(TrackLog.encode(10, 51500003, -120005, 51500000, -120000, 120, 141), ",3,-5,120,141;", "then the change");
    Test.assertEqualMessage(TrackLog.encode(12, null, null, 51500003, -120005, null, 140), "12,,,,140;", "heart rate only, 1.2 s later");
    Test.assertEqualMessage(TrackLog.encode(10, 51500004, -120005, 51500003, -120005, null, null), ",1,0;", "no speed or heart rate");
    return true;
}

//! TRK-7: chunks of CHUNK_SAMPLES, queued at full time, deleted as each is sent.
(:test)
function testTrackChunksAndUpload(logger as Logger) as Boolean {
    var savedOutbox = Application.Storage.getValue(TrackLog.STORAGE_OUTBOX);
    Application.Storage.deleteValue(TrackLog.STORAGE_OUTBOX);
    var created = 7;
    TrackLog.begin(created, T0);
    Test.assertMessage(TrackLog.isRecording(created), "recording");
    for (var i = 0; i <= TrackLog.CHUNK_SAMPLES; i++) {
        TrackLog.add(T0 + i * 1000, 51500000 + i, -120000, 300, 140);
    }
    var first = Application.Storage.getValue(TrackLog.chunkKey(created, 0)) as String;
    Test.assertEqualMessage(first.substring(0, 23) as String, "0,51500000,-120000,300,", "first chunk starts at the kickoff, whole");
    TrackLog.finish(created);
    Test.assertMessage(!TrackLog.isRecording(created), "stopped at full time");
    var entry = TrackLog.nextUpload() as Array<Number>;
    Test.assertMessage(entry[0] == created && entry[2] == 2 && entry[3] == 0, "two chunks queued");
    var upload = TrackLog.uploadFor(entry) as Dictionary;
    Test.assertMessage((upload["count"] as Number) == 2 && (upload["index"] as Number) == 0 && (upload["start"] as Number) == (T0 / 1000).toNumber(), "the upload says which chunk");
    var second = Application.Storage.getValue(TrackLog.chunkKey(created, 1)) as String;
    Test.assertEqualMessage(second, "3000,51500300,-120000,300,140;", "the second chunk counts from the start, position whole");
    TrackLog.sent(created, 0);
    Test.assertMessage(Application.Storage.getValue(TrackLog.chunkKey(created, 0)) == null, "sent chunk deleted");
    Test.assertMessage((TrackLog.nextUpload() as Array<Number>)[3] == 1, "then the next chunk");
    TrackLog.sent(created, 1);
    Test.assertMessage(TrackLog.nextUpload() == null && !TrackLog.isQueued(created), "track off the outbox after its last chunk");

    if (savedOutbox != null) {
        Application.Storage.setValue(TrackLog.STORAGE_OUTBOX, savedOutbox);
    }
    return true;
}

//! TRK-7, PRE-6: a match records its track from kickoff and restarting throws it away; each
//! period's kickoff time is kept for the figures.
(:test)
function testMatchRecordsTrack(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.recordTrack = true;
    match.start(T0);
    Test.assertMessage(TrackLog.isRecording(match.created), "recording from kickoff");
    Test.assertMessage(match.startedAt.size() == 1 && match.startedAt[0] == (T0 / 1000).toNumber(), "first kickoff time");
    TrackLog.add(at(T0, 0, 1), 51500000, -120000, 300, 140);
    match.restart();
    Test.assertMessage(!TrackLog.isRecording(match.created) && match.startedAt.size() == 0, "restart drops the track");
    match.start(T0);
    match.endPeriod(at(T0, 45, 0));
    match.endHalftime();
    match.selectKickoff(TEAM_AWAY);
    var second = at(T0, 60, 0);
    match.startNextPeriod(second);
    Test.assertMessage(match.startedAt.size() == 2 && match.startedAt[1] == (second / 1000).toNumber(), "second kickoff time");
    TrackLog.discard(match.created);
    cleanUp();
    return true;
}

//! VER-3: the watch says which LawFive it runs, after which watch it is; SYNC-13: the phone's
//! server shown as a host.
(:test)
function testDeviceHeaderAndHost(logger as Logger) as Boolean {
    var header = Sync.deviceHeader();
    Test.assertMessage(header.find("garmin; model=") == 0, "which watch first");
    var app = "; app=" + Sync.APP_VERSION;
    Test.assertEqualMessage(header.substring(header.length() - app.length(), header.length()) as String, app, "the app's version last");
    Test.assertEqualMessage(PhoneLink.hostOf("https://lawfive.example.com"), "lawfive.example.com", "the scheme dropped");
    Test.assertEqualMessage(PhoneLink.hostOf("lawfive.example.com"), "lawfive.example.com", "no scheme");
    return true;
}

//! SYNC-9: an address typed on the watch becomes a server URL; a server chosen on the watch wins
//! over the phone setting.
(:test)
function testTypedServer(logger as Logger) as Boolean {
    Test.assertEqualMessage(Sync.typedServer("lawfive.example.com") as String, "https://lawfive.example.com", "https:// added");
    Test.assertEqualMessage(Sync.typedServer("https://lawfive.example.com/ ") as String, "https://lawfive.example.com", "space and slash dropped");
    Test.assertEqualMessage(Sync.typedServer("http://localhost:3000") as String, "http://localhost:3000", "a typed scheme is kept");
    Test.assertMessage(Sync.typedServer("https://") == null, "nothing typed");
    var saved = Application.Storage.getValue(Sync.STORAGE_SERVER);
    var linked = Application.Storage.getValue(Sync.STORAGE_LINKED_SERVER);
    var setting = Application.Properties.getValue("serverUrl");
    Application.Properties.setValue("serverUrl", "https://from-phone.example.com");
    Application.Storage.deleteValue(Sync.STORAGE_SERVER);
    Application.Storage.deleteValue(Sync.STORAGE_LINKED_SERVER);
    Test.assertEqualMessage(Sync.serverUrl(), Sync.BUILT_IN_SERVER.length() > 0 ? Sync.BUILT_IN_SERVER : "https://from-phone.example.com", "nothing chosen: as before");
    Sync.chooseServer("https://mine.example.com/");
    Test.assertEqualMessage(Sync.serverUrl(), "https://mine.example.com", "chosen on the watch");
    Test.assertMessage(!Sync.isHosted(), "not the hosted service");
    Sync.chooseServer(Sync.DEFAULT_SERVER);
    Test.assertMessage(Sync.isHosted(), "hosted chosen");
    if (saved != null) {
        Application.Storage.setValue(Sync.STORAGE_SERVER, saved);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_SERVER);
    }
    Application.Properties.setValue("serverUrl", setting instanceof String ? setting : Sync.DEFAULT_SERVER);
    restoreStorage(Sync.STORAGE_LINKED_SERVER, linked);
    return true;
}

//! SYNC-2: a linked watch keeps the server it was linked with, so changing the phone setting can't
//! send it (and its token) elsewhere; unlinked, the setting chooses the server again.
(:test)
function testLinkedServerKept(logger as Logger) as Boolean {
    var savedToken = Application.Storage.getValue(Sync.STORAGE_TOKEN);
    var savedLinked = Application.Storage.getValue(Sync.STORAGE_LINKED_SERVER);
    var savedChosen = Application.Storage.getValue(Sync.STORAGE_SERVER);
    var savedSetting = Application.Properties.getValue("serverUrl");
    var savedOutbox = Application.Storage.getValue(Sync.STORAGE_OUTBOX);
    Application.Storage.deleteValue(Sync.STORAGE_SERVER);
    Application.Storage.deleteValue(Sync.STORAGE_LINKED_SERVER);
    Application.Storage.deleteValue(Sync.STORAGE_TOKEN);
    var builtIn = Sync.BUILT_IN_SERVER.length() > 0;
    Application.Properties.setValue("serverUrl", "https://first.example.com");
    var first = builtIn ? Sync.BUILT_IN_SERVER : "https://first.example.com";
    Sync.linkWith("test-token", Sync.unlinkedServerUrl());
    Application.Properties.setValue("serverUrl", "https://elsewhere.example.com");
    Test.assertEqualMessage(Sync.serverUrl(), first, "linked: the setting changed, the server didn't");
    Application.Storage.deleteValue(Sync.STORAGE_TOKEN);
    Test.assertEqualMessage(Sync.serverUrl(), builtIn ? Sync.BUILT_IN_SERVER : "https://elsewhere.example.com", "unlinked: the setting chooses again");
    // A watch linked before the server was kept keeps the one it used.
    Application.Storage.deleteValue(Sync.STORAGE_LINKED_SERVER);
    Sync.setToken("test-token");
    Sync.keepLinkedServer();
    Application.Properties.setValue("serverUrl", "https://third.example.com");
    Test.assertEqualMessage(Sync.serverUrl(), builtIn ? Sync.BUILT_IN_SERVER : "https://elsewhere.example.com", "an older link kept at start");
    restoreStorage(Sync.STORAGE_TOKEN, savedToken);
    restoreStorage(Sync.STORAGE_LINKED_SERVER, savedLinked);
    restoreStorage(Sync.STORAGE_SERVER, savedChosen);
    restoreStorage(Sync.STORAGE_OUTBOX, savedOutbox);
    Application.Properties.setValue("serverUrl", savedSetting instanceof String ? savedSetting : Sync.DEFAULT_SERVER);
    return true;
}

(:debug)
function restoreStorage(key as String, value as Application.Storage.ValueType?) as Void {
    if (value != null) {
        Application.Storage.setValue(key, value);
    } else {
        Application.Storage.deleteValue(key);
    }
}

//! SYNC-4, SYNC-13: linking queues every match in History not yet on LawFive, oldest first, but
//! not one already sent.
(:test)
function testLinkingQueuesHistory(logger as Logger) as Boolean {
    var savedHistory = Application.Storage.getValue(History.STORAGE_KEY);
    var savedOutbox = Application.Storage.getValue(Sync.STORAGE_OUTBOX);
    var savedToken = Application.Storage.getValue(Sync.STORAGE_TOKEN);
    var savedLinked = Application.Storage.getValue(Sync.STORAGE_LINKED_SERVER);
    Application.Storage.deleteValue(History.STORAGE_KEY);
    Application.Storage.deleteValue(Sync.STORAGE_OUTBOX);
    var created = [] as Array<Number>;
    for (var i = 0; i < 3; i++) {
        var match = makeTestMatch(-1, 0);
        match.created += i * 1000;
        match.start(T0);
        History.add(match);
        created.add(match.created);
    }
    History.markSent(created[1]);
    Sync.linkWith("test-token", Sync.unlinkedServerUrl());
    var queued = Sync.outbox();
    Test.assertEqualMessage(queued.size(), 2, "the two not sent");
    Test.assertEqualMessage(queued[queued.size() - 1]["created"] as Number, created[0], "the oldest goes first");
    Test.assertMessage(!Sync.isQueued(created[1]), "not the one already sent");
    Sync.linkWith("test-token", Sync.unlinkedServerUrl());
    Test.assertEqualMessage(Sync.outbox().size(), 2, "linking again doesn't queue them twice");
    if (savedHistory != null) {
        Application.Storage.setValue(History.STORAGE_KEY, savedHistory);
    } else {
        Application.Storage.deleteValue(History.STORAGE_KEY);
    }
    if (savedOutbox != null) {
        Application.Storage.setValue(Sync.STORAGE_OUTBOX, savedOutbox);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_OUTBOX);
    }
    if (savedToken != null) {
        Application.Storage.setValue(Sync.STORAGE_TOKEN, savedToken);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_TOKEN);
    }
    restoreStorage(Sync.STORAGE_LINKED_SERVER, savedLinked);
    cleanUp();
    return true;
}

//! UI-17: History keeps the whole match, so one not yet on LawFive can be sent from it; its state
//! follows the upload queue and the server; removing it takes it off the queue too.
(:test)
function testHistoryStates(logger as Logger) as Boolean {
    var savedHistory = Application.Storage.getValue(History.STORAGE_KEY);
    var savedOutbox = Application.Storage.getValue(Sync.STORAGE_OUTBOX);
    Application.Storage.deleteValue(Sync.STORAGE_OUTBOX);
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    match.addEvent(EVENT_GOAL, TEAM_HOME, 9, at(T0, 10, 0));
    History.add(match);
    var created = match.created;
    var entry = History.find(created) as Dictionary;
    Test.assertEqualMessage(History.title(entry), "HOM 1-0 AWY", "title");
    Test.assertMessage(History.uploadOf(entry) != null, "the whole match is kept, to send");
    Test.assertEqualMessage(History.stateShort(entry), "Not sent", "not on LawFive yet");
    Sync.queue(History.uploadOf(entry) as Dictionary);
    Test.assertEqualMessage(History.stateShort(entry), "Waiting to send", "queued");
    Sync.sent(created);
    History.markSent(created);
    entry = History.find(created) as Dictionary;
    Test.assertMessage(History.isSent(entry) && History.stateShort(entry).equals("Sent"), "sent");
    History.update(match);
    Test.assertMessage(History.isSent(History.find(created) as Dictionary), "a later update keeps when it was sent");
    Sync.queue(History.uploadOf(entry) as Dictionary);
    History.remove(created);
    Test.assertMessage(History.find(created) == null && !Sync.isQueued(created), "removed, and off the queue");
    if (savedHistory != null) {
        Application.Storage.setValue(History.STORAGE_KEY, savedHistory);
    } else {
        Application.Storage.deleteValue(History.STORAGE_KEY);
    }
    if (savedOutbox != null) {
        Application.Storage.setValue(Sync.STORAGE_OUTBOX, savedOutbox);
    }
    cleanUp();
    return true;
}

//! DIAG-1: the battery at each period's kickoff and end, GPS quality and restarts, kept with the match.
(:test)
function testDiagnostics(logger as Logger) as Boolean {
    var match = makeTestMatch(-1, 0);
    match.start(T0);
    Test.assertEqualMessage(match.batteryLog.size(), 1, "kickoff");
    Test.assertEqualMessage(match.batteryLog[0][1], 0, "at kickoff");
    match.noteGps(false, at(T0, 0, 1));
    match.noteGps(false, at(T0, 0, 2));
    match.noteGps(true, at(T0, 0, 3));
    match.noteGps(true, at(T0, 0, 4));
    Test.assertEqualMessage(match.gpsSamples, 4, "samples");
    Test.assertEqualMessage(match.gpsMissed, 2, "without a fix");
    Test.assertEqualMessage(match.gpsFirstFixSec as Number, 3, "first fix");
    match.endPeriod(at(T0, 45, 0));
    Test.assertEqualMessage(match.batteryLog.size(), 2, "period end");
    Test.assertEqualMessage(match.batteryLog[1][1], 1, "at the end");
    var saved = loadMatch() as Match;
    Test.assertEqualMessage(saved.batteryLog.size(), 2, "kept when saved");
    Test.assertEqualMessage(saved.gpsMissed, 2, "kept when saved");
    var d = match.diagnostics();
    Test.assertEqualMessage((d["battery"] as Array).size(), 2, "goes up with the match");
    Test.assertEqualMessage(d["gpsSamples"] as Number, 4, "with its samples");
    cleanUp();
    return true;
}

// UI-26: the screen says a sync with matches or tracks went through, even if it ran under a menu;
// a sync with nothing to send, or one that stopped unseen, stays quiet.
(:test)
function testSyncScreenOffered(logger as Logger) as Boolean {
    var total = Sync.stepsTotal;
    var problem = Sync.lastProblem;
    var shown = Sync._screenShown;
    Sync._screenShown = false;
    Sync.lastProblem = null;
    Sync.stepsTotal = 20;
    Test.assertMessage(Sync.wantsScreen(), "a match and its track went");
    Sync.lastProblem = "No phone";
    Test.assertMessage(!Sync.wantsScreen(), "it stopped, with no one looking");
    Sync.lastProblem = null;
    Sync.stepsTotal = 0;
    Test.assertMessage(!Sync.wantsScreen(), "nothing to send");
    Sync.stepsTotal = 20;
    Sync.screenShown();
    Test.assertMessage(!Sync.wantsScreen(), "once a sync");
    Sync.stepsTotal = total;
    Sync.lastProblem = problem;
    Sync._screenShown = shown;
    return true;
}

// PRE-8: a watch that has ever given a compass reading keeps the menu row.
(:test)
function testCompassAvailable(logger as Logger) as Boolean {
    var seen = Application.Storage.getValue("compassSeen");
    Application.Storage.setValue("compassSeen", true);
    Test.assertMessage(Compass.available(), "once seen, always offered");
    Application.Storage.deleteValue("compassSeen");
    Test.assertEqualMessage(Compass.available(), Compass.heading() != null, "otherwise only with a reading now");
    if (seen != null) {
        Application.Storage.setValue("compassSeen", seen);
    } else {
        Application.Storage.deleteValue("compassSeen");
    }
    return true;
}

// EVT-11: the score stands, the event says why, and it's ended.
(:test)
function testAbandon(logger as Logger) as Boolean {
    // Both matches end, which adds them to the history and the uploads: put those back after.
    var savedHistory = Application.Storage.getValue(History.STORAGE_KEY);
    var savedOutbox = Application.Storage.getValue(Sync.STORAGE_OUTBOX);
    var running = makeCupMatch(true, false);
    running.start(T0);
    running.abandon(at(T0, 10, 0), 1);
    Test.assertMessage(running.phase == PHASE_DONE, "ended");
    Test.assertMessage(running.isAbandoned(), "abandoned");
    var last = running.events[running.events.size() - 1];
    Test.assertMessage((last[EV_TYPE] as String).equals(EVENT_ABANDON), "the last event");
    Test.assertMessage((last[EV_DURATION] as Number) == 1, "with its reason");
    Test.assertMessage((last[EV_SECONDS] as Number) == 600, "and when");
    Test.assertMessage(((running.events[running.events.size() - 2])[EV_TYPE] as String).equals(EVENT_PERIOD_END), "after the period ended");
    var finished = makeCupMatch(true, false);
    finished.start(T0);
    finished.finish(at(T0, 10, 0));
    Test.assertMessage(!finished.isAbandoned(), "an ordinary finish isn't");
    Application.Storage.setValue(History.STORAGE_KEY, savedHistory);
    if (savedOutbox != null) {
        Application.Storage.setValue(Sync.STORAGE_OUTBOX, savedOutbox as Application.Storage.ValueType);
    } else {
        Application.Storage.deleteValue(Sync.STORAGE_OUTBOX);
    }
    cleanUp();
    return true;
}

//! SYNC-4, TRK-7: only LawFive's own refusal (JSON with an "error") drops what was being sent; a
//! proxy's 404 while a server restarts leaves it for the next sync.
(:test)
function testOnlyTheServerDropsUploads(logger as Logger) as Boolean {
    Test.assertMessage(Sync.fromServer({ "error" => "invalid track chunk" }), "LawFive's own answer");
    Test.assertMessage(!Sync.fromServer("404 page not found"), "a proxy's page");
    Test.assertMessage(!Sync.fromServer(null), "no body");
    Test.assertMessage(!Sync.fromServer({ "message" => "Not Found" }), "someone else's JSON");
    return true;
}

//! INP-10: the account's team swipes, as the server sends them; the team controls slide in the way
//! they're swiped open and leave the way they came.
(:test)
function testTeamSwipes(logger as Logger) as Boolean {
    var kept = Application.Storage.getValue(Sync.STORAGE_TEAM_SWIPES);
    Application.Storage.deleteValue(Sync.STORAGE_TEAM_SWIPES);
    Test.assertMessage(!Sync.sidewaysSwipes(), "down and up until the account says");
    Test.assertEqualMessage(teamSlideIn(TEAM_HOME), WatchUi.SLIDE_DOWN, "home from the top");
    Application.Storage.setValue(Sync.STORAGE_TEAM_SWIPES, "sideways");
    Test.assertMessage(Sync.sidewaysSwipes(), "sideways");
    Test.assertEqualMessage(teamSlideIn(TEAM_HOME), WatchUi.SLIDE_RIGHT, "home from the left");
    Test.assertEqualMessage(teamSlideOut(TEAM_HOME), WatchUi.SLIDE_LEFT, "and back out to the left");
    Test.assertEqualMessage(teamSlideIn(TEAM_AWAY), WatchUi.SLIDE_LEFT, "away from the right");
    Application.Storage.setValue(Sync.STORAGE_TEAM_SWIPES, "upDown");
    Test.assertMessage(!Sync.sidewaysSwipes(), "down and up again");
    if (kept != null) { Application.Storage.setValue(Sync.STORAGE_TEAM_SWIPES, kept); } else { Application.Storage.deleteValue(Sync.STORAGE_TEAM_SWIPES); }
    return true;
}

//! INP-11: a Back press with the screen off, or just after it turned on, only turns it on; the time
//! it turned on is kept until it goes off again.
(:test)
function testWakingBackPress(logger as Logger) as Boolean {
    Test.assertMessage(Wake.isWaking(false, 0, 5000), "screen still off");
    Test.assertMessage(Wake.isWaking(true, 5000, 5000 + Wake.WAKE_MS - 1), "just turned on");
    Test.assertMessage(!Wake.isWaking(true, 5000, 5000 + Wake.WAKE_MS), "on for a moment: the game menu");
    var keptOn = Wake.screenOn;
    var keptSince = Wake.onSinceMs;
    Wake.changed(false, 1000);
    Wake.changed(true, 2000);
    Test.assertEqualMessage(Wake.onSinceMs, 2000, "turned on at 2000");
    Wake.changed(true, 3000);
    Test.assertEqualMessage(Wake.onSinceMs, 2000, "staying on keeps when it turned on");
    Wake.screenOn = keptOn;
    Wake.onSinceMs = keptSince;
    return true;
}

//! SET-16: a match of one period has no label, its menus say "period", and its summary no break.
(:test)
function testOnePeriodWords(logger as Logger) as Boolean {
    Test.assertEqualMessage(Format.periodLabel(0, 1), "", "no label");
    Test.assertEqualMessage(Format.periodLabel(1, 1), "ET1", "extra time keeps its own");
    Test.assertEqualMessage(Format.periodName(0, 1), "period", "End period");
    Test.assertEqualMessage(Format.withPeriod(0, 1, "12:00"), "12:00", "the time alone");
    Test.assertEqualMessage(Format.withPeriod(0, 2, "12:00"), "1H 12:00", "the label before the time");
    Test.assertEqualMessage(Format.summary(1, 1200, 300), "1x20'", "no break in the summary");
    Test.assertEqualMessage(Format.summary(2, 2700, 900), "2x45' · HT 15'", "halves as before");
    return true;
}

//! INP-12: Touch lock is offered on a watch with Up and Down (this test runs on the fr965), off by default.
(:test)
function testTouchLockSetting(logger as Logger) as Boolean {
    var saved = Application.Properties.getValue("touchLock");
    Test.assertMessage(Settings.hasTeamButtons(), "the fr965 has Up and Down");
    Application.Properties.setValue("touchLock", false);
    Test.assertMessage(!Settings.touchLock(), "off");
    Application.Properties.setValue("touchLock", true);
    Test.assertMessage(Settings.touchLock(), "on");
    Test.assertEqualMessage(controlsSummary(), "Touch lock", "Settings says so");
    Application.Properties.setValue("touchLock", saved instanceof Boolean ? saved : false);
    return true;
}

//! TMR-15: the stopping clock and its goals-and-cards switch from the phone settings (the Clock list),
//! through Same as last, Quick match's format, a downloaded match (off from an older server) and the
//! upload; a stopping clock tracks stoppage whatever the setup says.
(:test)
function testStoppingClockFormat(logger as Logger) as Boolean {
    var savedFormat = Application.Storage.getValue(Settings.STORAGE_LAST_FORMAT);
    var savedKind = Application.Properties.getValue("clockKind");
    var savedStop = Application.Properties.getValue("stopForGoalsCards");
    var savedQuick = Application.Properties.getValue("trackStoppage");

    Application.Properties.setValue("clockKind", 1);
    Application.Properties.setValue("stopForGoalsCards", false);
    var quick = Settings.matchSetup(false);
    Test.assertMessage(quick["stoppingClock"] as Boolean, "the Clock list's Stops");
    Test.assertMessage(!(quick["stopForGoalsCards"] as Boolean), "goals and cards set not to stop it");
    quick["trackStoppage"] = false;
    var match = new Match(quick);
    Test.assertMessage(match.stoppingClock && match.trackStoppage, "a stopping clock tracks stoppage");
    Test.assertMessage(!match.stopForGoalsCards, "carried into the match");

    Settings.rememberFormat(quick);
    var setup = newSetup();
    Test.assertMessage(setup["stoppingClock"] as Boolean, "Same as last keeps the clock");
    Test.assertMessage(!(setup["stopForGoalsCards"] as Boolean), "and the switch");
    Application.Properties.setValue("clockKind", 0);
    Test.assertMessage(!Settings.sameFormat(Settings.lastFormat() as MatchData, Settings.matchSetup(false)), "a clock that runs on is another format");
    Settings.saveQuickFormat(setup);
    Test.assertEqualMessage(Application.Properties.getValue("clockKind") as Number, 1, "Quick match's format saved as the list's value");

    var older = new Match(Sync.setupFor(syncedMatch()));
    Test.assertMessage(!older.stoppingClock && older.stopForGoalsCards, "an older server's match runs on");
    var synced = syncedMatch();
    synced["stoppingClock"] = true;
    synced["stopForGoalsCards"] = true;
    var planned = new Match(Sync.setupFor(synced));
    Test.assertMessage(planned.stoppingClock && planned.stopForGoalsCards && planned.trackStoppage, "a downloaded stopping clock");
    planned.selectKickoff(TEAM_HOME);
    planned.start(T0);
    planned.addEvent(EVENT_GOAL, TEAM_HOME, 9, at(T0, 20, 0));
    Test.assertMessage(planned.clockStopped(), "a goal stops it");
    var upload = Sync.uploadFor(planned);
    Test.assertEqualMessage(upload["stoppingClock"] as Boolean, true, "the upload says the clock stopped");
    Test.assertEqualMessage(upload["stopForGoalsCards"] as Boolean, true, "and the switch");

    if (savedFormat != null) {
        Application.Storage.setValue(Settings.STORAGE_LAST_FORMAT, savedFormat);
    } else {
        Application.Storage.deleteValue(Settings.STORAGE_LAST_FORMAT);
    }
    Application.Properties.setValue("clockKind", savedKind instanceof Number ? savedKind : 0);
    Application.Properties.setValue("stopForGoalsCards", savedStop instanceof Boolean ? savedStop : true);
    Application.Properties.setValue("trackStoppage", savedQuick instanceof Boolean ? savedQuick : false);
    cleanUp();
    return true;
}
