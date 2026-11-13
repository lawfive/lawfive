import Toybox.Application;
import Toybox.Lang;
import Toybox.System;

// UI-21: the match screen's four choices. Clocks: one, or two stacked or side by side.
const CLOCKS_ONE = 0;
const CLOCKS_STACKED = 1;
const CLOCKS_SIDE_BY_SIDE = 2;
// What the edge of the screen shows: the ring (UI-23) or the time of day (UI-25).
const EDGE_NONE = 0;
const EDGE_RING = 1;
const EDGE_TIME = 2;
// TMR-4: how the break clock counts.
const BREAK_DOWN = 0;
const BREAK_UP = 1;

// The six layouts before UI-21's choices, as older servers and saved matches still name them.
const LAYOUT_DEFAULT = 0;
const LAYOUT_STACKED = 1;
const LAYOUT_MINIMAL = 2;
const LAYOUT_SCOREBOARD = 3;
const LAYOUT_SIDE_BY_SIDE = 4;
const LAYOUT_RING = 5;

//! TMR-11: the match clock styles as the menus name them, indexed by CLOCK_UP, CLOCK_UP_EACH, CLOCK_DOWN.
const CLOCK_STYLE_NAMES = ["Match time", "Each half from 0", "Time left"] as Array<String>;
//! The same, with their example for a 2 × 45 match.
const CLOCK_STYLE_HINTS = ["0 to 90, like TV", "0 to 45, then again", "45 down to 0"] as Array<String>;

//! The match screen chosen on this watch or for the account (UI-24), kept as properties so the
//! Garmin Connect phone settings show it too.
module Screen {
    //! The server's names, indexed by the values above.
    const CLOCKS_IDS = ["one", "stacked", "sideBySide"] as Array<String>;
    const EDGE_IDS = ["none", "ring", "time"] as Array<String>;
    const BREAK_IDS = ["down", "up"] as Array<String>;
    const LAYOUT_IDS = ["default", "stacked", "minimal", "scoreboard", "sideBySide", "ring"] as Array<String>;
    const CLOCK_IDS = ["up", "upEach", "down"] as Array<String>;

    // UI-24: until one is chosen, two clocks stacked, the time left over the match time, with the
    // time of day and names (properties.xml has the same).
    function clocks() as Number {
        return inRange(Settings.getNumber("screenClocks", CLOCKS_STACKED), 3, CLOCKS_STACKED);
    }

    function mainClock() as Number {
        return inRange(Settings.getNumber("mainClock", CLOCK_DOWN), 3, CLOCK_DOWN);
    }

    //! UI-22: never the same style as the match clock: time left, or from 0 when that's time left.
    function secondClock() as Number {
        var second = inRange(Settings.getNumber("secondClock", CLOCK_UP), 3, CLOCK_UP);
        var main = mainClock();
        return second != main ? second : (main == CLOCK_DOWN ? CLOCK_UP_EACH : CLOCK_DOWN);
    }

    function breakClock() as Number {
        return inRange(Settings.getNumber("breakClock", BREAK_DOWN), 2, BREAK_DOWN);
    }

    function edge() as Number {
        return inRange(Settings.getNumber("screenEdge", EDGE_TIME), 3, EDGE_TIME);
    }

    function names() as Boolean {
        return Settings.getBoolean("screenNames", true);
    }

    //! UI-23: square screens have no ring; they show the time of day instead.
    function shownEdge(chosen as Number) as Number {
        return chosen == EDGE_RING && System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_ROUND ? EDGE_TIME : chosen;
    }

    //! Watches updated from before UI-21's choices had one of six layouts, and the match clock in
    //! the format: read once into the four choices. A new install, or a watch that never changed
    //! either, gets the default screen (UI-24).
    function migrate() as Void {
        if (Settings.getNumber("screenClocks", -1) >= 0) {
            return;
        }
        var layout = Settings.getNumber("faceLayout", LAYOUT_DEFAULT);
        if (layout == LAYOUT_DEFAULT && Settings.getNumber("clockStyle", CLOCK_UP) == CLOCK_UP) {
            Application.Properties.setValue("screenClocks", CLOCKS_STACKED);
            Application.Properties.setValue("mainClock", CLOCK_DOWN);
            Application.Properties.setValue("secondClock", CLOCK_UP);
            Application.Properties.setValue("breakClock", BREAK_DOWN);
            Application.Properties.setValue("screenEdge", EDGE_TIME);
            Application.Properties.setValue("screenNames", true);
            return;
        }
        Application.Properties.setValue("screenClocks", clocksOf(layout));
        Application.Properties.setValue("screenEdge", layout == LAYOUT_RING ? EDGE_RING : EDGE_NONE);
        Application.Properties.setValue("screenNames", layout != LAYOUT_MINIMAL);
        Application.Properties.setValue("mainClock", inRange(Settings.getNumber("clockStyle", CLOCK_UP), 3, CLOCK_UP));
    }

    //! UI-21: Scoreboard was dropped, so it becomes one clock with names.
    function clocksOf(layout as Number) as Number {
        return layout == LAYOUT_STACKED ? CLOCKS_STACKED : (layout == LAYOUT_SIDE_BY_SIDE ? CLOCKS_SIDE_BY_SIDE : CLOCKS_ONE);
    }

    //! UI-24: the nearest old layout, for servers from before UI-21's choices.
    function nearestLayout() as Number {
        var c = clocks();
        if (c == CLOCKS_STACKED) {
            return LAYOUT_STACKED;
        } else if (c == CLOCKS_SIDE_BY_SIDE) {
            return LAYOUT_SIDE_BY_SIDE;
        } else if (!names()) {
            return LAYOUT_MINIMAL;
        }
        return edge() == EDGE_RING ? LAYOUT_RING : LAYOUT_DEFAULT;
    }

    //! UI-24: as the server takes it from the watch, and sends it back.
    function toServer(at as Number) as Dictionary {
        return {
            "layout" => LAYOUT_IDS[nearestLayout()],
            "secondClock" => CLOCK_IDS[secondClock()],
            "clocks" => CLOCKS_IDS[clocks()],
            "mainClock" => CLOCK_IDS[mainClock()],
            "breakClock" => BREAK_IDS[breakClock()],
            "edge" => EDGE_IDS[edge()],
            "names" => names(),
            "at" => at
        };
    }

    //! UI-24: the account's choice, as the server sends it. An older server sends only a layout and
    //! second clock; how the match and break clocks count then stay as they are. False if it can't
    //! be read.
    function fromServer(screen as Dictionary) as Boolean {
        var layout = LAYOUT_IDS.indexOf(screen["layout"] as String);
        var second = CLOCK_IDS.indexOf(screen["secondClock"] as String);
        if (layout < 0 || second < 0) {
            return false;
        }
        var clocksId = screen["clocks"];
        if (clocksId instanceof String) {
            var c = CLOCKS_IDS.indexOf(clocksId);
            var main = CLOCK_IDS.indexOf(screen["mainClock"] as String);
            var brk = BREAK_IDS.indexOf(screen["breakClock"] as String);
            var e = EDGE_IDS.indexOf(screen["edge"] as String);
            var n = screen["names"];
            if (c < 0 || main < 0 || brk < 0 || e < 0 || !(n instanceof Boolean)) {
                return false;
            }
            Application.Properties.setValue("screenClocks", c);
            Application.Properties.setValue("mainClock", main);
            Application.Properties.setValue("breakClock", brk);
            Application.Properties.setValue("screenEdge", e);
            Application.Properties.setValue("screenNames", n);
        } else {
            Application.Properties.setValue("screenClocks", clocksOf(layout));
            Application.Properties.setValue("screenEdge", layout == LAYOUT_RING ? EDGE_RING : EDGE_NONE);
            Application.Properties.setValue("screenNames", layout != LAYOUT_MINIMAL);
        }
        Application.Properties.setValue("secondClock", second);
        return true;
    }

    function inRange(value as Number, count as Number, fallback as Number) as Number {
        return value >= 0 && value < count ? value : fallback;
    }
}
