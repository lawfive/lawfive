import Toybox.Lang;
import Toybox.System;

//! INP-11: the Back press that turns the screen on only turns it on. Watches on Connect IQ 5 with
//! AMOLED or LCD screens say when the screen turns on (LawFiveApp.onDisplayModeChanged); the press
//! that woke it can arrive just before or just after that, so a press soon after counts too. Watches
//! without it never count as asleep.
module Wake {
    //! System.DISPLAY_MODE_HIGH_POWER, by value, as watches before Connect IQ 5 don't have the name.
    const SCREEN_ON = 0;
    //! How soon after the screen turns on a press still counts as the one that turned it on.
    const WAKE_MS = 400;

    var screenOn as Boolean = true;
    var onSinceMs as Number = -100000;

    //! From LawFiveApp.onDisplayModeChanged.
    function changed(on as Boolean, nowMs as Number) as Void {
        if (on && !screenOn) {
            onSinceMs = nowMs;
        }
        screenOn = on;
    }

    function currentlyOn() as Boolean {
        if (System has :getDisplayMode) {
            return (System.getDisplayMode() as Number) == SCREEN_ON;
        }
        return true;
    }

    //! Whether a press now is the one turning the screen on.
    function wakingPress(nowMs as Number) as Boolean {
        return isWaking(currentlyOn() && screenOn, onSinceMs, nowMs);
    }

    function isWaking(on as Boolean, onSince as Number, nowMs as Number) as Boolean {
        return !on || nowMs - onSince < WAKE_MS;
    }
}
