import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;

//! For trying a sync without refereeing a game (tools/device/install.sh --test-matches; never in a
//! normal build): once, on a linked watch, puts two finished matches with tracks in the upload queue,
//! so they go the way a real match's do, through the phone app when it's there. Tracks are made a
//! little each second, as the watch stops an app that works too long at once.
module TestMatches {
    const STORAGE_DONE = "testMatchesLoaded";
    const SAMPLES_PER_TICK = 100;

    var _queue as Array<Dictionary>? = null;
    var _match as Number = 0;
    var _chunk as Number = 0;
    var _sample as Number = 0;
    var _buf as String = "";
    var _lastLat as Number? = null;
    var _lastLon as Number? = null;

    function start() as Void {
        if (Application.Storage.getValue(STORAGE_DONE) != null || !Sync.isLinked()) {
            return;
        }
        var now = Time.now().value();
        _queue = [
            match(now - 2 * 86400, "TEST", "City Test", "DEMO", "Rovers Demo", 2700, 900, [2, 1], 0xC8102E, 0x1565C0, 18),
            match(now - 86400, "DEMO", "Demo United", "TRY", "Try Out FC", 1800, 300, [0, 3], 0x2E7D32, 0xF9A825, 12)
        ] as Array<Dictionary>;
    }

    function match(created as Number, home as String, homeName as String, away as String, awayName as String,
            periodSec as Number, halftimeSec as Number, score as Array<Number>, homeColor as Number, awayColor as Number,
            chunks as Number) as Dictionary {
        var first = created + 60;
        return {
            "created" => created,
            "device" => System.getDeviceSettings().partNumber,
            "home" => home, "away" => away, "homeName" => homeName, "awayName" => awayName,
            "homeColor" => homeColor, "awayColor" => awayColor,
            "numPeriods" => 2, "periodSec" => periodSec, "halftimeSec" => halftimeSec, "teamSize" => 11,
            "breakAtSec" => -1, "breakLenSec" => 0, "extraTime" => false, "etPeriods" => 2, "etPeriodSec" => 900,
            "penalties" => false, "clockStyle" => 0, "trackStoppage" => true, "goalScorers" => true, "goalTypes" => false,
            "score" => score, "pens" => null, "distanceM" => chunks * 480,
            "startedAt" => [first, first + periodSec + halftimeSec],
            "kickoff" => 0, "homeHeading" => null,
            "events" => events(periodSec, score),
            "chunks" => chunks
        };
    }

    function events(periodSec as Number, score as Array<Number>) as Array {
        var list = [] as Array;
        var at = 300;
        for (var team = 0; team < 2; team++) {
            for (var i = 0; i < score[team]; i++) {
                list.add(["G", team, at < periodSec ? 0 : 1, at < periodSec ? at : at - periodSec, 7 + i, null]);
                at += 700;
            }
        }
        list.add(["Y", 1, 0, periodSec / 2, 4, null]);
        list.add(["E", -1, 0, periodSec + 30, null, null]);
        list.add(["S", -1, 1, 600, null, 45]);
        list.add(["E", -1, 1, periodSec + 75, null, null]);
        return list;
    }

    //! Called every second.
    function tick() as Void {
        var queue = _queue;
        if (queue == null) {
            return;
        }
        if (_match >= queue.size()) {
            finish(queue);
            return;
        }
        var m = queue[_match];
        var periodSec = m["periodSec"] as Number;
        var chunks = m["chunks"] as Number;
        for (var i = 0; i < SAMPLES_PER_TICK && _sample < TrackLog.CHUNK_SAMPLES; i++) {
            // A chunk's first sample counts from the track's start, past half-time when it's over.
            var played = _chunk * TrackLog.CHUNK_SAMPLES;
            var dt = _sample == 0 ? (played + (played >= periodSec ? m["halftimeSec"] as Number : 0)) * 10 : 10;
            var t = (played + _sample).toFloat();
            var lat = 37404400 + (300 * Math.sin(t / 47) + 180 * Math.sin(t / 13)).toNumber();
            var lon = -122023600 + (420 * Math.cos(t / 61) + 150 * Math.sin(t / 17)).toNumber();
            var speed = 120 + (150 * (1 + Math.sin(t / 23))).toNumber();
            var hr = 140 + (20 * Math.sin(t / 300)).toNumber() + (4 * Math.sin(t / 9)).toNumber();
            _buf += TrackLog.encode(dt, lat, lon, _lastLat, _lastLon, speed, hr);
            _lastLat = lat;
            _lastLon = lon;
            _sample += 1;
        }
        if (_sample >= TrackLog.CHUNK_SAMPLES) {
            Application.Storage.setValue(TrackLog.chunkKey(m["created"] as Number, _chunk), _buf);
            _buf = "";
            _sample = 0;
            _lastLat = null;
            _lastLon = null;
            _chunk += 1;
            if (_chunk >= chunks) {
                _chunk = 0;
                _match += 1;
            }
        }
    }

    function finish(queue as Array<Dictionary>) as Void {
        _queue = null;
        Application.Storage.setValue(STORAGE_DONE, true);
        for (var i = 0; i < queue.size(); i++) {
            var m = queue[i];
            var chunks = m["chunks"] as Number;
            m.remove("chunks");
            TrackLog.queue([m["created"] as Number, (m["startedAt"] as Array<Number>)[0], chunks, 0]);
            Sync.queue(m);
        }
        Sync.run(null);
    }
}
