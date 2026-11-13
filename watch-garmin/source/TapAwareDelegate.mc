import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

//! Separates the Start/Stop button from screen taps (INP-9).
//!
//! On touch watches a tap is delivered twice: first as the Select behaviour (the same behaviour as
//! the Start/Stop button), then as onTap with its position, but only if onSelect returns false.
//! Handling Select directly would make every tap act as Start/Stop. So the button is handled in
//! onKey, Select is passed on, and taps are handled in onTap. The button itself can also arrive as
//! both onKey and Select, so a Select close to a Start/Stop key press is the same press and ignored.
//! If a watch reports the button only as Select (no onKey), a Select with no tap or key press right
//! next to it still counts as the button.
class TapAwareDelegate extends WatchUi.BehaviorDelegate {
    private const TAP_WINDOW_MS = 200;
    private var _lastTapMs as Number = -100000;
    private var _lastEnterMs as Number = -100000;
    private var _selectMs as Number = 0;
    private var _selectTimer as Timer.Timer? = null;

    function initialize() {
        BehaviorDelegate.initialize();
    }

    //! The Start/Stop button. Subclasses override.
    function onStartButton() as Boolean {
        return false;
    }

    //! A tap on the screen at (x, y). Subclasses override.
    function onScreenTap(x as Number, y as Number) as Boolean {
        return false;
    }

    //! Any other key. Subclasses override.
    function onOtherKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        return false;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        if (keyEvent.getKey() == WatchUi.KEY_ENTER) {
            _lastEnterMs = System.getTimer();
            return onStartButton();
        }
        return onOtherKey(keyEvent);
    }

    function onSelect() as Boolean {
        _selectMs = System.getTimer();
        if (_selectMs - _lastEnterMs < TAP_WINDOW_MS) {
            return true;
        }
        if (_selectMs - _lastTapMs < TAP_WINDOW_MS) {
            return false;
        }
        var timer = new Timer.Timer();
        timer.start(method(:selectWithoutTap), TAP_WINDOW_MS, false);
        _selectTimer = timer;
        return false;
    }

    //! Called shortly after a Select: if neither a tap nor the Start/Stop key came with it, it was the button.
    function selectWithoutTap() as Void {
        _selectTimer = null;
        var tapFollowed = _lastTapMs - _selectMs >= 0 && _lastTapMs - _selectMs <= TAP_WINDOW_MS;
        var keyFollowed = _lastEnterMs - _selectMs >= 0 && _lastEnterMs - _selectMs <= TAP_WINDOW_MS;
        if (!tapFollowed && !keyFollowed) {
            onStartButton();
        }
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Boolean {
        _lastTapMs = System.getTimer();
        var coords = clickEvent.getCoordinates();
        return onScreenTap(coords[0], coords[1]);
    }
}
