import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// ---- Create match (SET-9, SET-13) ----
// One list of the quick-match fields with their values; selecting a row edits it, and "Start match"
// starts a match from the setup. After the first match, "Same as last match" comes first and is on:
// the list is then just that and Start match. Rows for the halfway break and extra time only show
// when they are switched on. Every screen replaces the one before it, so the view stack stays flat.

//! A new Create match setup: the phone settings, or the last match's format when there is one.
function newSetup() as MatchData {
    var setup = Settings.matchSetup(false);
    var last = Settings.lastFormat();
    if (last != null) {
        Settings.applyFormat(setup, last);
        setup["sameAsLast"] = true;
    }
    return setup;
}

//! Shows the Create match list in place of the current view, focused on the row for `focusKey`.
function showSetupMenu(setup as MatchData, focusKey as String, slide as WatchUi.SlideType) as Void {
    var items = setupItems(setup);
    var focus = 0;
    for (var i = 0; i < items.size(); i++) {
        if ((items[i].getId() as String).equals(focusKey)) {
            focus = i;
        }
    }
    // Button watches focus Start match, so Start/Stop starts the match straight away.
    if (focusKey.equals("start")) {
        focus = listFocus(focus);
    }
    var menu = new WatchUi.Menu2({:title => new TimedTitle(isQuickEdit(setup) ? "Quick match" : "Create match"), :focus => focus});
    for (var i = 0; i < items.size(); i++) {
        menu.addItem(items[i]);
    }
    WatchUi.switchToView(menu, new SetupMenuDelegate(setup), slide);
}

//! Watches without a Down button (Venu) scroll the focused row to the top of the screen, hiding the
//! rows above it, so lists that open on a chosen row open at the top there instead.
function isQuickEdit(setup as MatchData) as Boolean {
    var mode = setup["mode"];
    return mode instanceof String && mode.equals("quick");
}

function listFocus(index as Number) as Number {
    var hasDown = (System.getDeviceSettings().inputButtons & System.BUTTON_INPUT_DOWN) != 0;
    return hasDown ? index : 0;
}

function setupItems(setup as MatchData) as Array<WatchUi.MenuItem> {
    // UI-17: editing the Quick match format from Settings: Save instead of Start, and no teams.
    if (isQuickEdit(setup)) {
        var quick = [new WatchUi.MenuItem("Save", "For Quick match", "start", null)] as Array<WatchUi.MenuItem>;
        quick.addAll(formatItems(setup));
        return quick;
    }
    // "sameAsLast" is only in the setup when there is a last match (SET-13).
    var hasLast = setup["sameAsLast"] instanceof Boolean;
    var sameAsLast = hasLast && (setup["sameAsLast"] as Boolean);
    var summary = Format.summary(setup["numPeriods"] as Number, setup["periodSec"] as Number, setup["halftimeSec"] as Number);
    if (setup["extraTime"] as Boolean) {
        // ET-6: "ET GG" with a golden goal.
        summary += booleanOr(setup["goldenGoal"], false) ? " · ET GG" : " · ET";
    }
    if (setup["penalties"] as Boolean) {
        summary += " · Pens";
    }
    if (booleanOr(setup["sinBins"], false)) {
        // EVT-12: "SB 10'".
        summary += " · SB " + Format.minutes(numberOr(setup["sinBinSec"], 600));
    }
    if (booleanOr(setup["stoppingClock"], false)) {
        // TMR-15.
        summary += " · Stop clock";
    }
    var items = [] as Array<WatchUi.MenuItem>;
    if (hasLast) {
        items.add(new WatchUi.ToggleMenuItem("Same as last", {:enabled => summary, :disabled => "Change below"},
            "sameAsLast", sameAsLast, null));
    }
    items.add(new WatchUi.MenuItem("Start match", sameAsLast ? null : summary, "start", null));
    if (!sameAsLast) {
        items.addAll(formatItems(setup));
    }
    // SET-14: last, and shown even with "Same as last" on, because colours change from match to match.
    items.add(new WatchUi.MenuItem("Team colors", colorsSummary(setup), "teamColors", null));
    return items;
}

//! The format rows, in the order of SET-9.
function formatItems(setup as MatchData) as Array<WatchUi.MenuItem> {
    var numPeriods = setup["numPeriods"] as Number;
    var periodSec = setup["periodSec"] as Number;
    var breakLabel = setup["breakLabel"] as String;
    var midBreak = setup["midBreak"] as Boolean;
    var extraTime = setup["extraTime"] as Boolean;
    var items = [
        new WatchUi.MenuItem("Periods", numPeriods.format("%d"), "numPeriods", null),
        new WatchUi.MenuItem("Period length", minutesText(periodSec), "periodSec", null),
        new WatchUi.MenuItem(numPeriods == 2 ? "Half-time" : numPeriods == 1 ? "Break before ET" : "Between periods", minutesText(setup["halftimeSec"] as Number), "halftimeSec", null),
        new WatchUi.MenuItem("Team size", (setup["teamSize"] as Number).format("%d"), "teamSize", null)
    ] as Array<WatchUi.MenuItem>;
    // TMR-15: the clock, and while it stops, whether a goal or card stops it. It stops with the stoppage
    // clock, so stoppage tracking (on) and break as stoppage (it stops for the break anyway) aren't asked.
    var stopping = booleanOr(setup["stoppingClock"], false);
    items.add(new WatchUi.MenuItem("Clock", stopping ? "Stops" : "Runs on", "stoppingClock", null));
    if (stopping) {
        items.add(new WatchUi.ToggleMenuItem("Goals, cards stop", {:enabled => "On", :disabled => "Off"},
            "stopForGoalsCards", booleanOr(setup["stopForGoalsCards"], true), null));
    } else {
        items.add(new WatchUi.ToggleMenuItem("Track " + (setup["stoppageLabel"] as String), {:enabled => "On", :disabled => "Off"},
            "trackStoppage", setup["trackStoppage"] as Boolean, null));
    }
    items.add(new WatchUi.ToggleMenuItem("Goal scorers", {:enabled => "Ask for the number", :disabled => "Off"},
        "goalScorers", setup["goalScorers"] as Boolean, null));
    items.add(new WatchUi.ToggleMenuItem("Goal types", {:enabled => "DFK, penalty, own goal", :disabled => "Off"},
        "goalTypes", setup["goalTypes"] as Boolean, null));
    items.add(new WatchUi.ToggleMenuItem("Extra time", {:enabled => "On", :disabled => "Off"}, "extraTime", extraTime, null));
    if (extraTime) {
        items.add(new WatchUi.MenuItem("ET periods", (setup["etPeriods"] as Number).format("%d"), "etPeriods", null));
        items.add(new WatchUi.MenuItem("ET period length", minutesText(setup["etPeriodSec"] as Number), "etPeriodSec", null));
        // ET-6.
        items.add(new WatchUi.ToggleMenuItem("Golden goal", {:enabled => "First ET goal wins", :disabled => "Off"},
            "goldenGoal", booleanOr(setup["goldenGoal"], false), null));
    }
    items.add(new WatchUi.ToggleMenuItem("Penalties", {:enabled => "On", :disabled => "Off"}, "penalties", setup["penalties"] as Boolean, null));
    items.add(new WatchUi.ToggleMenuItem("Halfway " + breakLabel, {:enabled => "At " + Format.seconds(halfwayBreakAtSec(setup)), :disabled => "Off"},
        "midBreak", midBreak, null));
    if (midBreak) {
        items.add(new WatchUi.MenuItem(Format.capitalize(breakLabel) + " length", Format.seconds(setup["breakLenSec"] as Number), "breakLenSec", null));
        // TMR-12: only with a stoppage clock to add it to, and not with a clock that stops (TMR-15).
        if ((setup["trackStoppage"] as Boolean) && !stopping) {
            items.add(new WatchUi.ToggleMenuItem(Format.capitalize(breakLabel) + " as " + (setup["stoppageLabel"] as String),
                {:enabled => "Time added on", :disabled => "Off"}, "breakStoppage", setup["breakStoppage"] as Boolean, null));
        }
    }
    // EVT-12: sin bins, and while they're on, their length.
    var sinBins = booleanOr(setup["sinBins"], false);
    items.add(new WatchUi.ToggleMenuItem("Sin bins", {:enabled => "On", :disabled => "Off"}, "sinBins", sinBins, null));
    if (sinBins) {
        items.add(new WatchUi.MenuItem("Sin bin length", minutesText(numberOr(setup["sinBinSec"], 600)), "sinBinSec", null));
    }
    return items;
}

//! "45 min", or "22:30" when not a whole number of minutes.
function minutesText(sec as Number) as String {
    return sec % 60 == 0 ? (sec / 60).format("%d") + " min" : Format.seconds(sec);
}

class SetupMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _setup as MatchData;

    function initialize(setup as MatchData) {
        Menu2InputDelegate.initialize();
        _setup = setup;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var key = item.getId() as String;
        if (key.equals("start") && isQuickEdit(_setup)) {
            Settings.saveQuickFormat(_setup);
            showSettingsMenu();
        } else if (key.equals("start")) {
            _setup.remove("sameAsLast");
            beginMatch(_setup);
        } else if (key.equals("teamColors")) {
            showTeamColors(_setup, "homeColor");
        } else if (item instanceof WatchUi.ToggleMenuItem) {
            // Rebuilt so the rows that depend on the switch appear or disappear.
            _setup[key] = item.isEnabled();
            var last = Settings.lastFormat();
            if (key.equals("sameAsLast") && item.isEnabled() && last != null) {
                // Back to exactly the last format, whatever was changed while it was off.
                Settings.applyFormat(_setup, last);
            }
            showSetupMenu(_setup, key, WatchUi.SLIDE_IMMEDIATE);
        } else if (key.equals("numPeriods")) {
            // SET-16: one period, for tournament games.
            showChoice(_setup, key, "Periods", [1, 2, 3, 4], ["1", "2", "3", "4"]);
        } else if (key.equals("etPeriods")) {
            showChoice(_setup, key, "ET periods", [1, 2], ["1", "2"]);
        } else if (key.equals("stoppingClock")) {
            // TMR-15: as a choice of two, kept as a number while it's chosen.
            _setup["clockKind"] = booleanOr(_setup["stoppingClock"], false) ? 1 : 0;
            showChoice(_setup, "clockKind", "Clock", [0, 1], ["Runs on", "Stops"]);
        } else if (key.equals("breakLenSec")) {
            var values = [] as Array<Number>;
            var labels = [] as Array<String>;
            for (var sec = 30; sec <= 300; sec += 30) {
                values.add(sec);
                labels.add(Format.seconds(sec));
            }
            showChoice(_setup, key, Format.capitalize(_setup["breakLabel"] as String) + " length", values, labels);
        } else if (key.equals("periodSec")) {
            // The same ranges as the phone settings.
            editDigits(key, item.getLabel(), "Minutes 1-60", 60, 1, 60, null);
        } else if (key.equals("halftimeSec")) {
            editDigits(key, item.getLabel(), "Minutes 0-30", 60, 0, 30, "No break");
        } else if (key.equals("etPeriodSec")) {
            editDigits(key, item.getLabel(), "Minutes 1-30", 60, 1, 30, null);
        } else if (key.equals("teamSize")) {
            editDigits(key, item.getLabel(), "Players 1-11", 1, 1, 11, null);
        } else if (key.equals("sinBinSec")) {
            // EVT-12: the phone setting's range.
            editDigits(key, item.getLabel(), "Minutes 1-20", 60, 1, 20, null);
        }
    }

    function onBack() as Void {
        if (isQuickEdit(_setup)) {
            showSettingsMenu();
        } else {
            showStartMenu(HOME_NEW);
        }
    }

    //! Two-digit entry for a value stored as `scale` times the number entered (60 for minutes).
    private function editDigits(key as String, title as String, unit as String, scale as Number, minValue as Number,
            maxValue as Number, zeroLabel as String?) as Void {
        var view = new DigitEntryView(title, null, unit, numberOr(_setup[key], 0) / scale, minValue, maxValue, zeroLabel);
        var edit = new SetupEdit(_setup, key, scale);
        WatchUi.switchToView(view, new DigitEntryDelegate(view, edit.method(:onDone)), WatchUi.SLIDE_LEFT);
    }
}

//! Stores a value from the two-digit entry and returns to the list; Back (null) keeps the old value.
class SetupEdit {
    private var _setup as MatchData;
    private var _key as String;
    private var _scale as Number;

    function initialize(setup as MatchData, key as String, scale as Number) {
        _setup = setup;
        _key = key;
        _scale = scale;
    }

    function onDone(value as Number?) as Void {
        if (value != null) {
            _setup[_key] = value * _scale;
        }
        showSetupMenu(_setup, _key, WatchUi.SLIDE_RIGHT);
    }
}

//! A list of values to pick from, focused on the current one.
function showChoice(setup as MatchData, key as String, title as String, values as Array<Number>, labels as Array<String>) as Void {
    var focus = 0;
    for (var i = 0; i < values.size(); i++) {
        if (values[i] == (setup[key] as Number)) {
            focus = i;
        }
    }
    var menu = new WatchUi.Menu2({:title => new TimedTitle(title), :focus => listFocus(focus)});
    for (var i = 0; i < values.size(); i++) {
        menu.addItem(new WatchUi.MenuItem(labels[i], null, values[i], null));
    }
    WatchUi.switchToView(menu, new SetupChoiceDelegate(setup, key), WatchUi.SLIDE_LEFT);
}

class SetupChoiceDelegate extends WatchUi.Menu2InputDelegate {
    private var _setup as MatchData;
    private var _key as String;

    function initialize(setup as MatchData, key as String) {
        Menu2InputDelegate.initialize();
        _setup = setup;
        _key = key;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        _setup[_key] = item.getId() as Number;
        back();
    }

    function onBack() as Void {
        back();
    }

    private function back() as Void {
        // TMR-15: the clock's choice goes back into the setup as the switch it is.
        if (_key.equals("clockKind")) {
            _setup["stoppingClock"] = (_setup["clockKind"] as Number) == 1;
            _setup.remove("clockKind");
            showSetupMenu(_setup, "stoppingClock", WatchUi.SLIDE_RIGHT);
            return;
        }
        showSetupMenu(_setup, _key, WatchUi.SLIDE_RIGHT);
    }
}

// ---- Team colours (SET-14) ----

//! "HOM Red · AWY Blue", or "None" when neither team has a colour.
function colorsSummary(setup as MatchData) as String {
    var home = setup["homeColor"] as Number;
    var away = setup["awayColor"] as Number;
    if (home < 0 && away < 0) {
        return "None";
    }
    return (setup["home"] as String) + " " + Colors.name(home) + " · " + (setup["away"] as String) + " " + Colors.name(away);
}

//! Home team and Away team, each with its colour.
function showTeamColors(setup as MatchData, focusKey as String) as Void {
    var menu = new WatchUi.Menu2({:title => new TimedTitle("Team colors"), :focus => listFocus(focusKey.equals("awayColor") ? 1 : 0)});
    var keys = ["homeColor", "awayColor"];
    var labels = ["Home team", "Away team"];
    for (var i = 0; i < 2; i++) {
        var color = setup[keys[i]] as Number;
        menu.addItem(new WatchUi.IconMenuItem(labels[i], Colors.name(color), keys[i], new ColorSwatch(color), null));
    }
    WatchUi.switchToView(menu, new TeamColorsDelegate(setup), WatchUi.SLIDE_LEFT);
}

class TeamColorsDelegate extends WatchUi.Menu2InputDelegate {
    private var _setup as MatchData;

    function initialize(setup as MatchData) {
        Menu2InputDelegate.initialize();
        _setup = setup;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var key = item.getId() as String;
        var current = _setup[key] as Number;
        var focus = Colors.VALUES.indexOf(current);
        var menu = new WatchUi.Menu2({:title => key.equals("homeColor") ? "Home color" : "Away color", :focus => listFocus(focus < 0 ? 0 : focus)});
        for (var i = 0; i < Colors.VALUES.size(); i++) {
            menu.addItem(new WatchUi.IconMenuItem(Colors.NAMES[i], null, Colors.VALUES[i], new ColorSwatch(Colors.VALUES[i]), null));
        }
        WatchUi.switchToView(menu, new ColorChoiceDelegate(_setup, key), WatchUi.SLIDE_LEFT);
    }

    function onBack() as Void {
        showSetupMenu(_setup, "teamColors", WatchUi.SLIDE_RIGHT);
    }
}

class ColorChoiceDelegate extends WatchUi.Menu2InputDelegate {
    private var _setup as MatchData;
    private var _key as String;

    function initialize(setup as MatchData, key as String) {
        Menu2InputDelegate.initialize();
        _setup = setup;
        _key = key;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        _setup[_key] = item.getId() as Number;
        showTeamColors(_setup, _key);
    }

    function onBack() as Void {
        showTeamColors(_setup, _key);
    }
}

//! A square of a colour for the colour menus, outlined so black and white show on any menu
//! background; "None" is the outline with a slash. The menu gives the icon its own area, so the
//! square is centred in it.
class ColorSwatch extends WatchUi.Drawable {
    private var _color as Number;

    function initialize(color as Number) {
        var size = (System.getDeviceSettings().screenHeight * 0.09).toNumber();
        Drawable.initialize({:width => size, :height => size});
        _color = color;
    }

    function draw(dc as Graphics.Dc) as Void {
        var x = (dc.getWidth() - width) / 2;
        var y = (dc.getHeight() - height) / 2;
        if (_color >= 0) {
            dc.setColor(_color, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, y, width, height, 5);
        }
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawRoundedRectangle(x, y, width, height, 5);
        if (_color < 0) {
            dc.drawLine(x + 4, y + height - 4, x + width - 4, y + 4);
        }
    }
}
