import Toybox.Attention;
import Toybox.Lang;

//! Vibration patterns (VIB-1 to VIB-4, VIB-7, EVT-12).
module Alerts {
    //! The last of the match's alerts to fire, for the shared match cases' tests (WCH-2).
    var last as Symbol? = null;

    function vibrate(pattern as Array<Attention.VibeProfile>) as Void {
        if (Attention has :vibrate) {
            Attention.vibrate(pattern);
        }
    }

    //! End of period: on/off pattern, repeated by the caller until acknowledged.
    function fullTime() as Void {
        last = :fullTime;
        vibrate([
            new Attention.VibeProfile(100, 400),
            new Attention.VibeProfile(0, 250),
            new Attention.VibeProfile(100, 400),
            new Attention.VibeProfile(0, 250),
            new Attention.VibeProfile(100, 400)
        ]);
    }

    //! VIB-7: the added time is used up: four quick pulses, repeated until acknowledged.
    function addedTime() as Void {
        last = :addedTime;
        vibrate([
            new Attention.VibeProfile(100, 150),
            new Attention.VibeProfile(0, 120),
            new Attention.VibeProfile(100, 150),
            new Attention.VibeProfile(0, 120),
            new Attention.VibeProfile(100, 150),
            new Attention.VibeProfile(0, 120),
            new Attention.VibeProfile(100, 150)
        ]);
    }

    //! EVT-12: a sin bin is over: three short pulses, repeated until acknowledged.
    function sinBinEnd() as Void {
        last = :sinBinEnd;
        vibrate([
            new Attention.VibeProfile(100, 150),
            new Attention.VibeProfile(0, 100),
            new Attention.VibeProfile(100, 150),
            new Attention.VibeProfile(0, 100),
            new Attention.VibeProfile(100, 150)
        ]);
    }

    //! Scheduled break has started: two short pulses, repeated until acknowledged.
    function breakStart() as Void {
        last = :breakStart;
        vibrate([
            new Attention.VibeProfile(100, 250),
            new Attention.VibeProfile(0, 200),
            new Attention.VibeProfile(100, 250)
        ]);
    }

    //! Break clock reached zero: one long vibration.
    function breakEnd() as Void {
        last = :breakEnd;
        vibrate([new Attention.VibeProfile(100, 2000)]);
    }

    //! TMR-13: the lightning countdown reached zero: one long vibration, as the break end's (VIB-3).
    function lightning() as Void {
        last = :lightning;
        vibrate([new Attention.VibeProfile(100, 2000)]);
    }

    //! Second yellow: three long pulses to prompt the referee to show a red card (EVT-6).
    function sendOff() as Void {
        vibrate([
            new Attention.VibeProfile(100, 600),
            new Attention.VibeProfile(0, 200),
            new Attention.VibeProfile(100, 600),
            new Attention.VibeProfile(0, 200),
            new Attention.VibeProfile(100, 600)
        ]);
    }

    //! Periodic reminder while a stoppage is active.
    function reminder() as Void {
        last = :reminder;
        vibrate([new Attention.VibeProfile(75, 200)]);
    }

    //! UI-12: turns the screen on (or keeps it on) while something needs the referee's attention.
    //! Watches with AMOLED screens limit how long an app may hold the backlight on and then throw;
    //! the screen is simply allowed to go off at that point.
    function screenOn() as Void {
        if (Attention has :backlight) {
            try {
                Attention.backlight(true);
            } catch (e instanceof Attention.BacklightOnTooLongException) {
            }
        }
    }

    //! The coin toss has landed (PRE-9): one firm pulse.
    function coinLanded() as Void {
        vibrate([new Attention.VibeProfile(100, 300)]);
    }

    //! Short tick confirming an input such as a recorded goal.
    function tick() as Void {
        vibrate([new Attention.VibeProfile(50, 80)]);
    }
}
