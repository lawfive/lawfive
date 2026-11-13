import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// ---- Coin toss (PRE-9) ----
// A gold coin seen from the side as it spins end over end: it squashes to a line and opens again on
// the other face, slowing down over FLIP_MS, then lands on the result picked when the flip started.

const COIN_GOLD = 0xF2C230;
const COIN_RIM = 0xB8860B;
const COIN_TEXT = 0x6B4E00;

module CoinToss {
    const FLIP_MS = 1800;
    const FRAME_MS = 50;

    //! A fair pick. Uses the top bit of the random number: the lowest bit of a simple generator can
    //! follow a pattern.
    function pick() as Boolean {
        return Math.rand() >= 0x40000000;
    }

    //! Half-turns for a flip landing on `heads`, starting from heads: an even number shows heads.
    function halfTurns(heads as Boolean) as Number {
        return heads ? 10 : 11;
    }

    //! The spin angle `t` (0 to 1) of the way through a flip: fast at first, slowing to a stop.
    function angleAt(t as Float, turns as Number) as Float {
        var u = t > 1.0 ? 1.0 : t;
        var eased = 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u);
        return (eased * turns * Math.PI).toFloat();
    }

    //! Which face shows at a spin angle: heads at 0, tails after half a turn, and so on.
    function headsAt(angle as Float) as Boolean {
        return ((angle + Math.PI / 2) / Math.PI).toNumber() % 2 == 0;
    }
}

class CoinTossView extends WatchUi.View {
    var flipping as Boolean = false;
    private var _heads as Boolean = true;
    private var _landed as Boolean = false;
    private var _turns as Number = 10;
    private var _startMs as Number = 0;
    private var _timer as Timer.Timer? = null;

    function initialize() {
        View.initialize();
    }

    function onHide() as Void {
        stopTimer();
    }

    //! Picks the result now, then animates towards it.
    function flip() as Void {
        if (flipping) {
            return;
        }
        _heads = CoinToss.pick();
        _turns = CoinToss.halfTurns(_heads);
        _startMs = System.getTimer();
        flipping = true;
        _landed = false;
        var timer = new Timer.Timer();
        timer.start(method(:frame), CoinToss.FRAME_MS, true);
        _timer = timer;
        WatchUi.requestUpdate();
    }

    function frame() as Void {
        if (System.getTimer() - _startMs >= CoinToss.FLIP_MS) {
            stopTimer();
            flipping = false;
            _landed = true;
            Alerts.coinLanded();
        }
        WatchUi.requestUpdate();
    }

    private function stopTimer() as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
            _timer = null;
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25

        var angle = 0.0;
        var lift = 0;
        var r = (w * 0.2).toNumber();
        if (flipping) {
            var t = (System.getTimer() - _startMs).toFloat() / CoinToss.FLIP_MS;
            angle = CoinToss.angleAt(t, _turns);
            // Tossed up and caught: rises and falls once over the flip.
            lift = (Math.sin(Math.PI * (t > 1.0 ? 1.0 : t)) * h * 0.12).toNumber();
        } else if (_landed) {
            angle = (_turns * Math.PI).toFloat();
        }
        var heads = flipping || _landed ? CoinToss.headsAt(angle) : true;
        drawCoin(dc, w / 2, (h * 0.45).toNumber() - lift, r, Math.cos(angle).abs().toFloat(), heads);

        if (!flipping && !_landed) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.14, Graphics.FONT_SMALL, "Coin toss", center);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.79, Graphics.FONT_XTINY, "Tap or press Start", center);
            dc.drawText(w / 2, h * 0.86, Graphics.FONT_XTINY, "to flip", center);
        } else if (_landed) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.76, Graphics.FONT_LARGE, _heads ? "HEADS" : "TAILS", center);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h * 0.87, Graphics.FONT_XTINY, "Tap to flip again", center);
        }
    }

    //! The coin as an ellipse `squash` (0 to 1) of its full height, with a darker rim. The letter is
    //! only drawn while the coin is open enough to read it.
    private function drawCoin(dc as Graphics.Dc, x as Number, y as Number, r as Number, squash as Float, heads as Boolean) as Void {
        var ry = (r * squash).toNumber();
        if (ry < 2) {
            ry = 2;
        }
        dc.setColor(COIN_RIM, Graphics.COLOR_TRANSPARENT);
        dc.fillEllipse(x, y, r, ry);
        var inner = (r * 0.84).toNumber();
        var innerY = (ry * 0.84).toNumber();
        if (innerY >= 1) {
            dc.setColor(COIN_GOLD, Graphics.COLOR_TRANSPARENT);
            dc.fillEllipse(x, y, inner, innerY);
        }
        if (squash > 0.45) {
            dc.setColor(COIN_TEXT, Graphics.COLOR_TRANSPARENT);
            dc.drawText(x, y, Graphics.FONT_LARGE, heads ? "H" : "T", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}

//! Start/Stop or a tap flips; Back returns to the match.
class CoinTossDelegate extends TapAwareDelegate {
    private var _view as CoinTossView;

    function initialize(view as CoinTossView) {
        TapAwareDelegate.initialize();
        _view = view;
    }

    function onStartButton() as Boolean {
        _view.flip();
        return true;
    }

    function onScreenTap(x as Number, y as Number) as Boolean {
        _view.flip();
        return true;
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
