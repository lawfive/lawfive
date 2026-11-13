import Toybox.Graphics;
import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Sensor;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// ---- Kickoff direction (PRE-8, experimental) ----
// The referee faces the goal the kickoff team attacks, holding the watch as if reading the time (so
// 12 o'clock points ahead), and saves the compass heading;
// later kickoff screens show an arrow towards the goal the kickoff team attacks in that period.

module Compass {
    //! The watch's compass heading in radians from true north (the way 12 o'clock points with the
    //! watch held level), or null when the watch has no reading.
    function heading() as Float? {
        var info = Sensor.getInfo();
        return info has :heading ? info.heading : null;
    }

    //! PRE-8: whether to offer the kickoff direction. Connect IQ can't say whether a watch has a
    //! compass, only whether it has a reading now, and one that's still waking up has none. So a watch
    //! that has ever given a reading keeps the menu row, and one that never has doesn't show it.
    function available() as Boolean {
        if (heading() != null) {
            Application.Storage.setValue("compassSeen", true);
            return true;
        }
        return Application.Storage.getValue("compassSeen") != null;
    }

    //! PRE-8: what you see when you do this right: the goal ahead, your arm in front of you with the
    //! watch on it, and a line from its 12 o'clock to the goal. In units of a 416-pixel-tall screen;
    //! the net's lines go on small screens, where it's a tint instead.
    function drawView(dc as Graphics.Dc, w as Number, h as Number, on as Boolean, team as Number) as Void {
        var s = h / 416.0;
        var c = w / 2;
        var line = (2 * s + 0.5).toNumber() < 1 ? 1 : (2 * s + 0.5).toNumber();
        var goalLine = 154 * s;
        var wrist = h * 0.565;
        var radius = 25 * s;
        var ink = on ? Graphics.COLOR_WHITE : 0x777777;
        var kit = team >= 0 ? team : Graphics.COLOR_WHITE;

        // The pitch running away from you.
        dc.setColor(0x12402C, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[c - 75 * s, goalLine], [c + 75 * s, goalLine], [c + 300 * s, wrist + 60 * s], [c - 300 * s, wrist + 60 * s]]);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(line);
        dc.drawLine(c - 75 * s, goalLine, c + 75 * s, goalLine);
        dc.drawLine(c - 48 * s, goalLine, c - 66 * s, goalLine + 16 * s);
        dc.drawLine(c - 66 * s, goalLine + 16 * s, c + 66 * s, goalLine + 16 * s);
        dc.drawLine(c + 66 * s, goalLine + 16 * s, c + 48 * s, goalLine);

        // The goal, its net in the kit's color.
        var top = goalLine - 26 * s;
        dc.setColor(kit, Graphics.COLOR_TRANSPARENT);
        if (h < 300) {
            dc.setPenWidth(1);
            for (var x = -30; x <= 30; x += 12) {
                dc.drawLine(c + x * s, top, c + x * s, goalLine);
            }
        } else {
            dc.setPenWidth(1);
            for (var x = -18; x <= 18; x += 18) {
                dc.drawLine(c + x * s, top, c + x * s, goalLine);
            }
            dc.drawLine(c - 36 * s, goalLine - 13 * s, c + 36 * s, goalLine - 13 * s);
        }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth((4 * s + 0.5).toNumber() < 2 ? 2 : (4 * s + 0.5).toNumber());
        dc.drawLine(c - 36 * s, goalLine, c - 36 * s, top);
        dc.drawLine(c - 36 * s, top, c + 36 * s, top);
        dc.drawLine(c + 36 * s, top, c + 36 * s, goalLine);

        // The line from 12 o'clock to the goal.
        dc.setColor(ink, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth((3 * s + 0.5).toNumber() < 1 ? 1 : (3 * s + 0.5).toNumber());
        var y = wrist - radius - 6 * s;
        var end = goalLine + 36 * s;
        while (y > end) {
            var next = y - 6 * s;
            dc.drawLine(c, y, c, next < end ? end : next);
            y -= 11 * s;
        }
        var tip = goalLine + 20 * s;
        dc.fillPolygon([[c, tip], [c + 11 * s, tip + 16 * s], [c - 11 * s, tip + 16 * s]]);

        // The arm, the hand and the strap.
        dc.setColor(0x9AA09C, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[c - 240 * s, wrist - 30 * s], [c + 34 * s, wrist - 17 * s], [c + 34 * s, wrist + 17 * s], [c - 240 * s, wrist + 34 * s]]);
        dc.fillRoundedRectangle(c + 28 * s, wrist - 20 * s, 50 * s, 40 * s, 17 * s);
        dc.setColor(0x2A2D2B, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(c - 15 * s, wrist - 24 * s, 30 * s, 48 * s);

        // The watch.
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(c, wrist, radius);
        dc.setColor(ink, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(line);
        dc.drawCircle(c, wrist, radius);
        dc.drawLine(c, wrist - radius + 2, c, wrist - radius * 0.35);
        dc.setPenWidth(1);
    }

    //! "N 12°", "SW 225°".
    function describe(heading as Float) as String {
        var degrees = (Math.toDegrees(heading).toNumber() % 360 + 360) % 360;
        var names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        return names[((degrees + 22) % 360) / 45] + " " + degrees.format("%d") + "°";
    }

    //! Draws an arrow centred on (x, y) pointing `angle` radians clockwise from straight up.
    function drawArrow(dc as Graphics.Dc, x as Number, y as Number, size as Number, angle as Float, color as Graphics.ColorType) as Void {
        var head = [[0.0, -1.0], [0.6, -0.1], [-0.6, -0.1]];
        var shaft = [[0.22, -0.15], [0.22, 1.0], [-0.22, 1.0], [-0.22, -0.15]];
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon(rotate(head, x, y, size, angle));
        dc.fillPolygon(rotate(shaft, x, y, size, angle));
    }

    //! Unit-size points turned clockwise by `angle` (screen y points down), scaled and moved to (x, y).
    function rotate(points as Array<Array<Float>>, x as Number, y as Number, size as Number, angle as Float) as Array<[Numeric, Numeric]> {
        var cos = Math.cos(angle);
        var sin = Math.sin(angle);
        var result = [] as Array<[Numeric, Numeric]>;
        for (var i = 0; i < points.size(); i++) {
            var px = points[i][0] * size;
            var py = points[i][1] * size;
            result.add([(x + px * cos - py * sin).toNumber(), (y + px * sin + py * cos).toNumber()]);
        }
        return result;
    }
}

//! PRE-8: "Face the goal HOM attacks", with the live compass reading and a Save pill.
class DirectionView extends WatchUi.View {
    var saveTarget as Array<Number>? = null;
    private var _timer as Timer.Timer? = null;

    function initialize() {
        View.initialize();
    }

    //! The reading updates four times a second while this screen is open.
    function onShow() as Void {
        var timer = new Timer.Timer();
        timer.start(method(:refresh), 250, true);
        _timer = timer;
    }

    function onHide() as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
            _timer = null;
        }
    }

    function refresh() as Void {
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25
        var match = getLawFiveApp().match;
        var team = match != null ? match.teamName(match.firstKickoff()) : "";

        var color = match != null ? match.teamColor(match.firstKickoff()) : -1;
        // A dark kit wouldn't show on the black screen.
        var bright = color >= 0 && ((color >> 16) & 0xFF) + ((color >> 8) & 0xFF) + (color & 0xFF) > 120;
        dc.drawText(w / 2, h * 0.155, Graphics.FONT_SMALL, "Face the goal", center);
        dc.setColor(bright ? color : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.245, Graphics.FONT_SMALL, team + " attacks", center);

        // PRE-8: what that looks like, with the compass reading under it.
        var heading = Compass.heading();
        Compass.drawView(dc, w, h, heading != null, bright ? color : -1);
        dc.setColor(heading != null ? Graphics.COLOR_WHITE : Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.668, Graphics.FONT_XTINY, heading != null ? Compass.describe(heading) : "No compass reading", center);

        var font = Graphics.FONT_SMALL;
        var pillW = (w * 0.5).toNumber();
        var pillH = dc.getFontHeight(font) + 10;
        var top = (h * 0.79).toNumber() - pillH / 2;
        var left = (w - pillW) / 2;
        dc.setColor(heading != null ? COLOR_START : COLOR_MENU_FOCUS, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(left, top, pillW, pillH, pillH / 2);
        dc.setColor(heading != null ? Graphics.COLOR_BLACK : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, top + pillH / 2, font, "Save", center);
        saveTarget = [left, top, pillW, pillH];
        if (heading == null) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.875, Graphics.FONT_XTINY, "Back: skip it", center);
        }
    }
}

//! Start/Stop or a tap on Save records the heading; Back leaves without saving.
class DirectionDelegate extends TapAwareDelegate {
    private var _view as DirectionView;

    function initialize(view as DirectionView) {
        TapAwareDelegate.initialize();
        _view = view;
    }

    function onStartButton() as Boolean {
        save();
        return true;
    }

    function onScreenTap(x as Number, y as Number) as Boolean {
        var target = _view.saveTarget;
        if (target != null && y >= target[1] - 8 && y <= target[1] + target[3] + 8) {
            save();
        }
        return true;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }

    private function save() as Void {
        var heading = Compass.heading();
        var match = getLawFiveApp().match;
        if (heading == null || match == null) {
            return;
        }
        match.setKickoffHeading(heading);
        Alerts.tick();
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}
