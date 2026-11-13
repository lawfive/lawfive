import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.Test;

// WCH-2: the shared match cases (schema/match-cases/*.json, as MatchCases.mc) run on this engine: each
// case's format and screen, then its steps' actions at their times, checking what's expected after each.
// A mismatch names the case, the step and the field; every mismatch is logged before the test fails.

(:debug)
const CASE_PHASES = ["pre", "ready", "running", "break", "done", "nextKickoff", "decide", "penalties", "golden", "suspended"] as Array<String>;
(:debug)
const CASE_STYLES = ["up", "upEach", "down"] as Array<String>;

(:debug)
function caseTeam(name as Object?) as Number {
    return "away".equals(name) ? TEAM_AWAY : TEAM_HOME;
}

(:debug)
function caseTeamName(team as Number) as String? {
    return team == TEAM_HOME ? "home" : team == TEAM_AWAY ? "away" : null;
}

//! A case's format as a new match's setup; what it leaves out is the other watches' default.
(:debug)
function caseMatch(format as Dictionary) as Match {
    var d = {
        "home" => "HOM", "away" => "AWY", "numPeriods" => 2, "periodSec" => 45 * 60, "halftimeSec" => 15 * 60,
        "midBreak" => false, "breakLenSec" => 120, "breakStoppage" => true, "trackStoppage" => false,
        "goalScorers" => true, "goalTypes" => false, "extraTime" => false, "etPeriods" => 2, "etPeriodSec" => 15 * 60,
        "goldenGoal" => false, "penalties" => false, "repeatSec" => 10, "reminderSec" => 10,
        "vibeFullTime" => true, "vibeStoppage" => true, "vibeBreak" => true, "created" => (T0 / 1000).toNumber()
    } as MatchData;
    var keys = format.keys();
    for (var i = 0; i < keys.size(); i++) {
        d[keys[i] as String] = format[keys[i]] as Application.PropertyValueType;
    }
    return new Match(d);
}

//! The screen a case starts its match with: the watch reads it from its settings at kickoff (UI-21).
(:debug)
function caseScreen(screen as Dictionary) as Void {
    var clocks = screen["clocks"] as Object?;
    Application.Properties.setValue("screenClocks", "stacked".equals(clocks) ? CLOCKS_STACKED : "sideBySide".equals(clocks) ? CLOCKS_SIDE_BY_SIDE : CLOCKS_ONE);
    var main = CASE_STYLES.indexOf(screen["mainClock"] as Object?);
    Application.Properties.setValue("mainClock", main < 0 ? CLOCK_UP : main);
    var second = CASE_STYLES.indexOf(screen["secondClock"] as Object?);
    Application.Properties.setValue("secondClock", second < 0 ? CLOCK_DOWN : second);
    Application.Properties.setValue("breakClock", "up".equals(screen["breakClock"] as Object?) ? BREAK_UP : BREAK_DOWN);
}

(:debug)
function caseAct(match as Match, a as Dictionary, now as Long) as Void {
    var what = a["do"] as String;
    if (what.equals("kickoff")) { match.selectKickoff(caseTeam(a["team"] as Object?)); }
    else if (what.equals("clearKickoff")) { match.clearKickoff(); }
    else if (what.equals("start")) { match.start(now); }
    else if (what.equals("swapKickoff")) { match.swapKickoff(); }
    else if (what.equals("endPeriod")) { match.endPeriod(now); }
    else if (what.equals("endHalftime")) { match.endHalftime(); }
    else if (what.equals("startNextPeriod")) { match.startNextPeriod(now); }
    else if (what.equals("stoppage")) { match.toggleStoppage(now); }
    else if (what.equals("undo")) { match.undoLastEvent(now); }
    else if (what.equals("restart")) { match.restart(); }
    else if (what.equals("startBreak")) { match.startBreak(now); }
    else if (what.equals("skipBreak")) { match.skipBreak(); }
    else if (what.equals("endBreakEarly")) { match.endBreakEarly(now); }
    else if (what.equals("chooseExtraTime")) { match.chooseExtraTime(now); }
    else if (what.equals("choosePenalties")) { match.choosePenalties(); }
    else if (what.equals("penaltyFirst")) { match.selectPenaltyFirst(caseTeam(a["team"] as Object?)); }
    else if (what.equals("startPenalties")) { match.startPenalties(); }
    else if (what.equals("kick")) { match.recordKick((a["scored"] as Boolean?) == true); }
    else if (what.equals("acknowledge")) { match.acknowledgeAlerts(now); }
    else if (what.equals("finish")) { match.finish(now); }
    else if (what.equals("abandon")) { match.abandon(now, a["reason"] as Number); }
    else if (what.equals("undoGoldenGoal")) { match.undoGoldenGoal(); }
    else if (what.equals("resetBreak")) { match.resetBreak(); }
    else if (what.equals("event")) { match.addEvent(a["type"] as String, caseTeam(a["team"] as Object?), a["player"] as Number?, now); }
    else if (what.equals("official")) { match.addOfficialCard((a["type"] as String).equals("R"), caseTeam(a["team"] as Object?), a["role"] as Number, now); }
    else if (what.equals("adjustClock")) { match.adjustClock(a["sec"] as Number, now); }
    else if (what.equals("adjustAdded")) { match.adjustAdded(a["sec"] as Number, now); }
    else if (what.equals("suspend")) { match.suspend(a["reason"] as Number, now); }
    else if (what.equals("resume")) { match.resume(now); }
    else if (what.equals("lightningAgain")) { match.lightningAgain(now); }
    // EVT-14.
    else if (what.equals("reason")) { match.giveReason(a["code"] as String); }
    else { System.println("unknown action " + what); }
}

//! What the match shows for an expected field, as the cases write it.
(:debug)
function caseShown(match as Match, key as String, now as Long, alert as Symbol?) as Object? {
    if (key.equals("clock")) { return match.clockDisplay(now)[0]; }
    if (key.equals("added")) { return match.clockDisplay(now)[1]; }
    if (key.equals("second")) { return match.screenClocks == CLOCKS_ONE ? null : match.secondClockText(now); }
    if (key.equals("progress")) { return match.periodProgress(now); }
    if (key.equals("breakClock")) { return match.breakClockText(now); }
    if (key.equals("phase")) { return CASE_PHASES[match.phase]; }
    if (key.equals("period")) { return match.period; }
    if (key.equals("score")) { return match.score; }
    if (key.equals("kickoff")) { return caseTeamName(match.firstKickoff()); }
    if (key.equals("kickoffOnScreen")) { return caseTeamName(match.kickoffTeamOnScreen()); }
    if (key.equals("events")) { return match.events.size(); }
    if (key.equals("alert")) {
        var names = {:fullTime => "fullTime", :addedTime => "addedTime", :breakStart => "breakStart", :breakEnd => "breakEnd", :reminder => "reminder", :lightning => "lightning", :sinBinEnd => "sinBinEnd"};
        return alert == null ? null : names[alert] as String;
    }
    if (key.equals("alerting")) { return match.hasActiveAlert(now); }
    if (key.equals("breakDue")) { return match.breakDue; }
    if (key.equals("stoppageRunning")) { return match.isStoppageActive(); }
    // TMR-15.
    if (key.equals("clockStopped")) { return match.clockStopped(); }
    // TMR-16.
    if (key.equals("stoppage")) { var pill = match.stoppagePill(now); return pill == null ? null : {"text" => pill[0], "solid" => pill[1]}; }
    if (key.equals("pens")) { return match.penaltyScore(); }
    if (key.equals("endedGolden")) { return match.endedGolden; }
    if (key.equals("abandoned")) { return match.isAbandoned(); }
    if (key.equals("periodLabel")) { return Format.periodLabel(match.period, match.numPeriods); }
    if (key.equals("stoppageMs")) { return match.stoppageTotalMs(now).toNumber(); }
    if (key.equals("breakStoppageRunning")) { return match.breakStoppageRunning; }
    if (key.equals("breakLeftMs")) { var left = match.breakRemainingMs(now); return left == null ? null : left.toNumber(); }
    if (key.equals("breakDueInMs")) { var due = match.breakDueInMs(now); return due == null ? null : due.toNumber(); }
    if (key.equals("suspendedMs")) { var gone = match.suspendedMs(now); return gone == null ? null : gone.toNumber(); }
    if (key.equals("lightningLeftMs")) { var wait = match.lightningLeftMs(now); return wait == null ? null : wait.toNumber(); }
    if (key.equals("screenOn")) { return match.wantsScreenOn(now); }
    if (key.equals("decision")) {
        var names = {:extraTime => "extraTime", :penalties => "penalties", :endMatch => "endMatch"};
        return names[match.recommendedDecision()] as String;
    }
    if (key.equals("nextKicker")) { return caseTeamName(match.nextKicker()); }
    if (key.equals("penaltyWinner")) { return caseTeamName(match.penaltyWinner()); }
    if (key.equals("goldenWinner")) { return caseTeamName(match.goldenWinner()); }
    // EVT-12.
    if (key.equals("sinBinPill")) { return match.sinBinPill(now); }
    if (key.equals("sinBins")) { return match.runningSinBins(now).size(); }
    if (key.equals("sinBinReturn")) {
        if (match.sinBinReturns.size() == 0) {
            return null;
        }
        var e = match.sinBinReturns[0];
        return {"team" => caseTeamName(e[EV_TEAM] as Number), "player" => e[EV_PLAYER]};
    }
    // EVT-14.
    if (key.equals("reasons")) { return match.cardReasons(); }
    return "(" + key + " isn't checked on Garmin)";
}

(:debug)
function caseSame(a as Object?, b as Object?) as Boolean {
    if (a == null || b == null) {
        return a == null && b == null;
    }
    if ((a instanceof Float || a instanceof Number) && (b instanceof Float || b instanceof Number)) {
        var d = (a as Numeric).toFloat() - (b as Numeric).toFloat();
        return d < 0.0001 && d > -0.0001;
    }
    if (a instanceof Array && b instanceof Array) {
        if (a.size() != b.size()) {
            return false;
        }
        for (var i = 0; i < a.size(); i++) {
            if (!caseSame(a[i] as Object?, b[i] as Object?)) {
                return false;
            }
        }
        return true;
    }
    // EVT-12's sinBinReturn: the fields the case names.
    if (a instanceof Dictionary && b instanceof Dictionary) {
        var keys = b.keys();
        if (a.size() != keys.size()) {
            return false;
        }
        for (var i = 0; i < keys.size(); i++) {
            if (!caseSame(a[keys[i]] as Object?, b[keys[i]] as Object?)) {
                return false;
            }
        }
        return true;
    }
    return a.equals(b);
}

(:test)
function testSharedCases(logger as Logger) as Boolean {
    var saved = [Application.Properties.getValue("screenClocks"), Application.Properties.getValue("mainClock"),
        Application.Properties.getValue("secondClock"), Application.Properties.getValue("breakClock")];
    var failures = 0;
    var cases = matchCases();
    for (var c = 0; c < cases.size(); c++) {
        var test = cases[c];
        var name = test["name"] as String;
        caseScreen(test["screen"] as Dictionary);
        var match = caseMatch(test["format"] as Dictionary);
        var steps = test["steps"] as Array<Dictionary>;
        for (var s = 0; s < steps.size(); s++) {
            var step = steps[s];
            var now = T0 + (step["at"] as Number);
            var actions = step["do"] as Array<Dictionary>;
            for (var a = 0; a < actions.size(); a++) {
                if ("reopen".equals(actions[a]["do"] as String)) {
                    // TMR-8: the app closed and opened again: the match read back from what was saved, as at start.
                    match.save();
                    var reopened = loadMatch();
                    if (reopened == null) {
                        logger.error(name + " › step " + (s + 1) + ": nothing saved to reopen");
                        failures += 1;
                    } else {
                        match = reopened;
                    }
                } else {
                    caseAct(match, actions[a], now);
                }
            }
            var expect = step["expect"] as Dictionary?;
            if (expect == null) {
                continue;
            }
            // A tick fires what's due at this time, before the rest is read.
            Alerts.last = null;
            if (expect.hasKey("alert")) {
                match.tick(now);
            }
            var alert = Alerts.last;
            var keys = expect.keys();
            for (var k = 0; k < keys.size(); k++) {
                var key = keys[k] as String;
                var where = name + " › step " + (s + 1);
                if (key.equals("breakPill")) {
                    continue; // The pictures' own.
                }
                if (key.equals("last")) {
                    var e = expect[key] as Dictionary;
                    if (match.events.size() == 0) {
                        logger.error(where + ": no events");
                        failures += 1;
                        continue;
                    }
                    var last = match.events[match.events.size() - 1];
                    var got = {"type" => last[EV_TYPE], "team" => caseTeamName(last[EV_TEAM] as Number), "seconds" => last[EV_SECONDS], "player" => last[EV_PLAYER],
                        "extra" => last.size() > EV_DURATION ? last[EV_DURATION] : null,
                        "reason" => last.size() > EV_REASON ? last[EV_REASON] : null};
                    var fields = e.keys();
                    for (var f = 0; f < fields.size(); f++) {
                        var field = fields[f] as String;
                        var wanted = e[field] as Object?;
                        var have = got[field] as Object?;
                        if (!caseSame(have, wanted)) {
                            logger.error(where + ": last." + field + " expected " + wanted + ", got " + have);
                            failures += 1;
                        }
                    }
                    continue;
                }
                var value = caseShown(match, key, now, alert);
                var wanted = expect[key] as Object?;
                if (!caseSame(value, wanted)) {
                    logger.error(where + ": " + key + " expected " + wanted + ", got " + value);
                    failures += 1;
                }
            }
        }
        cleanUp();
    }
    var names = ["screenClocks", "mainClock", "secondClock", "breakClock"];
    for (var i = 0; i < names.size(); i++) {
        var value = saved[i];
        if (value != null) {
            Application.Properties.setValue(names[i], value as Application.Properties.ValueType);
        }
    }
    logger.debug(cases.size() + " shared cases");
    return failures == 0;
}
