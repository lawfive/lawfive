import Toybox.Application;
import Toybox.Lang;
import Toybox.System;

//! Reads the app settings that are edited in the Garmin Connect phone app.
module Settings {
    const STORAGE_LAST_FORMAT = "lastFormat";

    //! The quick-match fields of MATCH_CONFIG.md: the format that Create match edits (SET-9) and
    //! "Same as last match" repeats (SET-13).
    const FORMAT_KEYS = ["numPeriods", "periodSec", "halftimeSec", "teamSize", "midBreak", "breakLenSec",
        "trackStoppage", "breakStoppage", "goalScorers", "goalTypes", "extraTime", "etPeriods", "etPeriodSec", "goldenGoal", "penalties",
        "sinBins", "sinBinSec", "stoppingClock", "stopForGoalsCards"] as Array<String>;
    function getString(key as String) as String {
        var value = Application.Properties.getValue(key);
        return value instanceof String ? value : "";
    }

    function getNumber(key as String, fallback as Number) as Number {
        var value = Application.Properties.getValue(key);
        return value instanceof Number ? value : fallback;
    }

    function getBoolean(key as String, fallback as Boolean) as Boolean {
        var value = Application.Properties.getValue(key);
        return value instanceof Boolean ? value : fallback;
    }

    //! A duration setting in minutes (whole or decimal, e.g. 2.5) as seconds.
    function getMinutesSec(key as String, fallbackMin as Number) as Number {
        var value = Application.Properties.getValue(key);
        if (value instanceof Number || value instanceof Float) {
            return (value * 60).toNumber();
        }
        return fallbackMin * 60;
    }

    //! INP-12: a watch with the Up and Down buttons (the five-button Forerunners, fenix and epix), so a
    //! match can be run by buttons alone; the Venu watches have only Start and Back (INP-5). From the
    //! watch's own list of its buttons, so a new model needs nothing here.
    function hasTeamButtons() as Boolean {
        var both = System.BUTTON_INPUT_UP | System.BUTTON_INPUT_DOWN;
        return (System.getDeviceSettings().inputButtons & both) == both;
    }

    //! INP-12: Touch lock, on and offered on this watch: taps and swipes do nothing on the running screen.
    function touchLock() as Boolean {
        return getBoolean("touchLock", false) && hasTeamButtons();
    }

    //! The longest title a menu row shows whole on the smallest round screens (Venu 2S, fenix 7S).
    const maxRowTitle = 14;

    //! Team names for a planned match, or null if none are set (SET-1).
    function plannedTeams() as [String, String]? {
        var home = getString("homeName");
        var away = getString("awayName");
        if (home.length() == 0 && away.length() == 0) {
            return null;
        }
        return [home.length() == 0 ? "HOM" : home, away.length() == 0 ? "AWY" : away];
    }

    //! The planned match's row in New match: the names when they fit a round screen's row, else the
    //! short names (SET-5), so "Strikers U12 v Rovers U12" becomes "STR v ROV" rather than being cut off.
    function plannedTitle(teams as [String, String]) as String {
        var full = teams[0] + " v " + teams[1];
        if (full.length() <= maxRowTitle) {
            return full;
        }
        var shown = shortNames(getString("homeAlias"), getString("homeName"), getString("awayAlias"), getString("awayName"));
        return shown[0] + " v " + shown[1];
    }

    //! SET-5: the short names a pair of teams shows, [home, away]: each typed one (up to 4
    //! characters), else the one suggested from both names, else HOM and AWY. A copy of shortName in
    //! schema/src/shortNames.ts, run against the cases in schema/short-names.json (testShortNames).
    function shortNames(homeAlias as String, homeName as String, awayAlias as String, awayName as String) as [String, String] {
        var suggested = suggestShortNames(homeName, awayName);
        return [typedOr(homeAlias, suggested[0], "HOM"), typedOr(awayAlias, suggested[1], "AWY")] as [String, String];
    }

    function typedOr(typed as String, suggested as String, fallback as String) as String {
        if (typed.length() > 0) {
            return typed.length() > 4 ? typed.substring(0, 4) as String : typed;
        }
        return suggested.length() > 0 ? suggested : fallback;
    }

    //! SET-5: the first three letters or digits of each name in capitals ("" for none). When those
    //! are the same, the words the names start with in common are skipped, so "Strikers U12" and
    //! "Strikers U14" become U12 and U14 (suggestAliases in schema/src/shortNames.ts).
    function suggestShortNames(homeName as String, awayName as String) as [String, String] {
        var home = nameWords(homeName);
        var away = nameWords(awayName);
        var simple = [firstThree(home, 0), firstThree(away, 0)] as [String, String];
        if (simple[0].length() == 0 || !simple[0].equals(simple[1])) {
            return simple;
        }
        var shared = 0;
        while (shared < home.size() && shared < away.size() && home[shared].toLower().equals(away[shared].toLower())) {
            shared++;
        }
        var distinct = [firstThree(home, shared), firstThree(away, shared)] as [String, String];
        if (distinct[0].length() == 0) {
            distinct[0] = simple[0];
        }
        if (distinct[1].length() == 0) {
            distinct[1] = simple[1];
        }
        return distinct[0].equals(distinct[1]) ? simple : distinct;
    }

    //! The first three characters of the words from `from` on, in capitals.
    function firstThree(words as Array<String>, from as Number) as String {
        var joined = "";
        for (var i = from; i < words.size() && joined.length() < 3; i++) {
            joined += words[i];
        }
        return (joined.length() > 3 ? joined.substring(0, 3) as String : joined).toUpper();
    }

    //! A name's words: its letters and digits, split at anything else. Monkey C has no Unicode
    //! classes, so a letter or digit is 0-9, A-Z, a-z, or any character from U+00C0 on but × and ÷
    //! and the punctuation blocks (curly quotes, dashes, CJK punctuation): every Latin letter with
    //! an accent, and other scripts' letters.
    function nameWords(name as String) as Array<String> {
        var words = [] as Array<String>;
        var word = "";
        var chars = name.toCharArray();
        for (var i = 0; i < chars.size(); i++) {
            var c = chars[i].toNumber();
            var letter = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
                || (c >= 0xC0 && c != 0xD7 && c != 0xF7 && !(c >= 0x2000 && c <= 0x206F) && !(c >= 0x3000 && c <= 0x303F));
            if (letter) {
                word += chars[i].toString();
            } else if (word.length() > 0) {
                words.add(word);
                word = "";
            }
        }
        if (word.length() > 0) {
            words.add(word);
        }
        return words;
    }

    //! The setup for a new match (SET-10, SET-11): the format from the phone settings, with the
    //! MATCH_CONFIG.md defaults for anything not set. Team names, aliases and colours only apply
    //! to the planned match; quick and created matches are HOM v AWY.
    //! Copied into the match, so changing settings mid-match does not change a match in progress.
    function matchSetup(planned as Boolean) as MatchData {
        var homeName = planned ? getString("homeName") : "";
        var awayName = planned ? getString("awayName") : "";
        var shown = shortNames(planned ? getString("homeAlias") : "", homeName, planned ? getString("awayAlias") : "", awayName);
        return {
            "home" => shown[0],
            "away" => shown[1],
            "homeName" => homeName,
            "awayName" => awayName,
            "homeColor" => planned ? Colors.parse(getString("homeColor")) : -1,
            "awayColor" => planned ? Colors.parse(getString("awayColor")) : -1,
            "numPeriods" => getNumber("numPeriods", 2),
            "periodSec" => getMinutesSec("periodMin", 45),
            "halftimeSec" => getMinutesSec("halftimeMin", 15),
            "teamSize" => getNumber("teamSize", 11),
            "midBreak" => getBoolean("midBreak", false),
            "breakLenSec" => getMinutesSec("midBreakMin", 2),
            "extraTime" => getBoolean("extraTime", false),
            "etPeriods" => getNumber("etPeriods", 2),
            "etPeriodSec" => getMinutesSec("etPeriodMin", 15),
            "goldenGoal" => getBoolean("goldenGoal", false),
            "penalties" => getBoolean("penalties", false),
            "trackStoppage" => getBoolean("trackStoppage", false),
            "breakStoppage" => getBoolean("breakStoppage", true),
            // TMR-15: the clock, as a list (0 runs on, 1 stops); a stopping one tracks stoppage.
            "stoppingClock" => getNumber("clockKind", 0) == 1,
            "stopForGoalsCards" => getBoolean("stopForGoalsCards", true),
            "goalScorers" => getBoolean("goalScorers", true),
            "goalTypes" => getBoolean("goalTypes", false),
            // EVT-12.
            "sinBins" => getBoolean("sinBins", false),
            "sinBinSec" => getMinutesSec("sinBinMin", 10),
            "repeatSec" => getNumber("alertRepeatSec", 10),
            "reminderSec" => getNumber("stoppageReminderSec", 10),
            "vibeFullTime" => getBoolean("vibeFullTime", true),
            "vibeAdded" => getBoolean("vibeAdded", true),
            "vibeStoppage" => getBoolean("vibeStoppage", true),
            "vibeBreak" => getBoolean("vibeBreak", true),
            "vibeSinBin" => getBoolean("vibeSinBin", true),
            "stoppageLabel" => timerName("stoppageLabel", "stoppage"),
            "breakLabel" => timerName("breakLabel", "break")
        };
    }

    //! A timer's name from settings, or its default when blank (SET-8).
    function timerName(key as String, fallback as String) as String {
        var name = getString(key);
        return name.length() == 0 ? fallback : name;
    }

    //! SET-13: keeps the format of a match being started, for "Same as last match".
    function rememberFormat(setup as MatchData) as Void {
        var format = {} as MatchData;
        for (var i = 0; i < FORMAT_KEYS.size(); i++) {
            format[FORMAT_KEYS[i]] = setup[FORMAT_KEYS[i]];
        }
        Application.Storage.setValue(STORAGE_LAST_FORMAT, format);
    }

    //! The last match's format, or null before the first match.
    function lastFormat() as MatchData? {
        var stored = Application.Storage.getValue(STORAGE_LAST_FORMAT);
        return stored instanceof Dictionary ? stored as MatchData : null;
    }

    //! SET-13: whether a remembered format is the same as a setup's (every FORMAT_KEYS field; one
    //! missing from an older remembered format is taken from the setup, as applyFormat does).
    function sameFormat(format as MatchData, setup as MatchData) as Boolean {
        for (var i = 0; i < FORMAT_KEYS.size(); i++) {
            // The format's fields are all whole numbers and switches, compared by value.
            var value = format[FORMAT_KEYS[i]];
            var other = setup[FORMAT_KEYS[i]];
            if (value instanceof Boolean) {
                if (!(other instanceof Boolean) || value != other) {
                    return false;
                }
            } else if (value instanceof Number) {
                if (!(other instanceof Number) || value != other) {
                    return false;
                }
            }
        }
        return true;
    }

    //! Copies a format into a setup, leaving its teams alone.
    function applyFormat(setup as MatchData, format as MatchData) as Void {
        for (var i = 0; i < FORMAT_KEYS.size(); i++) {
            var value = format[FORMAT_KEYS[i]];
            if (value != null) {
                setup[FORMAT_KEYS[i]] = value;
            }
        }
    }

    //! UI-17: a format from Create match (Settings → Quick match) as the Quick match settings.
    function saveQuickFormat(setup as MatchData) as Void {
        Application.Properties.setValue("numPeriods", setup["numPeriods"] as Number);
        Application.Properties.setValue("periodMin", (setup["periodSec"] as Number).toFloat() / 60);
        Application.Properties.setValue("halftimeMin", (setup["halftimeSec"] as Number).toFloat() / 60);
        Application.Properties.setValue("teamSize", setup["teamSize"] as Number);
        Application.Properties.setValue("midBreak", setup["midBreak"] as Boolean);
        Application.Properties.setValue("midBreakMin", (setup["breakLenSec"] as Number).toFloat() / 60);
        Application.Properties.setValue("extraTime", setup["extraTime"] as Boolean);
        Application.Properties.setValue("etPeriods", setup["etPeriods"] as Number);
        Application.Properties.setValue("etPeriodMin", (setup["etPeriodSec"] as Number).toFloat() / 60);
        Application.Properties.setValue("goldenGoal", setup["goldenGoal"] as Boolean);
        Application.Properties.setValue("penalties", setup["penalties"] as Boolean);
        Application.Properties.setValue("trackStoppage", setup["trackStoppage"] as Boolean);
        Application.Properties.setValue("breakStoppage", setup["breakStoppage"] as Boolean);
        Application.Properties.setValue("goalScorers", setup["goalScorers"] as Boolean);
        Application.Properties.setValue("goalTypes", setup["goalTypes"] as Boolean);
        Application.Properties.setValue("sinBins", booleanOr(setup["sinBins"], false));
        Application.Properties.setValue("sinBinMin", numberOr(setup["sinBinSec"], 600).toFloat() / 60);
        Application.Properties.setValue("clockKind", booleanOr(setup["stoppingClock"], false) ? 1 : 0);
        Application.Properties.setValue("stopForGoalsCards", booleanOr(setup["stopForGoalsCards"], true));
    }

    //! The periods alone, "2x45'", for a row with little room.
    function periodsSummary() as String {
        return getNumber("numPeriods", 2).format("%d") + "x" + Format.minutes(getMinutesSec("periodMin", 45));
    }

    //! One-line summary such as "2x45' · HT 15'", and "· Stop clock" for a clock that stops (TMR-15), as
    //! Create match sums a format up.
    function timingSummary() as String {
        var summary = Format.summary(getNumber("numPeriods", 2), getMinutesSec("periodMin", 45), getMinutesSec("halftimeMin", 15));
        return getNumber("clockKind", 0) == 1 ? summary + " · Stop clock" : summary;
    }
}
