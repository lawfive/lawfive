import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

//! Finished matches kept on the watch (DATA-1, DATA-3, UI-17), newest first. Each is the match as
//! it's uploaded (Sync.uploadFor), so one that hasn't reached LawFive can be sent from History,
//! plus what History shows: when it was sent and whether it had a track.
module History {
    const STORAGE_KEY = "history";
    const MAX_MATCHES = 10;

    //! The match a Remove from watch confirmation is for.
    var pendingRemoval as Number? = null;

    function all() as Array<Dictionary> {
        var stored = Application.Storage.getValue(STORAGE_KEY);
        return stored instanceof Array ? stored as Array<Dictionary> : [] as Array<Dictionary>;
    }

    function find(created as Number) as Dictionary? {
        var matches = all();
        for (var i = 0; i < matches.size(); i++) {
            if (matches[i]["created"] == created) {
                return matches[i];
            }
        }
        return null;
    }

    function add(match as Match) as Void {
        var matches = [entryFor(match, null)] as Array<Dictionary>;
        var previous = all();
        for (var i = 0; i < previous.size() && matches.size() < MAX_MATCHES; i++) {
            matches.add(previous[i]);
        }
        save(matches);
    }

    //! Replaces the saved record of a finished match, e.g. after a card given after full time (EVT-7).
    function update(match as Match) as Void {
        var matches = all();
        for (var i = 0; i < matches.size(); i++) {
            if (matches[i]["created"] == match.created) {
                matches[i] = entryFor(match, matches[i]);
                save(matches);
                return;
            }
        }
    }

    function entryFor(match as Match, previous as Dictionary?) as Dictionary {
        var entry = Sync.uploadFor(match);
        // The details as History holds them: a fee marked paid since (UI-20) stays marked.
        entry["details"] = previous != null && previous["details"] instanceof Dictionary ? previous["details"] : match.details;
        entry["stoppageLabel"] = match.stoppageLabel;
        entry["periodStarts"] = match.periodStarts();
        // TRK-7: whether it had a track for LawFive, which stays known once the track has gone.
        entry["track"] = TrackLog.isQueued(match.created) || (previous != null && previous["track"] == true);
        if (previous != null && previous["sentAt"] != null) {
            entry["sentAt"] = previous["sentAt"];
        }
        return entry;
    }

    //! UI-20: a planned match's fee marked paid or not, on its finished matches.
    function setFeePaid(matchId as String, paid as Boolean) as Void {
        var matches = all();
        var changed = false;
        for (var i = 0; i < matches.size(); i++) {
            var details = matches[i]["details"];
            if (details instanceof Dictionary && matchId.equals(details["id"] as String?) && details["fee"] instanceof Dictionary) {
                var fee = details["fee"] as Dictionary;
                fee["paid"] = paid;
                changed = true;
            }
        }
        if (changed) {
            save(matches);
        }
    }

    //! The server has the match.
    function markSent(created as Number) as Void {
        var matches = all();
        for (var i = 0; i < matches.size(); i++) {
            if (matches[i]["created"] == created) {
                matches[i]["sentAt"] = Time.now().value();
                save(matches);
                return;
            }
        }
    }

    //! Off the watch, with anything still waiting to upload for it.
    function remove(created as Number) as Void {
        var kept = [] as Array<Dictionary>;
        var matches = all();
        for (var i = 0; i < matches.size(); i++) {
            if (matches[i]["created"] != created) {
                kept.add(matches[i]);
            }
        }
        save(kept);
        Sync.sent(created);
        TrackLog.drop(created);
    }

    function isSent(entry as Dictionary) as Boolean {
        return entry["sentAt"] instanceof Number ? true : false;
    }

    //! The match to upload, or null for one kept before History held the whole match.
    function uploadOf(entry as Dictionary) as Dictionary? {
        return entry["periodSec"] instanceof Number ? entry : null;
    }

    //! "STR 3-2 ROV", with the shoot-out when there was one, or "(GG)" after a golden goal (ET-6): short, as
    //! the list is narrow.
    function title(entry as Dictionary) as String {
        var score = entry["score"] as Array<Number>;
        var text = (entry["home"] as String) + " " + score[0].format("%d") + "-" + score[1].format("%d") + " " + (entry["away"] as String);
        var pens = entry["pens"];
        var golden = entry["golden"];
        if (pens instanceof Array) {
            text += " (" + (pens[0] as Number).format("%d") + "-" + (pens[1] as Number).format("%d") + " p)";
        } else if (golden instanceof Boolean && golden) {
            text += " (GG)";
        }
        return text;
    }

    //! "Sat 24 Oct".
    function when(entry as Dictionary) as String {
        var info = Gregorian.info(new Time.Moment(entry["created"] as Number), Time.FORMAT_MEDIUM);
        return info.day_of_week + " " + info.day.format("%d") + " " + info.month;
    }

    //! Whether it's on LawFive, as the History list says it.
    function stateShort(entry as Dictionary) as String {
        var created = entry["created"] as Number;
        if (Sync.isQueued(created)) {
            return "Waiting to send";
        } else if (isSent(entry)) {
            return "Sent";
        }
        return uploadOf(entry) == null ? "On watch" : "Not sent";
    }

    //! The status row of a match's menu: what it is, and what pressing it does or when it was sent.
    function state(entry as Dictionary) as [String, String] {
        var created = entry["created"] as Number;
        if (Sync.isQueued(created)) {
            return ["Waiting to send", Sync.isLinked() ? "Press to send now" : "Link to send"];
        } else if (isSent(entry)) {
            var info = Gregorian.info(new Time.Moment(entry["sentAt"] as Number), Time.FORMAT_MEDIUM);
            var sub = info.day_of_week + " " + Sync.clockTime(info.hour, info.min);
            var track = trackState(entry);
            return ["Sent to LawFive", track != null ? sub + " · " + track : sub];
        } else if (uploadOf(entry) == null) {
            return ["On this watch", "Kept by an older version"];
        }
        return Sync.isLinked() ? ["Not on LawFive", "Press to send"] : ["On this watch only", "Link to send it"];
    }

    //! "track 3 of 18 sent" while it goes, "track sent" after; null without one.
    function trackState(entry as Dictionary) as String? {
        var queued = TrackLog.outbox();
        for (var i = 0; i < queued.size(); i++) {
            if (queued[i][0] == entry["created"]) {
                return "track " + queued[i][3].format("%d") + " of " + queued[i][2].format("%d") + " sent";
            }
        }
        return entry["track"] == true ? "track sent" : null;
    }

    function save(matches as Array<Dictionary>) as Void {
        Application.Storage.setValue(STORAGE_KEY, matches as Array<Application.Storage.ValueType>);
    }
}
