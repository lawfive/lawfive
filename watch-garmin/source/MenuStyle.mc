import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.WatchUi;

const COLOR_CARD_YELLOW = 0xFFCC00;
const COLOR_CARD_RED = 0xDD1111;
const COLOR_MENU_ROW = 0x222222;
const COLOR_MENU_FOCUS = 0x444444;

//! UI-25: the time of day, as the watch is set to show it.
function timeOfDay() as String {
    var now = System.getClockTime();
    return Sync.clockTime(now.hour, now.min);
}

var _timeFont as Graphics.FontType? = null;

//! UI-25: the font for the time of day at the bottom of a screen: the app's own on high-resolution
//! screens (sized for each in resources-*), the watch's smallest elsewhere.
function timeOfDayFont(width as Number) as Graphics.FontType {
    if (width < 360) {
        return Graphics.FONT_XTINY;
    }
    if (_timeFont == null) {
        _timeFont = WatchUi.loadResource(Rez.Fonts.TimeOfDay) as Graphics.FontType;
    }
    return _timeFont as Graphics.FontType;
}

//! UI-25: the time of day, small at the very bottom of every screen but the menus (whose titles have
//! it at the top) and the running match when it's not chosen: as low as it fits inside the screen's edge.
function drawTimeOfDay(dc as Graphics.Dc, color as Graphics.ColorType) as Void {
    var w = dc.getWidth();
    var h = dc.getHeight();
    var font = timeOfDayFont(w);
    var text = timeOfDay();
    // The widest the time gets, so it doesn't move as it changes.
    var width = dc.getTextWidthInPixels(text.length() > 5 ? "00:00 AM" : "00:00", font);
    var margin = (h * 0.012).toNumber() + 1;
    var bottom = h - margin;
    if (System.getDeviceSettings().screenShape == System.SCREEN_SHAPE_ROUND) {
        // The text's lower corners sit on the circle, just inside it.
        var r = h / 2.0 - margin;
        var half = width / 2.0;
        bottom = (h / 2.0 + Math.sqrt(r * r - half * half)).toNumber();
    }
    // Digits stand on the baseline, so the font's descent can hang below the edge.
    dc.setColor(color, Graphics.COLOR_TRANSPARENT);
    dc.drawText(w / 2, bottom - Graphics.getFontAscent(font), font, text, Graphics.TEXT_JUSTIFY_CENTER);
}

//! The title of a system menu (UI-6): its name, with the time of day above it (UI-25), kept current as it's drawn.
class TimedTitle extends WatchUi.Drawable {
    private var _text as String;

    function initialize(text as String) {
        Drawable.initialize({});
        _text = text;
    }

    function draw(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.34).toNumber(), Graphics.FONT_XTINY, timeOfDay(), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, (h * 0.72).toNumber(), Graphics.FONT_XTINY, _text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}

//! The team menu (UI-6): Goal, Yellow card and Red card, drawn by the app with colored card rows.
//! Every other menu uses the system Menu2 (`systemMenu`). The title is the team's kit, cut on the side
//! facing the other team (UI-10), so `team` says which side.
function newMenu(title as String, team as Number, color as Number) as WatchUi.CustomMenu {
    var height = System.getDeviceSettings().screenHeight;
    return new WatchUi.CustomMenu((height * 0.2).toNumber(), Graphics.COLOR_BLACK, {
        :focus => 0,
        :focusItemHeight => (height * 0.22).toNumber(),
        :titleItemHeight => (height * 0.24).toNumber(),
        :title => new MenuTitle(title, team, color)
    });
}

//! The team name on its lone kit (UI-10).
class MenuTitle extends WatchUi.Drawable {
    private var _text as String;
    private var _team as Number;
    private var _color as Number;

    function initialize(text as String, team as Number, color as Number) {
        Drawable.initialize({});
        _text = text;
        _team = team;
        _color = color;
    }

    function draw(dc as Graphics.Dc) as Void {
        var x = dc.getWidth() / 2;
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_BLACK);
        dc.clear();
        // UI-25: the time of day, above the team's name.
        var timeY = (h * 0.2).toNumber();
        var font = Graphics.FONT_XTINY;
        dc.drawText(x, timeY, font, timeOfDay(), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        // The kit a little under the time's baseline where the watch's fonts are tall (the Venu 2), and
        // never past the title's bottom.
        var kitH = dc.getFontHeight(Graphics.FONT_SMALL);
        var y = timeY - dc.getFontHeight(font) / 2 + Graphics.getFontAscent(font) + (kitH * 0.16).toNumber() + kitH / 2;
        var lowest = h - 2 - kitH / 2;
        y = y < h * 0.55 ? (h * 0.55).toNumber() : (y > lowest ? lowest : y);
        drawTeamKit(dc, x, y, _text, Graphics.FONT_SMALL, _color, _team);
    }
}

// UI-10: a team without a color is a kit in the board's blank.
const COLOR_KIT_BLANK = 0x3A403D;
// UI-10: how far a kit's cut leans either side of its middle, and the gap between two kits, as
// fractions of the kit's height.
const KIT_SLANT = 0.21;
const KIT_GAP = 0.11;

//! UI-10: the teams as kits, the slanted panels of the phones and website.
module Kit {
    //! The room either side of a name on its kit, for a kit `height` tall.
    function pad(height as Number) as Number {
        return (height * 0.3 + 0.5).toNumber();
    }

    //! The color a team's kit is filled with: its own, or the board's blank without one.
    function fill(color as Number) as Number {
        return color >= 0 ? color : COLOR_KIT_BLANK;
    }

    //! The corners of a kit spanning `left` to `right` at half its height, from `top` to `bottom`,
    //! clockwise from the top left. A cut edge leans as "/": KIT_SLANT of the height right of its
    //! middle at the top, as far left at the bottom.
    function points(left as Float, right as Float, top as Number, bottom as Number, cutLeft as Boolean,
            cutRight as Boolean) as Array<Graphics.Point2D> {
        var d = (bottom - top) * KIT_SLANT;
        return [
            [round(cutLeft ? left + d : left), top],
            [round(cutRight ? right + d : right), top],
            [round(cutRight ? right - d : right), bottom],
            [round(cutLeft ? left - d : left), bottom]
        ] as Array<Graphics.Point2D>;
    }

    function round(x as Float) as Number {
        return Math.round(x).toNumber();
    }

    //! Fills a kit (see `points`) in the team's color, or the blank for none (-1). A color too dark
    //! for the black screen gets a thin gray edge. Smoothed where the watch can (MIP screens can't,
    //! where the cut is a fine staircase).
    function draw(dc as Graphics.Dc, left as Float, right as Float, top as Number, bottom as Number,
            cutLeft as Boolean, cutRight as Boolean, color as Number) as Void {
        var corners = points(left, right, top, bottom, cutLeft, cutRight);
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(true);
        }
        dc.setColor(fill(color), Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon(corners);
        if (color >= 0 && Colors.needsOutline(color)) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(1);
            for (var i = 0; i < corners.size(); i++) {
                var a = corners[i];
                var b = corners[(i + 1) % corners.size()];
                dc.drawLine(a[0], a[1], b[0], b[1]);
            }
        }
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(false);
        }
    }
}

//! UI-10: one team on its own (the team menu's title, Sin bin over): the name centered on `x`, upright,
//! on a lone kit cut only on the side facing the other team (home's right edge, away's left), black or
//! white text by contrast.
function drawTeamKit(dc as Graphics.Dc, x as Number, y as Number, text as String, font as Graphics.FontType,
        color as Number, team as Number) as Void {
    var height = dc.getFontHeight(font);
    var width = dc.getTextWidthInPixels(text, font) + Kit.pad(height) * 2;
    var top = y - height / 2;
    Kit.draw(dc, x - width / 2.0, x + width / 2.0, top, top + height, team != TEAM_HOME, team == TEAM_HOME, color);
    dc.setColor(Colors.textOn(Kit.fill(color)), Graphics.COLOR_TRANSPARENT);
    dc.drawText(x, y, font, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
}

//! The system menu (UI-6), used for every menu except the team menu.
function systemMenu(title as String) as WatchUi.Menu2 {
    return new WatchUi.Menu2({:title => new TimedTitle(title)});
}

//! A team-menu row with a label and optional sub-label. `fill` paints the row in a color (the
//! yellow and red card choices); `text` colors the label on the dark band (Sin bin's yellow, EVT-12).
class TeamMenuItem extends WatchUi.CustomMenuItem {
    private var _label as String;
    private var _sub as String?;
    private var _fill as Graphics.ColorType?;
    private var _text as Graphics.ColorType?;

    function initialize(id as Object, label as String, sub as String?, options as {
        :fill as Graphics.ColorType,
        :text as Graphics.ColorType
    }?) {
        CustomMenuItem.initialize(id, {});
        _label = label;
        _sub = sub;
        _fill = options != null ? options.get(:fill) : null;
        _text = options != null ? options.get(:text) : null;
    }

    function getLabel() as String {
        return _label;
    }

    function subLabel() as String? {
        return _sub;
    }

    //! Every row is drawn as a band, so on touch watches (which show no focus until you scroll) rows
    //! still look like buttons; on button watches the focused row is brighter with a white outline.
    function draw(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var focused = isFocused();
        var fill = _fill;
        var band = fill != null ? fill : (focused ? COLOR_MENU_FOCUS : COLOR_MENU_ROW);
        var text = _text;
        var textColor = fill == COLOR_CARD_YELLOW ? Graphics.COLOR_BLACK : (text != null ? text : Graphics.COLOR_WHITE);
        var subColor = fill != null ? textColor : Graphics.COLOR_LT_GRAY;

        var inset = (w * 0.12).toNumber();
        var pad = 4;
        dc.setColor(band, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(inset, pad, w - inset * 2, h - pad * 2, 14);
        if (focused) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            dc.drawRoundedRectangle(inset, pad, w - inset * 2, h - pad * 2, 14);
        }

        var font = Graphics.FONT_SMALL;
        // With a sub-label, stack the two lines as one block centered in the row. Font heights include
        // generous spacing, so only 85% of each is counted.
        var labelY = h / 2;
        var subY = h / 2;
        if (_sub != null) {
            var labelH = dc.getFontHeight(font) * 0.85;
            var subH = dc.getFontHeight(Graphics.FONT_XTINY) * 0.85;
            var top = (h - labelH - subH) / 2;
            labelY = top + labelH / 2;
            subY = top + labelH + subH / 2;
        }
        // UI-6: labels start at one edge, the quickest to scan and as on the other watches.
        var textX = inset + (w * 0.05).toNumber();
        dc.setColor(textColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(textX, labelY, font, _label, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        var sub = _sub;
        if (sub != null) {
            dc.setColor(subColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(textX, subY, Graphics.FONT_XTINY, sub, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}
