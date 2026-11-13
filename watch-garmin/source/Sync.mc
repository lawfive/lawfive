import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;

//! Linking the watch to a LawFive account, downloading the next matches and uploading finished
//! ones (SYNC-1 to SYNC-7). Requests go through the LawFive phone app when it's there (APP-7,
//! Phone.mc), else through the Garmin Connect app, so they only work with the phone nearby;
//! finished matches wait in an outbox until the server (or the phone app) has them.
module Sync {
    const STORAGE_TOKEN = "authToken";
    const STORAGE_MATCHES = "syncedMatches";
    const STORAGE_OUTBOX = "outbox";
    //! SYNC-11: fees marked paid or not paid on the watch, waiting to be sent.
    const STORAGE_FEES = "feeOutbox";
    //! UI-24: the match screen chosen here, waiting to be sent, and when the screen last changed.
    const STORAGE_SCREEN_CHANGE = "screenChange";
    const STORAGE_SCREEN_AT = "screenAt";
    //! SYNC-12: pitch corners walked on the watch (TRK-13), waiting to be sent.
    const STORAGE_PITCHES = "pitchOutbox";
    const STORAGE_LAST_SYNC = "lastSync";
    //! SYNC-9: the server chosen on the watch, when one was.
    const STORAGE_SERVER = "server";
    //! SYNC-2: the server this watch was linked with, kept at linking, so a changed phone setting
    //! can't send a linked watch (and its token) elsewhere.
    const STORAGE_LINKED_SERVER = "linkedServer";
    const CLIENT_ID = "lawfive-garmin";
    //! VER-1: this build's version, stamped by tools/device/install.sh from tools/version.sh; "dev" in other builds.
    const APP_VERSION = "dev";
    //! VER-3: the server's version, from its last answer with the matches.
    const STORAGE_SERVER_VERSION = "serverVersion";
    //! INP-10: how swipes open the team controls, as the account last said ("upDown" or "sideways").
    const STORAGE_TEAM_SWIPES = "teamSwipes";
    const STORAGE_SCHEME = "misconductScheme";   // EVT-14: the account's codes, for a quick match's card reasons
    //! SYNC-6: links unlinked without the phone nearby, as [server, token], signed out at the next chance.
    const STORAGE_SIGN_OUTS = "signOuts";
    const MAX_SIGN_OUTS = 5;
    const DEFAULT_SERVER = "https://api.lawfive.app";
    //! SYNC-8: a server built in by `tools/device/install.sh --server`; empty in every other build.
    const BUILT_IN_SERVER = "";
    //! SYNC-3: how many upcoming matches the watch keeps (about 1 KB each).
    const MAX_MATCHES = 10;
    //! SYNC-4: finished matches waiting to upload; the oldest are dropped beyond this.
    const MAX_OUTBOX = 10;

    //! What went wrong in the last sync, for the Account screen; null when it worked.
    var lastProblem as String? = null;
    //! The step a sync is on, for Sync now and History (UI-16): "Sending match 1 of 2…".
    var progress as String? = null;
    // UI-26: the sync screen's words and ring: "Sending track", "3 of 18", and how many steps of how many.
    var stepLabel as String = "";
    var stepCount as String = "";
    var stepsDone as Number = 0;
    var stepsTotal as Number = 0;
    var matchesSentLast as Number = 0;
    var _screenShown as Boolean = true;
    var _job as SyncJob? = null;
    var _resetTimer as Timer.Timer? = null;
    var _resetSignedOut as Boolean = false;
    var _signingOut as Boolean = false;

    //! The server to use, without a trailing slash: while linked, the one it was linked with
    //! (SYNC-2); else one chosen on the watch (SYNC-9), else one built in at install (SYNC-8), else
    //! the phone setting (SYNC-2).
    function serverUrl() as String {
        var linked = linkedServer();
        if (linked != null && isLinked()) {
            return linked;
        }
        return unlinkedServerUrl();
    }

    //! The server a new link would use: the setting chooses it until the watch is linked.
    function unlinkedServerUrl() as String {
        var chosen = chosenServer();
        return chosen != null ? serverFrom(chosen, "") : serverFrom(Settings.getString("serverUrl"), BUILT_IN_SERVER);
    }

    function linkedServer() as String? {
        var value = Application.Storage.getValue(STORAGE_LINKED_SERVER);
        return value instanceof String && value.length() > 0 ? value : null;
    }

    //! SYNC-2: a watch linked before the server was kept at linking keeps the one it uses now.
    function keepLinkedServer() as Void {
        if (isLinked() && linkedServer() == null) {
            Application.Storage.setValue(STORAGE_LINKED_SERVER, unlinkedServerUrl());
        }
    }

    function chosenServer() as String? {
        var value = Application.Storage.getValue(STORAGE_SERVER);
        return value instanceof String && value.length() > 0 ? value : null;
    }

    //! SYNC-9: remembers the server chosen on the watch (the hosted service, or one checked to be LawFive).
    function chooseServer(url as String) as Void {
        Application.Storage.setValue(STORAGE_SERVER, serverFrom(url, ""));
    }

    function isHosted() as Boolean {
        return serverUrl().equals(DEFAULT_SERVER);
    }

    //! SYNC-9: an address typed on the watch as a server URL: spaces dropped, `https://` added when
    //! no scheme was typed, no trailing slash. Null when there's nothing after the scheme.
    function typedServer(text as String) as String? {
        var url = "";
        var chars = text.toCharArray();
        for (var i = 0; i < chars.size(); i++) {
            if (chars[i] != ' ') {
                url += chars[i].toString();
            }
        }
        var at = url.find("://");
        if (at == null) {
            url = "https://" + url;
            at = 5;
        }
        var rest = url.substring(at + 3, url.length()) as String;
        while (rest.length() > 0 && (rest.substring(rest.length() - 1, rest.length()) as String).equals("/")) {
            rest = rest.substring(0, rest.length() - 1) as String;
        }
        return rest.length() > 0 ? (url.substring(0, at + 3) as String) + rest : null;
    }

    //! The server to use: one built in at install (SYNC-8) always wins, since a sideloaded watch
    //! can't change the setting and may have kept an old value from an earlier install; otherwise
    //! the setting, or the hosted service when it's blank.
    function serverFrom(setting as String, builtIn as String) as String {
        var url = builtIn.length() > 0 ? builtIn : setting;
        if (url.length() == 0) {
            url = DEFAULT_SERVER;
        }
        while (url.length() > 1 && (url.substring(url.length() - 1, url.length()) as String).equals("/")) {
            url = url.substring(0, url.length() - 1) as String;
        }
        return url;
    }

    //! The server's host, for showing on screen: "lawfive.example.com".
    function serverHost() as String {
        var url = serverUrl();
        var at = url.find("://");
        return at != null ? url.substring(at + 3, url.length()) as String : url;
    }

    function token() as String? {
        var value = Application.Storage.getValue(STORAGE_TOKEN);
        return value instanceof String ? value : null;
    }

    function isLinked() as Boolean {
        return token() != null;
    }

    //! SYNC-1, SYNC-13: the watch is linked to `server`. Keeps its token and the server (SYNC-2),
    //! and queues every match in History that isn't on LawFive yet, oldest first, to go up with the
    //! first sync (SYNC-4), finished while linked or not.
    function linkWith(token as String, server as String) as Void {
        Application.Storage.setValue(STORAGE_LINKED_SERVER, serverFrom(server, ""));
        setToken(token);
        var entries = History.all();
        for (var i = entries.size() - 1; i >= 0; i--) {
            var entry = entries[i];
            var created = entry["created"];
            if (created instanceof Number && !History.isSent(entry) && !isQueued(created)) {
                var upload = History.uploadOf(entry);
                if (upload != null) {
                    queue(upload);
                }
            }
        }
    }

    function setToken(value as String) as Void {
        Application.Storage.setValue(STORAGE_TOKEN, value);
    }

    //! SYNC-6: forgets the account and the downloaded matches. Finished matches stay queued, so
    //! linking again uploads them.
    function unlink() as Void {
        Application.Storage.deleteValue(STORAGE_TOKEN);
        // SYNC-2: unlinked, the setting (or the server chosen here) decides the next link.
        Application.Storage.deleteValue(STORAGE_LINKED_SERVER);
        Application.Storage.deleteValue(STORAGE_MATCHES);
        Application.Storage.deleteValue(STORAGE_LAST_SYNC);
        // UI-24: the next account's match screen is its own.
        Application.Storage.deleteValue(STORAGE_SCREEN_CHANGE);
        Application.Storage.deleteValue(STORAGE_SCREEN_AT);
        Application.Storage.deleteValue(STORAGE_SCHEME);
    }

    //! VER-3: the server's version as it last said, or null before a sync with a server that says.
    function serverVersion() as String? {
        var value = Application.Storage.getValue(STORAGE_SERVER_VERSION);
        return value instanceof String ? value : null;
    }

    //! DATA-8: signs this watch out on the server too, so the website's and the phone's devices
    //! lists drop it. The request carries the token, so the watch can forget it straight away.
    function signOut(done as Method(code as Number, data as Dictionary or String or Null) as Void) as Void {
        Communications.makeWebRequest(serverUrl() + "/v1/auth/sign-out", {}, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => headers(),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, done);
    }

    //! SYNC-6, SYNC-13: unlinks, and signs the old link out on the server so the devices lists drop
    //! it: now if the phone is nearby, else the next time it is (`sendSignOuts`).
    function unlinkAndSignOut() as Void {
        var old = token();
        if (old != null) {
            var queued = signOuts();
            queued.add([serverUrl(), old] as Array<String>);
            if (queued.size() > MAX_SIGN_OUTS) {
                queued = queued.slice(queued.size() - MAX_SIGN_OUTS, null);
            }
            Application.Storage.setValue(STORAGE_SIGN_OUTS, queued as Array<Application.Storage.ValueType>);
        }
        unlink();
        sendSignOuts();
    }

    function signOuts() as Array<Array<String>> {
        var stored = Application.Storage.getValue(STORAGE_SIGN_OUTS);
        return stored instanceof Array ? stored as Array<Array<String>> : [] as Array<Array<String>>;
    }

    //! SYNC-6: the old links waiting, oldest first, each to the server it came from; one goes once
    //! that server answers, and they stay while it can't be reached.
    function sendSignOuts() as Void {
        var queued = signOuts();
        if (_signingOut || queued.size() == 0) {
            return;
        }
        _signingOut = true;
        Communications.makeWebRequest(queued[0][0] + "/v1/auth/sign-out", {}, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                "Authorization" => "Bearer " + queued[0][1],
                "X-LawFive-Device" => deviceHeader()
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, new Lang.Method(Sync, :onQueuedSignOut));
    }

    function onQueuedSignOut(code as Number, data as Dictionary or String or Null) as Void {
        _signingOut = false;
        if ((code >= 200 && code < 300) || (code > 0 && fromServer(data))) {
            var queued = signOuts();
            Application.Storage.setValue(STORAGE_SIGN_OUTS, queued.slice(1, null) as Array<Application.Storage.ValueType>);
            sendSignOuts();
        }
    }

    //! DATA-8: everything this app keeps on the watch goes (the link, matches, history, what waits
    //! to upload, tracks, the chosen server); settings stay. A linked watch signs out on the server
    //! first (a few seconds at most). The app then closes, so it opens afresh.
    function reset() as Void {
        if (!isLinked()) {
            finishReset();
            return;
        }
        signOut(new Lang.Method(Sync, :onResetSignedOut));
        // Without the phone the answer can take a while: reset anyway.
        var timer = new Timer.Timer();
        timer.start(new Lang.Method(Sync, :finishReset), 8000, false);
        _resetTimer = timer;
    }

    function onResetSignedOut(code as Number, data as Dictionary or String or Null) as Void {
        _resetSignedOut = (code >= 200 && code < 300) || (code > 0 && fromServer(data));
        finishReset();
    }

    //! SYNC-6: old links not signed out yet stay through the reset, with this one if its sign-out
    //! didn't get through, so the server still drops them later.
    function finishReset() as Void {
        var queued = signOuts();
        var old = token();
        if (old != null && !_resetSignedOut) {
            queued.add([serverUrl(), old] as Array<String>);
        }
        Application.Storage.clearValues();
        if (queued.size() > 0) {
            Application.Storage.setValue(STORAGE_SIGN_OUTS, queued as Array<Application.Storage.ValueType>);
        }
        System.exit();
    }

    function matches() as Array<Dictionary> {
        var stored = Application.Storage.getValue(STORAGE_MATCHES);
        return stored instanceof Array ? stored as Array<Dictionary> : [] as Array<Dictionary>;
    }

    function outbox() as Array<Dictionary> {
        var stored = Application.Storage.getValue(STORAGE_OUTBOX);
        return stored instanceof Array ? stored as Array<Dictionary> : [] as Array<Dictionary>;
    }

    //! When the last sync finished, in seconds since 1970, or null.
    function lastSync() as Number? {
        var value = Application.Storage.getValue(STORAGE_LAST_SYNC);
        return value instanceof Number ? value : null;
    }

    //! The headers every signed-in request sends.
    function headers() as Dictionary {
        return {
            "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
            "Authorization" => "Bearer " + token(),
            "X-LawFive-Device" => deviceHeader()
        };
    }

    //! "garmin; model=006-B3703-00; firmware=12.30; app=2026.10.30": which watch this is, so the
    //! website can name it ("Garmin Venu 2") from the moment it asks to link, and this app's version
    //! (VER-3). Servers before this read only "garmin".
    function deviceHeader() as String {
        var settings = System.getDeviceSettings();
        var text = "garmin; model=" + settings.partNumber;
        var firmware = settings.firmwareVersion;
        if (firmware != null && firmware.size() >= 2) {
            text += "; firmware=" + firmware[0].format("%d") + "." + firmware[1].format("%02d");
        }
        return text + "; app=" + APP_VERSION;
    }

    // ---- Outbox (SYNC-4) ----

    //! Queues a finished match for upload, replacing an earlier copy of the same match (cards
    //! given after full time change it). Only while linked: matches played before linking stay
    //! on the watch.
    function queueMatch(match as Match) as Void {
        if (isLinked()) {
            queue(uploadFor(match));
        }
    }

    function queue(upload as Dictionary) as Void {
        var created = upload["created"];
        var next = [upload] as Array<Dictionary>;
        var previous = outbox();
        for (var i = 0; i < previous.size() && next.size() < MAX_OUTBOX; i++) {
            if (previous[i]["created"] != created) {
                next.add(previous[i]);
            }
        }
        Application.Storage.setValue(STORAGE_OUTBOX, next as Array<Application.Storage.ValueType>);
    }

    // ---- Fees (UI-19, SYNC-11) ----

    function feeOutbox() as Array<Dictionary> {
        var stored = Application.Storage.getValue(STORAGE_FEES);
        return stored instanceof Array ? stored as Array<Dictionary> : [] as Array<Dictionary>;
    }

    //! UI-24: the match screen was chosen on this watch: goes up at the next sync.
    function screenChanged() as Void {
        var at = Time.now().value();
        Application.Storage.setValue(STORAGE_SCREEN_AT, at);
        Application.Storage.setValue(STORAGE_SCREEN_CHANGE, Screen.toServer(at) as Dictionary<Application.Storage.KeyType, Application.Storage.ValueType>);
    }

    function screenChange() as Dictionary? {
        var stored = Application.Storage.getValue(STORAGE_SCREEN_CHANGE);
        return stored instanceof Dictionary ? stored as Dictionary : null;
    }

    //! INP-10: right for home and left for away, with up for the game menu, rather than down and up.
    function sidewaysSwipes() as Boolean {
        var swipes = Application.Storage.getValue(STORAGE_TEAM_SWIPES);
        return swipes instanceof String && swipes.equals("sideways");
    }

    //! EVT-14: the account's misconduct codes as the last sync said, or null before one with a server that says.
    function accountScheme() as String? {
        var scheme = Application.Storage.getValue(STORAGE_SCHEME);
        return scheme instanceof String ? scheme : null;
    }

    //! UI-24: the match screen chosen for the account, if it's newer than this watch's and readable.
    function applyScreen(screen as Dictionary) as Boolean {
        var at = screen["at"];
        var seen = Application.Storage.getValue(STORAGE_SCREEN_AT);
        if (!(at instanceof Number) || (seen instanceof Number && seen >= at) || !Screen.fromServer(screen)) {
            return false;
        }
        Application.Storage.setValue(STORAGE_SCREEN_AT, at);
        return true;
    }

    //! A downloaded match's fee marked paid or not: shown at once, and sent at the next sync,
    //! replacing an earlier change to the same match that hasn't gone yet.
    function setFeePaid(matchId as String, paid as Boolean) as Void {
        var list = matches();
        for (var i = 0; i < list.size(); i++) {
            var fee = list[i]["fee"];
            if (matchId.equals(list[i]["id"] as String?) && fee instanceof Dictionary) {
                fee["paid"] = paid;
            }
        }
        Application.Storage.setValue(STORAGE_MATCHES, list as Array<Application.Storage.ValueType>);
        History.setFeePaid(matchId, paid);
        var next = [{"matchId" => matchId, "paid" => paid, "at" => Time.now().value()}] as Array<Dictionary>;
        var previous = feeOutbox();
        for (var i = 0; i < previous.size() && next.size() < MAX_MATCHES; i++) {
            if (!matchId.equals(previous[i]["matchId"] as String?)) {
                next.add(previous[i]);
            }
        }
        Application.Storage.setValue(STORAGE_FEES, next as Array<Application.Storage.ValueType>);
    }

    //! Takes a fee change off the outbox once the server has it; a newer change to the same match stays.
    function feeSent(change as Dictionary) as Void {
        var remaining = [] as Array<Dictionary>;
        var previous = feeOutbox();
        for (var i = 0; i < previous.size(); i++) {
            if (!(change["matchId"] as String).equals(previous[i]["matchId"] as String?) || previous[i]["at"] != change["at"]) {
                remaining.add(previous[i]);
            }
        }
        Application.Storage.setValue(STORAGE_FEES, remaining as Array<Application.Storage.ValueType>);
    }

    // ---- Pitch corners (TRK-13, SYNC-12) ----

    function pitchOutbox() as Array<Dictionary> {
        var stored = Application.Storage.getValue(STORAGE_PITCHES);
        return stored instanceof Array ? stored as Array<Dictionary> : [] as Array<Dictionary>;
    }

    //! Whether two markings are for the same match: a planned match's id, else a quick match's start.
    function sameMatch(a as Dictionary, b as Dictionary) as Boolean {
        var id = a["matchId"] as String?;
        if (id != null) {
            return id.equals(b["matchId"] as String?);
        }
        var mine = a["created"] as Number?;
        var theirs = b["created"] as Number?;
        if (b["matchId"] != null || mine == null || theirs == null) {
            return false;
        }
        return mine.equals(theirs);
    }

    //! Corners walked for a match, `target` naming it ({"matchId"} or {"created"}): sent at the next
    //! sync, replacing an earlier marking of the same match that hasn't gone yet.
    function queuePitch(target as Dictionary, corners as Array<Dictionary>) as Void {
        // In millionths of a degree, as tracks are: the request's JSON keeps only six significant figures of a decimal.
        var e6 = [] as Array<Array<Number>>;
        for (var i = 0; i < corners.size(); i++) {
            e6.add([((corners[i]["lat"] as Double) * 1000000).toNumber(), ((corners[i]["lon"] as Double) * 1000000).toNumber()]);
        }
        var marking = {"corners" => e6, "at" => Time.now().value()} as Dictionary;
        if (target["matchId"] != null) {
            marking["matchId"] = target["matchId"];
        } else {
            marking["created"] = target["created"];
        }
        var next = [marking] as Array<Dictionary>;
        var previous = pitchOutbox();
        for (var i = 0; i < previous.size() && next.size() < MAX_OUTBOX; i++) {
            if (!sameMatch(marking, previous[i])) {
                next.add(previous[i]);
            }
        }
        Application.Storage.setValue(STORAGE_PITCHES, next as Array<Application.Storage.ValueType>);
    }

    //! How many corners are waiting to be sent for a match, or 0.
    function pitchQueued(target as Dictionary) as Number {
        var queued = pitchOutbox();
        for (var i = 0; i < queued.size(); i++) {
            if (sameMatch(target, queued[i])) {
                return (queued[i]["corners"] as Array).size();
            }
        }
        return 0;
    }

    function pitchSent(marking as Dictionary) as Void {
        var remaining = [] as Array<Dictionary>;
        var previous = pitchOutbox();
        for (var i = 0; i < previous.size(); i++) {
            if (!sameMatch(marking, previous[i]) || previous[i]["at"] != marking["at"]) {
                remaining.add(previous[i]);
            }
        }
        Application.Storage.setValue(STORAGE_PITCHES, remaining as Array<Application.Storage.ValueType>);
    }

    //! SYNC-4, TRK-7: whether an error answer is LawFive's own, which always says what's wrong as JSON
    //! with an "error", rather than a proxy's (Traefik answers 404 while a server restarts, R-19).
    //! Only LawFive's own refusal drops what was being sent; anything else waits for the next sync.
    function fromServer(data as Dictionary or String or Null) as Boolean {
        return data instanceof Dictionary && data.hasKey("error");
    }

    //! Takes a match off the outbox once the server has it.
    function sent(created as Number) as Void {
        var remaining = [] as Array<Dictionary>;
        var previous = outbox();
        for (var i = 0; i < previous.size(); i++) {
            if (previous[i]["created"] != created) {
                remaining.add(previous[i]);
            }
        }
        Application.Storage.setValue(STORAGE_OUTBOX, remaining as Array<Application.Storage.ValueType>);
    }

    //! A finished match as the server takes it (POST /v1/watch/records): what the watch saved,
    //! plus the planned match's id when it came from a sync.
    function uploadFor(match as Match) as Dictionary {
        var distance = match.distanceM;
        var reasons = match.cardReasons();
        return {
            "created" => match.created,
            "matchId" => match.details["id"],
            "device" => System.getDeviceSettings().partNumber,
            "home" => match.home,
            "away" => match.away,
            "homeName" => match.homeName,
            "awayName" => match.awayName,
            "homeColor" => match.homeColor,
            "awayColor" => match.awayColor,
            "numPeriods" => match.numPeriods,
            "periodSec" => match.periodSec,
            "halftimeSec" => match.halftimeSec,
            "teamSize" => match.teamSize,
            "breakAtSec" => match.breakAtSec,
            "breakLenSec" => match.breakLenSec,
            "extraTime" => match.extraTime,
            "etPeriods" => match.etPeriods,
            "etPeriodSec" => match.etPeriodSec,
            "goldenGoal" => match.goldenGoal,
            "penalties" => match.penalties,
            // EVT-12.
            "sinBins" => match.sinBins,
            "sinBinSec" => match.sinBinSec,
            "clockStyle" => match.clockStyle,
            "trackStoppage" => match.trackStoppage,
            // TMR-15: every event's seconds are the clock's, which stood still during the stoppages.
            "stoppingClock" => match.stoppingClock,
            "stopForGoalsCards" => match.stopForGoalsCards,
            "breakStoppage" => match.breakStoppage,
            "goalScorers" => match.goalScorers,
            "goalTypes" => match.goalTypes,
            "score" => match.score,
            "pens" => match.penaltyScore(),
            "golden" => match.endedGolden,
            "distanceM" => distance != null ? distance.toNumber() : null,
            "startedAt" => match.startedAt,
            // PRE-8, for heatmaps (TRK-9): the first period's kickoff team and where home attacked.
            "kickoff" => match.kickoff,
            "homeHeading" => match.homeHeading,
            "events" => match.uploadEvents(),
            // EVT-14: beside the events, so a server from before it still takes the match.
            "misconduct" => reasons.size() > 0 ? {"scheme" => match.reasonScheme, "codes" => reasons} : null,
            "diagnostics" => match.diagnostics()
        };
    }

    // ---- Downloaded matches (SYNC-3) ----

    //! A downloaded match as a setup to start: its teams and format, with this watch's alerts and
    //! timer names. Its id goes in the details, so the finished match is linked to it.
    function setupFor(synced as Dictionary) as MatchData {
        var setup = Settings.matchSetup(false);
        // EVT-12: a server from before sin bins sends neither: off, and 10 minutes.
        setup["sinBins"] = false;
        setup["sinBinSec"] = 600;
        // TMR-15: nor a stopping clock: it runs on.
        setup["stoppingClock"] = false;
        setup["stopForGoalsCards"] = true;
        // EVT-14: the match's codes (its competition's, else the account's); a server from before them sends none.
        if (synced["misconductScheme"] instanceof String) {
            setup["misconductScheme"] = synced["misconductScheme"] as String;
        }
        var keys = ["home", "away", "homeName", "awayName", "homeColor", "awayColor"] as Array<String>;
        keys.addAll(Settings.FORMAT_KEYS);
        for (var i = 0; i < keys.size(); i++) {
            var value = synced[keys[i]];
            if (value != null) {
                setup[keys[i]] = value as Application.PropertyValueType;
            }
        }
        // UI-20: the fee goes with the match, so History can mark it paid after the game.
        var fee = synced["fee"];
        setup["details"] = (fee instanceof Dictionary
            ? {"id" => synced["id"] as String, "fee" => {"text" => fee["text"] as String, "paid" => fee["paid"] as Boolean}}
            : {"id" => synced["id"] as String}) as MatchData;
        return setup;
    }

    //! The start-menu line for a downloaded match: "STR v ROV" and "Sat 9:00 · 54° rain · Twin Creeks"
    //! (the forecast, WX-7, when the server has one).
    function describe(synced as Dictionary) as [String, String] {
        var parts = [] as Array<String>;
        var kickoff = kickoffText(synced);
        if (kickoff != null) {
            parts.add(kickoff);
        }
        var weather = synced["weather"];
        if (weather instanceof String) {
            parts.add(weather);
        }
        var where = synced["where"];
        if (where instanceof String) {
            parts.add(where);
        }
        var sub = "";
        for (var i = 0; i < parts.size(); i++) {
            sub += (i > 0 ? " · " : "") + parts[i];
        }
        return [stringOr(synced["title"] as String?, "Match"), sub];
    }

    //! A downloaded match's kickoff, "Sat 9:00", or null when it has none.
    function kickoffText(synced as Dictionary) as String? {
        var kickoff = synced["kickoff"];
        if (!(kickoff instanceof Number)) {
            return null;
        }
        var info = Gregorian.info(new Time.Moment(kickoff), Time.FORMAT_MEDIUM);
        return info.day_of_week + " " + clockTime(info.hour, info.min);
    }

    function isRunning() as Boolean {
        return _job != null;
    }

    //! UI-26: matches or tracks are going, or went without the screen getting a chance to say so,
    //! and it hasn't come up for this sync yet.
    function wantsScreen() as Boolean {
        return !_screenShown && stepsTotal > 0 && (_job != null || lastProblem == null);
    }

    function screenShown() as Void {
        _screenShown = true;
    }

    //! One step of a sync's uploads, for the menus' sub-label and the sync screen.
    function step(label as String, number as Number, total as Number, done as Number, allSteps as Number) as Void {
        stepLabel = label;
        stepCount = number + " of " + total;
        stepsDone = done;
        stepsTotal = allSteps;
        progress = label + " " + stepCount + "…";
    }

    function progressText() as String {
        var step = progress;
        return step != null ? step : "Syncing…";
    }

    function isQueued(created as Number) as Boolean {
        var queued = outbox();
        for (var i = 0; i < queued.size(); i++) {
            if (queued[i]["created"] == created) {
                return true;
            }
        }
        return false;
    }

    //! "synced 8:42" (or the day), or the last problem: for the start menu's Matches row.
    function shortStatus() as String {
        var problem = lastProblem;
        if (problem != null) {
            return problem;
        }
        var last = lastSync();
        if (last == null) {
            return "not synced yet";
        }
        var info = Gregorian.info(new Time.Moment(last), Time.FORMAT_MEDIUM);
        var today = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        return "synced " + (info.day == today.day && info.month.equals(today.month) ? clockTime(info.hour, info.min) : info.day_of_week);
    }

    //! For the full-time screen: "Sent to LawFive", "Waiting for phone" while queued, or null when
    //! not linked.
    function uploadState(created as Number) as String? {
        if (!isLinked()) {
            return null;
        }
        var queued = outbox();
        for (var i = 0; i < queued.size(); i++) {
            if (queued[i]["created"] == created) {
                return _job != null ? progressText() : "Uploads when phone is near";
            }
        }
        // TRK-7: the track follows the match, a chunk at a time.
        if (TrackLog.isQueued(created)) {
            return _job != null ? progressText() : "Track uploads when phone is near";
        }
        return "Sent to LawFive";
    }

    //! "14:00", or "2:00 PM" on a watch set to 12-hour time.
    function clockTime(hour as Number, minute as Number) as String {
        var mm = minute.format("%02d");
        if (System.getDeviceSettings().is24Hour) {
            return hour.format("%d") + ":" + mm;
        }
        var h12 = hour % 12 == 0 ? 12 : hour % 12;
        return h12.format("%d") + ":" + mm + (hour < 12 ? " AM" : " PM");
    }

    //! "Synced 5 min ago", "Not synced yet", or the last problem.
    function status() as String {
        var problem = lastProblem;
        if (problem != null) {
            return problem;
        }
        var last = lastSync();
        if (last == null) {
            return "Not synced yet";
        }
        var minutes = (Time.now().value() - last) / 60;
        if (minutes < 2) {
            return "Synced just now";
        } else if (minutes < 60) {
            return "Synced " + minutes + " min ago";
        } else if (minutes < 48 * 60) {
            return "Synced " + (minutes / 60) + " h ago";
        }
        return "Synced " + (minutes / 1440) + " days ago";
    }

    //! What a failed request means for the person holding the watch.
    function problemFor(code as Number) as String {
        if (code == Communications.BLE_CONNECTION_UNAVAILABLE || code == Communications.BLE_HOST_TIMEOUT || code == Communications.BLE_SERVER_TIMEOUT) {
            return "Phone not connected";
        } else if (code == Communications.NETWORK_REQUEST_TIMED_OUT || code < 0) {
            return "Couldn't reach server";
        }
        return "Server error " + code;
    }

    // ---- Running a sync (SYNC-3, SYNC-4) ----

    //! Uploads the outbox, then downloads the next matches. `done` is called with true when it
    //! all worked. Does nothing if not linked or a sync is already running.
    function run(done as Method(ok as Boolean) as Void or Null) as Void {
        sendSignOuts();
        if (!isLinked() || _job != null) {
            return;
        }
        var job = new SyncJob(done);
        _job = job;
        _screenShown = false;
        stepsDone = 0;
        stepsTotal = 0;
        matchesSentLast = 0;
        job.start();
    }

    function finished(ok as Boolean, problem as String?) as Void {
        _job = null;
        progress = null;
        lastProblem = problem;
        if (ok) {
            Application.Storage.setValue(STORAGE_LAST_SYNC, Time.now().value());
        }
    }
}

//! One sync: each queued match up, then the next matches down, one request at a time.
class SyncJob {
    private var _done as Method(ok as Boolean) as Void or Null;
    private var _fee as Dictionary? = null;
    private var _pitch as Dictionary? = null;
    private var _sending as Number? = null;
    private var _track as Array<Number>? = null;
    // UI-16: how far through the matches and track chunks this sync is.
    private var _matchesTotal as Number = 0;
    private var _matchesSent as Number = 0;
    private var _chunksTotal as Number = 0;
    private var _chunksSent as Number = 0;

    function initialize(done as Method(ok as Boolean) as Void or Null) {
        _done = done;
    }

    function start() as Void {
        _matchesTotal = Sync.outbox().size();
        // UI-26: the whole way, so the ring only ever goes forward.
        var tracks = TrackLog.outbox();
        _chunksTotal = 0;
        for (var i = 0; i < tracks.size(); i++) {
            _chunksTotal += tracks[i][2] - tracks[i][3];
        }
        Sync.stepsTotal = _matchesTotal + _chunksTotal;
        uploadNext();
    }

    private function uploadNext() as Void {
        var queued = Sync.outbox();
        if (queued.size() == 0) {
            uploadTrack();
            return;
        }
        // Oldest first.
        var upload = queued[queued.size() - 1];
        _sending = upload["created"] as Number;
        Sync.step("Sending match", _matchesSent + 1, _matchesTotal > _matchesSent ? _matchesTotal : _matchesSent + 1, _matchesSent + _chunksSent, _matchesTotal + _chunksTotal);
        Phone.request("POST", "/v1/watch/records", upload, method(:onUploaded));
    }

    function onUploaded(code as Number, data as Dictionary or String or Null) as Void {
        // APP-7: Phone.KEPT is the phone app keeping it for when it has signal: sent, as far as the watch goes.
        if (code == 200 || code == 201 || code == Phone.KEPT) {
            Sync.sent(_sending as Number);
            History.markSent(_sending as Number);
            _matchesSent += 1;
            Sync.matchesSentLast = _matchesSent;
            uploadNext();
        } else if (code == 400 && Sync.fromServer(data)) {
            // The server can't take this one; dropping it lets the others through.
            Sync.sent(_sending as Number);
            uploadNext();
        } else {
            fail(code);
        }
    }

    //! TRK-7: the tracks of uploaded matches, a chunk a request, oldest first.
    private function uploadTrack() as Void {
        var entry = TrackLog.nextUpload();
        if (entry == null) {
            sendFee();
            return;
        }
        _track = entry;
        Sync.step("Sending track", _chunksSent + 1, _chunksTotal, _matchesSent + _chunksSent, _matchesTotal + _chunksTotal);
        var upload = TrackLog.uploadFor(entry);
        if (upload == null) {
            // The chunk is missing from storage: skip it.
            TrackLog.sent(entry[0], entry[3]);
            uploadTrack();
            return;
        }
        Phone.request("POST", "/v1/watch/tracks", upload, method(:onTrackSent));
    }

    function onTrackSent(code as Number, data as Dictionary or String or Null) as Void {
        var entry = _track as Array<Number>;
        if (code == 200 || code == 201 || code == Phone.KEPT || (code == 400 && Sync.fromServer(data))) {
            // Sent (or kept on the phone), or a chunk the server can't take: either way, on to the next.
            TrackLog.sent(entry[0], entry[3]);
            _chunksSent += 1;
            uploadTrack();
        } else if (code == 404 && Sync.fromServer(data)) {
            // A server from before TRK-7, or the match was deleted: the track has nowhere to go.
            TrackLog.drop(entry[0]);
            uploadTrack();
        } else {
            fail(code);
        }
    }

    //! SYNC-11: fees marked paid on the watch, oldest first, before the matches come down (so
    //! they come down with the change).
    private function sendFee() as Void {
        var queued = Sync.feeOutbox();
        if (queued.size() == 0) {
            sendScreen();
            return;
        }
        var change = queued[queued.size() - 1];
        _fee = change;
        Sync.progress = "Sending fee…";
        Phone.request("POST", "/v1/watch/fee", change, method(:onFeeSent));
    }

    function onFeeSent(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 || code == Phone.KEPT || code == 400 || code == 404) {
            // Done (or kept on the phone), or one the server can't take (the match has gone, or a server from before it): on to the next.
            Sync.feeSent(_fee as Dictionary);
            sendFee();
        } else {
            fail(code);
        }
    }

    //! UI-24: the match screen chosen on the watch, before the matches come down with the account's.
    private function sendScreen() as Void {
        var change = Sync.screenChange();
        if (change == null) {
            sendPitch();
            return;
        }
        Phone.request("POST", "/v1/watch/screen", change, method(:onScreenSent));
    }

    function onScreenSent(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 || code == Phone.KEPT || code == 400 || code == 404) {
            // Done (or kept on the phone), or one the server can't take (a server from before it).
            Application.Storage.deleteValue(Sync.STORAGE_SCREEN_CHANGE);
            sendPitch();
        } else {
            fail(code);
        }
    }

    //! SYNC-12: pitch corners, oldest first, once the matches they're for are up (a quick match's
    //! still waiting to go stays for the next sync).
    private function sendPitch() as Void {
        var queued = Sync.pitchOutbox();
        var marking = null;
        for (var i = queued.size() - 1; i >= 0; i--) {
            var created = queued[i]["created"];
            if (!(created instanceof Number && Sync.isQueued(created))) {
                marking = queued[i];
                break;
            }
        }
        if (marking == null) {
            download();
            return;
        }
        _pitch = marking;
        Sync.progress = "Sending pitch…";
        Phone.request("POST", "/v1/watch/pitch", marking, method(:onPitchSent));
    }

    function onPitchSent(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 || code == Phone.KEPT || code == 400 || code == 404) {
            // Kept (here or on the phone), or one the server can't take (the match has gone, or a server from before it).
            Sync.pitchSent(_pitch as Dictionary);
            sendPitch();
        } else {
            fail(code);
        }
    }

    private function download() as Void {
        Sync.progress = "Getting matches…";
        Phone.request("GET", "/v1/watch/matches", {"limit" => Sync.MAX_MATCHES}, method(:onMatches));
    }

    function onMatches(code as Number, data as Dictionary or String or Null) as Void {
        if (code == 200 && data instanceof Dictionary && data["matches"] instanceof Array) {
            Application.Storage.setValue(Sync.STORAGE_MATCHES, data["matches"] as Array<Application.Storage.ValueType>);
            if (data["serverVersion"] instanceof String) {
                Application.Storage.setValue(Sync.STORAGE_SERVER_VERSION, data["serverVersion"] as String);
            }
            var screen = data["screen"];
            if (screen instanceof Dictionary) {
                Sync.applyScreen(screen);
            }
            if (data["teamSwipes"] instanceof String) {
                Application.Storage.setValue(Sync.STORAGE_TEAM_SWIPES, data["teamSwipes"] as String);
            }
            if (data["misconductScheme"] instanceof String) {
                Application.Storage.setValue(Sync.STORAGE_SCHEME, data["misconductScheme"] as String);
            }
            finish(true, null);
        } else {
            fail(code);
        }
    }

    private function fail(code as Number) as Void {
        if (code == 401) {
            // SYNC-6: unlinked on the website (or the session ran out).
            Sync.unlink();
            finish(false, "Unlinked; link again");
        } else {
            finish(false, Sync.problemFor(code));
        }
    }

    private function finish(ok as Boolean, problem as String?) as Void {
        Sync.finished(ok, problem);
        var done = _done;
        if (done != null) {
            done.invoke(ok);
        }
        WatchUi.requestUpdate();
    }
}
