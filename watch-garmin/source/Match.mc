import Toybox.Activity;
import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Time;

enum MatchPhase {
    PHASE_PRE,      // choosing the kickoff team
    PHASE_READY,    // kickoff team chosen, waiting for Start
    PHASE_RUNNING,  // a period is being played
    PHASE_BREAK,    // half-time (or the break between periods)
    PHASE_DONE,     // full time
    PHASE_NEXT_KICKOFF, // half-time ended, choosing who kicks off the next period
    PHASE_DECIDE,       // regular time (or extra time) over: extra time, penalties or end match? (ET-1)
    PHASE_PENALTIES,    // penalty shoot-out (ET-3)
    PHASE_GOLDEN,       // ET-6: a golden goal in extra time; End match or Undo, while the clock runs on
    PHASE_SUSPENDED     // TMR-13: play suspended (lightning, weather), every clock stopped until Resume
    // Only append: saved matches store the phase as a number.
}

const TEAM_HOME = 0;
const TEAM_AWAY = 1;

// Event types stored in the match record (EVT-1, EVT-4).
const EVENT_GOAL = "G";
const EVENT_OWN_GOAL = "GO";        // goal types, when the match records them (EVT-8)
const EVENT_PEN_GOAL = "GP";
const EVENT_DFK_GOAL = "GF";
const EVENT_YELLOW = "Y";
const EVENT_RED = "R";
const EVENT_SECOND_YELLOW = "Y2";   // a numbered player's second yellow; counts as a sending-off (EVT-5)
const EVENT_OFFICIAL_YELLOW = "TY"; // EVT-15: a team official's caution and send-off, the role in EV_DURATION
const EVENT_OFFICIAL_RED = "TR";    // (0 head coach, 1 assistant coach, 2 other)
const EVENT_INJURY = "I";           // EVT-16
const EVENT_STOPPAGE = "S";
const EVENT_PERIOD_END = "E";
const EVENT_PEN_SCORED = "PG";      // shoot-out kicks (ET-3)
const EVENT_PEN_MISSED = "PM";
const EVENT_CLOCK_ADJUSTED = "CK";  // TMR-14: the match clock and the added time corrected,
const EVENT_ADDED_ADJUSTED = "CA";  // the change in whole seconds (signed) in EV_DURATION
const EVENT_ABANDON = "A";          // EVT-11: the reason's number in EV_DURATION
const EVENT_SUSPENDED = "SU";       // TMR-13: play suspended, the reason's number (as an abandonment's) in
const EVENT_RESUMED = "RS";         // EV_DURATION, and resumed, the whole seconds suspended in EV_DURATION
const EVENT_SIN_BIN = "SB";         // EVT-12: a sin bin, its length in seconds in EV_DURATION; a second for the
const EVENT_SECOND_SIN_BIN = "SB2"; // same team and number, a send-off, with the length too

//! TMR-13: the reason numbers play can be suspended for (an abandonment's, but not 3, not enough
//! players), and the US 30-minute lightning rule, started over by each strike.
const SUSPEND_REASONS = [0, 1, 2, 4] as Array<Number>;
const REASON_LIGHTNING = 1;
const LIGHTNING_WAIT_MS = 1800000l;

// Each event is stored as an array: [type, team, period, match seconds, player number, duration seconds].
// Team is -1 for stoppages and period ends. Cards given outside play have no match time; their
// match seconds is one of the SECONDS_* markers below.
const EV_TYPE = 0;
const EV_TEAM = 1;
const EV_PERIOD = 2;
const EV_SECONDS = 3;

const SECONDS_BEFORE_KICKOFF = -1;
const SECONDS_AT_BREAK = -2;
const SECONDS_AFTER_FULL_TIME = -3;
const SECONDS_PENALTIES = -4;
const EV_PLAYER = 4;
const EV_DURATION = 5;
// EVT-14: a card's reason, a misconduct code of the match's scheme, when one was chosen: a seventh field
// only on the watch. The upload sends the reasons beside the six fields (cardReasons, uploadEvents).
const EV_REASON = 6;

const STORAGE_MATCH = "match";

// TMR-11: how the match clock is shown. The clock itself is always the time since the period started.
const CLOCK_UP = 0;          // counts up through the match: the second half runs 45:00 to 90:00
const CLOCK_UP_EACH = 1;     // counts up from 0:00 in every period
const CLOCK_DOWN = 2;        // counts down to 0:00 in every period

typedef MatchData as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>;

//! A match in progress. All clocks are derived from stored start times, and the
//! whole state is saved on every change so the match survives an app restart (TMR-8).
class Match {
    // Configuration, fixed when the match is created (SET-10). `home` and `away` are the short
    // names shown on screen (alias, SET-5); `homeName` and `awayName` the full names, if any.
    var home as String;
    var away as String;
    var homeName as String;
    var awayName as String;
    var homeColor as Number;            // team colour (UI-10), or -1 for none
    var awayColor as Number;
    var numPeriods as Number;           // regular periods
    var periodSec as Number;
    var halftimeSec as Number;          // break between periods, also before and within extra time (ET-2)
    var teamSize as Number;
    var breakAtSec as Number;           // the halfway break's time into each regular period, or -1 (TMR-7)
    var breakLenSec as Number;
    var extraTime as Boolean;
    var etPeriods as Number;
    var etPeriodSec as Number;
    var goldenGoal as Boolean;          // ET-6: a goal in extra time ends the match
    var penalties as Boolean;
    var trackStoppage as Boolean;       // TMR-10: off means no stoppage clock at all
    var breakStoppage as Boolean;       // TMR-12: a halfway break's time is added on, as stoppage
    var stoppingClock as Boolean;       // TMR-15: the match clock stops while a stoppage runs, with no added time
    var stopForGoalsCards as Boolean;   // TMR-15: a goal or card recorded stops a stopping clock
    var sinBins as Boolean;             // EVT-12: Sin bin in the team menu, for sinBinSec of the match clock
    var sinBinSec as Number;
    var reasonScheme as String;         // EVT-14: the misconduct codes a card's reason is chosen from
    // The match screen (UI-21), taken from Screen at kickoff so it doesn't change during the match.
    var clockStyle as Number;           // TMR-11: CLOCK_UP, CLOCK_UP_EACH or CLOCK_DOWN
    var secondClock as Number;          // UI-22: the second clock's CLOCK_ style
    var screenClocks as Number;         // a CLOCKS_ value
    var screenEdge as Number;           // an EDGE_ value
    var screenNames as Boolean;         // the team names over the clock, or scores only
    var breakClock as Number;           // TMR-4: BREAK_DOWN or BREAK_UP
    var goalScorers as Boolean;         // EVT-10: ask the number for each goal
    var goalTypes as Boolean;           // EVT-8: ask Goal / Own goal / Penalty / Direct FK
    var recordTrack as Boolean;         // TRK-7: keep GPS and heart rate for LawFive
    var details as MatchData;           // match id, officials, notes and the like: stored only (SET-10)
    var repeatSec as Number;
    var reminderSec as Number;
    var vibeFullTime as Boolean;
    var vibeAdded as Boolean;           // VIB-7
    var vibeStoppage as Boolean;
    var vibeBreak as Boolean;
    var vibeSinBin as Boolean;          // EVT-12: the sin bin return's vibration
    var stoppageLabel as String;
    var breakLabel as String;

    // State.
    var phase as Number = PHASE_PRE;
    var period as Number = 0;
    var kickoff as Number = -1;
    var periodStart as Long? = null;
    var stoppageMs as Long = 0l;
    var stoppageStart as Long? = null;
    var breakEnd as Long? = null;
    var breakIsHalftime as Boolean = false;
    var scheduledBreakDone as Boolean = false;
    var fullTimeAcked as Boolean = false;
    var addedAcked as Boolean = false;        // VIB-7: the added time alert, once a period
    var fullTimeRepeats as Boolean = false;   // VIB-1: stoppage tracked, but none when the length was reached
    var breakDue as Boolean = false;          // scheduled break time reached, waiting for the referee (TMR-7)
    var breakDueSilenced as Boolean = false;
    var breakEndAlerted as Boolean = false;
    var breakStoppageRunning as Boolean = false;  // the stoppage was started by the halfway break (TMR-12)
    var score as Array<Number> = [0, 0];
    var events as Array<Array> = [];
    var penFirst as Number = -1;              // team taking the first shoot-out kick (ET-3)
    // PRE-8: compass heading (radians, from true north) of the goal the home team attacks in the
    // first period, or null if the referee did not record it. Kept per team, not per kickoff team,
    // so changing or swapping the kickoff team afterwards does not change it.
    var homeHeading as Float? = null;
    // ET-7: a new toss decides extra time, so its kickoff team (the team kicking off ET1, -1 until
    // chosen) and the heading of the goal the home team attacks in ET1 are kept apart from the above.
    var etKickoff as Number = -1;
    var etHomeHeading as Float? = null;
    var penStarted as Boolean = false;
    //! ET-6: it ended on a golden goal.
    var endedGolden as Boolean = false;
    var created as Number;
    //! When each period kicked off, in seconds since 1970, for the track's figures (TRK-3).
    var startedAt as Array<Number> = [];
    // DIAG-1: how the recording went.
    var batteryLog as Array<Array<Number>> = [] as Array<Array<Number>>;
    var gpsFirstFixSec as Number? = null;
    var gpsSamples as Number = 0;
    var gpsMissed as Number = 0;
    var restarts as Number = 0;
    //! SYNC-7: metres covered in the match, from the activity recording, read at full time.
    var distanceM as Float? = null;
    // TMR-13: while suspended, when it was, why (a SUSPEND_REASONS number, -1 for none), and when the
    // lightning countdown last started (lightning only).
    var suspendedAt as Long? = null;
    var suspendReason as Number = -1;
    var lightningFrom as Long? = null;
    var lightningAlerted as Boolean = false;
    //! EVT-12: the sin bins over (their events), waiting for a button for "can return", in the order they ended.
    var sinBinReturns as Array<Array> = [] as Array<Array>;

    // Alert timing only matters while the app is running, so it is not saved.
    private var _lastRepeat as Long = 0l;
    private var _lastReminder as Long = 0l;
    //! EVT-12: the time played at the last tick, so each sin bin's end is announced once. Saved with the
    //! waiting returns, so a restart neither repeats nor loses one.
    private var _sinBinCheckedMs as Long = 0l;

    //! Builds a match from a stored dictionary, or from a setup (Settings.matchSetup, Create match) for a new one.
    function initialize(d as MatchData) {
        home = d.get("home") as String;
        away = d.get("away") as String;
        numPeriods = d.get("numPeriods") as Number;
        periodSec = d.get("periodSec") as Number;
        halftimeSec = d.get("halftimeSec") as Number;
        breakLenSec = d.get("breakLenSec") as Number;
        // Read defensively: matches saved before SET-10 lack the newer keys.
        homeName = stringOr(d.get("homeName"), "");
        awayName = stringOr(d.get("awayName"), "");
        homeColor = numberOr(d.get("homeColor"), -1);
        awayColor = numberOr(d.get("awayColor"), -1);
        teamSize = numberOr(d.get("teamSize"), 11);
        extraTime = booleanOr(d.get("extraTime"), false);
        etPeriods = numberOr(d.get("etPeriods"), 2);
        etPeriodSec = numberOr(d.get("etPeriodSec"), 15 * 60);
        // Only with extra time; matches saved before ET-6 didn't have it.
        goldenGoal = extraTime && booleanOr(d.get("goldenGoal"), false);
        penalties = booleanOr(d.get("penalties"), false);
        // Matches saved before TMR-10 always tracked stoppage.
        trackStoppage = booleanOr(d.get("trackStoppage"), true);
        // Matches saved before TMR-12 didn't add break time.
        breakStoppage = booleanOr(d.get("breakStoppage"), false);
        // TMR-15: matches saved before the stopping clock run on. It stops with the stoppage clock, so it needs it.
        stoppingClock = booleanOr(d.get("stoppingClock"), false);
        stopForGoalsCards = booleanOr(d.get("stopForGoalsCards"), true);
        if (stoppingClock) {
            trackStoppage = true;
        }
        // A new match has "midBreak"; a saved one keeps the break time it started with (TMR-7).
        var breakAt = d.get("breakAtSec");
        breakAtSec = breakAt instanceof Number ? breakAt : halfwayBreakAtSec(d);
        // EVT-12: matches saved before sin bins have none.
        sinBins = booleanOr(d.get("sinBins"), false);
        sinBinSec = numberOr(d.get("sinBinSec"), 600);
        // EVT-14: a planned match's codes, else the account's (as the last sync said), else IFAB's.
        var scheme = d.get("misconductScheme");
        reasonScheme = misconductScheme(scheme instanceof String ? scheme : Sync.accountScheme());
        // Matches saved before TMR-11 counted up from 0:00 each period.
        clockStyle = numberOr(d.get("clockStyle"), CLOCK_UP_EACH);
        // Matches saved before UI-21's choices have one of the six layouts, or none (Default).
        var layout = numberOr(d.get("faceLayout"), LAYOUT_DEFAULT);
        secondClock = numberOr(d.get("secondClock"), CLOCK_DOWN);
        screenClocks = numberOr(d.get("screenClocks"), Screen.clocksOf(layout));
        screenEdge = numberOr(d.get("screenEdge"), layout == LAYOUT_RING ? EDGE_RING : EDGE_NONE);
        screenNames = booleanOr(d.get("screenNames"), layout != LAYOUT_MINIMAL);
        breakClock = numberOr(d.get("breakClock"), BREAK_DOWN);
        goalScorers = booleanOr(d.get("goalScorers"), true);
        goalTypes = booleanOr(d.get("goalTypes"), false);
        recordTrack = booleanOr(d.get("recordTrack"), false);
        var info = d.get("details");
        details = info instanceof Dictionary ? info as MatchData : {} as MatchData;
        repeatSec = d.get("repeatSec") as Number;
        reminderSec = d.get("reminderSec") as Number;
        vibeFullTime = d.get("vibeFullTime") as Boolean;
        vibeAdded = booleanOr(d.get("vibeAdded"), true);
        vibeStoppage = d.get("vibeStoppage") as Boolean;
        vibeBreak = d.get("vibeBreak") as Boolean;
        vibeSinBin = booleanOr(d.get("vibeSinBin"), true);
        // Matches saved before timer names existed fall back to the defaults (SET-8).
        stoppageLabel = stringOr(d.get("stoppageLabel"), "stoppage");
        breakLabel = stringOr(d.get("breakLabel"), "break");

        var createdValue = d.get("created");
        created = createdValue instanceof Number ? createdValue : Time.now().value();
        if (!d.hasKey("phase")) {
            return;
        }
        phase = d.get("phase") as Number;
        period = d.get("period") as Number;
        kickoff = d.get("kickoff") as Number;
        periodStart = d.get("periodStart") as Long?;
        stoppageMs = d.get("stoppageMs") as Long;
        stoppageStart = d.get("stoppageStart") as Long?;
        breakEnd = d.get("breakEnd") as Long?;
        breakIsHalftime = d.get("breakIsHalftime") as Boolean;
        scheduledBreakDone = d.get("scheduledBreakDone") as Boolean;
        fullTimeAcked = d.get("fullTimeAcked") as Boolean;
        addedAcked = booleanOr(d.get("addedAcked"), false);
        fullTimeRepeats = booleanOr(d.get("fullTimeRepeats"), false);
        // Read defensively: matches saved before break acceptance existed lack these keys.
        breakDue = booleanOr(d.get("breakDue"), false);
        breakDueSilenced = booleanOr(d.get("breakDueSilenced"), false);
        breakEndAlerted = d.get("breakEndAlerted") as Boolean;
        breakStoppageRunning = booleanOr(d.get("breakStoppageRunning"), false);
        score = d.get("score") as Array<Number>;
        events = d.get("events") as Array<Array>;
        penFirst = numberOr(d.get("penFirst"), -1);
        var heading = d.get("homeHeading");
        homeHeading = heading instanceof Float ? heading : null;
        // A match saved in extra time by an older build kept alternating from the first kickoff.
        etKickoff = numberOr(d.get("etKickoff"), period >= numPeriods && kickoff >= 0 ? (numPeriods % 2 == 0 ? kickoff : 1 - kickoff) : -1);
        var etHeading = d.get("etHomeHeading");
        etHomeHeading = etHeading instanceof Float ? etHeading : null;
        var distance = d.get("distanceM");
        distanceM = distance instanceof Float ? distance : null;
        penStarted = booleanOr(d.get("penStarted"), false);
        endedGolden = booleanOr(d.get("golden"), false);
        var started = d.get("startedAt");
        startedAt = started instanceof Array ? started as Array<Number> : [] as Array<Number>;
        var log = d.get("batteryLog");
        batteryLog = log instanceof Array ? log as Array<Array<Number>> : [] as Array<Array<Number>>;
        gpsFirstFixSec = d.get("gpsFirstFixSec") as Number?;
        gpsSamples = numberOr(d.get("gpsSamples"), 0);
        gpsMissed = numberOr(d.get("gpsMissed"), 0);
        restarts = numberOr(d.get("restarts"), 0);
        // TMR-13: matches saved before suspensions have none.
        suspendedAt = d.get("suspendedAt") as Long?;
        suspendReason = numberOr(d.get("suspendReason"), -1);
        lightningFrom = d.get("lightningFrom") as Long?;
        lightningAlerted = booleanOr(d.get("lightningAlerted"), false);
        // EVT-12: the returns waiting, as indexes into the events; a match saved before them starts from now.
        var returns = d.get("sinBinReturns");
        if (returns instanceof Array) {
            for (var i = 0; i < returns.size(); i++) {
                var index = returns[i];
                if (index instanceof Number && index >= 0 && index < events.size()) {
                    sinBinReturns.add(events[index]);
                }
            }
        }
        var checked = d.get("sinBinCheckedMs");
        _sinBinCheckedMs = checked instanceof Long ? checked : checked instanceof Number ? checked.toLong() : sinBinClockMs(Clock.nowMs());
    }

    function save() as Void {
        Application.Storage.setValue(STORAGE_MATCH, {
            "home" => home,
            "away" => away,
            "homeName" => homeName,
            "awayName" => awayName,
            "homeColor" => homeColor,
            "awayColor" => awayColor,
            "numPeriods" => numPeriods,
            "periodSec" => periodSec,
            "halftimeSec" => halftimeSec,
            "teamSize" => teamSize,
            "breakAtSec" => breakAtSec,
            "breakLenSec" => breakLenSec,
            "extraTime" => extraTime,
            "etPeriods" => etPeriods,
            "etPeriodSec" => etPeriodSec,
            "goldenGoal" => goldenGoal,
            "penalties" => penalties,
            "trackStoppage" => trackStoppage,
            "breakStoppage" => breakStoppage,
            "stoppingClock" => stoppingClock,
            "stopForGoalsCards" => stopForGoalsCards,
            "sinBins" => sinBins,
            "sinBinSec" => sinBinSec,
            "misconductScheme" => reasonScheme,
            "clockStyle" => clockStyle,
            "secondClock" => secondClock,
            "screenClocks" => screenClocks,
            "screenEdge" => screenEdge,
            "screenNames" => screenNames,
            "breakClock" => breakClock,
            "goalScorers" => goalScorers,
            "goalTypes" => goalTypes,
            "recordTrack" => recordTrack,
            "details" => details,
            "repeatSec" => repeatSec,
            "reminderSec" => reminderSec,
            "vibeFullTime" => vibeFullTime,
            "vibeAdded" => vibeAdded,
            "vibeStoppage" => vibeStoppage,
            "vibeBreak" => vibeBreak,
            "vibeSinBin" => vibeSinBin,
            "stoppageLabel" => stoppageLabel,
            "breakLabel" => breakLabel,
            "created" => created,
            "phase" => phase,
            "period" => period,
            "kickoff" => kickoff,
            "periodStart" => periodStart,
            "stoppageMs" => stoppageMs,
            "stoppageStart" => stoppageStart,
            "breakEnd" => breakEnd,
            "breakIsHalftime" => breakIsHalftime,
            "scheduledBreakDone" => scheduledBreakDone,
            "fullTimeAcked" => fullTimeAcked,
            "addedAcked" => addedAcked,
            "fullTimeRepeats" => fullTimeRepeats,
            "breakDue" => breakDue,
            "breakDueSilenced" => breakDueSilenced,
            "breakEndAlerted" => breakEndAlerted,
            "breakStoppageRunning" => breakStoppageRunning,
            "score" => score,
            "events" => events,
            "penFirst" => penFirst,
            "homeHeading" => homeHeading,
            "etKickoff" => etKickoff,
            "etHomeHeading" => etHomeHeading,
            "penStarted" => penStarted,
            "golden" => endedGolden,
            "distanceM" => distanceM,
            "startedAt" => startedAt,
            "batteryLog" => batteryLog,
            "gpsFirstFixSec" => gpsFirstFixSec,
            "gpsSamples" => gpsSamples,
            "gpsMissed" => gpsMissed,
            "restarts" => restarts,
            "suspendedAt" => suspendedAt,
            "suspendReason" => suspendReason,
            "lightningFrom" => lightningFrom,
            "lightningAlerted" => lightningAlerted,
            "sinBinReturns" => sinBinReturnIndexes(),
            "sinBinCheckedMs" => _sinBinCheckedMs
        } as MatchData);
    }

    // ---- Clock values ----

    //! TMR-13: every clock stands where it was while play is suspended. The earlier of the two, so a
    //! time before the suspension (a stoppage's start) still reads as it did.
    private function clockNow(now as Long) as Long {
        var at = suspendedAt;
        return phase == PHASE_SUSPENDED && at != null && at < now ? at : now;
    }

    //! The period's time. TMR-15: on a stopping clock, less the time stopped (the stoppage clock), and held
    //! at the period's length, as there's no added time.
    function matchMs(now as Long) as Long {
        var start = periodStart;
        if (start == null) {
            return 0l;
        }
        var elapsed = clockNow(now) - start;
        if (!stoppingClock) {
            return elapsed;
        }
        elapsed -= stoppageTotalMs(now);
        var length = currentPeriodSec().toLong() * 1000;
        return elapsed < length ? elapsed : length;
    }

    //! TMR-15: the stopping clock standing still, while a stoppage runs (shown in orange).
    function clockStopped() as Boolean {
        return stoppingClock && stoppageStart != null;
    }

    //! Total stoppage for the current period, including an active stoppage (TMR-3).
    function stoppageTotalMs(now as Long) as Long {
        var total = stoppageMs;
        var start = stoppageStart;
        if (start != null) {
            total += clockNow(now) - start;
        }
        return total;
    }

    //! TMR-13: how long play has been suspended, counting up; null when it isn't.
    function suspendedMs(now as Long) as Long? {
        var at = suspendedAt;
        if (phase != PHASE_SUSPENDED || at == null) {
            return null;
        }
        return now > at ? now - at : 0l;
    }

    //! TMR-13: for lightning, the 30:00 countdown's time left, held at 0:00; null otherwise.
    function lightningLeftMs(now as Long) as Long? {
        var from = lightningFrom;
        if (phase != PHASE_SUSPENDED || from == null) {
            return null;
        }
        var left = from + LIGHTNING_WAIT_MS - now;
        return left > 0 ? left : 0l;
    }

    function isStoppageActive() as Boolean {
        return stoppageStart != null;
    }

    //! Break time remaining, or null when no break clock is running.
    function breakRemainingMs(now as Long) as Long? {
        var end = breakEnd;
        if (end == null) {
            return null;
        }
        var remaining = end - clockNow(now);
        return remaining < 0 ? 0l : remaining;
    }

    //! TMR-4: the break clock as shown, counting down (time left) or up (time taken), or null when
    //! no break clock is running.
    function breakClockText(now as Long) as String? {
        var remaining = breakRemainingMs(now);
        if (remaining == null) {
            return null;
        }
        if (breakClock == BREAK_UP) {
            var length = (breakIsHalftime ? halftimeSec : breakLenSec).toLong() * 1000;
            return Format.clock(length - remaining);
        }
        return Format.countdown(remaining);
    }

    //! The team kicking off a period: the kickoff team in odd periods, the other team in even ones (PRE-5).
    //! Extra time alternates the same way from its own kickoff team (ET-7).
    function kickoffFor(p as Number) as Number {
        var first = p >= numPeriods ? etKickoff : kickoff;
        if (first < 0) {
            return -1;
        }
        return (p >= numPeriods ? p - numPeriods : p) % 2 == 0 ? first : 1 - first;
    }

    //! ET-7: whether the period being played, or about to kick off, is in extra time.
    private function aboutExtraTime() as Boolean {
        return phase == PHASE_NEXT_KICKOFF ? period + 1 >= numPeriods : period >= numPeriods;
    }

    //! The team that kicked off the match, or extra time once it's on (PRE-3, ET-7).
    function firstKickoff() as Number {
        return aboutExtraTime() ? etKickoff : kickoff;
    }

    //! Whether the current period is the last regular period, or the last extra-time period.
    function isLastPeriod() as Boolean {
        return isExtraTime() ? period >= numPeriods + etPeriods - 1 : period >= numPeriods - 1;
    }

    function isExtraTime() as Boolean {
        return period >= numPeriods;
    }

    //! Length of the current period: regular or extra time (ET-2).
    function currentPeriodSec() as Number {
        return isExtraTime() ? etPeriodSec : periodSec;
    }

    //! TMR-11: match time at the start of period `p` in seconds, counting regular periods then
    //! extra-time periods (0, 45:00, 90:00, 105:00 for 2 x 45 with 2 x 15 extra time).
    function periodStartSec(p as Number) as Number {
        return p < numPeriods ? p * periodSec : numPeriods * periodSec + (p - numPeriods) * etPeriodSec;
    }

    //! TMR-11: the start of every period in match time when the clock counts up through the match,
    //! for the event list; null for the other styles, where event times are per period.
    function periodStarts() as Array<Number>? {
        if (clockStyle != CLOCK_UP) {
            return null;
        }
        var starts = [] as Array<Number>;
        for (var p = 0; p < numPeriods + etPeriods; p++) {
            starts.add(periodStartSec(p));
        }
        return starts;
    }

    //! TMR-11, TMR-2: the match clock as shown, and the added time under it once the period length
    //! is reached ("+1:12"), or null before that.
    function clockDisplay(now as Long) as [String, String?] {
        var elapsed = matchMs(now);
        var periodMs = currentPeriodSec().toLong() * 1000;
        // TMR-15: a stopping clock has no added time.
        return [clockText(clockStyle, now), elapsed >= periodMs && !stoppingClock ? "+" + Format.clock(elapsed - periodMs) : null];
    }

    //! UI-2, UI-4, TMR-16: the stoppage pill's text and whether it's solid (a stoppage running), with
    //! stoppage tracked; null until there's stoppage time. Before the period's length it shows the
    //! total (TMR-3); from the length the added time still to play (the total less the time past the
    //! length), held while a stoppage runs then, 0:00 for the second the added time alert fires
    //! (VIB-7), then the time over it ("+0:05"). None on a stopping clock (TMR-15).
    function stoppagePill(now as Long) as [String, Boolean]? {
        var total = stoppageTotalMs(now);
        var running = isStoppageActive();
        if (!trackStoppage || stoppingClock || (!running && total <= 0)) {
            return null;
        }
        var elapsed = matchMs(now);
        var periodMs = currentPeriodSec().toLong() * 1000;
        if (elapsed < periodMs) {
            return [Format.clock(total), running];
        }
        var over = elapsed - periodMs - total;
        return [over >= 1000 ? "+" + Format.clock(over) : Format.countdown(over < 0 ? -over : 0l), running];
    }

    //! TMR-11: the current period's time in one of the clock styles, held at the period's end.
    private function clockText(style as Number, now as Long) as String {
        var elapsed = matchMs(now);
        var periodMs = currentPeriodSec().toLong() * 1000;
        var shown = elapsed < periodMs ? elapsed : periodMs;
        if (style == CLOCK_UP) {
            return Format.clock(periodStartSec(period).toLong() * 1000 + shown);
        } else if (style == CLOCK_DOWN) {
            return Format.countdown(periodMs - shown);
        }
        return Format.clock(shown);
    }

    //! UI-22: the second clock, in the style chosen for it. Never a copy of the main clock: if that
    //! is the same style, this shows the time remaining, or the time from 0 when the main clock
    //! counts down.
    function secondClockText(now as Long) as String {
        var style = secondClock;
        if (style == clockStyle) {
            style = clockStyle == CLOCK_DOWN ? CLOCK_UP_EACH : CLOCK_DOWN;
        }
        return clockText(style, now);
    }

    //! UI-23: how far through its length the current period is, from 0 to 1 (1 through added time).
    function periodProgress(now as Long) as Float {
        var progress = matchMs(now).toFloat() / (currentPeriodSec() * 1000);
        return progress < 1.0 ? progress : 1.0;
    }

    //! Whether ending the current period ends the match, rather than leading to a break or ET-1's choice.
    function periodEndsMatch() as Boolean {
        return isLastPeriod() && !canExtraTime() && !canPenalties();
    }

    //! ET-1: extra time can still be chosen (switched on and not yet played).
    function canExtraTime() as Boolean {
        return extraTime && !isExtraTime();
    }

    function canPenalties() as Boolean {
        return penalties && phase != PHASE_PENALTIES;
    }

    //! Whether the break shown is half-time (the only break in a two-period match), not another break.
    function isHalftime() as Boolean {
        return numPeriods == 2 && period == 0;
    }

    function teamName(team as Number) as String {
        return team == TEAM_HOME ? home : away;
    }

    //! The team's colour, or -1 for none (UI-10).
    function teamColor(team as Number) as Number {
        return team == TEAM_HOME ? homeColor : awayColor;
    }

    // ---- Alerts ----

    //! VIB-1: the period's length reached, and its alert not yet answered (with stoppage tracked, not yet given).
    private function fullTimeDue(now as Long) as Boolean {
        return phase == PHASE_RUNNING && vibeFullTime && !fullTimeAcked && matchMs(now) >= currentPeriodSec() * 1000;
    }

    //! VIB-1: full time repeats until a button without stoppage tracked, and with it when there was no
    //! stoppage time at the length (no added time alert would follow); otherwise it's one vibration as
    //! added time starts.
    private function fullTimeAlertActive(now as Long) as Boolean {
        return (!trackStoppage || fullTimeRepeats) && fullTimeDue(now);
    }

    //! VIB-7: with stoppage tracked, once the period's length and its added time (the stoppage
    //! total, which a stoppage in added time makes longer) have both passed. Once a period.
    private function addedAlertActive(now as Long) as Boolean {
        // TMR-15: none on a stopping clock, which has no added time.
        if (phase != PHASE_RUNNING || !trackStoppage || stoppingClock || !vibeAdded || addedAcked) {
            return false;
        }
        var added = stoppageTotalMs(now);
        return added > 0 && matchMs(now) >= currentPeriodSec() * 1000 + added;
    }

    private function breakDueAlertActive() as Boolean {
        return phase == PHASE_RUNNING && vibeBreak && breakDue && !breakDueSilenced;
    }

    //! EVT-12: a sin bin over, during play, with its vibration on.
    private function sinBinAlertActive() as Boolean {
        return (phase == PHASE_RUNNING || phase == PHASE_GOLDEN) && vibeSinBin && sinBinReturns.size() > 0;
    }

    //! Whether a repeating alert is waiting to be acknowledged.
    function hasActiveAlert(now as Long) as Boolean {
        return fullTimeAlertActive(now) || addedAlertActive(now) || breakDueAlertActive() || sinBinAlertActive();
    }

    //! UI-12: the screen stays on from 30 s before the period's time is up until the period is
    //! ended, and while a halfway break is due.
    function wantsScreenOn(now as Long) as Boolean {
        return phase == PHASE_RUNNING && (breakDue || matchMs(now) >= currentPeriodSec() * 1000 - 30000);
    }

    //! Silences repeating alerts (VIB-6). Returns true if there was one to silence.
    function acknowledgeAlerts(now as Long) as Boolean {
        // EVT-12: "can return" waits for a button even with its vibration off.
        if (!hasActiveAlert(now) && sinBinReturns.size() == 0) {
            return false;
        }
        sinBinReturns = [] as Array<Array>;
        if (fullTimeAlertActive(now)) {
            fullTimeAcked = true;
        }
        if (addedAlertActive(now)) {
            addedAcked = true;
        }
        if (breakDueAlertActive()) {
            breakDueSilenced = true;
        }
        save();
        return true;
    }

    //! Called every second: starts scheduled breaks and fires vibrations. At most one vibration per tick.
    function tick(now as Long) as Void {
        // TMR-13: while suspended every clock stands still; only the lightning countdown runs, with one
        // long vibration at zero, as the break end's (VIB-3).
        if (phase == PHASE_SUSPENDED) {
            var from = lightningFrom;
            if (from != null && !lightningAlerted && now >= from + LIGHTNING_WAIT_MS) {
                lightningAlerted = true;
                save();
                if (vibeBreak) {
                    Alerts.lightning();
                }
            }
            return;
        }
        if (phase == PHASE_RUNNING) {
            startScheduledBreakIfDue(now);
        }
        checkSinBins(now);

        // Checked before the repeating alerts, so an unacknowledged break still ends on time.
        var end = breakEnd;
        if (end != null && !breakEndAlerted && now >= end) {
            breakEndAlerted = true;
            if (!breakIsHalftime) {
                breakEnd = null;
                endBreakStoppage(end);
            }
            save();
            if (vibeBreak) {
                Alerts.breakEnd();
            }
            return;
        }

        // VIB-1: with stoppage tracked, decided as the length is reached: with stoppage time, full time
        // vibrates once with nothing to answer, so the next press starts a stoppage; with none, it repeats
        // until a press, as no added time alert follows, and stands for that alert this period, so a
        // stoppage started after it brings no other. TMR-15: a stopping clock has no added time to follow, so its
        // full time always repeats.
        if (trackStoppage && !fullTimeRepeats && fullTimeDue(now)) {
            if (stoppageTotalMs(now) > 0 && !stoppingClock) {
                fullTimeAcked = true;
                save();
                Alerts.fullTime();
                return;
            }
            fullTimeRepeats = true;
            addedAcked = true;
            save();
        }

        if (hasActiveAlert(now)) {
            if (now - _lastRepeat >= repeatSec * 1000) {
                _lastRepeat = now;
                // VIB-7 comes after full time, so it's the news when both are waiting; a sin bin over is newer still (EVT-12).
                if (sinBinAlertActive()) {
                    Alerts.sinBinEnd();
                } else if (addedAlertActive(now)) {
                    Alerts.addedTime();
                } else if (fullTimeAlertActive(now)) {
                    Alerts.fullTime();
                } else {
                    Alerts.breakStart();
                }
            }
            return;
        }

        // No reminders for the stoppage a break started: the break clock is running (TMR-12).
        if (phase == PHASE_RUNNING && isStoppageActive() && !breakStoppageRunning && vibeStoppage && reminderSec > 0
                && now - _lastReminder >= reminderSec * 1000) {
            _lastReminder = now;
            Alerts.reminder();
        }
    }

    // ---- Sin bins (EVT-12) ----

    //! The time played in the match so far, by the match clock: each ended period's time (its E event),
    //! and the period being played (stood still while suspended). Breaks add nothing, so a sin bin waits
    //! through them.
    function playedMs(now as Long) as Long {
        var inPlay = phase == PHASE_RUNNING || phase == PHASE_GOLDEN || phase == PHASE_SUSPENDED;
        return endedMs(-1, false) + (inPlay ? matchMs(now) : 0l);
    }

    //! The ended periods' time: every period's (`before` -1), those before `before`, or with `only` just that one.
    private function endedMs(before as Number, only as Boolean) as Long {
        var sum = 0l;
        for (var i = 0; i < events.size(); i++) {
            var e = events[i];
            var p = e[EV_PERIOD] as Number;
            var seconds = e[EV_SECONDS] as Number;
            if ((e[EV_TYPE] as String).equals(EVENT_PERIOD_END) && seconds >= 0
                    && (before < 0 || (only ? p == before : p < before))) {
                sum += seconds.toLong() * 1000;
            }
        }
        return sum;
    }

    //! The stoppage so far in the match (TMR-10): the stoppages recorded (S, with their length) from
    //! `from` up to `to` in the events, and the one running, stood still while suspended. None without
    //! stoppage tracked.
    private function stoppedMs(from as Number, to as Number) as Long {
        var sum = 0l;
        for (var i = from; i < to; i++) {
            if ((events[i][EV_TYPE] as String).equals(EVENT_STOPPAGE)) {
                sum += extraMs(events[i]);
            }
        }
        return sum;
    }

    private function runningStoppageMs(now as Long) as Long {
        var start = stoppageStart;
        return start == null ? 0l : clockNow(now) - start;
    }

    //! The sin bins' clock: the time played less the stoppage in it, so a sin bin holds while a stoppage
    //! runs, as IFAB's guidance adds the time lost in one (the owner's choice, 2026-11-10).
    private function sinBinClockMs(now as Long) as Long {
        // TMR-15: a stopping clock has already stood still for them.
        if (stoppingClock) {
            return playedMs(now);
        }
        return playedMs(now) - stoppedMs(0, events.size()) - runningStoppageMs(now);
    }

    //! The sin bins' clock when one began: the time played then (before kickoff 0:00, at a break the end
    //! of the period before), less the stoppage before it, and of a stoppage running then, the part before it.
    private function sinBinFromMs(e as Array, now as Long) as Long {
        var p = e[EV_PERIOD] as Number;
        var seconds = e[EV_SECONDS] as Number;
        var from = p > 0 ? endedMs(p, false) : 0l;
        if (seconds < 0) {
            from += seconds == SECONDS_AT_BREAK ? endedMs(p, true) : 0l;
        } else {
            from += seconds.toLong() * 1000;
        }
        // TMR-15: the clock stood still for the stoppages, so the time played is the sin bins' clock.
        if (stoppingClock) {
            return from;
        }
        var index = indexOfEvent(events, e);
        var stopped = stoppedMs(0, index);
        if (seconds >= 0) {
            // Given during a stoppage: the first one recorded after it, if it started before it, or the one running now.
            var next = null as Array?;
            for (var i = index + 1; i < events.size() && next == null; i++) {
                if ((events[i][EV_TYPE] as String).equals(EVENT_STOPPAGE)) {
                    next = events[i];
                }
            }
            var start = stoppageStart;
            var kickoff = periodStart;
            if (next != null) {
                if ((next[EV_PERIOD] as Number) == p) {
                    stopped += clampMs((seconds - (next[EV_SECONDS] as Number)).toLong() * 1000, extraMs(next));
                }
            } else if (start != null && kickoff != null && period == p) {
                stopped += clampMs(seconds.toLong() * 1000 - (start - kickoff), runningStoppageMs(now));
            }
        }
        return from - stopped;
    }

    //! A value from 0 to `most`.
    private function clampMs(value as Long, most as Long) as Long {
        return value < 0 ? 0l : value > most ? most : value;
    }

    //! A sin bin's length, or a stoppage's: the seconds in its extra.
    private function extraMs(e as Array) as Long {
        var length = e[EV_DURATION];
        return length instanceof Number ? length.toLong() * 1000 : 0l;
    }

    //! A sin bin's time left, by the sin bins' clock, from its length down to 0.
    function sinBinLeftMs(e as Array, now as Long) as Long {
        var length = extraMs(e);
        return clampMs(length - (sinBinClockMs(now) - sinBinFromMs(e, now)), length);
    }

    //! Sin bins not ended by the player being sent off after it (a red, a second yellow or a second sin bin).
    private function liveSinBins() as Array<Array> {
        var live = [] as Array<Array>;
        for (var i = 0; i < events.size(); i++) {
            var e = events[i];
            if (!(e[EV_TYPE] as String).equals(EVENT_SIN_BIN)) {
                continue;
            }
            var player = e[EV_PLAYER];
            var ended = false;
            for (var j = i + 1; player != null && j < events.size() && !ended; j++) {
                var later = events[j];
                ended = isSendOff(later[EV_TYPE] as String) && later[EV_TEAM] == e[EV_TEAM] && later[EV_PLAYER] == player;
            }
            if (!ended) {
                live.add(e);
            }
        }
        return live;
    }

    //! The sin bins counting down, the one ending first first (a stable sort, so ties keep their order).
    function runningSinBins(now as Long) as Array<Array> {
        var live = liveSinBins();
        var running = [] as Array<Array>;
        var lefts = [] as Array<Long>;
        for (var i = 0; i < live.size(); i++) {
            var left = sinBinLeftMs(live[i], now);
            if (left <= 0) {
                continue;
            }
            var at = running.size();
            while (at > 0 && lefts[at - 1] > left) {
                at -= 1;
            }
            running.add(live[i]);
            lefts.add(left);
            for (var j = running.size() - 1; j > at; j--) {
                running[j] = running[j - 1];
                lefts[j] = lefts[j - 1];
            }
            running[at] = live[i];
            lefts[at] = left;
        }
        return running;
    }

    //! UI-1: the sin bin pill, "AWY 7 4:12" for the one ending first, "+1" after it for each other; null
    //! for none.
    function sinBinPill(now as Long) as String? {
        return sinBinPillText(now, true);
    }

    //! The pill's text, without the team ("7 4:12 +1") for when three pills don't fit the screen.
    function sinBinPillText(now as Long, withTeam as Boolean) as String? {
        var running = runningSinBins(now);
        if (running.size() == 0) {
            return null;
        }
        var first = running[0];
        var player = first[EV_PLAYER];
        var text = withTeam ? teamName(first[EV_TEAM] as Number) + " " : "";
        if (player instanceof Number) {
            text += player.format("%d") + " ";
        }
        text += Format.countdown(sinBinLeftMs(first, now));
        return running.size() > 1 ? text + " +" + (running.size() - 1).format("%d") : text;
    }

    //! "AWY #7 can return", for the first sin bin over; null for none.
    function sinBinReturnText() as String? {
        if (sinBinReturns.size() == 0) {
            return null;
        }
        var e = sinBinReturns[0];
        var player = e[EV_PLAYER];
        return teamName(e[EV_TEAM] as Number) + (player instanceof Number ? " #" + player.format("%d") : "") + " can return";
    }

    //! The "can return" screen over the running match: a sin bin over, during play.
    function showsSinBinReturn() as Boolean {
        return sinBinReturns.size() > 0 && (phase == PHASE_RUNNING || phase == PHASE_GOLDEN);
    }

    //! Each sin bin's end, announced once, when the sin bins' clock reaches it.
    private function checkSinBins(now as Long) as Void {
        var clock = sinBinClockMs(now);
        var live = liveSinBins();
        var added = false;
        for (var i = 0; i < live.size(); i++) {
            var e = live[i];
            var end = sinBinFromMs(e, now) + extraMs(e);
            if (_sinBinCheckedMs < end && end <= clock && indexOfEvent(sinBinReturns, e) < 0) {
                sinBinReturns.add(e);
                _lastRepeat = 0l;
                added = true;
            }
        }
        _sinBinCheckedMs = clock;
        if (added) {
            save();
        }
    }

    //! Where this very event is in a list, by identity (two events can hold the same values), or -1.
    private function indexOfEvent(list as Array<Array>, e as Array) as Number {
        for (var i = 0; i < list.size(); i++) {
            if (list[i] == e) {
                return i;
            }
        }
        return -1;
    }

    private function sinBinReturnIndexes() as Array<Number> {
        var indexes = [] as Array<Number>;
        for (var i = 0; i < sinBinReturns.size(); i++) {
            var index = indexOfEvent(events, sinBinReturns[i]);
            if (index >= 0) {
                indexes.add(index);
            }
        }
        return indexes;
    }

    //! TMR-7: at the configured match time the break becomes due. It only starts when the
    //! referee accepts it at a natural stoppage (startBreak), or is skipped (skipBreak).
    //! There is no mid-period break in extra time.
    private function startScheduledBreakIfDue(now as Long) as Void {
        if (scheduledBreakDone || periodStart == null || breakAtSec < 0 || breakLenSec <= 0 || isExtraTime()) {
            return;
        }
        if (matchMs(now) < breakAtSec * 1000) {
            return;
        }
        scheduledBreakDone = true;
        breakDue = true;
        breakDueSilenced = false;
        _lastRepeat = 0l;
        save();
    }

    //! UI-4: time until the scheduled break is due, or null when none is still to come this period.
    function breakDueInMs(now as Long) as Long? {
        if (phase != PHASE_RUNNING || scheduledBreakDone || periodStart == null || breakAtSec < 0 || breakLenSec <= 0
                || isExtraTime()) {
            return null;
        }
        var remaining = breakAtSec.toLong() * 1000 - matchMs(now);
        return remaining < 0 ? 0l : remaining;
    }

    //! The referee accepts the due break: the break clock starts counting down now.
    function startBreak(now as Long) as Void {
        if (phase != PHASE_RUNNING || !breakDue) {
            return;
        }
        breakDue = false;
        breakIsHalftime = false;
        breakEnd = now + breakLenSec * 1000;
        breakEndAlerted = false;
        // TMR-12: the break's time is added on, as a stoppage that ends with the break. One the
        // referee already started stays theirs to end, and covers the break anyway. TMR-15: a stopping clock
        // stops for the break, whatever the setting.
        if (trackStoppage && (breakStoppage || stoppingClock) && stoppageStart == null) {
            stoppageStart = now;
            breakStoppageRunning = true;
        }
        save();
    }

    //! Ends the stoppage a halfway break started, when the break ends (TMR-12).
    private function endBreakStoppage(at as Long) as Void {
        if (breakStoppageRunning) {
            closeStoppage(at);
        }
    }

    function skipBreak() as Void {
        if (breakDue) {
            breakDue = false;
            save();
        }
    }

    // ---- Actions ----

    function selectKickoff(team as Number) as Void {
        if (phase == PHASE_PRE || phase == PHASE_READY) {
            kickoff = team;
            phase = PHASE_READY;
            save();
        } else if (phase == PHASE_NEXT_KICKOFF) {
            // Stored as the first-period (or ET1) kickoff team, so kickoffFor(next period) gives the chosen team.
            var next = period + 1;
            if (next >= numPeriods) {
                etKickoff = (next - numPeriods) % 2 == 0 ? team : 1 - team;
            } else {
                kickoff = next % 2 == 0 ? team : 1 - team;
            }
            save();
        }
    }

    //! The team highlighted on a kickoff screen, or -1 when none is chosen yet.
    function kickoffTeamOnScreen() as Number {
        return phase == PHASE_NEXT_KICKOFF ? kickoffFor(period + 1) : kickoff;
    }

    //! PRE-8: whether the kickoff direction can be recorded now: once the kickoff team is chosen,
    //! until the end of the first period; and again for extra time, once its kickoff team is chosen,
    //! until the end of ET1 (ET-7).
    function canRecordDirection() as Boolean {
        if (phase == PHASE_NEXT_KICKOFF) {
            return period + 1 == numPeriods && etKickoff >= 0;
        }
        return phase == PHASE_READY || (phase == PHASE_RUNNING && (period == 0 || period == numPeriods));
    }

    //! PRE-8: the referee faced the goal the current kickoff team attacks in the first period
    //! (or ET1, ET-7).
    function setKickoffHeading(heading as Float) as Void {
        var first = firstKickoff();
        var home = normalizeHeading(first == TEAM_AWAY ? heading + Math.PI : heading);
        if (aboutExtraTime()) {
            etHomeHeading = home;
        } else {
            homeHeading = home;
        }
        save();
    }

    function hasDirection() as Boolean {
        return (aboutExtraTime() ? etHomeHeading : homeHeading) != null;
    }

    //! PRE-8: the compass heading the team kicking off period `p` attacks, or null when unknown.
    //! Teams change ends every period: the home team attacks the recorded way in the 1st and 3rd
    //! periods and the other way in the 2nd and 4th. Extra time has its own toss and its own
    //! recorded direction, counted from ET1 the same way (ET-7).
    function attackHeading(p as Number) as Float? {
        var extra = p >= numPeriods;
        var heading = extra ? etHomeHeading : homeHeading;
        if (heading == null) {
            return null;
        }
        var flip = (kickoffFor(p) == TEAM_AWAY) != ((extra ? p - numPeriods : p) % 2 == 1);
        return flip ? normalizeHeading(heading + Math.PI) : heading;
    }

    //! PRE-3: tapping the selected team again clears the choice.
    function clearKickoff() as Void {
        if (phase == PHASE_READY) {
            kickoff = -1;
            phase = PHASE_PRE;
            save();
        }
    }

    //! PRE-3: fix a wrongly chosen kickoff team after the match has started (in extra time, its own, ET-7).
    function swapKickoff() as Void {
        if (aboutExtraTime()) {
            if (etKickoff >= 0) {
                etKickoff = 1 - etKickoff;
                save();
            }
        } else if (kickoff >= 0) {
            kickoff = 1 - kickoff;
            save();
        }
    }

    //! PRE-6: back to the kickoff screen after an accidental start, during the first period only.
    //! Clears the clocks, score and in-play events (cards given before kickoff are kept), and
    //! discards the activity recorded so far.
    function restart() as Void {
        if (phase != PHASE_RUNNING || period != 0) {
            return;
        }
        beginPeriod(0l);
        periodStart = null;
        phase = PHASE_READY;
        score = [0, 0];
        var kept = [] as Array<Array>;
        for (var i = 0; i < events.size(); i++) {
            if (events[i][EV_SECONDS] == SECONDS_BEFORE_KICKOFF) {
                kept.add(events[i]);
            }
        }
        events = kept;
        startedAt = [] as Array<Number>;
        sinBinReturns = [] as Array<Array>;
        _sinBinCheckedMs = 0l;
        save();
        Recorder.discard();
        TrackLog.discard(created);
    }

    function start(now as Long) as Void {
        if (phase != PHASE_READY) {
            return;
        }
        period = 0;
        // UI-21, TMR-11: fixed at kickoff, so the screen doesn't change during the match.
        clockStyle = Screen.mainClock();
        secondClock = Screen.secondClock();
        screenClocks = Screen.clocks();
        screenEdge = Screen.edge();
        screenNames = Screen.names();
        breakClock = Screen.breakClock();
        beginPeriod(now);
        startedAt = [(now / 1000).toNumber()] as Array<Number>;
        noteBattery(0);
        phase = PHASE_RUNNING;
        save();
        Recorder.start(activityName());
        if (recordTrack) {
            TrackLog.begin(created, now);
        }
    }

    private function beginPeriod(now as Long) as Void {
        periodStart = now;
        stoppageMs = 0l;
        stoppageStart = null;
        breakStoppageRunning = false;
        breakEnd = null;
        breakIsHalftime = false;
        scheduledBreakDone = false;
        fullTimeAcked = false;
        addedAcked = false;
        fullTimeRepeats = false;
        breakDue = false;
        breakDueSilenced = false;
        breakEndAlerted = false;
        _lastRepeat = 0l;
    }

    function toggleStoppage(now as Long) as Void {
        if (phase != PHASE_RUNNING || !trackStoppage) {
            return;
        }
        if (stoppageStart == null) {
            stoppageStart = now;
            _lastReminder = now;
        } else {
            closeStoppage(now);
        }
        save();
    }

    private function closeStoppage(now as Long) as Void {
        var start = stoppageStart;
        if (start == null) {
            return;
        }
        // The period's time it began at: on a stopping clock (TMR-15), where the clock stood still.
        var seconds = toSeconds(matchMs(start));
        var duration = now - start;
        stoppageMs += duration;
        stoppageStart = null;
        breakStoppageRunning = false;
        events.add([EVENT_STOPPAGE, -1, period, seconds, null, toSeconds(duration)]);
    }

    //! EVT-16, TMR-15: a stoppage started by an event, as Start/Stop starts one, unless one is running.
    private function stopFor(now as Long) as Void {
        if (phase == PHASE_RUNNING && trackStoppage && stoppageStart == null) {
            stoppageStart = now;
            _lastReminder = now;
        }
    }

    //! Records a goal or card (EVT-1). Goals only during play; cards at any time, including
    //! before kickoff, at half-time and after full time (EVT-7). A yellow for a numbered player
    //! who already has one is recorded as a second yellow (EVT-5).
    //! EVT-12: a sin bin only with sin bins on, and not once the clock has nothing left to run (the shoot-out,
    //! after full time); a second for the same numbered player is a second sin bin, a send-off. A sin bin
    //! and a caution don't combine.
    //! Returns true when the event is a second yellow or a second sin bin, so the caller can show the
    //! send-off reminder.
    function addEvent(type as String, team as Number, player as Number?, now as Long) as Boolean {
        if (isGoal(type) && phase != PHASE_RUNNING) {
            return false;
        }
        var sinBin = type.equals(EVENT_SIN_BIN);
        if (sinBin && (!sinBins || phase == PHASE_PENALTIES || phase == PHASE_DONE)) {
            return false;
        }
        // EVT-3: 00 on the entry is no number.
        if (player != null && player == 0) {
            player = null;
        }
        var recorded = type;
        if ((type.equals(EVENT_YELLOW) || sinBin) && player != null && hasCard(type, team, player)) {
            recorded = sinBin ? EVENT_SECOND_SIN_BIN : EVENT_SECOND_YELLOW;
        }
        events.add([recorded, team, period, eventSeconds(now), player, sinBin ? sinBinSec : null]);
        if (isGoal(recorded)) {
            score[team] = score[team] + 1;
            // ET-6: the first goal in extra time wins it; End match or Undo comes next.
            if (goldenGoal && isExtraTime()) {
                phase = PHASE_GOLDEN;
            }
        }
        // EVT-16: an injury in play starts the stoppage, as Start/Stop does, unless one is running; at a break it has none.
        // TMR-15: so does a goal or card on a stopping clock, Start/Stop starting it again at the restart.
        if (recorded.equals(EVENT_INJURY) || (stoppingClock && stopForGoalsCards && (isGoal(recorded) || isCard(recorded)))) {
            stopFor(now);
        }
        save();
        updateHistory();
        return recorded.equals(EVENT_SECOND_YELLOW) || recorded.equals(EVENT_SECOND_SIN_BIN);
    }

    //! EVT-15: a team official's caution or send-off, at any time as a player's card (EVT-7), with the
    //! role (0 head coach, 1 assistant coach, 2 other). It never makes a second yellow: officials aren't
    //! matched by number.
    function addOfficialCard(red as Boolean, team as Number, role as Number, now as Long) as Void {
        events.add([red ? EVENT_OFFICIAL_RED : EVENT_OFFICIAL_YELLOW, team, period, eventSeconds(now), null, role]);
        // TMR-15: a card stops a stopping clock.
        if (stoppingClock && stopForGoalsCards) {
            stopFor(now);
        }
        save();
        updateHistory();
    }

    //! EVT-14: the card's reason, chosen after the number (or the official's role): it goes to the most
    //! recent card (Y, Y2, R, SB, SB2, TY, TR), replacing one given before. Nothing without a card.
    function giveReason(code as String) as Void {
        for (var i = events.size() - 1; i >= 0; i--) {
            var e = events[i];
            if (isCard(e[EV_TYPE] as String)) {
                if (e.size() > EV_REASON) {
                    e[EV_REASON] = code;
                } else {
                    e.add(code);
                }
                save();
                updateHistory();
                return;
            }
        }
    }

    //! EVT-14: the reasons as the upload sends them beside the events: [the card's index in events, its
    //! code], worked out when asked so an undone card takes its reason with it.
    function cardReasons() as Array<Array> {
        var reasons = [] as Array<Array>;
        for (var i = 0; i < events.size(); i++) {
            if (events[i].size() > EV_REASON && events[i][EV_REASON] instanceof String) {
                reasons.add([i, events[i][EV_REASON]]);
            }
        }
        return reasons;
    }

    //! The events as the server takes them, each with its six fields (EVT-14's reasons go beside them).
    function uploadEvents() as Array<Array> {
        var sent = [] as Array<Array>;
        for (var i = 0; i < events.size(); i++) {
            sent.add(events[i].size() > EV_REASON ? events[i].slice(0, EV_REASON) : events[i]);
        }
        return sent;
    }

    //! TMR-14: Adjust clock, during play: the period's clock moves by whole seconds (forward for a clock
    //! started late), by moving the period's kickoff time, so every clock style, the halfway break and
    //! the alerts follow. Never before the kickoff. Events already recorded keep their times. Recorded as
    //! CK at the new time, with the change; false when nothing changed. Saved, so a restart keeps it (TMR-8).
    function adjustClock(changeSec as Number, now as Long) as Boolean {
        if (phase != PHASE_RUNNING || periodStart == null) {
            return false;
        }
        var least = -toSeconds(matchMs(now));
        var change = changeSec < least ? least : changeSec;
        if (change == 0) {
            return false;
        }
        shiftClock(change, now);
        events.add([EVENT_CLOCK_ADJUSTED, -1, period, toSeconds(matchMs(now)), null, change]);
        save();
        return true;
    }

    private function shiftClock(change as Number, now as Long) as Void {
        var start = periodStart;
        if (start == null) {
            return;
        }
        periodStart = start - change.toLong() * 1000;
        var elapsed = matchMs(now);
        // The alerts and the halfway break come again when the clock is put back before them.
        if (elapsed < currentPeriodSec().toLong() * 1000) {
            fullTimeAcked = false;
            // VIB-1: decided again when the length is reached again.
            fullTimeRepeats = false;
        }
        rearmAdded(now);
        if (breakDue && breakAtSec >= 0 && elapsed < breakAtSec.toLong() * 1000) {
            breakDue = false;
            breakDueSilenced = false;
            scheduledBreakDone = false;
        }
    }

    //! TMR-14: VIB-7's alert comes again when its time is moved back ahead of the clock.
    private function rearmAdded(now as Long) as Void {
        if (matchMs(now) < currentPeriodSec().toLong() * 1000 + stoppageTotalMs(now)) {
            addedAcked = false;
        }
    }

    //! TMR-14: Adjust added time, with stoppage tracked: the stoppage total moves by whole seconds, for a
    //! stoppage started or ended late; never below 0:00. A stoppage running carries on. Recorded as CA,
    //! with the change; false when nothing changed.
    function adjustAdded(changeSec as Number, now as Long) as Boolean {
        // TMR-15: a stopping clock has no added time.
        if (phase != PHASE_RUNNING || !trackStoppage || stoppingClock) {
            return false;
        }
        var least = -toSeconds(stoppageTotalMs(now));
        var change = changeSec < least ? least : changeSec;
        if (change == 0) {
            return false;
        }
        shiftAdded(change, now);
        events.add([EVENT_ADDED_ADJUSTED, -1, period, eventSeconds(now), null, change]);
        save();
        return true;
    }

    private function shiftAdded(change as Number, now as Long) as Void {
        stoppageMs += change.toLong() * 1000;
        // Taken back further than the stoppages before the running one: the running one is shorter.
        var start = stoppageStart;
        if (stoppageMs < 0 && start != null) {
            var later = start - stoppageMs;
            stoppageStart = later < now ? later : now;
        }
        if (stoppageMs < 0) {
            stoppageMs = 0l;
        }
        rearmAdded(now);
    }

    //! Match time for an event, or the marker for when it happened outside play.
    private function eventSeconds(now as Long) as Number {
        // TMR-13: a card while suspended is at the time play stopped.
        if (phase == PHASE_RUNNING || phase == PHASE_GOLDEN || phase == PHASE_SUSPENDED) {
            return toSeconds(matchMs(now));
        } else if (phase == PHASE_PRE || phase == PHASE_READY) {
            return SECONDS_BEFORE_KICKOFF;
        } else if (phase == PHASE_DONE) {
            return SECONDS_AFTER_FULL_TIME;
        } else if (phase == PHASE_PENALTIES) {
            return SECONDS_PENALTIES;
        }
        return SECONDS_AT_BREAK;
    }

    //! Cards given after full time also belong in the saved match record.
    private function updateHistory() as Void {
        if (phase == PHASE_DONE) {
            History.update(self);
            Sync.queueMatch(self);
        }
    }

    //! Whether the numbered player already has a card of this type (a yellow, or a sin bin, EVT-12).
    private function hasCard(type as String, team as Number, player as Number) as Boolean {
        for (var i = 0; i < events.size(); i++) {
            var event = events[i];
            if ((event[EV_TYPE] as String).equals(type) && event[EV_TEAM] == team && event[EV_PLAYER] == player) {
                return true;
            }
        }
        return false;
    }

    //! The most recent goal, card or shoot-out kick, which INP-6 allows to be undone, only while it's
    //! in the current period: while play runs, recorded since this period's kickoff; at a break, in
    //! the period just ended or the break itself. An earlier period's event can't be undone (null).
    //! TMR-14: a clock's correction too, but only while its period is being played, as it moves the
    //! running clock; outside play Undo passes over it. TMR-13: while suspended, as during play, but
    //! not a clock's correction; a suspension or a resumption never.
    function lastUndoableEvent() as Array? {
        var playing = phase == PHASE_RUNNING || phase == PHASE_GOLDEN;
        var inPlay = playing || phase == PHASE_SUSPENDED;
        for (var i = events.size() - 1; i >= 0; i--) {
            var type = events[i][EV_TYPE] as String;
            if (isGoal(type) || type.equals(EVENT_YELLOW) || type.equals(EVENT_SECOND_YELLOW) || type.equals(EVENT_RED)
                    || type.equals(EVENT_OFFICIAL_YELLOW) || type.equals(EVENT_OFFICIAL_RED) || type.equals(EVENT_INJURY)
                    || isSinBin(type) || isKick(type) || (playing && isAdjustment(type))) {
                if (events[i][EV_PERIOD] != period || (inPlay && (events[i][EV_SECONDS] as Number) < 0)) {
                    return null;
                }
                return events[i];
            }
        }
        return null;
    }

    function undoLastEvent(now as Long) as Void {
        var event = lastUndoableEvent();
        if (event == null) {
            return;
        }
        // TMR-14: a correction taken back moves the clock back by its change.
        var type = event[EV_TYPE] as String;
        var change = event[EV_DURATION];
        if (type.equals(EVENT_CLOCK_ADJUSTED)) {
            shiftClock(change instanceof Number ? -change : 0, now);
        } else if (type.equals(EVENT_ADDED_ADJUSTED)) {
            shiftAdded(change instanceof Number ? -change : 0, now);
        }
        if (isGoal(event[EV_TYPE] as String)) {
            var team = event[EV_TEAM] as Number;
            score[team] = score[team] - 1;
            // ET-6: the golden goal taken back, so play goes on.
            if (phase == PHASE_GOLDEN) {
                phase = PHASE_RUNNING;
            }
        }
        events.remove(event);
        // EVT-12: a sin bin taken back no longer waits for its return.
        var waiting = indexOfEvent(sinBinReturns, event);
        if (waiting >= 0) {
            var kept = [] as Array<Array>;
            for (var i = 0; i < sinBinReturns.size(); i++) {
                if (i != waiting) {
                    kept.add(sinBinReturns[i]);
                }
            }
            sinBinReturns = kept;
        }
        save();
        updateHistory();
    }

    //! ET-6: the team whose golden goal won (or wins, while End match is offered), or -1.
    function goldenWinner() as Number {
        if (phase != PHASE_GOLDEN && !endedGolden) {
            return -1;
        }
        for (var i = events.size() - 1; i >= 0; i--) {
            if (isGoal(events[i][EV_TYPE] as String)) {
                return events[i][EV_TEAM] as Number;
            }
        }
        return -1;
    }

    //! ET-6: Undo on the golden goal screen: that goal goes, even if a card was given after it, and
    //! the period carries on from where it is.
    function undoGoldenGoal() as Void {
        if (phase != PHASE_GOLDEN) {
            return;
        }
        for (var i = events.size() - 1; i >= 0; i--) {
            var event = events[i];
            if (isGoal(event[EV_TYPE] as String)) {
                var team = event[EV_TEAM] as Number;
                score[team] = score[team] - 1;
                events.remove(event);
                break;
            }
        }
        phase = PHASE_RUNNING;
        save();
    }

    //! TMR-7: ends a running halfway break early; the time it took counts as stoppage (TMR-12).
    function endBreakEarly(now as Long) as Void {
        if (phase == PHASE_RUNNING && breakEnd != null) {
            breakEnd = null;
            endBreakStoppage(now);
            save();
        }
    }

    //! TMR-7: a break started by mistake: it's due again, and counts for nothing.
    function resetBreak() as Void {
        if (phase == PHASE_RUNNING && breakEnd != null) {
            breakEnd = null;
            breakDue = true;
            breakDueSilenced = true;
            if (breakStoppageRunning) {
                stoppageStart = null;
                breakStoppageRunning = false;
            }
            save();
        }
    }

    //! Ends the current period: half-time follows, or full time after the last period (TMR-5, TMR-6).
    //! With extra time or penalties switched on, the last period leads to ET-1's choice instead.
    function endPeriod(now as Long) as Void {
        if (phase != PHASE_RUNNING) {
            return;
        }
        if (periodEndsMatch()) {
            finish(now);
            return;
        }
        closeStoppage(now);
        events.add([EVENT_PERIOD_END, -1, period, toSeconds(matchMs(now)), null, null]);
        noteBattery(1);
        breakDue = false;
        if (isLastPeriod()) {
            phase = PHASE_DECIDE;
            breakEnd = null;
            save();
        } else {
            beginBreak(now);
        }
        Recorder.pause();
    }

    //! The break between periods, also used before extra time and between its periods (ET-2).
    private function beginBreak(now as Long) as Void {
        phase = PHASE_BREAK;
        breakIsHalftime = true;
        breakEnd = now + halftimeSec * 1000;
        breakEndAlerted = halftimeSec <= 0;
        save();
    }

    //! The choice ET-1 recommends: extra time (or penalties) when the score is level, otherwise end match.
    function recommendedDecision() as Symbol {
        if (score[TEAM_HOME] == score[TEAM_AWAY]) {
            if (canExtraTime()) {
                return :extraTime;
            } else if (canPenalties()) {
                return :penalties;
            }
        }
        return :endMatch;
    }

    //! ET-1/ET-2: the referee chose extra time; the break before it starts now.
    function chooseExtraTime(now as Long) as Void {
        if (phase == PHASE_DECIDE && canExtraTime()) {
            beginBreak(now);
        }
    }

    //! ET-1/ET-3: the referee chose penalties; next, who kicks first.
    function choosePenalties() as Void {
        if (phase == PHASE_DECIDE && canPenalties()) {
            phase = PHASE_PENALTIES;
            penFirst = -1;
            penStarted = false;
            save();
        }
    }

    // ---- Penalty shoot-out (ET-3, ET-4) ----

    //! Before the first kick, choose (or change) the team kicking first.
    function selectPenaltyFirst(team as Number) as Void {
        if (phase == PHASE_PENALTIES && !penStarted) {
            penFirst = team;
            save();
        }
    }

    function startPenalties() as Void {
        if (phase == PHASE_PENALTIES && !penStarted && penFirst >= 0) {
            penStarted = true;
            save();
        }
    }

    //! The team taking the next kick: teams alternate, starting with `penFirst`.
    function nextKicker() as Number {
        var first = penFirst < 0 ? TEAM_HOME : penFirst;
        return penaltyKicks(first) == penaltyKicks(1 - first) ? first : 1 - first;
    }

    function recordKick(scored as Boolean) as Void {
        if (phase != PHASE_PENALTIES || !penStarted || penaltyWinner() >= 0) {
            return;
        }
        events.add([scored ? EVENT_PEN_SCORED : EVENT_PEN_MISSED, nextKicker(), period, SECONDS_PENALTIES, null, null]);
        save();
    }

    function penaltyKicks(team as Number) as Number {
        return countKicks(team, false);
    }

    function penaltyGoals(team as Number) as Number {
        return countKicks(team, true);
    }

    //! Each team's kicks in order, true for scored.
    function kickResults(team as Number) as Array<Boolean> {
        var results = [] as Array<Boolean>;
        for (var i = 0; i < events.size(); i++) {
            var type = events[i][EV_TYPE] as String;
            if (isKick(type) && events[i][EV_TEAM] == team) {
                results.add(type.equals(EVENT_PEN_SCORED));
            }
        }
        return results;
    }

    private function countKicks(team as Number, scoredOnly as Boolean) as Number {
        var count = 0;
        for (var i = 0; i < events.size(); i++) {
            var type = events[i][EV_TYPE] as String;
            if (events[i][EV_TEAM] == team && (scoredOnly ? type.equals(EVENT_PEN_SCORED) : isKick(type))) {
                count += 1;
            }
        }
        return count;
    }

    //! ET-4: the shoot-out winner, or -1 while it is undecided. In the first five kicks each, a
    //! team wins once the other cannot catch up; after that, when both have taken the same number
    //! of kicks and the scores differ (sudden death).
    function penaltyWinner() as Number {
        var goals = [penaltyGoals(TEAM_HOME), penaltyGoals(TEAM_AWAY)];
        var kicks = [penaltyKicks(TEAM_HOME), penaltyKicks(TEAM_AWAY)];
        if (kicks[TEAM_HOME] <= 5 && kicks[TEAM_AWAY] <= 5) {
            for (var team = 0; team < 2; team++) {
                if (goals[team] > goals[1 - team] + 5 - kicks[1 - team]) {
                    return team;
                }
            }
        } else if (kicks[TEAM_HOME] == kicks[TEAM_AWAY] && goals[TEAM_HOME] != goals[TEAM_AWAY]) {
            return goals[TEAM_HOME] > goals[TEAM_AWAY] ? TEAM_HOME : TEAM_AWAY;
        }
        return -1;
    }

    //! The shoot-out score, or null if there was no shoot-out.
    function penaltyScore() as Array<Number>? {
        if (penFirst < 0 && penaltyKicks(TEAM_HOME) == 0 && penaltyKicks(TEAM_AWAY) == 0) {
            return null;
        }
        return [penaltyGoals(TEAM_HOME), penaltyGoals(TEAM_AWAY)];
    }

    //! "End HT": half-time is over; next the kickoff screen for the next period (PRE-7).
    function endHalftime() as Void {
        if (phase != PHASE_BREAK) {
            return;
        }
        phase = PHASE_NEXT_KICKOFF;
        breakEnd = null;
        breakIsHalftime = false;
        save();
    }

    function startNextPeriod(now as Long) as Void {
        // ET-7: ET1 waits for its kickoff team.
        if (phase != PHASE_NEXT_KICKOFF || kickoffFor(period + 1) < 0) {
            return;
        }
        period += 1;
        beginPeriod(now);
        startedAt.add((now / 1000).toNumber());
        noteBattery(0);
        phase = PHASE_RUNNING;
        save();
        Recorder.resume(activityName());
    }

    //! Ends the match early from the game menu, or at the end of the last period.
    function finish(now as Long) as Void {
        finishWith(now, null);
    }

    //! EVT-11: ended for good here, with the score as it stands. `reason`: 0 weather, 1 lightning,
    //! 2 crowd trouble, 3 not enough players, 4 other.
    function abandon(now as Long, reason as Number) as Void {
        finishWith(now, reason);
    }

    function isAbandoned() as Boolean {
        for (var i = events.size() - 1; i >= 0; i--) {
            if ((events[i][EV_TYPE] as String).equals(EVENT_ABANDON)) {
                return true;
            }
        }
        return false;
    }

    private function finishWith(now as Long, abandonReason as Number?) as Void {
        if (phase == PHASE_DONE) {
            return;
        }
        var seconds = phase == PHASE_PENALTIES ? SECONDS_PENALTIES : SECONDS_AT_BREAK;
        // ET-6: End match after a golden goal, not an abandonment from its screen.
        endedGolden = phase == PHASE_GOLDEN && abandonReason == null;
        if (phase == PHASE_RUNNING || phase == PHASE_GOLDEN || phase == PHASE_SUSPENDED) {
            // TMR-13: abandoned while suspended, the period ends where play stopped.
            closeStoppage(clockNow(now));
            seconds = toSeconds(matchMs(now));
            events.add([EVENT_PERIOD_END, -1, period, seconds, null, null]);
            noteBattery(1);
        }
        if (abandonReason != null) {
            events.add([EVENT_ABANDON, -1, period, seconds, null, abandonReason]);
        }
        phase = PHASE_DONE;
        breakEnd = null;
        clearSuspension();
        // SYNC-7: the distance covered, before the recording is saved and closed.
        if (Toybox has :Activity) {
            var info = Activity.getActivityInfo();
            if (info != null && info.elapsedDistance != null) {
                distanceM = info.elapsedDistance;
            }
        }
        save();
        Recorder.save();
        if (recordTrack) {
            // TRK-7: uploaded with the match, now or once the watch is linked.
            TrackLog.finish(created);
        }
        History.add(self);
        // SYNC-4: up to the account, now if the phone is nearby, else at the next sync.
        Sync.queueMatch(self);
        Sync.run(null);
    }

    //! TMR-13: Suspend match, during play, for a lightning or weather delay: every clock stops where it
    //! is (the match clock, the stoppage clock, a running halfway break) until Resume, and the activity
    //! recording pauses, as at half-time (ACT-2). Recorded as SU at the period's time, with the reason
    //! (SUSPEND_REASONS) in EV_DURATION. For lightning, a 30:00 countdown starts. False when it can't be.
    function suspend(reason as Number, now as Long) as Boolean {
        if (phase != PHASE_RUNNING || SUSPEND_REASONS.indexOf(reason) < 0) {
            return false;
        }
        events.add([EVENT_SUSPENDED, -1, period, eventSeconds(now), null, reason]);
        phase = PHASE_SUSPENDED;
        suspendedAt = now;
        suspendReason = reason;
        lightningFrom = reason == REASON_LIGHTNING ? now : null;
        lightningAlerted = false;
        save();
        Recorder.pause();
        return true;
    }

    //! TMR-13: Lightning again, while suspended for lightning: the 30:00 countdown starts over.
    function lightningAgain(now as Long) as Void {
        if (phase == PHASE_SUSPENDED && suspendReason == REASON_LIGHTNING) {
            lightningFrom = now;
            lightningAlerted = false;
            save();
        }
    }

    //! TMR-13: Resume: the period carries on from where it stopped, every clock moved on by the time
    //! suspended, so it's neither played time nor added time. Recorded as RS at the same period's time,
    //! with the whole seconds suspended in EV_DURATION. The period's kickoff time for the track
    //! (startedAt) stays as it was, and the recording carries on in the same lap: it's the same period.
    function resume(now as Long) as Void {
        var at = suspendedAt;
        if (phase != PHASE_SUSPENDED || at == null) {
            return;
        }
        var shift = now > at ? now - at : 0l;
        var start = periodStart;
        if (start != null) {
            periodStart = start + shift;
        }
        var stoppage = stoppageStart;
        if (stoppage != null) {
            stoppageStart = stoppage + shift;
        }
        var end = breakEnd;
        if (end != null) {
            breakEnd = end + shift;
        }
        _lastReminder += shift;
        phase = PHASE_RUNNING;
        clearSuspension();
        events.add([EVENT_RESUMED, -1, period, toSeconds(matchMs(now)), null, toSeconds(shift)]);
        save();
        Recorder.start(activityName());
    }

    private function clearSuspension() as Void {
        suspendedAt = null;
        suspendReason = -1;
        lightningFrom = null;
        lightningAlerted = false;
    }

    //! DIAG-1: the battery at a period's kickoff (0) or end (1).
    function noteBattery(at as Number) as Void {
        if (batteryLog.size() < 24) {
            batteryLog.add([period, at, (System.getSystemStats().battery * 10).toNumber()] as Array<Number>);
        }
    }

    //! DIAG-1: one track sample, and whether it had a GPS fix.
    function noteGps(hadFix as Boolean, now as Long) as Void {
        gpsSamples += 1;
        if (!hadFix) {
            gpsMissed += 1;
        } else if (gpsFirstFixSec == null && startedAt.size() > 0) {
            var since = (now / 1000).toNumber() - startedAt[0];
            gpsFirstFixSec = since > 0 ? since : 0;
        }
    }

    //! DIAG-1: as it goes up with the match.
    function diagnostics() as Dictionary {
        var battery = [] as Array<Array<Numeric>>;
        for (var i = 0; i < batteryLog.size(); i++) {
            var entry = batteryLog[i];
            battery.add([entry[0], entry[1], entry[2].toFloat() / 10] as Array<Numeric>);
        }
        var result = {
            "battery" => battery,
            "app" => Sync.APP_VERSION,
            "gpsSamples" => gpsSamples,
            "gpsMissed" => gpsMissed,
            "restarts" => restarts
        } as Dictionary;
        var firmware = System.getDeviceSettings().firmwareVersion;
        if (firmware != null && firmware.size() >= 2) {
            result["firmware"] = firmware[0] + "." + firmware[1].format("%02d");
        }
        if (gpsFirstFixSec != null) {
            result["gpsFirstFixSec"] = gpsFirstFixSec;
        }
        return result;
    }

    //! Re-attaches the activity recording after the app was restarted mid-match (R-5).
    function resumeRecording() as Void {
        if (phase == PHASE_RUNNING || phase == PHASE_GOLDEN) {
            Recorder.start(activityName());
        }
    }

    //! "Ref STR v ROV": Ref for the role, so refereed matches stand apart from ones played in Garmin
    //! Connect, where the sport is soccer either way. Uses the full team names when there are any (SET-5).
    function activityName() as String {
        return "Ref " + (homeName.length() > 0 ? homeName : home) + " v " + (awayName.length() > 0 ? awayName : away);
    }

    private function toSeconds(ms as Long) as Number {
        return (ms / 1000).toNumber();
    }
}

//! Loads a match saved by an earlier run of the app, if any.
function loadMatch() as Match? {
    var stored = Application.Storage.getValue(STORAGE_MATCH);
    if (stored instanceof Dictionary && stored.hasKey("phase")) {
        return new Match(stored as MatchData);
    }
    return null;
}

//! TMR-7: when a setup's halfway break is due, in seconds into each regular period, or -1 for none.
//! Added on as stoppage (TMR-12; a stopping clock always stops for it, TMR-15), it's due at halfway, as it
//! takes none of the period's time (22:30 in a 45-minute half); otherwise it's centered on halfway, due
//! half its length before it (21:30 for a 2-minute break).
function halfwayBreakAtSec(setup as MatchData) as Number {
    if (!booleanOr(setup.get("midBreak"), false)) {
        return -1;
    }
    var periodSec = setup.get("periodSec") as Number;
    var stopping = booleanOr(setup.get("stoppingClock"), false);
    if ((booleanOr(setup.get("trackStoppage"), false) || stopping) && (booleanOr(setup.get("breakStoppage"), false) || stopping)) {
        return periodSec / 2;
    }
    var at = (periodSec - (setup.get("breakLenSec") as Number)) / 2;
    return at < 0 ? 0 : at;
}

function stringOr(value as Application.Storage.ValueType, fallback as String) as String {
    return value instanceof String && value.length() > 0 ? value : fallback;
}

function booleanOr(value as Application.Storage.ValueType, fallback as Boolean) as Boolean {
    return value instanceof Boolean ? value : fallback;
}

//! A heading in radians in the range 0 to 2π.
function normalizeHeading(heading as Float) as Float {
    var twoPi = 2 * Math.PI;
    var h = heading;
    while (h < 0) {
        h += twoPi;
    }
    while (h >= twoPi) {
        h -= twoPi;
    }
    return h.toFloat();
}

function numberOr(value as Application.Storage.ValueType, fallback as Number) as Number {
    return value instanceof Number ? value : fallback;
}

//! Any goal, whatever its type (EVT-8). An own goal counts for the team it was recorded for.
function isGoal(type as String) as Boolean {
    return type.equals(EVENT_GOAL) || type.equals(EVENT_OWN_GOAL) || type.equals(EVENT_PEN_GOAL) || type.equals(EVENT_DFK_GOAL);
}

function isKick(type as String) as Boolean {
    return type.equals(EVENT_PEN_SCORED) || type.equals(EVENT_PEN_MISSED);
}

//! EVT-12: a sin bin or a second sin bin.
//! EVT-14: the events a reason can go to: a player's or a team official's card, or a sin bin.
function isCard(type as String) as Boolean {
    return type.equals(EVENT_YELLOW) || type.equals(EVENT_SECOND_YELLOW) || type.equals(EVENT_RED)
        || type.equals(EVENT_OFFICIAL_YELLOW) || type.equals(EVENT_OFFICIAL_RED) || isSinBin(type);
}

function isSinBin(type as String) as Boolean {
    return type.equals(EVENT_SIN_BIN) || type.equals(EVENT_SECOND_SIN_BIN);
}

//! EVT-12: what sends a player off, so a sin bin running for them ends without a return.
function isSendOff(type as String) as Boolean {
    return type.equals(EVENT_RED) || type.equals(EVENT_SECOND_YELLOW) || type.equals(EVENT_SECOND_SIN_BIN);
}

//! TMR-14: a correction of the match clock or the added time.
function isAdjustment(type as String) as Boolean {
    return type.equals(EVENT_CLOCK_ADJUSTED) || type.equals(EVENT_ADDED_ADJUSTED);
}

function clearStoredMatch() as Void {
    Application.Storage.deleteValue(STORAGE_MATCH);
}
