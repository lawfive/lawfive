import { defaultFormat } from "@lawfive/schema";
import { FitBaseType, FitEncoder } from "fit-file-parser";
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { kickoffInRecording, periodsFromStretches, readTrackFile } from "../src/trackFile.ts";

// Activity files for a match's track (TRK-8): FIT, GPX and TCX read to the same track, pauses found.

const kickoff = Date.parse("2026-10-24T16:00:00Z");
const minute = 60_000;
/** Two 3-minute halves a second apart, with a 2-minute half-time pause between them. */
const moments = [...Array(180).keys(), ...Array.from({ length: 180 }, (_, i) => 300 + i)].map((s) => kickoff + s * 1000);
const latAt = (i: number) => 33.5 + i * 0.00001;
const lon = -117.6;
/** The watch's own speed, m/s. */
const speedAt = (i: number) => 1 + (i % 5) / 4;

function fitFile(): Uint8Array {
    const e = new FitEncoder();
    const at = (ms: number) => ({ number: 253, size: 4, baseType: FitBaseType.Uint32, value: FitEncoder.toFitTimestamp(new Date(ms)) });
    const semicircles = (deg: number) => Math.round((deg * 2 ** 31) / 180);
    const timer = (ms: number, type: number) => e.writeMessage(21, [at(ms), { number: 0, size: 1, baseType: FitBaseType.Enum, value: 0 }, { number: 1, size: 1, baseType: FitBaseType.Enum, value: type }]);
    e.writeMessage(0, [
        { number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 },
        { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 1 },
        { number: 2, size: 2, baseType: FitBaseType.Uint16, value: 3703 },
    ]);
    timer(moments[0], 0);
    moments.forEach((ms, i) => {
        if (i === 180) {
            timer(moments[179], 4);
            timer(ms, 0);
        }
        e.writeMessage(20, [
            at(ms),
            { number: 0, size: 4, baseType: FitBaseType.Sint32, value: semicircles(latAt(i)) },
            { number: 1, size: 4, baseType: FitBaseType.Sint32, value: semicircles(lon) },
            { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 120 + (i % 40) },
            { number: 73, size: 4, baseType: FitBaseType.Uint32, value: speedAt(i) * 1000 },
        ]);
    });
    timer(moments.at(-1)!, 4);
    return e.close();
}

const iso = (ms: number) => new Date(ms).toISOString();
const gpx = `<?xml version="1.0"?><gpx creator="Garmin Connect" xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><trkseg>${
    moments.map((ms, i) => `<trkpt lat="${latAt(i)}" lon="${lon}"><ele>20</ele><time>${iso(ms)}</time><extensions><ns3:TrackPointExtension><ns3:hr>${120 + (i % 40)}</ns3:hr></ns3:TrackPointExtension></extensions></trkpt>`).join("\n")
}</trkseg></trk></gpx>`;
const tcx = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Other"><Lap><Track>${
    moments.map((ms, i) => `<Trackpoint><Time>${iso(ms)}</Time><Position><LatitudeDegrees>${latAt(i)}</LatitudeDegrees><LongitudeDegrees>${lon}</LongitudeDegrees></Position><HeartRateBpm><Value>${120 + (i % 40)}</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Speed>${speedAt(i)}</ns3:Speed></ns3:TPX></Extensions></Trackpoint>`).join("\n")
}</Track></Lap><Creator xsi:type="Device_t"><Name>Venu 2</Name></Creator></Activity></Activities></TrainingCenterDatabase>`;

/** A zip with one deflated file, as Garmin Connect's Export Original gives a FIT. */
function zip(name: string, data: Uint8Array): Uint8Array {
    const packed = deflateRawSync(data);
    const nameBytes = new TextEncoder().encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, 0, true);
    central.set(nameBytes, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(16, local.length + packed.length, true);
    return new Uint8Array([...local, ...packed, ...central, ...end]);
}

const file = (name: string, content: string | Uint8Array) => new File([content as BlobPart], name);

test("FIT, GPX and TCX read to the same track, with the pause found (TRK-8)", async () => {
    const fit = await readTrackFile(file("match.fit", fitFile()));
    const fromGpx = await readTrackFile(file("match.gpx", gpx));
    const fromTcx = await readTrackFile(file("match.tcx", tcx));
    assert.deepEqual(fit.track.source, { kind: "fit", device: "garmin:venu2" });
    assert.deepEqual(fromTcx.track.source, { kind: "tcx", device: "Venu 2" });
    assert.equal(fit.deviceName, "Venu 2");
    for (const read of [fit, fromGpx, fromTcx]) {
        assert.equal(read.track.start, iso(kickoff));
        assert.equal(read.track.gps?.t.length, 360);
        assert.equal(read.track.gps?.t[180], 300_000);
        assert.ok(Math.abs(read.track.gps!.lat[359] - latAt(359)) < 1e-6);
        assert.deepEqual(read.track.heartRate?.bpm.slice(0, 3), [120, 121, 122]);
        assert.deepEqual(read.stretches, [{ from: kickoff, to: kickoff + 179_000 }, { from: kickoff + 300_000, to: kickoff + 479_000 }], read.kind);
    }
    // The watch's own speed comes across where the file has it (TRK-3); this GPX hasn't.
    assert.deepEqual(fit.track.gps?.speedMps?.slice(0, 5), [1, 1.25, 1.5, 1.75, 2]);
    assert.deepEqual(fromTcx.track.gps?.speedMps, fit.track.gps?.speedMps);
    assert.equal(fromGpx.track.gps?.speedMps, undefined);
});

test("Garmin Connect's zipped Export Original reads like the FIT inside it", async () => {
    const read = await readTrackFile(file("12345.zip", zip("12345_ACTIVITY.fit", fitFile())));
    assert.equal(read.kind, "fit");
    assert.equal(read.track.gps?.t.length, 360);
});

test("samples at the same time keep the last; points without a position only count for heart rate", async () => {
    const read = await readTrackFile(file("x.gpx", `<gpx><trk><trkseg>
        <trkpt lat="33.5" lon="-117.6"><time>${iso(kickoff)}</time></trkpt>
        <trkpt lat="33.6" lon="-117.6"><time>${iso(kickoff)}</time><extensions><hr>130</hr></extensions></trkpt>
        <trkpt lat="0" lon="0"><time>${iso(kickoff + 1000)}</time><extensions><hr>131</hr></extensions></trkpt>
    </trkseg></trk></gpx>`));
    assert.deepEqual(read.track.gps, { t: [0], lat: [33.6], lon: [-117.6] });
    assert.deepEqual(read.track.heartRate, { t: [0, 1000], bpm: [130, 131] });
});

test("files that aren't activities are refused with a reason", async () => {
    await assert.rejects(readTrackFile(file("notes.txt", "hello")), /isn't a FIT, GPX or TCX file/);
    await assert.rejects(readTrackFile(file("empty.gpx", "<gpx><trk></trk></gpx>")), /no positions or heart rate/);
});

test("periods come from the stretches of two minutes or more; extra time after the format's periods", () => {
    const stretch = (fromMin: number, toMin: number) => ({ from: kickoff + fromMin * minute, to: kickoff + toMin * minute });
    const periods = periodsFromStretches([stretch(0, 46), stretch(46.5, 47), stretch(60, 107), stretch(112, 127), stretch(128, 143)], defaultFormat);
    assert.deepEqual(periods.map((p) => [p.period, p.extraTime, p.playedSec]), [[1, false, 2760], [2, false, 2820], [3, true, 900], [4, true, 900]]);
    assert.equal(periods[1].startedAt, iso(kickoff + 60 * minute));
    assert.deepEqual(periodsFromStretches([stretch(0, 120)], defaultFormat), [], "never paused: no periods");
});

test("a kickoff lines up with a recording that covers it, or began up to an hour after it", async () => {
    const { track } = await readTrackFile(file("match.gpx", gpx));
    assert.ok(kickoffInRecording(track, iso(kickoff + 2 * minute)));
    assert.ok(kickoffInRecording(track, iso(kickoff - 30 * minute)));
    assert.ok(!kickoffInRecording(track, iso(kickoff - 2 * 60 * minute)));
    assert.ok(!kickoffInRecording(track, iso(kickoff + 24 * 60 * minute)));
    assert.ok(kickoffInRecording(track, undefined));
});
