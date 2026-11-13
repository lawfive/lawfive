import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Position;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

const COLOR_BREAK = 0x55AAFF;
const COLOR_START = 0x00AA44;
const COLOR_STOPPAGE = 0xFF8800;
const COLOR_RING_TRACK = 0x2A2A2A;

// UI-1, UI-21: the slots shared by every layout of the running screen, as fractions of its height.
const UNDER_CLOCK_Y = 0.68;
const PILLS_Y = 0.835;
const KICK_SCORED = 0;
const KICK_MISSED = 1;

//! The main match screen for every phase (PRE-1 to PRE-4, UI-1 to UI-5).
class MatchView extends WatchUi.View {
    // UI-26: with no menu over it, so the sync screen can come up at full time.
    static var onScreen as Boolean = false;

    // Tap targets from the last draw, as [x, y, width, height], so only taps on the pill itself count.
    var startTarget as Array<Number>? = null;
    var breakTarget as Array<Number>? = null;
    // ET-1: the choices shown after regular time, and where each was drawn.
    var decisionOptions as Array<Symbol> = [] as Array<Symbol>;
    var decisionTargets as Array<Array<Number>> = [] as Array<Array<Number>>;
    // ET-3: the highlighted shoot-out result (Start/Stop presses it) and the pills' tap targets.
    var kickChoice as Number = KICK_SCORED;
    //! ET-6: the golden goal screen's highlighted pill, End match (0) or Undo (1).
    var goldenChoice as Number = 0;
    var kickTargets as Array<Array<Number>> = [] as Array<Array<Number>>;

    private var _w as Number = 0;
    private var _h as Number = 0;
    private var _ringInset as Number = 0;
    private var _compassTimer as Timer.Timer? = null;

    function initialize() {
        View.initialize();
    }

    //! The match was cancelled or closed from a menu or confirmation shown on top of this view.
    function onShow() as Void {
        if (getLawFiveApp().match == null) {
            var start = startMenu();
            WatchUi.switchToView(start[0], start[1], WatchUi.SLIDE_RIGHT);
            return;
        }
        onScreen = true;
        // PRE-8: the kickoff arrow turns with the referee, so redraw faster than the 1 s tick.
        var timer = new Timer.Timer();
        timer.start(method(:refreshCompass), 250, true);
        _compassTimer = timer;
    }

    function onHide() as Void {
        onScreen = false;
        var timer = _compassTimer;
        if (timer != null) {
            timer.stop();
            _compassTimer = null;
        }
    }

    function refreshCompass() as Void {
        var match = getLawFiveApp().match;
        if (match != null && match.phase == PHASE_NEXT_KICKOFF && match.period + 1 != match.numPeriods
                && match.attackHeading(match.period + 1) != null) {
            WatchUi.requestUpdate();
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        _w = dc.getWidth();
        _h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        _ringInset = 0;
        startTarget = null;
        breakTarget = null;
        decisionTargets = [] as Array<Array<Number>>;
        kickTargets = [] as Array<Array<Number>>;

        var match = getLawFiveApp().match;
        if (match == null) {
            return;
        }
        var now = Clock.nowMs();
        // UI-25: the time of day at the bottom of every screen but the running match, which has it when chosen.
        var sinBinOver = match.showsSinBinReturn();
        if (match.phase != PHASE_RUNNING || sinBinOver) {
            drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY);
        }
        if (sinBinOver) {
            drawSinBinReturn(dc, match);
        } else if (match.phase == PHASE_PRE || match.phase == PHASE_READY || match.phase == PHASE_NEXT_KICKOFF) {
            drawKickoff(dc, match);
        } else if (match.phase == PHASE_RUNNING) {
            drawRunning(dc, match, now);
        } else if (match.phase == PHASE_BREAK) {
            drawBreak(dc, match, now);
        } else if (match.phase == PHASE_DECIDE) {
            drawDecide(dc, match);
        } else if (match.phase == PHASE_PENALTIES) {
            drawPenalties(dc, match);
        } else if (match.phase == PHASE_GOLDEN) {
            drawGolden(dc, match);
        } else if (match.phase == PHASE_SUSPENDED) {
            drawSuspended(dc, match, now);
        } else {
            drawFullTime(dc, match);
        }
    }

    //! The kickoff screen, before the match (PRE-1, PRE-2) and after half-time (PRE-7), where the
    //! team due to kick off the next period is already selected.
    private function drawKickoff(dc as Graphics.Dc, match as Match) as Void {
        var nextPeriod = match.phase == PHASE_NEXT_KICKOFF;
        var title = nextPeriod ? Format.periodLabel(match.period + 1, match.numPeriods) + " kickoff"
            : Format.summary(match.numPeriods, match.periodSec, match.halftimeSec);
        var titleY = (_h * 0.14).toNumber();
        drawCentered(dc, titleY, Graphics.FONT_XTINY, title, Graphics.COLOR_LT_GRAY);
        drawScoreLine(dc, match, (_h * 0.32).toNumber(), baseline(dc, titleY, Graphics.FONT_XTINY), match.kickoffTeamOnScreen(), match.score);
        if (match.phase == PHASE_PRE) {
            drawCentered(dc, (_h * 0.56).toNumber(), Graphics.FONT_SMALL, "Who kicks off?", Graphics.COLOR_WHITE);
        } else if (match.kickoffTeamOnScreen() < 0) {
            // ET-7: a new toss decides who kicks off extra time.
            drawCentered(dc, (_h * 0.56).toNumber(), Graphics.FONT_SMALL, "Who kicks off?", Graphics.COLOR_WHITE);
        } else {
            startTarget = drawStartButton(dc, (_h * 0.60).toNumber());
        }
        if (nextPeriod) {
            drawKickoffArrow(dc, match);
            return;
        }
        var gpsReady = getLawFiveApp().gpsQuality >= Position.QUALITY_USABLE;
        drawCentered(dc, (_h * 0.84).toNumber(), Graphics.FONT_XTINY,
            gpsReady ? "GPS ready" : "GPS searching", gpsReady ? Graphics.COLOR_GREEN : Graphics.COLOR_LT_GRAY);
    }

    //! Fixed slots, so nothing moves when timers appear (UI-1), built from the match screen's
    //! choices (UI-21). The added time or second clock and the pills are in the same place in every
    //! layout, and the ring or time of day at the edge moves nothing.
    private function drawRunning(dc as Graphics.Dc, match as Match, now as Long) as Void {
        var clock = match.clockDisplay(now);
        var edge = Screen.shownEdge(match.screenEdge);
        _ringInset = edge == EDGE_RING ? (_w * 0.027).toNumber() : 0;
        if (edge == EDGE_RING) {
            drawPeriodRing(dc, match, now);
        }
        if (match.screenNames) {
            drawPeriodLabel(dc, match, 0.12);
            drawScoreLine(dc, match, (_h * 0.25).toNumber(), -1, -1, match.score);
        } else {
            drawPeriodLabel(dc, match, 0.10);
            drawPlainScore(dc, match, (_h * 0.21).toNumber());
        }
        // TMR-15: a stopping clock standing still is orange, the stoppage's color, as are the clocks under or beside it.
        var stopped = match.clockStopped();
        var clockColor = stopped ? COLOR_STOPPAGE : Graphics.COLOR_WHITE;
        if (match.screenClocks == CLOCKS_SIDE_BY_SIDE) {
            drawClocksSideBySide(dc, clock[0], match.secondClockText(now), clockColor);
        } else if (match.screenNames) {
            drawMainClock(dc, clock[0], [Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM], 0.50, 0.8, clockColor);
        } else {
            // Scores only: the largest clock that fits.
            drawMainClock(dc, clock[0], [Graphics.FONT_NUMBER_THAI_HOT, Graphics.FONT_NUMBER_HOT, Graphics.FONT_NUMBER_MEDIUM], 0.50, 0.8, clockColor);
        }

        var added = clock[1];
        if (added != null) {
            // TMR-2: "45:00" with "+1:12" underneath; UI-22: it takes the place of a stacked second clock.
            drawCentered(dc, (_h * UNDER_CLOCK_Y).toNumber(), Graphics.FONT_MEDIUM, added, COLOR_STOPPAGE);
        } else if (match.screenClocks == CLOCKS_STACKED) {
            // Small screens' large font would reach the clock and the pills.
            var secondFont = dc.getFontHeight(Graphics.FONT_LARGE) > _h * 0.115 ? Graphics.FONT_MEDIUM : Graphics.FONT_LARGE;
            drawCentered(dc, (_h * UNDER_CLOCK_Y).toNumber(), secondFont, match.secondClockText(now), stopped ? COLOR_STOPPAGE : Graphics.COLOR_LT_GRAY);
        }
        drawTimerPills(dc, match, now);
        if (edge == EDGE_TIME) {
            drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY);
        }
    }

    //! EVT-12: a sin bin is over, over the running match until a button or tap (VIB-6): the team on its
    //! lone kit (UI-10) and the number, large, "can return" in the Start green, and "+1" for more waiting.
    private function drawSinBinReturn(dc as Graphics.Dc, match as Match) as Void {
        var e = match.sinBinReturns[0];
        var team = e[EV_TEAM] as Number;
        var player = e[EV_PLAYER];
        var name = match.teamName(team);
        var number = player instanceof Number ? "#" + player.format("%d") : "";
        var font = Graphics.FONT_LARGE;
        var y = (_h * 0.42).toNumber();
        var height = dc.getFontHeight(font);
        var kitW = dc.getTextWidthInPixels(name, font) + Kit.pad(height) * 2;
        // A space between them, and room for the home kit's cut, which leans out at the top.
        var gap = number.length() > 0 ? dc.getTextWidthInPixels(" ", font) + (height * KIT_SLANT).toNumber() : 0;
        var x = (_w - kitW - gap - dc.getTextWidthInPixels(number, font)) / 2;
        drawTeamKit(dc, x + kitW / 2, y, name, font, match.teamColor(team), team);
        if (number.length() > 0) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x + kitW + gap, y, font, number, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        drawCentered(dc, (_h * 0.58).toNumber(), Graphics.FONT_MEDIUM, "can return", COLOR_START);
        var more = match.sinBinReturns.size() - 1;
        if (more > 0) {
            drawCentered(dc, (_h * 0.70).toNumber(), Graphics.FONT_SMALL, "+" + more.format("%d"), Graphics.COLOR_LT_GRAY);
        }
    }

    private function drawPeriodLabel(dc as Graphics.Dc, match as Match, y as Float) as Void {
        drawCentered(dc, (_h * y).toNumber(), Graphics.FONT_XTINY,
            Format.periodLabel(match.period, match.numPeriods), Graphics.COLOR_LT_GRAY);
    }

    //! TMR-11: the clock in the match's style, in the first of the fonts no wider than maxWidth (a
    //! fraction of the screen); "105:00" in extra time is wider, hence the width check.
    private function drawMainClock(dc as Graphics.Dc, text as String, fonts as Array<Graphics.FontType>, y as Float, maxWidth as Float, color as Graphics.ColorType) as Void {
        var widest = text.length() > 5 ? "888:88" : "88:88";
        var font = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            if (dc.getTextWidthInPixels(widest, fonts[i]) <= _w * maxWidth) {
                font = fonts[i];
                break;
            }
        }
        drawCentered(dc, (_h * y).toNumber(), font, text, color);
    }

    //! UI-21: two clocks of the same size with a thin line between them, in the largest font that
    //! fits both across the middle of the screen, however wide their digits are. Which of these is
    //! largest differs from watch to watch. With the ring they keep that size, unless their corners
    //! would cross into it on this watch, when they drop a size.
    private function drawClocksSideBySide(dc as Graphics.Dc, main as String, second as String, color as Graphics.ColorType) as Void {
        var fonts = [Graphics.FONT_NUMBER_MEDIUM, Graphics.FONT_NUMBER_MILD, Graphics.FONT_LARGE, Graphics.FONT_MEDIUM] as Array<Graphics.FontType>;
        var widest = main.length() > 5 || second.length() > 5 ? "888:88" : "88:88";
        var gap = (_w * 0.05).toNumber();
        var font = Graphics.FONT_SMALL;
        var best = 0;
        for (var i = 0; i < fonts.size(); i++) {
            var width = dc.getTextWidthInPixels(widest, fonts[i]);
            if (width > best && width * 2 + gap <= _w * 0.94 && (_ringInset == 0 || clearsRing(width * 2 + gap, Graphics.getFontAscent(fonts[i])))) {
                font = fonts[i];
                best = width;
            }
        }
        var cx = _w / 2;
        var y = _h / 2;
        var offset = (dc.getTextWidthInPixels(widest, font) + gap) / 2;
        var justify = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx - offset, y, font, main, justify);
        dc.drawText(cx + offset, y, font, second, justify);
        drawDivider(dc, cx, y, (_h * 0.08).toNumber());
    }

    //! Whether a block of digits this wide, centred on the screen, stays off the ring. Number fonts'
    //! digits are about their ascent tall, a little less; the ring may meet a digit's corner, not cut it.
    private function clearsRing(width as Number, ascent as Number) as Boolean {
        var r = _w / 2.0 - _ringInset / 2.0;
        var x = width / 2.0;
        var y = ascent * 0.4;
        return x * x + y * y <= r * r;
    }

    //! The thin line between side-by-side clocks (UI-21).
    private function drawDivider(dc as Graphics.Dc, x as Number, y as Number, half as Number) as Void {
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawLine(x, y - half, x, y + half);
    }

    //! UI-21: scores only, without names: the two scores are the kits (UI-10).
    private function drawPlainScore(dc as Graphics.Dc, match as Match, y as Number) as Void {
        var font = Graphics.FONT_MEDIUM;
        var texts = [match.score[TEAM_HOME].format("%d"), match.score[TEAM_AWAY].format("%d")];
        var height = dc.getFontHeight(font);
        // A figure is narrow, so the cut takes more of its room: the kits are wider by the cut's lean.
        var kitW = dc.getTextWidthInPixels(texts[0].length() > texts[1].length() ? texts[0] : texts[1], font)
            + Kit.pad(height) * 2 + (height * KIT_SLANT).toNumber();
        drawKits(dc, match, y, font, texts, kitW, -1, -1);
    }

    //! UI-21: Scoreboard's names (no longer offered, Screen.migrate), either side of the period, each on
    //! its lone kit (UI-10), with each team's large score centered under its name.
    private function drawBigScore(dc as Graphics.Dc, match as Match) as Void {
        var cx = _w / 2;
        var offset = (_w * 0.217).toNumber();
        var nameY = (_h * 0.14).toNumber();
        var scoreY = (_h * 0.31).toNumber();
        var justify = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        var names = [match.home, match.away];
        var kitH = dc.getFontHeight(Graphics.FONT_SMALL);
        var pad = Kit.pad(kitH);
        // A wide name's kit moves in, so its name stays inside the round screen.
        var reach = (rowWidth(nameY) / 2).toNumber() - 2;
        for (var team = 0; team < 2; team++) {
            var name = fitText(dc, names[team], Graphics.FONT_SMALL, (_w * 0.36).toNumber() - pad * 2);
            var half = dc.getTextWidthInPixels(name, Graphics.FONT_SMALL) / 2 + pad;
            var x = offset + half > reach ? reach - half : offset;
            x = team == TEAM_HOME ? cx - x : cx + x;
            drawTeamKit(dc, x, nameY, name, Graphics.FONT_SMALL, match.teamColor(team), team);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, scoreY, Graphics.FONT_NUMBER_HOT, match.score[team].format("%d"), justify);
        }
        drawCentered(dc, scoreY, Graphics.FONT_LARGE, "-", Graphics.COLOR_DK_GRAY);
    }

    //! UI-23: a ring around the edge that follows the match clock: filling clockwise from 12 o'clock
    //! as the period runs when it counts up, emptying the same way when it counts down. Full and
    //! orange through added time. Only on round screens (Screen.shownEdge).
    private function drawPeriodRing(dc as Graphics.Dc, match as Match, now as Long) as Void {
        var pen = _ringInset;
        var cx = _w / 2;
        var cy = _h / 2;
        var r = cx - pen / 2;
        var progress = match.periodProgress(now);
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(true);
        }
        dc.setPenWidth(pen);
        dc.setColor(progress < 1.0 ? COLOR_RING_TRACK : COLOR_STOPPAGE, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, r);
        if (progress > 0.0 && progress < 1.0) {
            // Where the period has got to, clockwise from 12 o'clock.
            var at = (450 - (360 * progress).toNumber()) % 360;
            dc.setColor(COLOR_START, Graphics.COLOR_TRANSPARENT);
            if (match.clockStyle == CLOCK_DOWN) {
                dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, at, 90);
            } else {
                dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, 90, at);
            }
        } else if (progress <= 0.0 && match.clockStyle == CLOCK_DOWN) {
            dc.setColor(COLOR_START, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, cy, r);
        }
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(false);
        }
    }

    //! UI-2, UI-4: the stoppage pill is solid while a stoppage runs and outlined once it is paused;
    //! from the period's length it counts down the added time left (TMR-16).
    //! The break pill is outlined while counting down to the scheduled break, then solid with
    //! "<name> due" while waiting to be accepted (TMR-7), then solid with the break countdown.
    //! EVT-12: the sin bin pill last, outlined in the cards' yellow; with it the row may step down to
    //! smaller fonts, and when even the smallest is too wide it drops the team.
    private function drawTimerPills(dc as Graphics.Dc, match as Match, now as Long) as Void {
        var texts = [] as Array<String>;
        var colors = [] as Array<Graphics.ColorType>;
        var solids = [] as Array<Boolean>;
        // TMR-16: from the period's length, the added time left.
        var stoppage = match.stoppagePill(now);
        if (stoppage != null) {
            texts.add(stoppage[0]);
            colors.add(COLOR_STOPPAGE);
            solids.add(stoppage[1]);
        }
        var remaining = match.breakRemainingMs(now);
        var dueIn = match.breakDueInMs(now);
        var breakIndex = -1;
        if (match.breakDue) {
            breakIndex = texts.size();
            texts.add(match.breakLabel + " due");
        } else if (remaining != null) {
            breakIndex = texts.size();
            texts.add(match.breakClockText(now) as String);
        } else if (dueIn != null) {
            breakIndex = texts.size();
            texts.add(Format.countdown(dueIn));
        }
        if (breakIndex >= 0) {
            colors.add(COLOR_BREAK);
            solids.add(remaining != null || match.breakDue);
        }
        var y = (_h * PILLS_Y).toNumber();
        var fonts = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL] as Array<Graphics.FontType>;
        var sinBin = match.sinBinPill(now);
        if (sinBin != null) {
            fonts.addAll([Graphics.FONT_TINY, Graphics.FONT_XTINY]);
            texts.add(sinBin);
            colors.add(COLOR_CARD_YELLOW);
            solids.add(false);
            if (!pillsFit(dc, y, texts, Graphics.FONT_XTINY, pillPad(Graphics.FONT_XTINY))) {
                texts[texts.size() - 1] = match.sinBinPillText(now, false) as String;
            }
        }
        var targets = drawPillRow(dc, y, texts, colors, solids, fonts);
        if (match.breakDue) {
            breakTarget = targets[breakIndex];
        }
    }

    //! Draws timer pills side by side, centred as a group, in the first of `fonts` they fit in (the last
    //! if none); returns each pill's [x, y, width, height].
    private function drawPillRow(dc as Graphics.Dc, y as Number, texts as Array<String>,
            colors as Array<Graphics.ColorType>, solids as Array<Boolean>, fonts as Array<Graphics.FontType>) as Array<Array<Number>> {
        // Try the normal size first; on the round screen the row narrows towards the bottom, so
        // fall back to a smaller font and tighter padding when the pills would be clipped.
        var font = fonts[fonts.size() - 1];
        for (var i = 0; i < fonts.size(); i++) {
            if (pillsFit(dc, y, texts, fonts[i], pillPad(fonts[i]))) {
                font = fonts[i];
                break;
            }
        }
        var pad = pillPad(font);
        var gap = (_w * 0.04).toNumber();
        var widths = pillWidths(dc, texts, font, pad);
        var height = dc.getFontHeight(font) + 6;
        var total = sum(widths) + gap * (texts.size() - 1);
        var targets = [] as Array<Array<Number>>;
        var x = (_w - total) / 2;
        for (var i = 0; i < texts.size(); i++) {
            var top = y - height / 2;
            dc.setColor(colors[i], Graphics.COLOR_TRANSPARENT);
            if (solids[i]) {
                dc.fillRoundedRectangle(x, top, widths[i], height, height / 2);
                dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
            } else {
                dc.setPenWidth(3);
                dc.drawRoundedRectangle(x, top, widths[i], height, height / 2);
            }
            dc.drawText(x + widths[i] / 2, y, font, texts[i], Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            targets.add([x, top, widths[i], height]);
            x += widths[i] + gap;
        }
        return targets;
    }

    //! The padding either side of a pill's text: roomier at the normal size.
    private function pillPad(font as Graphics.FontType) as Number {
        return ((font == Graphics.FONT_MEDIUM ? 0.05 : 0.03) * _w).toNumber();
    }

    //! Whether a row of pills in this font fits across the screen where it's drawn.
    private function pillsFit(dc as Graphics.Dc, y as Number, texts as Array<String>, font as Graphics.FontType, pad as Number) as Boolean {
        var gap = (_w * 0.04).toNumber();
        var height = dc.getFontHeight(font) + 6;
        return sum(pillWidths(dc, texts, font, pad)) + gap * (texts.size() - 1) <= rowWidth(y + height / 2) * 0.94;
    }

    private function pillWidths(dc as Graphics.Dc, texts as Array<String>, font as Graphics.FontType, pad as Number) as Array<Number> {
        var widths = [] as Array<Number>;
        for (var i = 0; i < texts.size(); i++) {
            widths.add(dc.getTextWidthInPixels(texts[i], font) + pad * 2);
        }
        return widths;
    }

    private function sum(values as Array<Number>) as Number {
        var total = 0;
        for (var i = 0; i < values.size(); i++) {
            total += values[i];
        }
        return total;
    }

    //! Whether a tap at (x, y) falls on a target from the last draw, with a little slack for fingers.
    function hits(target as Array<Number>?, x as Number, y as Number) as Boolean {
        if (target == null) {
            return false;
        }
        var slack = 8;
        return x >= target[0] - slack && x <= target[0] + target[2] + slack
            && y >= target[1] - slack && y <= target[1] + target[3] + slack;
    }

    private function drawBreak(dc as Graphics.Dc, match as Match, now as Long) as Void {
        drawCentered(dc, (_h * 0.13).toNumber(), Graphics.FONT_XTINY,
            match.isHalftime() ? "HALF-TIME" : "BREAK", Graphics.COLOR_LT_GRAY);
        drawScoreLine(dc, match, (_h * 0.28).toNumber(), -1, -1, match.score);
        // TMR-4: time left or time taken, red once the break's length is up.
        var remaining = match.breakRemainingMs(now);
        var text = match.breakClockText(now);
        drawCentered(dc, (_h * 0.47).toNumber(), Graphics.FONT_NUMBER_MEDIUM, text == null ? "0:00" : text,
            remaining != null && remaining > 0 ? COLOR_BREAK : Graphics.COLOR_RED);
        var next = match.period + 1;
        var team = match.kickoffFor(next);
        // ET-7: before extra time it's down to the new toss.
        drawCentered(dc, (_h * 0.63).toNumber(), Graphics.FONT_XTINY,
            team >= 0 ? "Kickoff: " + match.teamName(team) : "New toss for kickoff", Graphics.COLOR_LT_GRAY);
        startTarget = drawPill(dc, (_h * 0.78).toNumber(), match.isHalftime() ? "End HT" : "End break", COLOR_START);
    }

    //! TMR-13: play suspended, laid out as the break screen. For lightning, the 30:00 countdown in the
    //! break clock's blue, green once it reaches 0:00, with the time suspended under it; otherwise the
    //! time suspended, counting up, with the reason under it. Resume needs a tap on the pill (INP-8).
    private function drawSuspended(dc as Graphics.Dc, match as Match, now as Long) as Void {
        var lightning = match.suspendReason == REASON_LIGHTNING;
        drawCentered(dc, (_h * 0.13).toNumber(), Graphics.FONT_XTINY, lightning ? "LIGHTNING" : "SUSPENDED", Graphics.COLOR_LT_GRAY);
        drawScoreLine(dc, match, (_h * 0.28).toNumber(), -1, -1, match.score);
        var suspended = match.suspendedMs(now);
        var since = Format.clock(suspended == null ? 0l : suspended);
        var left = match.lightningLeftMs(now);
        if (lightning && left != null) {
            drawCentered(dc, (_h * 0.47).toNumber(), Graphics.FONT_NUMBER_MEDIUM, Format.countdown(left), left > 0 ? COLOR_BREAK : COLOR_START);
            drawCentered(dc, (_h * 0.63).toNumber(), Graphics.FONT_XTINY, "Suspended " + since, Graphics.COLOR_LT_GRAY);
        } else {
            drawCentered(dc, (_h * 0.47).toNumber(), Graphics.FONT_NUMBER_MEDIUM, since, Graphics.COLOR_WHITE);
            var reason = match.suspendReason;
            drawCentered(dc, (_h * 0.63).toNumber(), Graphics.FONT_XTINY,
                reason == 0 ? "Weather" : reason == 2 ? "Crowd trouble" : "Other reason", Graphics.COLOR_LT_GRAY);
        }
        startTarget = drawPill(dc, (_h * 0.78).toNumber(), "Resume", COLOR_START);
    }

    //! ET-1: after regular time (or extra time), extra time / penalties / end match. The recommended
    //! choice is filled (Start/Stop takes it); the others are outlined. Each pill can be tapped.
    private function drawDecide(dc as Graphics.Dc, match as Match) as Void {
        drawCentered(dc, (_h * 0.13).toNumber(), Graphics.FONT_XTINY,
            match.numPeriods == 1 && match.period == 0 ? "FULL TIME" : "AFTER " + Format.periodLabel(match.period, match.numPeriods), Graphics.COLOR_LT_GRAY);
        drawScoreLine(dc, match, (_h * 0.27).toNumber(), -1, -1, match.score);
        var options = [] as Array<Symbol>;
        if (match.canExtraTime()) {
            options.add(:extraTime);
        }
        if (match.canPenalties()) {
            options.add(:penalties);
        }
        options.add(:endMatch);
        decisionOptions = options;
        var recommended = match.recommendedDecision();
        var ys = options.size() == 3 ? [0.46, 0.62, 0.78] : [0.50, 0.70];
        for (var i = 0; i < options.size(); i++) {
            var label = options[i] == :extraTime ? "Extra time" : (options[i] == :penalties ? "Penalties" : "End match");
            decisionTargets.add(drawChoicePill(dc, (_h * ys[i]).toNumber(), label, options[i] == recommended));
        }
    }

    //! ET-3: choose the team kicking first, then record each kick as Scored or Missed.
    private function drawPenalties(dc as Graphics.Dc, match as Match) as Void {
        var titleY = (_h * 0.13).toNumber();
        drawCentered(dc, titleY, Graphics.FONT_XTINY, "PENALTIES", Graphics.COLOR_LT_GRAY);
        if (!match.penStarted) {
            drawScoreLine(dc, match, (_h * 0.32).toNumber(), baseline(dc, titleY, Graphics.FONT_XTINY), match.penFirst, match.score);
            if (match.penFirst < 0) {
                drawCentered(dc, (_h * 0.56).toNumber(), Graphics.FONT_SMALL, "Who kicks first?", Graphics.COLOR_WHITE);
            } else {
                startTarget = drawStartButton(dc, (_h * 0.60).toNumber());
            }
            return;
        }
        drawScoreLine(dc, match, (_h * 0.26).toNumber(), -1, -1,
            [match.penaltyGoals(TEAM_HOME), match.penaltyGoals(TEAM_AWAY)]);
        drawKickDots(dc, match, (_h * 0.38).toNumber());
        var winner = match.penaltyWinner();
        if (winner >= 0) {
            drawCentered(dc, (_h * 0.53).toNumber(), Graphics.FONT_MEDIUM, match.teamName(winner) + " win", Graphics.COLOR_WHITE);
            startTarget = drawPill(dc, (_h * 0.76).toNumber(), "End match", COLOR_START);
            return;
        }
        var kicker = match.nextKicker();
        drawCentered(dc, (_h * 0.53).toNumber(), Graphics.FONT_SMALL,
            "Kick " + (match.penaltyKicks(kicker) + 1).format("%d") + ": " + match.teamName(kicker), Graphics.COLOR_WHITE);
        kickTargets = drawPillRow(dc, (_h * 0.74).toNumber(), ["Scored", "Missed"], [COLOR_START, COLOR_CARD_RED],
            [kickChoice == KICK_SCORED, kickChoice == KICK_MISSED], [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL]);
    }

    //! ET-6: a golden goal: the winner, then End match and Undo, either tapped or chosen with Up/Down
    //! and Start. The period's clock runs on underneath, so Undo carries on from where it is.
    private function drawGolden(dc as Graphics.Dc, match as Match) as Void {
        drawCentered(dc, (_h * 0.13).toNumber(), Graphics.FONT_XTINY, "GOLDEN GOAL", Graphics.COLOR_LT_GRAY);
        drawScoreLine(dc, match, (_h * 0.30).toNumber(), -1, -1, match.score);
        var winner = match.goldenWinner();
        if (winner >= 0) {
            drawCentered(dc, (_h * 0.50).toNumber(), Graphics.FONT_MEDIUM, match.teamName(winner) + " win", Graphics.COLOR_WHITE);
        }
        kickTargets = drawPillRow(dc, (_h * 0.72).toNumber(), ["End match", "Undo"], [COLOR_START, Graphics.COLOR_LT_GRAY],
            [goldenChoice == 0, goldenChoice == 1], [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL]);
    }

    //! Each team's kicks as dots under its name, oldest first: filled for scored, hollow for missed.
    //! In a long sudden death only the latest few fit.
    private function drawKickDots(dc as Graphics.Dc, match as Match, y as Number) as Void {
        var r = (_w * 0.016).toNumber();
        var step = r * 3;
        var maxDots = 6;
        for (var team = 0; team < 2; team++) {
            var results = match.kickResults(team);
            var first = results.size() > maxDots ? results.size() - maxDots : 0;
            var count = results.size() - first;
            // Home dots end just left of the centre, away dots start just right of it.
            var x = team == TEAM_HOME ? _w / 2 - (_w * 0.05).toNumber() - (count - 1) * step : _w / 2 + (_w * 0.05).toNumber();
            for (var i = first; i < results.size(); i++) {
                dc.setColor(results[i] ? Graphics.COLOR_WHITE : Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                if (results[i]) {
                    dc.fillCircle(x, y, r);
                } else {
                    dc.setPenWidth(2);
                    dc.drawCircle(x, y, r);
                }
                x += step;
            }
        }
    }

    //! A pill for one of several choices: filled green when highlighted, otherwise outlined in grey.
    private function drawChoicePill(dc as Graphics.Dc, y as Number, text as String, filled as Boolean) as Array<Number> {
        var font = Graphics.FONT_SMALL;
        var width = dc.getTextWidthInPixels(text, font) + (_w * 0.12).toNumber();
        var height = dc.getFontHeight(font) + 6;
        var x = (_w - width) / 2;
        if (filled) {
            dc.setColor(COLOR_START, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, y - height / 2, width, height, height / 2);
        } else {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            dc.drawRoundedRectangle(x, y - height / 2, width, height, height / 2);
        }
        drawCentered(dc, y, font, text, filled ? Graphics.COLOR_BLACK : Graphics.COLOR_WHITE);
        return [x, y - height / 2, width, height];
    }

    private function drawFullTime(dc as Graphics.Dc, match as Match) as Void {
        drawCentered(dc, (_h * 0.14).toNumber(), Graphics.FONT_XTINY, match.isAbandoned() ? "ABANDONED" : "FULL TIME", Graphics.COLOR_LT_GRAY);
        drawScoreLine(dc, match, (_h * 0.32).toNumber(), -1, -1, match.score);
        var pens = match.penaltyScore();
        if (pens != null) {
            drawCentered(dc, (_h * 0.43).toNumber(), Graphics.FONT_SMALL,
                pens[0].format("%d") + "-" + pens[1].format("%d") + " on penalties", Graphics.COLOR_LT_GRAY);
        } else if (match.endedGolden) {
            drawCentered(dc, (_h * 0.43).toNumber(), Graphics.FONT_SMALL, "On a golden goal", Graphics.COLOR_LT_GRAY);
        }
        var savedY = (_h * (pens != null || match.endedGolden ? 0.56 : 0.52)).toNumber();
        drawCentered(dc, savedY, Graphics.FONT_SMALL, "Match saved", Graphics.COLOR_GREEN);
        // SYNC-4: whether it has reached the account yet.
        var upload = Sync.uploadState(match.created);
        if (upload != null) {
            drawCentered(dc, savedY + dc.getFontHeight(Graphics.FONT_SMALL) / 2 + dc.getFontHeight(Graphics.FONT_XTINY) / 2 + 2,
                Graphics.FONT_XTINY, upload, Graphics.COLOR_LT_GRAY);
        }
        drawCentered(dc, (_h * 0.72).toNumber(), Graphics.FONT_XTINY, "Start: events", Graphics.COLOR_LT_GRAY);
        drawCentered(dc, (_h * 0.79).toNumber(), Graphics.FONT_XTINY, "Back: exit", Graphics.COLOR_LT_GRAY);
    }

    //! UI-10: "0 HOM/AWY 2", with the given scores (the match score, or the shoot-out tally): the teams
    //! as two kits of the same width, the scores outside them. UI-11: on the kickoff and first-kicker
    //! screens, the `selected` team (or -1) has a white dot above its kit, kept below `ceiling`, the
    //! baseline of the title over the line (-1 on the other screens, which have no dot).
    private function drawScoreLine(dc as Graphics.Dc, match as Match, y as Number, ceiling as Number,
            selected as Number, scores as Array<Number>) as Void {
        var cx = _w / 2;
        var spacing = (_w * 0.03).toNumber();
        var homeScore = scores[TEAM_HOME].format("%d");
        var awayScore = scores[TEAM_AWAY].format("%d");
        // Each kit gets half of what is left of the row after the scores, spacing and the gap between
        // the kits (SET-5). If a name does not fit, the line drops to a smaller font before names are cut.
        var fonts = [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL] as Array<Graphics.FontType>;
        var font = fonts[0];
        var names = [match.home, match.away];
        var pad = 0;
        for (var f = 0; f < fonts.size(); f++) {
            font = fonts[f];
            var height = dc.getFontHeight(font);
            pad = Kit.pad(height);
            var scoreWidth = dc.getTextWidthInPixels(homeScore.length() > awayScore.length() ? homeScore : awayScore, font);
            var maxLabel = (rowWidth(y) * 0.96 / 2 - scoreWidth - spacing - height * KIT_GAP / 2 - pad * 2).toNumber();
            names = [fitText(dc, match.home, font, maxLabel), fitText(dc, match.away, font, maxLabel)];
            if (names[0].equals(match.home) && names[1].equals(match.away)) {
                break;
            }
        }
        var widths = [dc.getTextWidthInPixels(names[0], font), dc.getTextWidthInPixels(names[1], font)];
        var kitW = (widths[0] > widths[1] ? widths[0] : widths[1]) + pad * 2;
        var half = drawKits(dc, match, y, font, names, kitW, ceiling >= 0 ? selected : -1, ceiling);
        var justify = Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx - half - spacing, y, font, homeScore, Graphics.TEXT_JUSTIFY_RIGHT | justify);
        dc.drawText(cx + half + spacing, y, font, awayScore, Graphics.TEXT_JUSTIFY_LEFT | justify);
    }

    //! UI-10: the two teams as kits `kitW` wide at half their height, side by side across the middle and
    //! cut on one diagonal where they meet, leaning as "/", with a small gap between; each text upright
    //! in the middle of its own part, black or white by contrast. UI-11: the `selected` team (or -1)
    //! has a white dot above its kit, over its name, and nothing else; where the title over the line
    //! (its baseline `ceiling`) leaves too little room, the dot sits between them, nearer the kit,
    //! smaller if it must (the fenix 7S). Returns how far the kits reach either side of the middle.
    private function drawKits(dc as Graphics.Dc, match as Match, y as Number, font as Graphics.FontType,
            texts as Array<String>, kitW as Number, selected as Number, ceiling as Number) as Float {
        var cx = _w / 2.0;
        var height = dc.getFontHeight(font);
        var top = y - height / 2;
        var bottom = top + height;
        var inner = height * KIT_GAP / 2;
        var half = inner + kitW;
        Kit.draw(dc, cx - half, cx - inner, top, bottom, false, true, match.teamColor(TEAM_HOME));
        Kit.draw(dc, cx + inner, cx + half, top, bottom, true, false, match.teamColor(TEAM_AWAY));
        var xs = [Kit.round(cx - inner - kitW / 2.0), Kit.round(cx + inner + kitW / 2.0)];
        for (var team = 0; team < 2; team++) {
            dc.setColor(Colors.textOn(Kit.fill(match.teamColor(team))), Graphics.COLOR_TRANSPARENT);
            dc.drawText(xs[team], y, font, texts[team], Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
        if (selected == TEAM_HOME || selected == TEAM_AWAY) {
            if (dc has :setAntiAlias) {
                dc.setAntiAlias(true);
            }
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            var r = Kit.round(height * 0.17);
            var cy = Kit.round(top - height * 0.37);
            if (cy - r - 2 < ceiling) {
                // A third of the room under it and two above, so it reads as the kit's, not the title's;
                // at least 3 pixels either side.
                var room = (top - ceiling - 6) / 2;
                r = room < r ? room : r;
                var free = top - ceiling - r * 2;
                cy = top - r - (free / 3 < 3 ? free / 2 : free / 3);
            }
            dc.fillCircle(xs[selected], cy, r < 3 ? 3 : r);
            if (dc has :setAntiAlias) {
                dc.setAntiAlias(false);
            }
        }
        return half;
    }

    //! Usable width of the screen at height y: the chord of the circle on round screens, inside
    //! the ring if there is one (UI-23).
    private function rowWidth(y as Number) as Float {
        if (System.getDeviceSettings().screenShape != System.SCREEN_SHAPE_ROUND) {
            return _w.toFloat();
        }
        var dy = (y - _h / 2.0).abs();
        var r = _h / 2.0 - _ringInset;
        return 2 * Math.sqrt(r * r - dy * dy).toFloat();
    }

    //! The baseline of a line of text drawn centered on y: where its letters stand.
    private function baseline(dc as Graphics.Dc, y as Number, font as Graphics.FontType) as Number {
        return y - dc.getFontHeight(font) / 2 + Graphics.getFontAscent(font);
    }

    private function drawCentered(dc as Graphics.Dc, y as Number, font as Graphics.FontType, text as String, color as Graphics.ColorType) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(_w / 2, y, font, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! PRE-8: an arrow towards the goal the next period's kickoff team attacks, turning with the
    //! watch, labelled with the team. Nothing when no direction was recorded, or on ET1's own
    //! kickoff screen, where it's recorded (ET-7).
    private function drawKickoffArrow(dc as Graphics.Dc, match as Match) as Void {
        var next = match.period + 1;
        var target = match.attackHeading(next);
        if (target == null || next == match.numPeriods) {
            return;
        }
        var team = match.kickoffFor(next);
        var heading = Compass.heading();
        if (heading == null) {
            drawCentered(dc, (_h * 0.80).toNumber(), Graphics.FONT_XTINY, "No compass reading", Graphics.COLOR_LT_GRAY);
            return;
        }
        var color = match.teamColor(team);
        Compass.drawArrow(dc, _w / 2, (_h * 0.775).toNumber(), (_h * 0.055).toNumber(), target - heading,
            color >= 0 && !Colors.needsOutline(color) ? color : Graphics.COLOR_WHITE);
        drawCentered(dc, (_h * 0.875).toNumber(), Graphics.FONT_XTINY, match.teamName(team) + " attacks", Graphics.COLOR_LT_GRAY);
    }

    //! UI-13: the large Start button on the kickoff and shoot-out first-kicker screens, an easy
    //! target for a finger or a glance; returns its [x, y, width, height] for tap handling.
    private function drawStartButton(dc as Graphics.Dc, y as Number) as Array<Number> {
        var font = Graphics.FONT_LARGE;
        var width = (_w * 0.56).toNumber();
        var height = dc.getFontHeight(font) + 16;
        var x = (_w - width) / 2;
        dc.setColor(COLOR_START, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y - height / 2, width, height, height / 2);
        drawCentered(dc, y, font, "Start", Graphics.COLOR_BLACK);
        return [x, y - height / 2, width, height];
    }

    //! A centred button-like pill; returns its [x, y, width, height] for tap handling.
    private function drawPill(dc as Graphics.Dc, y as Number, text as String, color as Graphics.ColorType) as Array<Number> {
        var font = Graphics.FONT_MEDIUM;
        var width = dc.getTextWidthInPixels(text, font) + (_w * 0.12).toNumber();
        var height = dc.getFontHeight(font) + 8;
        var x = (_w - width) / 2;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y - height / 2, width, height, height / 2);
        drawCentered(dc, y, font, text, Graphics.COLOR_BLACK);
        return [x, y - height / 2, width, height];
    }

    //! Shortens a team name until it fits (SET-5).
    private function fitText(dc as Graphics.Dc, text as String, font as Graphics.FontType, maxWidth as Number) as String {
        var fitted = text;
        while (fitted.length() > 1 && dc.getTextWidthInPixels(fitted, font) > maxWidth) {
            fitted = fitted.substring(0, fitted.length() - 1) as String;
        }
        return fitted;
    }
}
