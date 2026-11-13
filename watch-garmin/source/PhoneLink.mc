import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! SYNC-13: the LawFive phone app linking this watch, so nobody types a server address or a code.
//! The phone offers (its server and account; it sends the offer again every few seconds until it
//! hears back), the watch asks "Link to lawfive.example.com?", and on Start answers with which
//! watch it is; the phone then links it as the website's Link page would and sends the server and
//! the watch's own token, which the watch keeps as if it had linked with a code.
//!
//!   phone -> watch  {"lawfive": 1, "kind": "offer", "id", "server", "account"}
//!   watch -> phone  {"lawfive": 1, "kind": "accept" | "decline" | "busy", "id", "device"}
//!   phone -> watch  {"lawfive": 1, "kind": "link", "id", "server", "token"} or {"kind": "failed", "id", "message"}
//!   watch -> phone  {"lawfive": 1, "kind": "linked", "id"}
module PhoneLink {
    //! How long the watch waits for the token once it has said yes (the phone links it in about 6 s).
    const WAIT_MS = 60000;

    //! How long the question waits on screen before a new offer asks again.
    const ASK_MS = 120000;

    //! The offer being asked about or acted on; null when there's none.
    var _offer as Dictionary? = null;
    var _accepted as Boolean = false;
    var _until as Number = 0;
    var _askedAt as Number = 0;
    var _view as LinkView? = null;
    //! The Link screen waiting for "linked" to have gone before the first sync.
    var _linkedView as LinkView? = null;

    function onMessage(data as Dictionary) as Void {
        var kind = data["kind"] as String;
        if (kind.equals("offer")) {
            offered(data);
        } else if (kind.equals("link")) {
            linked(data);
        } else if (kind.equals("failed")) {
            var text = data["message"];
            stop(text instanceof String ? text : "Couldn't link");
        }
    }

    function offered(data as Dictionary) as Void {
        var server = data["server"];
        if (!(server instanceof String)) {
            return;
        }
        // Not in the middle of a match.
        if (getLawFiveApp().match != null) {
            reply("busy", data);
            return;
        }
        var current = _offer;
        if (current != null) {
            // The same offer again (the phone sends it until it hears back).
            if ((current["id"] as Number?) == (data["id"] as Number?)) {
                return;
            }
            // A new offer while linking for the last: that finishes first.
            if (_accepted) {
                return;
            }
            // A new offer while the question is on screen: the answer goes to the new one.
            if (System.getTimer() - _askedAt < ASK_MS) {
                _offer = data;
                return;
            }
        }
        _offer = data;
        _accepted = false;
        _askedAt = System.getTimer();
        var account = data["account"];
        var detail = Sync.isLinked() && !Sync.serverUrl().equals(server)
            ? "Instead of " + Sync.serverHost()
            : account instanceof String ? "As " + account : null;
        var view = new ConfirmView("Link to " + hostOf(server) + "?", detail, false);
        WatchUi.pushView(view, new ConfirmDelegate(view, :phoneLink), WatchUi.SLIDE_IMMEDIATE);
    }

    //! The answer to "Link to ...?": yes shows Linking until the token comes.
    function answer(yes as Boolean) as Void {
        var offer = _offer;
        if (offer == null) {
            return;
        }
        if (!yes) {
            reply("decline", offer);
            _offer = null;
            return;
        }
        reply("accept", offer);
        _accepted = true;
        _until = System.getTimer() + WAIT_MS;
        var view = new LinkView();
        view.byPhone(hostOf(offer["server"] as String));
        _view = view;
        WatchUi.pushView(view, new LinkDelegate(view), WatchUi.SLIDE_LEFT);
    }

    function linked(data as Dictionary) as Void {
        var offer = _offer;
        var server = data["server"];
        var token = data["token"];
        if (offer == null || !_accepted || !(server instanceof String) || !(token instanceof String)) {
            return;
        }
        // SEC-5: only the server the wearer said yes to, for the offer they answered.
        if (!server.equals(offer["server"] as String?) || (data["id"] as Number?) != (offer["id"] as Number?)) {
            return;
        }
        // A watch linked elsewhere leaves that account first; what waits to upload stays (SYNC-6).
        if (Sync.isLinked()) {
            Sync.unlinkAndSignOut();
        }
        Sync.chooseServer(server);
        Sync.linkWith(token, server);
        // The first sync waits until "linked" has gone: Garmin sends one message at a time, and a
        // sync's first message failing would send it straight to the server instead of the phone.
        _linkedView = _view;
        _view = null;
        _offer = null;
        replyThen("linked", offer, new ThenListener(new Lang.Method(PhoneLink, :afterLinked)));
    }

    function afterLinked() as Void {
        var view = _linkedView;
        _linkedView = null;
        if (view != null) {
            view.linkedByPhone();
        } else {
            Sync.run(null);
        }
    }

    //! Called every second (LawFiveApp.onTick): no token in time.
    function tick() as Void {
        if (_offer != null && _accepted && System.getTimer() > _until) {
            stop("The phone didn't answer");
        }
    }

    function stop(text as String) as Void {
        _offer = null;
        var view = _view;
        _view = null;
        if (view != null) {
            view.phoneProblem(text);
        }
    }

    //! An answer to the phone, with the offer's id.
    function reply(kind as String, offer as Dictionary) as Void {
        replyThen(kind, offer, new QuietListener());
    }

    function replyThen(kind as String, offer as Dictionary, listener as Communications.ConnectionListener) as Void {
        var message = {"lawfive" => 1, "kind" => kind, "device" => Sync.deviceHeader()} as Dictionary;
        message["id"] = offer["id"];
        Communications.transmit(message as Dictionary<Communications.TransmitKeyType, Communications.TransmitType>, null, listener);
    }

    function hostOf(url as String) as String {
        var at = url.find("://");
        return at != null ? url.substring(at + 3, url.length()) as String : url;
    }
}

//! For messages whose delivery nothing waits on (the phone sends its offer again, or the watch times out).
class QuietListener extends Communications.ConnectionListener {
    function initialize() {
        ConnectionListener.initialize();
    }

    function onComplete() as Void {
    }

    function onError() as Void {
    }
}

//! Runs `then` once the message has gone (or failed to).
class ThenListener extends Communications.ConnectionListener {
    private var _then as Method() as Void;

    function initialize(then as Method() as Void) {
        ConnectionListener.initialize();
        _then = then;
    }

    function onComplete() as Void {
        _then.invoke();
    }

    function onError() as Void {
        _then.invoke();
    }
}
