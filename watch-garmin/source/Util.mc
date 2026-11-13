import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;

//! Wall-clock milliseconds. Time.now() only has second resolution, so it is
//! anchored once and advanced with the millisecond system timer (TMR-8).
module Clock {
    var _baseMs as Long? = null;
    var _baseTimer as Number = 0;

    function nowMs() as Long {
        var base = _baseMs;
        if (base == null) {
            base = Time.now().value().toLong() * 1000;
            _baseMs = base;
            _baseTimer = System.getTimer();
        }
        return base + (System.getTimer() - _baseTimer);
    }
}

module Format {
    //! Elapsed time as m:ss. Minutes are not wrapped, so 90 minutes shows as 90:00.
    function clock(ms as Long) as String {
        var sec = (ms / 1000).toNumber();
        if (sec < 0) {
            sec = 0;
        }
        return (sec / 60).format("%d") + ":" + (sec % 60).format("%02d");
    }

    //! Countdown time as m:ss, rounded up so 0:00 only shows once time has run out.
    function countdown(ms as Long) as String {
        return clock(ms + 999);
    }

    function seconds(sec as Number) as String {
        return clock(sec.toLong() * 1000);
    }

    //! TMR-14: a clock's change, signed: "+0:40", "-1:05". An ASCII minus, as Garmin's system fonts
    //! can't be relied on for U+2212 on every watch.
    function change(sec as Number) as String {
        return (sec < 0 ? "-" : "+") + seconds(sec < 0 ? -sec : sec);
    }

    //! "stoppage" -> "Stoppage", for names at the start of a line.
    function capitalize(text as String) as String {
        if (text.length() == 0) {
            return text;
        }
        return (text.substring(0, 1) as String).toUpper() + (text.substring(1, text.length()) as String);
    }

    //! Short label for a period: halves are 1H/2H, quarters Q1-Q4, anything else P1, P2...
    //! Extra-time periods come after the regular ones: ET1, ET2 (ET-2). A match of one period has
    //! none (SET-16), so its screens leave the label's slot empty.
    function periodLabel(period as Number, numPeriods as Number) as String {
        if (period >= numPeriods) {
            return "ET" + (period - numPeriods + 1).format("%d");
        } else if (numPeriods == 1) {
            return "";
        } else if (numPeriods == 2) {
            return (period + 1).format("%d") + "H";
        } else if (numPeriods == 4) {
            return "Q" + (period + 1).format("%d");
        }
        return "P" + (period + 1).format("%d");
    }

    //! Longer label used in menus: "1st half", "2nd half", "Q3", "P2"; "period" for a match of one
    //! (SET-16), as in "End period" before extra time or penalties.
    function periodName(period as Number, numPeriods as Number) as String {
        if (numPeriods == 2 && period < numPeriods) {
            return period == 0 ? "1st half" : "2nd half";
        } else if (numPeriods == 1 && period == 0) {
            return "period";
        }
        return periodLabel(period, numPeriods);
    }

    //! A period's label before a time, "1H 23:40", or the time alone for a match of one period (SET-16).
    function withPeriod(period as Number, numPeriods as Number, text as String) as String {
        var label = periodLabel(period, numPeriods);
        return label.length() == 0 ? text : label + " " + text;
    }

    //! Minutes as "45'", or "22:30" when not a whole number of minutes.
    function minutes(sec as Number) as String {
        return sec % 60 == 0 ? (sec / 60).format("%d") + "'" : seconds(sec);
    }

    //! One-line format summary such as "2x45' · HT 15'" (SET-9); "1x20'" for one period, which has no
    //! break but before extra time (SET-16).
    function summary(numPeriods as Number, periodSec as Number, halftimeSec as Number) as String {
        var periods = numPeriods.format("%d") + "x" + minutes(periodSec);
        return numPeriods == 1 ? periods : periods + " · " + (numPeriods == 2 ? "HT " : "Brk ") + minutes(halftimeSec);
    }
}

//! Team colours (UI-10).
module Colors {
    //! The colours offered in Create match (SET-14), with "None" first.
    const NAMES = ["None", "Black", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple"] as Array<String>;
    const VALUES = [-1, 0x000000, 0xFFFFFF, 0xD71920, 0xFF7A00, 0xFFD100, 0x00A651, 0x0057B8, 0x6A2C91] as Array<Number>;

    //! "Red" for a colour from the list, "Custom" for any other (a hex colour from the phone), "None" for -1.
    function name(color as Number) as String {
        var index = VALUES.indexOf(color);
        return index >= 0 ? NAMES[index] : "Custom";
    }

    //! Parses "#C8102E", "C8102E" or "#C12" into a colour; -1 if blank or not a colour.
    function parse(text as String) as Number {
        var hex = text;
        if (hex.length() > 0 && (hex.substring(0, 1) as String).equals("#")) {
            hex = hex.substring(1, hex.length()) as String;
        }
        if (hex.length() == 3) {
            var chars = hex.toCharArray();
            hex = "";
            for (var i = 0; i < 3; i++) {
                hex += chars[i].toString() + chars[i].toString();
            }
        }
        if (hex.length() != 6) {
            return -1;
        }
        var value = hex.toNumberWithBase(16);
        return value == null ? -1 : value;
    }

    //! WCAG relative luminance (0 = black, 1 = white).
    function luminance(color as Number) as Float {
        var channels = [(color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF];
        var weights = [0.2126, 0.7152, 0.0722];
        var total = 0.0;
        for (var i = 0; i < 3; i++) {
            var c = channels[i] / 255.0;
            var linear = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            total += weights[i] * linear;
        }
        return total.toFloat();
    }

    //! Black or white, whichever has the higher contrast ratio against the colour.
    function textOn(color as Number) as Graphics.ColorType {
        var l = luminance(color);
        var onBlack = (l + 0.05) / 0.05;
        var onWhite = 1.05 / (l + 0.05);
        return onBlack >= onWhite ? Graphics.COLOR_BLACK : Graphics.COLOR_WHITE;
    }

    //! A colour too dark to stand out from the black screen gets a grey outline (contrast below 1.5:1).
    function needsOutline(color as Number) as Boolean {
        return (luminance(color) + 0.05) / 0.05 < 1.5;
    }
}
