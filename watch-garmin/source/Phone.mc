import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

//! APP-7: the LawFive phone app as the way to the server. When it's on the phone and signed in to
//! the same server, a sync's requests go to it as messages, and it makes them with the watch's own
//! token; at a ground without signal it keeps what the watch sends in its outbox (answering 202)
//! and answers for the next matches with what it fetched last. Without the app, or when it doesn't
//! answer, requests go straight to the server through Garmin Connect, as before (SYNC-1 to SYNC-12).
module Phone {
    //! How long to wait for the app to answer "hello", and then a request (a track chunk takes a while).
    //! A hello's round trip takes 2-3 s, and about 3.6 s when the phone has to start the app.
    const HELLO_MS = 8000;
    const REQUEST_MS = 30000;
    //! After the app didn't answer, how long requests go straight to the server before asking again.
    const RETRY_MS = 600000;
    //! What the app answers for "kept for later" (no signal at the phone).
    const KEPT = 202;

    //! True when the app answered; false when it didn't (asked again after RETRY_MS); null before asking.
    var present as Boolean? = null;
    var _checkedAt as Number = 0;
    var _nextId as Number = 1;
    //! The request waiting for an answer: {"id", "until", "hello", "method", "path", "body"}.
    var _pending as Dictionary? = null;
    var _callback as Method(code as Number, data as Dictionary or String or Null) as Void or Null = null;
    var _registered as Boolean = false;

    //! A request to the server, through the phone app when it's there. `body` is the JSON body of a
    //! POST, or the query of a GET. `callback` gets the status code and the answer, as from
    //! Communications.makeWebRequest.
    function request(method as String, path as String, body as Dictionary?, callback as Method(code as Number, data as Dictionary or String or Null) as Void) as Void {
        _callback = callback;
        var asked = present;
        if (asked == false && System.getTimer() - _checkedAt < RETRY_MS) {
            direct(method, path, body);
            return;
        }
        listen();
        if (asked == true) {
            send(false, method, path, body);
        } else {
            send(true, method, path, body);
        }
    }

    function listen() as Void {
        if (!_registered) {
            Communications.registerForPhoneAppMessages(new Lang.Method(Phone, :onMessage) as Method(msg as Communications.PhoneAppMessage) as Void);
            _registered = true;
        }
    }

    //! "hello" first (to learn whether the app is there and signed in to this server), or the request itself.
    function send(hello as Boolean, method as String, path as String, body as Dictionary?) as Void {
        var id = _nextId;
        _nextId += 1;
        _pending = {"id" => id, "until" => System.getTimer() + (hello ? HELLO_MS : REQUEST_MS), "hello" => hello,
            "method" => method, "path" => path, "body" => body};
        var message = {"lawfive" => 1, "id" => id, "server" => Sync.serverUrl()} as Dictionary;
        if (hello) {
            message["kind"] = "hello";
        } else {
            message["kind"] = "request";
            message["method"] = method;
            message["path"] = path;
            message["body"] = body;
            message["token"] = Sync.token();
            message["device"] = Sync.deviceHeader();
        }
        Communications.transmit(message as Dictionary<Communications.TransmitKeyType, Communications.TransmitType>, null, new PhoneListener(id));
    }

    function onMessage(msg as Communications.PhoneAppMessage) as Void {
        var data = msg.data;
        // SYNC-13: the phone app linking this watch (answers to the watch's own requests have no kind).
        if (data instanceof Dictionary && data["kind"] instanceof String) {
            PhoneLink.onMessage(data);
            return;
        }
        var pending = _pending;
        if (!(data instanceof Dictionary) || pending == null || data["id"] != pending["id"]) {
            // Not ours, or the answer to a request already given up on.
            return;
        }
        var code = data["code"];
        var ok = false;
        if (code instanceof Number) {
            ok = code == 200;
        }
        if (pending["hello"] == true) {
            _pending = null;
            gone(ok);
            if (ok) {
                send(false, pending["method"] as String, pending["path"] as String, pending["body"] as Dictionary?);
            } else {
                // Signed in to another server, or not at all.
                direct(pending["method"] as String, pending["path"] as String, pending["body"] as Dictionary?);
            }
            return;
        }
        _pending = null;
        if (code instanceof Number && code == 409) {
            // Signed out of the app, or into another server, since it last answered.
            gone(false);
            direct(pending["method"] as String, pending["path"] as String, pending["body"] as Dictionary?);
            return;
        }
        var callback = _callback;
        if (callback != null) {
            var answer = data["data"];
            callback.invoke(code instanceof Number ? code : -2, answer instanceof Dictionary || answer instanceof String ? answer : null);
        }
    }

    //! The message didn't get to the phone app.
    function failed(id as Number) as Void {
        var pending = _pending;
        if (pending != null && pending["id"] == id) {
            fallBack(pending);
        }
    }

    //! Called every second (LawFiveApp.onTick): a request the app hasn't answered goes straight to the server.
    function tick() as Void {
        var pending = _pending;
        if (pending != null && System.getTimer() > (pending["until"] as Number)) {
            fallBack(pending);
        }
    }

    function fallBack(pending as Dictionary) as Void {
        _pending = null;
        gone(false);
        direct(pending["method"] as String, pending["path"] as String, pending["body"] as Dictionary?);
    }

    function gone(answered as Boolean) as Void {
        present = answered;
        _checkedAt = System.getTimer();
    }

    //! Straight to the server, through Garmin Connect on the phone.
    function direct(method as String, path as String, body as Dictionary?) as Void {
        var callback = _callback;
        if (callback == null) {
            return;
        }
        Communications.makeWebRequest(Sync.serverUrl() + path, body as Dictionary<Object, Object>?, {
            :method => "GET".equals(method) ? Communications.HTTP_REQUEST_METHOD_GET : Communications.HTTP_REQUEST_METHOD_POST,
            :headers => Sync.headers(),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, callback);
    }
}

class PhoneListener extends Communications.ConnectionListener {
    private var _id as Number;

    function initialize(id as Number) {
        ConnectionListener.initialize();
        _id = id;
    }

    function onComplete() as Void {
    }

    function onError() as Void {
        Phone.failed(_id);
    }
}
