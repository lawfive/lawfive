import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;

//! EVT-9: how long a tapped confirm pill waits for the second tap.
const ARM_MS = 3000;

//! Starts a match from a setup and shows its kickoff screen in place of the current view.
function beginMatch(setup as MatchData) as Void {
    getLawFiveApp().newMatch(setup);
    var view = new MatchView();
    WatchUi.switchToView(view, new MatchDelegate(view), WatchUi.SLIDE_LEFT);
}

// ---- Team controls (INP-1, INP-2, EVT-1, EVT-3, EVT-5, EVT-6) ----

function teamMenu(match as Match, team as Number) as WatchUi.Menu2 {
    var menu = newMenu(match.teamName(team), team, match.teamColor(team));
    // Goals only during play; cards at any time (EVT-7).
    if (match.phase == PHASE_RUNNING) {
        menu.addItem(new TeamMenuItem(:goal, "Goal", null, null));
    }
    // EVT-12: with sin bins in the format, while the clock has time left to run, above Yellow card (the
    // owner's order): the dark band with the label in the cards' yellow, so it isn't taken for the
    // Yellow card row.
    if (match.sinBins && match.phase != PHASE_PENALTIES && match.phase != PHASE_DONE) {
        menu.addItem(new TeamMenuItem(:sinBin, "Sin bin", null, {:text => COLOR_CARD_YELLOW}));
    }
    menu.addItem(new TeamMenuItem(:yellow, "Yellow card", null, {:fill => COLOR_CARD_YELLOW}));
    menu.addItem(new TeamMenuItem(:red, "Red card", null, {:fill => COLOR_CARD_RED}));
    // EVT-15, EVT-16: a team official's card after the players', then an injury.
    menu.addItem(new TeamMenuItem(:official, "Team official", null, null));
    menu.addItem(new TeamMenuItem(:injury, "Injury", null, null));
    return menu;
}

class TeamMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _team as Number;

    function initialize(team as Number) {
        Menu2InputDelegate.initialize();
        _team = team;
    }

    //! EVT-3: every card asks for the player number, and every goal unless scorers are off (EVT-10);
    //! with goal types on, a goal first asks for its type (EVT-8).
    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        var match = getLawFiveApp().match;
        if (id == :goal && match != null && match.goalTypes) {
            WatchUi.switchToView(goalTypeMenu(match, _team), new GoalTypeDelegate(_team), WatchUi.SLIDE_LEFT);
        } else if (id == :goal) {
            askScorer(_team, EVENT_GOAL);
        } else if (id == :official && match != null) {
            WatchUi.switchToView(officialMenu(match, _team), new OfficialCardDelegate(_team), WatchUi.SLIDE_LEFT);
        } else if (id == :injury) {
            // EVT-16: the player's number, as for a card (EVT-3).
            askPlayerNumber(_team, EVENT_INJURY);
        } else if (id == :sinBin) {
            // EVT-12: the player's number too; 00 or Back is no number (EVT-3).
            askPlayerNumber(_team, EVENT_SIN_BIN);
        } else {
            askPlayerNumber(_team, id == :yellow ? EVENT_YELLOW : EVENT_RED);
        }
    }

    function onBack() as Void {
        WatchUi.popView(teamSlideOut(_team));
    }
}

//! EVT-8: Goal, DFK (direct free kick), Penalty or Own Goal, in the team menu's style.
function goalTypeMenu(match as Match, team as Number) as WatchUi.Menu2 {
    var menu = newMenu("Goal " + match.teamName(team), team, match.teamColor(team));
    menu.addItem(new TeamMenuItem(EVENT_GOAL, "Goal", null, null));
    menu.addItem(new TeamMenuItem(EVENT_DFK_GOAL, "DFK", null, null));
    menu.addItem(new TeamMenuItem(EVENT_PEN_GOAL, "Penalty", null, null));
    menu.addItem(new TeamMenuItem(EVENT_OWN_GOAL, "Own Goal", null, null));
    return menu;
}

class GoalTypeDelegate extends WatchUi.Menu2InputDelegate {
    private var _team as Number;

    function initialize(team as Number) {
        Menu2InputDelegate.initialize();
        _team = team;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        askScorer(_team, item.getId() as String);
    }

    function onBack() as Void {
        WatchUi.popView(teamSlideOut(_team));
    }
}

//! EVT-15: the card for a team official, in the team menu's style and the cards' colors.
function officialMenu(match as Match, team as Number) as WatchUi.Menu2 {
    var menu = newMenu("Official " + match.teamName(team), team, match.teamColor(team));
    menu.addItem(new TeamMenuItem(:yellow, "Yellow card", null, {:fill => COLOR_CARD_YELLOW}));
    menu.addItem(new TeamMenuItem(:red, "Red card", null, {:fill => COLOR_CARD_RED}));
    return menu;
}

class OfficialCardDelegate extends WatchUi.Menu2InputDelegate {
    private var _team as Number;

    function initialize(team as Number) {
        Menu2InputDelegate.initialize();
        _team = team;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var match = getLawFiveApp().match;
        if (match == null) {
            return;
        }
        var red = item.getId() == :red;
        var menu = newMenu((red ? "Red " : "Yellow ") + match.teamName(_team), _team, match.teamColor(_team));
        for (var i = 0; i < OFFICIAL_ROLES.size(); i++) {
            menu.addItem(new TeamMenuItem(i, OFFICIAL_ROLES[i], null, null));
        }
        WatchUi.switchToView(menu, new OfficialRoleDelegate(_team, red), WatchUi.SLIDE_LEFT);
    }

    function onBack() as Void {
        WatchUi.popView(teamSlideOut(_team));
    }
}

//! EVT-15: who the card was for, in place of a player's number. The numbers are what the server reads.
//! "Assistant" alone, as "Assistant coach" doesn't fit a Forerunner 965's row.
const OFFICIAL_ROLES = ["Head coach", "Assistant", "Other"];

class OfficialRoleDelegate extends WatchUi.Menu2InputDelegate {
    private var _team as Number;
    private var _red as Boolean;

    function initialize(team as Number, red as Boolean) {
        Menu2InputDelegate.initialize();
        _team = team;
        _red = red;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var match = getLawFiveApp().match;
        if (match != null) {
            match.addOfficialCard(_red, _team, item.getId() as Number, Clock.nowMs());
            Alerts.tick();
            if (asksReason()) {
                askReason(match, _team, _red, null, false);
                return;
            }
        }
        WatchUi.popView(teamSlideOut(_team));
    }

    function onBack() as Void {
        WatchUi.popView(teamSlideOut(_team));
    }
}

//! EVT-10: a goal of any type, recorded straight away when the match doesn't record scorers.
function askScorer(team as Number, type as String) as Void {
    var match = getLawFiveApp().match;
    if (match != null && !match.goalScorers) {
        recordEvent(type, team, null);
        WatchUi.popView(teamSlideOut(team));
    } else {
        askPlayerNumber(team, type);
    }
}

//! EVT-3: the player-number screen for a goal or card, in place of the current menu.
function askPlayerNumber(team as Number, type as String) as Void {
    var match = getLawFiveApp().match;
    var teamName = match != null ? match.teamName(team) : "";
    var card = type.equals(EVENT_YELLOW) || type.equals(EVENT_SIN_BIN) ? COLOR_CARD_YELLOW : (type.equals(EVENT_RED) ? COLOR_CARD_RED : null);
    var view = new DigitEntryView(eventName(type) + " " + teamName, card, "Player number", 0, 1, 99, "No number");
    view.twoTap = true;
    var entry = new PlayerNumberEntry(team, type);
    WatchUi.switchToView(view, new DigitEntryDelegate(view, entry.method(:onDone)), WatchUi.SLIDE_LEFT);
}

//! The short name of a goal or card: "Goal", "Own goal", "Pen goal", "DFK goal", "Yellow", "2nd yellow", "Red",
//! "Sin bin", "2nd sin bin" (EVT-12).
function eventName(type as String) as String {
    if (type.equals(EVENT_GOAL)) {
        return "Goal";
    } else if (type.equals(EVENT_OWN_GOAL)) {
        return "Own goal";
    } else if (type.equals(EVENT_PEN_GOAL)) {
        return "Pen goal";
    } else if (type.equals(EVENT_DFK_GOAL)) {
        return "DFK goal";
    } else if (type.equals(EVENT_YELLOW) || type.equals(EVENT_OFFICIAL_YELLOW)) {
        return "Yellow";
    } else if (type.equals(EVENT_SECOND_YELLOW)) {
        return "2nd yellow";
    } else if (type.equals(EVENT_INJURY)) {
        return "Injury";
    } else if (type.equals(EVENT_SIN_BIN)) {
        return "Sin bin";
    } else if (type.equals(EVENT_SECOND_SIN_BIN)) {
        return "2nd sin bin";
    }
    return "Red";
}

//! EVT-15: a team official in an event's words, short for Garmin's rows: "Yellow HOM coach".
const OFFICIAL_WORDS = ["coach", "assistant", "official"];

//! UI-9: team controls come in the way they're swiped open: home from the top and away from the
//! bottom, or with sideways swipes (INP-10) home from the left and away from the right.
function teamSlideIn(team as Number) as WatchUi.SlideType {
    if (Sync.sidewaysSwipes()) {
        return team == TEAM_HOME ? WatchUi.SLIDE_RIGHT : WatchUi.SLIDE_LEFT;
    }
    return team == TEAM_HOME ? WatchUi.SLIDE_DOWN : WatchUi.SLIDE_UP;
}

//! UI-9: and leave the way they came in.
function teamSlideOut(team as Number) as WatchUi.SlideType {
    if (Sync.sidewaysSwipes()) {
        return team == TEAM_HOME ? WatchUi.SLIDE_LEFT : WatchUi.SLIDE_RIGHT;
    }
    return team == TEAM_HOME ? WatchUi.SLIDE_UP : WatchUi.SLIDE_DOWN;
}

//! Records the event; returns true when it was a second yellow (EVT-5) or a second sin bin (EVT-12).
function recordEvent(type as String, team as Number, player as Number?) as Boolean {
    var match = getLawFiveApp().match;
    if (match == null) {
        return false;
    }
    var secondYellow = match.addEvent(type, team, player, Clock.nowMs());
    if (!secondYellow) {
        Alerts.tick();
    }
    return secondYellow;
}

//! Two-digit entry (UI-8): two digit boxes shown together, the active one outlined. Used for player
//! numbers (EVT-3) and for minutes and team size in Create match (SET-9).
//! Garmin's built-in Picker shows one column at a time, which hides the tens digit while the
//! ones digit is chosen, so this screen is custom.
class DigitEntryView extends WatchUi.View {
    var digits as Array<Number>;
    var active as Number = 0;
    var okTop as Number = 0;
    // EVT-9: when set (player numbers), a tap on the pill only arms it; a second tap within
    // ARM_MS confirms. Buttons confirm at once.
    var twoTap as Boolean = false;
    var armed as Boolean = false;
    private var _armTimer as Timer.Timer? = null;
    private var _title as String;
    private var _card as Graphics.ColorType?;
    private var _subtitle as String;
    private var _minValue as Number;
    private var _maxValue as Number;
    private var _zeroLabel as String?;

    //! `card` is the card colour for a yellow or red card, shown beside the title. Values outside
    //! `minValue` to `maxValue` cannot be confirmed, except 00 when it has a meaning (`zeroLabel`,
    //! e.g. "No number").
    function initialize(title as String, card as Graphics.ColorType?, subtitle as String, initial as Number,
            minValue as Number, maxValue as Number, zeroLabel as String?) {
        View.initialize();
        _title = title;
        _card = card;
        _subtitle = subtitle;
        _minValue = minValue;
        _maxValue = maxValue;
        _zeroLabel = zeroLabel;
        var value = initial < 0 ? 0 : (initial > 99 ? 99 : initial);
        digits = [value / 10, value % 10];
    }

    function change(delta as Number) as Void {
        digits[active] = (digits[active] + delta + 10) % 10;
        disarm();
        WatchUi.requestUpdate();
    }

    function arm() as Void {
        armed = true;
        var timer = new Timer.Timer();
        timer.start(method(:disarm), ARM_MS, false);
        _armTimer = timer;
        WatchUi.requestUpdate();
    }

    function disarm() as Void {
        var timer = _armTimer;
        if (timer != null) {
            timer.stop();
            _armTimer = null;
        }
        if (armed) {
            armed = false;
            WatchUi.requestUpdate();
        }
    }

    function onHide() as Void {
        disarm();
    }

    function select(index as Number) as Void {
        active = index;
        disarm();
        WatchUi.requestUpdate();
    }

    function value() as Number {
        return digits[0] * 10 + digits[1];
    }

    function canConfirm() as Boolean {
        var v = value();
        return (v >= _minValue && v <= _maxValue) || (v == 0 && _zeroLabel != null);
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25

        // Title, with a small card beside it for yellow and red cards.
        var titleFont = Graphics.FONT_SMALL;
        var titleY = (h * 0.17).toNumber();
        var titleX = w / 2;
        var card = _card;
        if (card != null) {
            var cardW = (h * 0.045).toNumber();
            var cardH = (h * 0.065).toNumber();
            var gap = (w * 0.025).toNumber();
            var titleW = dc.getTextWidthInPixels(_title, titleFont);
            var cardX = w / 2 - (cardW + gap + titleW) / 2;
            dc.setColor(card, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(cardX, titleY - cardH / 2, cardW, cardH, 3);
            titleX = cardX + cardW + gap + titleW / 2;
        }
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(titleX, titleY, titleFont, _title, center);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.27, Graphics.FONT_XTINY, _subtitle, center);

        // Digit boxes. Font heights include generous spacing, so the box is sized to about 70% of it.
        var font = Graphics.FONT_NUMBER_MEDIUM;
        var y = (h * 0.50).toNumber();
        var boxW = dc.getTextWidthInPixels("0", font) + (w * 0.07).toNumber();
        var boxH = (dc.getFontHeight(font) * 0.7).toNumber();
        var gapX = (w * 0.04).toNumber();
        var arrow = (w * 0.03).toNumber();
        for (var i = 0; i < 2; i++) {
            var x = i == 0 ? w / 2 - gapX / 2 - boxW / 2 : w / 2 + gapX / 2 + boxW / 2;
            var left = x - boxW / 2;
            var top = y - boxH / 2;
            var focused = i == active;
            dc.setColor(focused ? COLOR_MENU_FOCUS : COLOR_MENU_ROW, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(left, top, boxW, boxH, 10);
            if (focused) {
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(2);
                dc.drawRoundedRectangle(left, top, boxW, boxH, 10);
                // Up/down arrows just outside the box.
                var above = top - arrow;
                var below = top + boxH + arrow;
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
                dc.fillPolygon([[x - arrow, above], [x + arrow, above], [x, above - arrow]]);
                dc.fillPolygon([[x - arrow, below], [x + arrow, below], [x, below + arrow]]);
            }
            dc.setColor(focused ? Graphics.COLOR_WHITE : Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, y, font, digits[i].format("%d"), center);
        }

        // Confirm pill: the zero label (e.g. "No number") in grey at 00, a green OK for a valid value,
        // and a dimmed OK when the value is out of range. Once armed by a tap (EVT-9) it is white,
        // asking for a second tap.
        var zeroLabel = _zeroLabel;
        var showZero = value() == 0 && zeroLabel != null;
        var okLabel = armed ? "Tap again" : (showZero ? zeroLabel as String : "OK");
        var enabled = canConfirm();
        var okFont = Graphics.FONT_SMALL;
        var okY = (h * 0.81).toNumber();
        var okWidth = dc.getTextWidthInPixels(okLabel, okFont) + (w * 0.14).toNumber();
        var okHeight = dc.getFontHeight(okFont) + 6;
        okTop = okY - okHeight / 2 - 10;
        dc.setColor(armed ? Graphics.COLOR_WHITE : (showZero || !enabled ? COLOR_MENU_FOCUS : COLOR_START), Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle((w - okWidth) / 2, okY - okHeight / 2, okWidth, okHeight, okHeight / 2);
        dc.setColor(armed ? Graphics.COLOR_BLACK : (showZero ? Graphics.COLOR_WHITE : (enabled ? Graphics.COLOR_BLACK : Graphics.COLOR_DK_GRAY)), Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, okY, okFont, okLabel, center);
    }
}

//! Up/Down or swipe up/down: change the digit. Start: next digit, then OK. Tap a digit to select it,
//! tap the pill to confirm (twice for player numbers, EVT-9). Back returns to the first digit; on the first digit it calls `done` with
//! null (no number, or keep the old value). Otherwise `done` gets the value entered.
class DigitEntryDelegate extends TapAwareDelegate {
    private var _view as DigitEntryView;
    private var _done as Method(value as Number?) as Void;

    function initialize(view as DigitEntryView, done as Method(value as Number?) as Void) {
        TapAwareDelegate.initialize();
        _view = view;
        _done = done;
    }

    function onOtherKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_UP) {
            _view.change(1);
            return true;
        } else if (key == WatchUi.KEY_DOWN) {
            _view.change(-1);
            return true;
        }
        return false;
    }

    function onStartButton() as Boolean {
        if (_view.active == 0) {
            _view.select(1);
        } else {
            confirm();
        }
        return true;
    }

    function onBack() as Boolean {
        _view.disarm();
        if (_view.active == 1) {
            _view.select(0);
        } else {
            _done.invoke(null);
        }
        return true;
    }

    function onScreenTap(x as Number, y as Number) as Boolean {
        if (y >= _view.okTop) {
            if (_view.twoTap && !_view.armed && _view.canConfirm()) {
                _view.arm();
            } else {
                confirm();
            }
        } else {
            _view.select(x < System.getDeviceSettings().screenWidth / 2 ? 0 : 1);
        }
        return true;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Boolean {
        var direction = swipeEvent.getDirection();
        if (direction == WatchUi.SWIPE_UP) {
            _view.change(1);
        } else if (direction == WatchUi.SWIPE_DOWN) {
            _view.change(-1);
        } else {
            _view.select(1 - _view.active);
        }
        return true;
    }

    private function confirm() as Void {
        _view.disarm();
        if (_view.canConfirm()) {
            _done.invoke(_view.value());
        }
    }
}

//! EVT-3: records the goal or card once the player number is entered; 00 or Back means no number.
class PlayerNumberEntry {
    private var _team as Number;
    private var _type as String;

    function initialize(team as Number, type as String) {
        _team = team;
        _type = type;
    }

    function onDone(value as Number?) as Void {
        var player = value == null || value == 0 ? null : value;
        var second = recordEvent(_type, _team, player);
        var match = getLawFiveApp().match;
        if (match != null && isCard(_type) && asksReason()) {
            askReason(match, _team, _type.equals(EVENT_RED), second ? player : null, _type.equals(EVENT_SIN_BIN));
        } else if (second) {
            WatchUi.switchToView(new SendOffView(_team, player as Number, _type.equals(EVENT_SIN_BIN)), new SendOffDelegate(), WatchUi.SLIDE_IMMEDIATE);
        } else {
            WatchUi.popView(teamSlideOut(_team));
        }
    }
}

// ---- The card's reason (EVT-14) ----

//! Card reasons, in Settings, Controls: off by default, as it's one more step during play.
function asksReason() as Boolean {
    return Settings.getBoolean("cardReasons", false);
}

//! The match's misconduct codes for the card just recorded, No reason first: a caution's for a yellow (also
//! a second one), a sin bin or an official's yellow, a send-off's for a red. In place of the number entry
//! or the role list; the red screen follows for a second yellow or second sin bin (sentOff, the player).
function askReason(match as Match, team as Number, sendOff as Boolean, sentOff as Number?, sinBin as Boolean) as Void {
    var menu = newMenu("Reason", team, match.teamColor(team));
    menu.addItem(new TeamMenuItem(:none, "No reason", null, null));
    var codes = misconductCodes(match.reasonScheme, sendOff);
    for (var i = 0; i + 1 < codes.size(); i += 2) {
        menu.addItem(new TeamMenuItem(codes[i], codes[i], codes[i + 1], null));
    }
    WatchUi.switchToView(menu, new ReasonDelegate(team, sentOff, sinBin), WatchUi.SLIDE_LEFT);
}

class ReasonDelegate extends WatchUi.Menu2InputDelegate {
    private var _team as Number;
    private var _sentOff as Number?;
    private var _sinBin as Boolean;

    function initialize(team as Number, sentOff as Number?, sinBin as Boolean) {
        Menu2InputDelegate.initialize();
        _team = team;
        _sentOff = sentOff;
        _sinBin = sinBin;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        var match = getLawFiveApp().match;
        if (match != null && id instanceof String) {
            match.giveReason(id);
        }
        done();
    }

    //! Back is No reason: the card is already recorded.
    function onBack() as Void {
        done();
    }

    private function done() as Void {
        if (_sentOff != null) {
            WatchUi.switchToView(new SendOffView(_team, _sentOff, _sinBin), new SendOffDelegate(), WatchUi.SLIDE_IMMEDIATE);
        } else {
            WatchUi.popView(teamSlideOut(_team));
        }
    }
}

//! EVT-6: full red screen reminding the referee to show a red card, until a button is pressed; after a
//! second yellow, or a second sin bin (EVT-12).
class SendOffView extends WatchUi.View {
    private var _team as Number;
    private var _player as Number;
    private var _sinBin as Boolean;

    function initialize(team as Number, player as Number, sinBin as Boolean) {
        View.initialize();
        _team = team;
        _player = player;
        _sinBin = sinBin;
    }

    function onShow() as Void {
        Alerts.sendOff();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var match = getLawFiveApp().match;
        var team = match != null ? match.teamName(_team) : "";
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_RED);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_WHITE); // UI-25
        dc.drawText(w / 2, h * 0.22, Graphics.FONT_SMALL, _sinBin ? "2nd SIN BIN" : "2nd YELLOW", center);
        dc.drawText(w / 2, h * 0.40, Graphics.FONT_LARGE, team + " #" + _player.format("%d"), center);
        dc.drawText(w / 2, h * 0.58, Graphics.FONT_MEDIUM, "Show RED card", center);
        dc.drawText(w / 2, h * 0.71, Graphics.FONT_SMALL, "Send player off", center);
        dc.drawText(w / 2, h * 0.85, Graphics.FONT_XTINY, "Press any button", center);
    }
}

class SendOffDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        return dismiss();
    }

    function onBack() as Boolean {
        return dismiss();
    }

    function onSelect() as Boolean {
        return dismiss();
    }

    function onMenu() as Boolean {
        return dismiss();
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Boolean {
        return dismiss();
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Boolean {
        return dismiss();
    }

    private function dismiss() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        return true;
    }
}

// ---- Game menu (INP-3, INP-6, TMR-7, TMR-9, ET-1) ----

function gameMenu(match as Match) as WatchUi.Menu2 {
    if (match.phase == PHASE_RUNNING) {
        return playMenu(match);
    } else if (match.phase == PHASE_SUSPENDED) {
        return suspendedMenu(match);
    }
    var menu = systemMenu("Game");
    // PRE-8, ET-7: on a kickoff screen the direction is what the menu is opened for, so it comes first
    // (the owner's order) and is the item focused when the menu opens.
    if ((match.phase == PHASE_READY || match.phase == PHASE_NEXT_KICKOFF) && match.canRecordDirection() && Compass.available()) {
        menu.addItem(directionItem(match));
    }
    // PRE-9: wherever a real toss happens: before kickoff, before extra time and before a shoot-out.
    // Next after Kickoff direction, or first where that isn't shown.
    var beforeExtraTime = match.phase == PHASE_NEXT_KICKOFF && match.period + 1 == match.numPeriods;
    if (match.phase == PHASE_PRE || match.phase == PHASE_READY || beforeExtraTime
            || (match.phase == PHASE_PENALTIES && !match.penStarted)) {
        menu.addItem(new WatchUi.MenuItem("Coin toss", null, :coinToss, null));
    }
    if (match.phase == PHASE_BREAK) {
        menu.addItem(new WatchUi.MenuItem(match.isHalftime() ? "End HT" : "End break", null, :endHalftime, null));
    } else if (match.phase == PHASE_NEXT_KICKOFF && match.kickoffTeamOnScreen() >= 0) {
        menu.addItem(new WatchUi.MenuItem("Start " + Format.periodName(match.period + 1, match.numPeriods), null, :nextPeriod, null));
    } else if (match.phase == PHASE_DECIDE) {
        // ET-1: every choice, for button watches where Start only takes the recommended one.
        if (match.canExtraTime()) {
            menu.addItem(new WatchUi.MenuItem("Extra time", match.etPeriods.format("%d") + "x" + Format.minutes(match.etPeriodSec), :extraTime, null));
        }
        if (match.canPenalties()) {
            menu.addItem(new WatchUi.MenuItem("Penalties", null, :penalties, null));
        }
    }
    if (match.phase == PHASE_PRE || match.phase == PHASE_READY || match.phase == PHASE_NEXT_KICKOFF || match.phase == PHASE_PENALTIES
            || match.phase == PHASE_BREAK || match.phase == PHASE_DECIDE) {
        // On the kickoff and shoot-out screens Up/Down choose a team or a result, so cards are
        // reached from here; at a break it's where people look for them (EVT-7).
        menu.addItem(new WatchUi.MenuItem("Card for " + match.home, null, :cardHome, null));
        menu.addItem(new WatchUi.MenuItem("Card for " + match.away, null, :cardAway, null));
    }
    addUndoItem(menu, match);
    if (match.phase == PHASE_BREAK || match.phase == PHASE_NEXT_KICKOFF || match.phase == PHASE_DECIDE
            || match.phase == PHASE_PENALTIES || match.phase == PHASE_GOLDEN) {
        menu.addItem(new WatchUi.MenuItem("End match", null, :endMatch, null));
    } else {
        menu.addItem(new WatchUi.MenuItem("Cancel match", null, :cancel, null));
    }
    // EVT-11: once it's under way, and last, as it can't be taken back.
    if (match.phase == PHASE_BREAK || match.phase == PHASE_NEXT_KICKOFF || match.phase == PHASE_DECIDE || match.phase == PHASE_PENALTIES) {
        menu.addItem(new WatchUi.MenuItem("Abandon match", "Keeps the score", :abandon, null));
    }
    return menu;
}

//! INP-3: the game menu during play. The period's end first, as it's done every match, but for a due
//! halfway break's Start, which is what the menu is opened for then (TMR-7); then stoppage and the
//! halfway break; Undo (this period's events only, INP-6); the clock's corrections (TMR-14); the
//! kickoff's corrections; and Restart, Suspend (TMR-13) and Abandon last, as they stop play.
function playMenu(match as Match) as WatchUi.Menu2 {
    var menu = systemMenu("Game");
    var now = Clock.nowMs();
    if (match.breakDue) {
        menu.addItem(new WatchUi.MenuItem("Start " + match.breakLabel, Format.seconds(match.breakLenSec), :startBreak, null));
    }
    menu.addItem(endPeriodItem(match, now));
    if (match.stoppingClock) {
        // TMR-15: a stoppage stops the clock, so it's named for what it does.
        menu.addItem(new WatchUi.MenuItem(match.isStoppageActive() ? "Start clock" : "Stop clock", null, :stoppage, null));
    } else if (match.trackStoppage) {
        menu.addItem(new WatchUi.MenuItem((match.isStoppageActive() ? "End " : "Start ") + match.stoppageLabel, null, :stoppage, null));
    }
    if (match.breakDue) {
        menu.addItem(new WatchUi.MenuItem("Skip " + match.breakLabel, null, :skipBreak, null));
    }
    var remaining = match.breakRemainingMs(now);
    if (remaining != null) {
        menu.addItem(new WatchUi.MenuItem("End " + match.breakLabel, Format.countdown(remaining) + " left", :endBreak, null));
        // TMR-7: Reset is out of the menu for now (the user's choice); the rest of it stays, to bring back.
        // menu.addItem(new WatchUi.MenuItem("Reset " + match.breakLabel, "Started by mistake", :resetBreak, null));
    }
    addUndoItem(menu, match);
    // TMR-14: correcting the clock, with the period's time as counted from its kickoff ("1H 23:40",
    // as Each half from 0 shows it, added time included), and the stoppage total when it's tracked.
    menu.addItem(new WatchUi.MenuItem("Adjust clock", Format.withPeriod(match.period, match.numPeriods, Format.clock(match.matchMs(now))), :adjustClock, null));
    // TMR-15: a stopping clock has no added time.
    if (match.trackStoppage && !match.stoppingClock) {
        menu.addItem(new WatchUi.MenuItem("Adjust added time", Format.clock(match.stoppageTotalMs(now)), :adjustAdded, null));
    }
    // PRE-3: fix a wrongly chosen kickoff team; it decides who kicks off the next period. Named
    // as the first kickoff (or ET1's), not the current period's, which can be the other team.
    menu.addItem(new WatchUi.MenuItem("Change kickoff", (match.isExtraTime() ? "ET1 kickoff: " : "First kickoff: ") + match.teamName(match.firstKickoff()), :swapKickoff, null));
    if (match.canRecordDirection() && Compass.available()) {
        menu.addItem(directionItem(match));
    }
    if (match.period == 0) {
        menu.addItem(new WatchUi.MenuItem("Restart match", "Back to kickoff", :restart, null));
    }
    // TMR-13: a delay the match carries on after, before Abandon, which ends it.
    menu.addItem(new WatchUi.MenuItem("Suspend match", "Lightning, weather", :suspend, null));
    menu.addItem(new WatchUi.MenuItem("Abandon match", "Keeps the score", :abandon, null));
    return menu;
}

//! TMR-13, INP-3: the game menu while play is suspended. Resume first, as it's what the menu is
//! opened for; Lightning again for a new strike; cards, as at a break (EVT-7); Undo; and Abandon
//! last, as it can't be taken back.
function suspendedMenu(match as Match) as WatchUi.Menu2 {
    var menu = systemMenu("Game");
    menu.addItem(new WatchUi.MenuItem("Resume match", null, :resume, null));
    if (match.suspendReason == REASON_LIGHTNING) {
        menu.addItem(new WatchUi.MenuItem("Lightning again", "Back to 30:00", :lightningAgain, null));
    }
    menu.addItem(new WatchUi.MenuItem("Card for " + match.home, null, :cardHome, null));
    menu.addItem(new WatchUi.MenuItem("Card for " + match.away, null, :cardAway, null));
    addUndoItem(menu, match);
    menu.addItem(new WatchUi.MenuItem("Abandon match", "Keeps the score", :abandon, null));
    return menu;
}

//! INP-6: Undo, only for an event in the current period; with none, no row.
function addUndoItem(menu as WatchUi.Menu2, match as Match) as Void {
    var last = match.lastUndoableEvent();
    if (last != null) {
        menu.addItem(new WatchUi.MenuItem("Undo last event", describeEvent(last, match.home, match.away, match.numPeriods, match.stoppageLabel, null)[0], :undo, null));
    }
}

// ---- Abandoning a match (EVT-11) ----

const ABANDON_REASONS = ["Weather", "Lightning", "Crowd trouble", "Not enough players", "Other"];

//! Why, then Yes or No. The numbers are what the server reads.
class AbandonMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var match = getLawFiveApp().match;
        if (match == null) {
            return;
        }
        var reason = item.getId() as Number;
        var score = match.score[0].format("%d") + "-" + match.score[1].format("%d");
        var view = new ConfirmView("Abandon match?", ABANDON_REASONS[reason] + ", " + score + " stands", true);
        pendingAbandonReason = reason;
        WatchUi.switchToView(view, new ConfirmDelegate(view, :abandon), WatchUi.SLIDE_LEFT);
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}

var pendingAbandonReason as Number = 4;

function abandonMenu() as WatchUi.Menu2 {
    var menu = systemMenu("Why?");
    for (var i = 0; i < ABANDON_REASONS.size(); i++) {
        menu.addItem(new WatchUi.MenuItem(ABANDON_REASONS[i], null, i, null));
    }
    return menu;
}

// ---- Suspending a match (TMR-13) ----

//! Why, in the abandonment reason menu's style, without Not enough players. Choosing one suspends at
//! once, with the clock stopped as it's chosen: no Yes or No, as Resume undoes a mistake.
function suspendMenu() as WatchUi.Menu2 {
    var menu = systemMenu("Suspend match");
    for (var i = 0; i < SUSPEND_REASONS.size(); i++) {
        menu.addItem(new WatchUi.MenuItem(ABANDON_REASONS[SUSPEND_REASONS[i]], null, SUSPEND_REASONS[i], null));
    }
    return menu;
}

class SuspendMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var match = getLawFiveApp().match;
        if (match != null) {
            match.suspend(item.getId() as Number, Clock.nowMs());
        }
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}

// ---- Correcting the clock (TMR-14) ----

//! The change a Yes on "Clock +0:40?" or "Added time -1:05?" makes, in whole seconds.
var pendingClockChange as Number = 0;

//! Adjust clock and Adjust added time: the value when the row was chosen (the period's time, or the
//! stoppage total), then its minutes and seconds on the two-digit entry (UI-8; 00 is a real value
//! here, so no zero label and no two-tap), then Yes or No for the change (UI-7). Back on the seconds'
//! first digit returns to the minutes as entered; on the minutes' first digit, to the match screen.
class ClockAdjustEntry {
    private var _added as Boolean;
    private var _captured as Number;
    private var _period as String;
    private var _minutes as Number;

    function initialize(match as Match, added as Boolean, now as Long) {
        _added = added;
        _captured = ((added ? match.stoppageTotalMs(now) : match.matchMs(now)) / 1000).toNumber();
        if (_captured < 0) {
            _captured = 0;
        }
        // SET-16: a match of one period has no label, so it's "Minutes played".
        _period = Format.periodLabel(match.period, match.numPeriods);
        _minutes = _captured / 60;
    }

    function askMinutes(slide as WatchUi.SlideType) as Void {
        var view = new DigitEntryView(title(), null, unit("Minutes"), _minutes, 0, 99, null);
        WatchUi.switchToView(view, new DigitEntryDelegate(view, method(:onMinutes)), slide);
    }

    function onMinutes(value as Number?) as Void {
        if (value == null) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return;
        }
        _minutes = value;
        var view = new DigitEntryView(title(), null, unit("Seconds"), _captured % 60, 0, 59, null);
        WatchUi.switchToView(view, new DigitEntryDelegate(view, method(:onSeconds)), WatchUi.SLIDE_LEFT);
    }

    function onSeconds(value as Number?) as Void {
        if (value == null) {
            askMinutes(WatchUi.SLIDE_RIGHT);
            return;
        }
        var entered = _minutes * 60 + value;
        var change = entered - _captured;
        if (change == 0) {
            // Nothing to change, so nothing is recorded.
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return;
        }
        pendingClockChange = change;
        var view = new ConfirmView((_added ? "Added time " : "Clock ") + Format.change(change) + "?", "To " + Format.seconds(entered), false);
        WatchUi.switchToView(view, new ConfirmDelegate(view, _added ? :adjustAdded : :adjustClock), WatchUi.SLIDE_LEFT);
    }

    private function title() as String {
        return _added ? "Added time" : "Adjust clock";
    }

    //! "Minutes into 1H", or "Minutes" for added time.
    private function unit(what as String) as String {
        return _added ? what : _period.length() == 0 ? what + " played" : what + " into " + _period;
    }
}

//! PRE-8: record which way the kickoff team attacks.
function directionItem(match as Match) as WatchUi.MenuItem {
    return new WatchUi.MenuItem("Kickoff direction", match.hasDirection() ? "Saved" : "Face the goal", :direction, null);
}

//! "End 1st half", "End ET1" or "End match", with the match clock.
function endPeriodItem(match as Match, now as Long) as WatchUi.MenuItem {
    var label = match.periodEndsMatch() ? "End match" : "End " + Format.periodName(match.period, match.numPeriods);
    return new WatchUi.MenuItem(label, match.clockDisplay(now)[0], :endPeriod, null);
}

class GameMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var match = getLawFiveApp().match;
        if (match == null) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
            return;
        }
        var id = item.getId();
        var now = Clock.nowMs();
        if (id == :cardHome || id == :cardAway) {
            var team = id == :cardHome ? TEAM_HOME : TEAM_AWAY;
            WatchUi.switchToView(teamMenu(match, team), new TeamMenuDelegate(team), WatchUi.SLIDE_LEFT);
            return;
        } else if (id == :endHalftime) {
            match.endHalftime();
        } else if (id == :startBreak) {
            match.startBreak(now);
        } else if (id == :skipBreak) {
            match.skipBreak();
        } else if (id == :swapKickoff) {
            // PRE-3: it changes who kicks off the next period, so a stray tap must not do it.
            confirm("Change kickoff?", (match.isExtraTime() ? "ET1 kickoff to " : "First kickoff to ") + match.teamName(1 - match.firstKickoff()), :swapKickoff);
            return;
        } else if (id == :restart) {
            confirm("Restart match?", "Clock and events are cleared", :restart);
            return;
        } else if (id == :stoppage) {
            match.toggleStoppage(now);
        } else if (id == :endBreak) {
            match.endBreakEarly(now);
        } else if (id == :resetBreak) {
            match.resetBreak();
        } else if (id == :nextPeriod) {
            match.startNextPeriod(now);
        } else if (id == :coinToss) {
            var toss = new CoinTossView();
            WatchUi.switchToView(toss, new CoinTossDelegate(toss), WatchUi.SLIDE_LEFT);
            return;
        } else if (id == :direction) {
            var view = new DirectionView();
            WatchUi.switchToView(view, new DirectionDelegate(view), WatchUi.SLIDE_LEFT);
            return;
        } else if (id == :extraTime) {
            match.chooseExtraTime(now);
        } else if (id == :penalties) {
            match.choosePenalties();
        } else if (id == :undo) {
            confirm("Undo?", item.getSubLabel() as String, :undo);
            return;
        } else if (id == :adjustClock || id == :adjustAdded) {
            new ClockAdjustEntry(match, id == :adjustAdded, now).askMinutes(WatchUi.SLIDE_LEFT);
            return;
        } else if (id == :endPeriod) {
            confirm(item.getLabel() + "?", null, :endPeriod);
            return;
        } else if (id == :endMatch) {
            confirm("End match?", null, :endMatch);
            return;
        } else if (id == :cancel) {
            confirm("Cancel match?", "Nothing is saved", :cancel);
            return;
        } else if (id == :abandon) {
            WatchUi.switchToView(abandonMenu(), new AbandonMenuDelegate(), WatchUi.SLIDE_LEFT);
            return;
        } else if (id == :suspend) {
            WatchUi.switchToView(suspendMenu(), new SuspendMenuDelegate(), WatchUi.SLIDE_LEFT);
            return;
        } else if (id == :resume) {
            match.resume(now);
        } else if (id == :lightningAgain) {
            match.lightningAgain(now);
        }
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }

    private function confirm(message as String, detail as String?, action as Symbol) as Void {
        var view = new ConfirmView(message, detail, action == :cancel || action == :restart);
        WatchUi.switchToView(view, new ConfirmDelegate(view, action), WatchUi.SLIDE_IMMEDIATE);
    }
}

//! Carries out a game-menu action once it has been confirmed (TMR-9).
function performConfirmedAction(action as Symbol) as Void {
    if (action == :removeHistory) {
        // UI-17: off the watch, and back past its menu to History.
        var created = History.pendingRemoval;
        if (created != null) {
            History.remove(created);
        }
        History.pendingRemoval = null;
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        return;
    }
    if (action == :reset) {
        // DATA-8: everything goes and the app closes.
        Sync.reset();
        return;
    }
    if (action == :unlink) {
        // SYNC-6, from the Account menu: back past it to the start menu.
        Sync.unlinkAndSignOut();
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        return;
    }
    var match = getLawFiveApp().match;
    if (match == null) {
        return;
    }
    var now = Clock.nowMs();
    if (action == :undo) {
        match.undoLastEvent(now);
    } else if (action == :adjustClock) {
        match.adjustClock(pendingClockChange, now);
    } else if (action == :adjustAdded) {
        match.adjustAdded(pendingClockChange, now);
    } else if (action == :endPeriod) {
        match.endPeriod(now);
    } else if (action == :endMatch) {
        match.finish(now);
    } else if (action == :abandon) {
        match.abandon(now, pendingAbandonReason);
    } else if (action == :swapKickoff) {
        match.swapKickoff();
    } else if (action == :restart) {
        match.restart();
    } else if (action == :cancel) {
        // MatchView.onShow returns to the start menu once the match is gone.
        Recorder.discard();
        TrackLog.discard(match.created);
        getLawFiveApp().closeMatch();
    }
}

// ---- History and event lists (DATA-3) ----

function eventsMenu(title as String, events as Array<Array>, home as String, away as String, numPeriods as Number, stoppageLabel as String,
        periodStarts as Array<Number>?) as WatchUi.Menu2 {
    var menu = systemMenu(title);
    for (var i = 0; i < events.size(); i++) {
        var text = describeEvent(events[i], home, away, numPeriods, stoppageLabel, periodStarts);
        menu.addItem(new WatchUi.MenuItem(text[0], text[1], i, null));
    }
    if (events.size() == 0) {
        menu.addItem(new WatchUi.MenuItem("No events", null, :none, null));
    }
    return menu;
}

//! Label and sub-label for an event, such as "Goal HOM #9" / "1H 23:14". With `periodStarts`
//! (TMR-11, clock counting up through the match) the time is match time: "2H 67:14".
function describeEvent(event as Array, home as String, away as String, numPeriods as Number, stoppageLabel as String,
        periodStarts as Array<Number>?) as [String, String] {
    var type = event[EV_TYPE] as String;
    var team = event[EV_TEAM] as Number;
    var seconds = event[EV_SECONDS] as Number;
    var periodIndex = event[EV_PERIOD] as Number;
    var period = Format.periodLabel(periodIndex, numPeriods);
    var offset = periodStarts != null && periodIndex < periodStarts.size() ? periodStarts[periodIndex] : 0;
    var when = Format.withPeriod(periodIndex, numPeriods, Format.seconds(seconds + offset));
    if (seconds == SECONDS_BEFORE_KICKOFF) {
        when = "Before kickoff";
    } else if (seconds == SECONDS_AFTER_FULL_TIME) {
        when = "After full time";
    } else if (seconds == SECONDS_PENALTIES) {
        when = "Penalties";
    } else if (seconds < 0) {
        when = numPeriods == 2 && event[EV_PERIOD] == 0 ? "Half-time" : period.length() == 0 ? "At the break" : "After " + period;
    }

    if (isKick(type)) {
        return ["Pen " + (team == TEAM_HOME ? home : away) + (type.equals(EVENT_PEN_SCORED) ? " scored" : " missed"), when];
    } else if (type.equals(EVENT_STOPPAGE)) {
        return [Format.capitalize(stoppageLabel) + " " + Format.seconds(event[EV_DURATION] as Number), when];
    } else if (type.equals(EVENT_PERIOD_END)) {
        return ["End " + period, when];
    } else if (type.equals(EVENT_ABANDON)) {
        var reason = event[EV_DURATION];
        return ["Abandoned", reason instanceof Number && reason >= 0 && reason < ABANDON_REASONS.size() ? ABANDON_REASONS[reason] : when];
    } else if (isAdjustment(type)) {
        // TMR-14: "Clock +0:40", "Added time -1:05".
        var change = event[EV_DURATION];
        return [(type.equals(EVENT_CLOCK_ADJUSTED) ? "Clock " : "Added time ") + Format.change(change instanceof Number ? change : 0), when];
    } else if (type.equals(EVENT_SUSPENDED)) {
        // TMR-13: "Suspended" / "Lightning · 1H 30:00": the reason goes under it, as the rows are narrow.
        var reason = event[EV_DURATION];
        return ["Suspended", (reason instanceof Number && reason >= 0 && reason < ABANDON_REASONS.size() ? ABANDON_REASONS[reason] + " · " : "") + when];
    } else if (type.equals(EVENT_RESUMED)) {
        // TMR-13: "Resumed after 30:00", how long play was suspended.
        var length = event[EV_DURATION];
        return ["Resumed after " + Format.seconds(length instanceof Number ? length : 0), when];
    }
    if (type.equals(EVENT_SECOND_YELLOW) || type.equals(EVENT_SECOND_SIN_BIN)) {
        when = "Sent off · " + when;
    }
    var label = eventName(type) + " " + (team == TEAM_HOME ? home : away);
    if (type.equals(EVENT_OFFICIAL_YELLOW) || type.equals(EVENT_OFFICIAL_RED)) {
        var role = event[EV_DURATION];
        label += " " + (role instanceof Number && role >= 0 && role < OFFICIAL_WORDS.size() ? OFFICIAL_WORDS[role] : OFFICIAL_WORDS[2]);
    }
    var player = event[EV_PLAYER];
    if (player instanceof Number) {
        label += " #" + player.format("%d");
    }
    // EVT-14: the card's reason goes under it, "UB · 1H 22:41", as the rows are narrow.
    if (event.size() > EV_REASON && event[EV_REASON] instanceof String) {
        when = (event[EV_REASON] as String) + " · " + when;
    }
    return [label, when];
}
