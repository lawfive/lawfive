import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

const CHOICE_CANCEL = 0;
const CHOICE_CONFIRM = 1;
const COLOR_CANCEL = 0x444444;

//! Confirmation screen with Yes and No pills (UI-7), replacing the system Confirmation so it
//! matches the rest of the app. Yes is green, or red for destructive actions. (Not "Confirm" and
//! "Cancel": under "Cancel match?" a Cancel pill would read as the action itself.)
class ConfirmView extends WatchUi.View {
    var focus as Number = CHOICE_CONFIRM;
    var cancelTarget as Array<Number>? = null;
    var confirmTarget as Array<Number>? = null;
    private var _message as String;
    private var _detail as String?;
    private var _destructive as Boolean;
    private var _pillFont as Graphics.FontType = Graphics.FONT_SMALL;

    //! `message` is a short question ("Restart match?"); `detail` an optional smaller line under it.
    function initialize(message as String, detail as String?, destructive as Boolean) {
        View.initialize();
        _message = message;
        _detail = detail;
        _destructive = destructive;
    }

    function setFocus(choice as Number) as Void {
        focus = choice;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25

        // Yes above No, the same width, narrow enough for the round screen near the bottom.
        var pillW = (w * 0.5).toNumber();
        _pillFont = Graphics.FONT_SMALL;
        var pillH = dc.getFontHeight(_pillFont) + 10;
        var left = (w - pillW) / 2;
        var confirmTop = (h * 0.62).toNumber() - pillH / 2;

        // The question in white with the detail in smaller grey text under it, wrapped to the
        // screen width and centred as a block between the top of the screen and the pills.
        var font = Graphics.FONT_SMALL;
        var detailFont = Graphics.FONT_XTINY;
        var lines = wrap(dc, _message, font, (w * 0.7).toNumber());
        var detail = _detail;
        var detailLines = detail != null ? wrap(dc, detail, detailFont, (w * 0.7).toNumber()) : [] as Array<String>;
        var lineH = dc.getFontHeight(font);
        var detailH = dc.getFontHeight(detailFont);
        var gap = detailLines.size() > 0 ? 6 : 0;
        var blockH = lines.size() * lineH + gap + detailLines.size() * detailH;
        var areaTop = (h * 0.15).toNumber();
        var y = areaTop + (confirmTop - areaTop - blockH) / 2;
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        for (var i = 0; i < lines.size(); i++) {
            dc.drawText(w / 2, y + lineH / 2, font, lines[i], center);
            y += lineH;
        }
        y += gap;
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < detailLines.size(); i++) {
            dc.drawText(w / 2, y + detailH / 2, detailFont, detailLines[i], center);
            y += detailH;
        }

        confirmTarget = drawPill(dc, left, confirmTop, pillW, pillH, "Yes",
            _destructive ? COLOR_CARD_RED : COLOR_START, _destructive ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK, focus == CHOICE_CONFIRM);
        cancelTarget = drawPill(dc, left, (h * 0.79).toNumber() - pillH / 2, pillW, pillH, "No", COLOR_CANCEL, Graphics.COLOR_WHITE, focus == CHOICE_CANCEL);
    }

    private function drawPill(dc as Graphics.Dc, x as Number, y as Number, w as Number, h as Number, text as String,
            fill as Graphics.ColorType, textColor as Graphics.ColorType, focused as Boolean) as Array<Number> {
        dc.setColor(fill, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, w, h, h / 2);
        if (focused) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(3);
            dc.drawRoundedRectangle(x, y, w, h, h / 2);
        }
        dc.setColor(textColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + w / 2, y + h / 2, _pillFont, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        return [x, y, w, h];
    }

    //! Splits text into lines no wider than maxWidth, breaking at spaces.
    function hits(target as Array<Number>?, x as Number, y as Number) as Boolean {
        if (target == null) {
            return false;
        }
        var slack = 8;
        return x >= target[0] - slack && x <= target[0] + target[2] + slack
            && y >= target[1] - slack && y <= target[1] + target[3] + slack;
    }
}

//! Start/Stop presses the highlighted pill; Up/Down or any swipe moves the highlight; Back
//! always cancels; tapping a pill presses it.
class ConfirmDelegate extends TapAwareDelegate {
    private var _view as ConfirmView;
    private var _action as Symbol;

    function initialize(view as ConfirmView, action as Symbol) {
        TapAwareDelegate.initialize();
        _view = view;
        _action = action;
    }

    function onStartButton() as Boolean {
        choose(_view.focus);
        return true;
    }

    function onOtherKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        var key = keyEvent.getKey();
        if (key == WatchUi.KEY_UP || key == WatchUi.KEY_DOWN) {
            _view.setFocus(1 - _view.focus);
            return true;
        }
        return false;
    }

    function onBack() as Boolean {
        choose(CHOICE_CANCEL);
        return true;
    }

    function onScreenTap(x as Number, y as Number) as Boolean {
        if (_view.hits(_view.cancelTarget, x, y)) {
            choose(CHOICE_CANCEL);
        } else if (_view.hits(_view.confirmTarget, x, y)) {
            choose(CHOICE_CONFIRM);
        }
        return true;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Boolean {
        _view.setFocus(1 - _view.focus);
        return true;
    }

    private function choose(choice as Number) as Void {
        if (_action == :phoneLink) {
            // SYNC-13: the answer goes to the phone either way, and Link may open in this one's place.
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            PhoneLink.answer(choice == CHOICE_CONFIRM);
            return;
        }
        if (choice == CHOICE_CONFIRM) {
            performConfirmedAction(_action);
        }
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
    }
}

//! Splits text into lines no wider than maxWidth, breaking at spaces.
function wrap(dc as Graphics.Dc, text as String, font as Graphics.FontType, maxWidth as Number) as Array<String> {
    var lines = [] as Array<String>;
    var line = "";
    var rest = text;
    while (rest.length() > 0) {
        var space = rest.find(" ");
        var word = space == null ? rest : rest.substring(0, space) as String;
        rest = space == null ? "" : rest.substring(space + 1, rest.length()) as String;
        var candidate = line.length() == 0 ? word : line + " " + word;
        if (line.length() > 0 && dc.getTextWidthInPixels(candidate, font) > maxWidth) {
            lines.add(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line.length() > 0) {
        lines.add(line);
    }
    return lines;
}
