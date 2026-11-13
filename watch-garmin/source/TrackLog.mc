import Toybox.Activity;
import Toybox.Application;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;

//! TRK-7: the referee's GPS and heart rate about once a second during the periods, uploaded to
//! LawFive after the match. The activity recording has the same data, but an app can't read it
//! back, so the app keeps its own copy.
//!
//! Samples are packed as text, a chunk of up to CHUNK_SAMPLES in each storage value (well under
//! the 32 KB a value may hold), so a match fits in about 100 KB. Each sample is
//! "dt,dlat,dlon,speed,hr;" (fields left empty when unknown, trailing commas dropped):
//!   dt     tenths of a second since the sample before (empty for exactly one second); the first
//!          sample of a chunk counts from the track's start;
//!   dlat, dlon  millionths of a degree moved since the chunk's previous position (the first
//!          position of a chunk is whole); empty when there was no new GPS fix;
//!   speed  the speed the watch measured, in cm/s;
//!   hr     beats a minute.
//! Chunks decode on their own; the server puts them back together (server/src/watchTrack.ts).
module TrackLog {
    const STORAGE_STATE = "trackState";   // [created, startSec, chunks, samples in buffer, buffer, last tDs, last lat, last lon, full]
    const STORAGE_OUTBOX = "trackOutbox"; // tracks waiting to upload: [created, startSec, chunks, next chunk to send]
    const CHUNK_SAMPLES = 300;            // five minutes, about 4 KB
    const MAX_TRACKS = 3;                 // tracks kept for upload; the oldest are dropped beyond this
    const SAVE_EVERY = 30;                // samples between saves of the chunk being filled

    var _created as Number? = null;
    var _startSec as Number = 0;
    var _chunks as Number = 0;
    var _count as Number = 0;
    var _buf as String = "";
    var _lastTDs as Number = 0;
    var _lastLat as Number? = null;
    var _lastLon as Number? = null;
    var _lastFix as Number = -1;
    //! The watch's storage was full: recording stopped, keeping what it had.
    var _full as Boolean = false;

    function chunkKey(created as Number, index as Number) as String {
        return "trk" + created + "_" + index;
    }

    //! Starts the track for a match at its kickoff.
    function begin(created as Number, nowMs as Long) as Void {
        if (_created == created || resume(created)) {
            return;
        }
        _created = created;
        _startSec = (nowMs / 1000).toNumber();
        _chunks = 0;
        _full = false;
        newChunk();
        save();
    }

    //! Picks up the track of a match in progress after the app was restarted (TMR-8).
    function resume(created as Number) as Boolean {
        if (_created == created) {
            return true;
        }
        var state = Application.Storage.getValue(STORAGE_STATE);
        if (!(state instanceof Array) || state.size() < 9 || !(state[0] instanceof Number) || (state[0] as Number) != created) {
            return false;
        }
        _created = created;
        _startSec = state[1] as Number;
        _chunks = state[2] as Number;
        _count = state[3] as Number;
        _buf = state[4] as String;
        _lastTDs = state[5] as Number;
        _lastLat = state[6] as Number?;
        _lastLon = state[7] as Number?;
        _full = state[8] as Boolean;
        _lastFix = -1;
        return true;
    }

    function isRecording(created as Number) as Boolean {
        return _created == created;
    }

    //! Once a second while a period is being played: the latest fix (if new) and heart rate.
    //! Whether it had a GPS fix, for the match's diagnostics (DIAG-1); null when it took no sample.
    function sample(created as Number, nowMs as Long) as Boolean? {
        if (!resume(created) || _full) {
            return null;
        }
        var lat = null;
        var lon = null;
        var speed = null;
        var info = Position.getInfo();
        var when = info.when;
        var fix = when != null ? when.value() : -1;
        if (info.accuracy >= Position.QUALITY_POOR && info.position != null && fix != _lastFix) {
            var degrees = (info.position as Position.Location).toDegrees();
            lat = (degrees[0] * 1000000).toNumber();
            lon = (degrees[1] * 1000000).toNumber();
            var mps = info.speed;
            speed = mps != null ? (mps * 100).toNumber() : null;
            _lastFix = fix;
        }
        var hr = null;
        if (Toybox has :Activity) {
            var activity = Activity.getActivityInfo();
            if (activity != null) {
                hr = activity.currentHeartRate;
            }
        }
        add(nowMs, lat, lon, speed, hr);
        return lat != null;
    }

    //! Adds one sample: positions in millionths of a degree, speed in cm/s.
    function add(nowMs as Long, lat as Number?, lon as Number?, speed as Number?, hr as Number?) as Void {
        if (lat == null && hr == null) {
            return;
        }
        var tDs = ((nowMs - _startSec * 1000l) / 100).toNumber();
        if (tDs <= _lastTDs && _count > 0) {
            return;
        }
        _buf += encode(tDs - _lastTDs, lat, lon, _lastLat, _lastLon, speed, hr);
        _lastTDs = tDs;
        if (lat != null) {
            _lastLat = lat;
            _lastLon = lon;
        }
        _count += 1;
        if (_count >= CHUNK_SAMPLES) {
            writeChunk();
        } else if (_count % SAVE_EVERY == 0) {
            save();
        }
    }

    //! One sample as text, "dt,dlat,dlon,speed,hr;", without trailing empty fields.
    function encode(dt as Number, lat as Number?, lon as Number?, lastLat as Number?, lastLon as Number?, speed as Number?, hr as Number?) as String {
        var fields = [dt == 10 ? "" : dt.toString(), "", "", "", ""] as Array<String>;
        if (lat != null && lon != null) {
            fields[1] = (lastLat != null ? lat - lastLat : lat).toString();
            fields[2] = (lastLon != null ? lon - lastLon : lon).toString();
            if (speed != null) {
                fields[3] = speed.toString();
            }
        }
        if (hr != null) {
            fields[4] = hr.toString();
        }
        var last = 4;
        while (last > 0 && fields[last].length() == 0) {
            last -= 1;
        }
        var text = fields[0];
        for (var i = 1; i <= last; i++) {
            text += "," + fields[i];
        }
        return text + ";";
    }

    //! Stores the chunk being filled and starts the next.
    function writeChunk() as Void {
        var created = _created;
        if (created == null || _count == 0) {
            return;
        }
        try {
            Application.Storage.setValue(chunkKey(created, _chunks), _buf);
            _chunks += 1;
            newChunk();
        } catch (e instanceof Lang.StorageFullException) {
            // Keep the chunks already stored; the rest of the match goes unrecorded.
            _full = true;
        }
        save();
    }

    function newChunk() as Void {
        _buf = "";
        _count = 0;
        _lastTDs = 0;
        _lastLat = null;
        _lastLon = null;
    }

    //! Saves the chunk being filled, so closing the app loses nothing.
    function save() as Void {
        var created = _created;
        if (created == null) {
            return;
        }
        try {
            Application.Storage.setValue(STORAGE_STATE, [created, _startSec, _chunks, _count, _buf, _lastTDs, _lastLat, _lastLon, _full]
                as Array<Application.Storage.ValueType>);
        } catch (e instanceof Lang.StorageFullException) {
            _full = true;
        }
    }

    //! Full time: the last chunk is stored and the track queued for upload: straight away when
    //! linked, else when the watch is linked (SYNC-4). Only the last MAX_TRACKS wait.
    function finish(created as Number) as Void {
        if (!resume(created)) {
            return;
        }
        writeChunk();
        var chunks = _chunks;
        var startSec = _startSec;
        clear();
        if (chunks > 0) {
            queue([created, startSec, chunks, 0]);
        }
    }

    //! PRE-6 and Cancel match: the track so far goes too.
    function discard(created as Number) as Void {
        if (!resume(created)) {
            return;
        }
        deleteChunks(created, 0, _chunks);
        clear();
    }

    function clear() as Void {
        _created = null;
        _chunks = 0;
        _full = false;
        newChunk();
        Application.Storage.deleteValue(STORAGE_STATE);
    }

    function deleteChunks(created as Number, from as Number, to as Number) as Void {
        for (var i = from; i < to; i++) {
            Application.Storage.deleteValue(chunkKey(created, i));
        }
    }

    // ---- Upload (SYNC-4) ----

    function outbox() as Array<Array<Number>> {
        var stored = Application.Storage.getValue(STORAGE_OUTBOX);
        return stored instanceof Array ? stored as Array<Array<Number>> : [] as Array<Array<Number>>;
    }

    //! Newest first, as the match outbox; beyond MAX_TRACKS the oldest are dropped with their chunks.
    function queue(entry as Array<Number>) as Void {
        var next = [entry] as Array<Array<Number>>;
        var previous = outbox();
        for (var i = 0; i < previous.size(); i++) {
            var old = previous[i];
            if (old[0] == entry[0]) {
                continue;
            } else if (next.size() < MAX_TRACKS) {
                next.add(old);
            } else {
                deleteChunks(old[0], old[3], old[2]);
            }
        }
        Application.Storage.setValue(STORAGE_OUTBOX, next as Array<Application.Storage.ValueType>);
    }

    //! The next chunk to upload, oldest track first: [created, startSec, chunks, index], or null.
    function nextUpload() as Array<Number>? {
        var queued = outbox();
        return queued.size() > 0 ? queued[queued.size() - 1] : null;
    }

    //! The server has a chunk (or can't take it): it's deleted, and the track leaves the outbox
    //! after its last chunk.
    function sent(created as Number, index as Number) as Void {
        Application.Storage.deleteValue(chunkKey(created, index));
        var remaining = [] as Array<Array<Number>>;
        var previous = outbox();
        for (var i = 0; i < previous.size(); i++) {
            var entry = previous[i];
            if (entry[0] == created) {
                if (index + 1 >= entry[2]) {
                    continue;
                }
                entry = [entry[0], entry[1], entry[2], index + 1];
            }
            remaining.add(entry);
        }
        Application.Storage.setValue(STORAGE_OUTBOX, remaining as Array<Application.Storage.ValueType>);
    }

    //! Drops a whole track from the outbox, for a server that doesn't take tracks.
    function drop(created as Number) as Void {
        var remaining = [] as Array<Array<Number>>;
        var previous = outbox();
        for (var i = 0; i < previous.size(); i++) {
            var entry = previous[i];
            if (entry[0] == created) {
                deleteChunks(created, entry[3], entry[2]);
            } else {
                remaining.add(entry);
            }
        }
        Application.Storage.setValue(STORAGE_OUTBOX, remaining as Array<Application.Storage.ValueType>);
    }

    function isQueued(created as Number) as Boolean {
        var queued = outbox();
        for (var i = 0; i < queued.size(); i++) {
            if (queued[i][0] == created) {
                return true;
            }
        }
        return false;
    }

    //! A queued chunk as the server takes it (POST /v1/watch/tracks).
    function uploadFor(entry as Array<Number>) as Dictionary? {
        var data = Application.Storage.getValue(chunkKey(entry[0], entry[3]));
        if (!(data instanceof String)) {
            return null;
        }
        return {
            "created" => entry[0],
            "start" => entry[1],
            "index" => entry[3],
            "count" => entry[2],
            "device" => System.getDeviceSettings().partNumber,
            "data" => data
        };
    }
}
