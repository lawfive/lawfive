import { type MatchTrack, type PitchOutline, type SpeedBand, fromPitch, pitchBearing, pitchFrame, pitchOf, toPitch, trackSteps } from "@lawfive/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type ReactNode, useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Pane, Polygon, Polyline, useMap } from "react-leaflet";
import type { Moment, TrailPiece } from "../replay.ts";
import { useMapTiles } from "./VenueMap.tsx";

// Where the referee went during a match (TRK-5): the track during the periods, each stretch
// coloured by its speed band (the same steps as the figures, from schema/src/track.ts), on the
// same tiles as the venue maps, with the pitch drawn (dashed when it was found from the track
// rather than marked, TRK-9). During a replay (TRK-10) the track fades back, and a marker with a
// fading trail shows where the referee was at that moment. Adjusting the pitch puts handles on it.

type LatLon = [number, number];

/** Runs of steps in the same band, as lines to draw; steps that don't count leave a break. */
function stretches(gps: NonNullable<MatchTrack["gps"]>, windows: { from: number; to: number }[], sprintKph: number) {
    const steps = trackSteps(gps, sprintKph);
    const out: { band: SpeedBand; points: LatLon[] }[] = [];
    let current: { band: SpeedBand; points: LatLon[] } | undefined;
    for (const [i, step] of steps.entries()) {
        const inside = windows.some((w) => gps.t[i - 1] >= w.from && gps.t[i] <= w.to);
        if (!step || !inside) {
            current = undefined;
            continue;
        }
        if (current?.band !== step.band) {
            // Each stretch starts where the last ended, so the line is unbroken.
            current = { band: step.band, points: [[gps.lat[i - 1], gps.lon[i - 1]]] };
            out.push(current);
        }
        current.points.push([gps.lat[i], gps.lon[i]]);
    }
    return out;
}

/** The pitch's outline and halfway line, from the two corners of one touchline and the centre spot. */
function pitchLines(pitch: PitchOutline) {
    const [a, b] = pitch.corners;
    const c = pitch.centre;
    // The far touchline's corners are these turned half a circle around the centre spot.
    const opposite = (p: { lat: number; lon: number }): LatLon => [2 * c.lat - p.lat, 2 * c.lon - p.lon];
    const outline: LatLon[] = [[a.lat, a.lon], [b.lat, b.lon], opposite(a), opposite(b)];
    const halfway: LatLon[] = [[(a.lat + b.lat) / 2, (a.lon + b.lon) / 2], [2 * c.lat - (a.lat + b.lat) / 2, 2 * c.lon - (a.lon + b.lon) / 2]];
    return { outline, halfway };
}

export function TrackMap({ track, pitch: shownPitch, adjusting, windows, sprintKph, height = 340, moment, trail, overlay, banner, pulse, replaying = false, fullscreen = false }: {
    track: MatchTrack;
    /** The pitch to draw: the track's own, or one found from it (TRK-9). */
    pitch?: PitchOutline;
    /** Adjusting the pitch: it has handles to drag, and each change goes to onChange. */
    adjusting?: { pitch: PitchOutline; onChange: (pitch: PitchOutline) => void };
    /** The sprint speed the bands are coloured by (the user's, TRK-11). */
    sprintKph: number;
    windows: { from: number; to: number }[];
    height?: number;
    /** Where the marker is, when there's a moment to show (a replay, or the heart-rate chart's crosshair). */
    moment?: Moment;
    trail?: TrailPiece[];
    /** Over the map, in a corner: the clock, score, heart rate and speed. */
    overlay?: ReactNode;
    /** Across the middle of the map: a goal or card as the replay reaches it. */
    banner?: ReactNode;
    /** A ring that pulses out from the marker; a new key starts it again (a goal). */
    pulse?: string;
    replaying?: boolean;
    fullscreen?: boolean;
}) {
    const { tiles, switcher } = useMapTiles();
    const lines = useMemo(() => (track.gps ? stretches(track.gps, windows, sprintKph) : []), [track.gps, windows, sprintKph]);
    const drawn = adjusting?.pitch ?? shownPitch;
    const pitch = drawn && pitchLines(drawn);
    return (
        <div className={`map track-map${replaying ? " replaying" : ""}`} style={fullscreen ? undefined : { height }}>
            {switcher}
            {overlay && <div className="replay-overlay">{overlay}</div>}
            {banner && <div className="replay-banner-wrap">{banner}</div>}
            <MapContainer center={[0, 0]} zoom={2} maxZoom={19} zoomSnap={0.25} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
                {tiles}
                {/* className as a prop, not in pathOptions: Leaflet reads it only when it makes the line. */}
                {pitch && (
                    <>
                        <Polygon key={`${drawn!.by}-${!!adjusting}`} positions={pitch.outline} className={`pitch-line${drawn!.by === "auto" && !adjusting ? " found" : ""}${adjusting ? " adjusting" : ""}`}
                            fill={!!adjusting} weight={adjusting ? 2 : 1.5} interactive={false} />
                        <Polyline key={`h-${drawn!.by}-${!!adjusting}`} positions={pitch.halfway} className={`pitch-line${drawn!.by === "auto" && !adjusting ? " found" : ""}`} weight={1.5} interactive={false} />
                    </>
                )}
                {adjusting && <PitchHandles pitch={adjusting.pitch} onChange={adjusting.onChange} />}
                {lines.map((line, i) => (
                    <Polyline key={i} positions={line.points} className={`speed-line speed-${line.band}`} weight={2.5} interactive={false} />
                ))}
                {trail?.map((piece, i) => (
                    <Polyline key={`${i}-${piece.band}`} positions={piece.points} className={`speed-line speed-${piece.band} trail`} weight={4}
                        pathOptions={{ opacity: 1 - piece.age * 0.85 }} interactive={false} />
                ))}
                {/* Its own layer, above the track and trail, which are redrawn as the replay moves. */}
                <Pane name="replay-marker" style={{ zIndex: 450 }}>
                    {moment?.position && pulse && <CircleMarker key={pulse} center={moment.position} radius={8} className="replay-pulse" interactive={false} />}
                    {moment?.position && (
                        <CircleMarker key={moment.noGps ? "waiting" : "moving"} center={moment.position} radius={7} className={`replay-marker${moment.noGps ? " no-gps" : ""}`} interactive={false} />
                    )}
                </Pane>
                <FitTrack points={[...lines.flatMap((l) => l.points), ...(pitch?.outline ?? [])]} />
                <Resize when={fullscreen} />
            </MapContainer>
        </div>
    );
}

/** Tells the map its size changed (in and out of full screen). */
function Resize({ when }: { when: boolean }) {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
    }, [when, map]);
    return null;
}

/** Zooms to the track and the pitch once they're drawn. */
function FitTrack({ points }: { points: LatLon[] }) {
    const map = useMap();
    const hasPoints = points.length > 0;
    useEffect(() => {
        if (hasPoints) {
            map.fitBounds(L.latLngBounds(points), { padding: [16, 16], maxZoom: 19 });
        }
        // Only when the track first arrives.
    }, [hasPoints, map]);
    return null;
}

const handleIcon = (kind: string, label: string) => L.divIcon({ className: `pitch-handle pitch-handle-${kind}`, html: `<span aria-label="${label}"></span>`, iconSize: [22, 22] });
const handles = { move: handleIcon("move", "Move the pitch"), end: handleIcon("end", "Turn the pitch and change its length"), side: handleIcon("side", "Change the pitch's width") };

/**
 * TRK-9: handles to put the pitch where it was: the centre spot moves it, the end of the halfway
 * line's axis (the middle of a goal line) turns it and sets its length, the middle of a touchline
 * sets its width.
 */
function PitchHandles({ pitch, onChange }: { pitch: PitchOutline; onChange: (pitch: PitchOutline) => void }) {
    const frame = pitchFrame(pitch);
    const bearing = pitchBearing(frame);
    const end = fromPitch(frame, frame.lengthM / 2, 0);
    const side = fromPitch(frame, 0, frame.widthM / 2);
    const at = (e: L.LeafletEvent) => (e.target as L.Marker).getLatLng();
    return (
        <>
            <Marker position={[pitch.centre.lat, pitch.centre.lon]} icon={handles.move} draggable keyboard={false}
                eventHandlers={{ drag: (e) => onChange(pitchOf({ lat: at(e).lat, lon: at(e).lng }, bearing, frame.lengthM, frame.widthM, "referee")) }} />
            <Marker position={[end.lat, end.lon]} icon={handles.end} draggable keyboard={false}
                eventHandlers={{
                    drag: (e) => {
                        const [x, y] = toPitch(frame, at(e).lat, at(e).lng);
                        const turn = (Math.atan2(y, x) * 180) / Math.PI;
                        onChange(pitchOf(pitch.centre, bearing - turn, Math.max(30, 2 * Math.hypot(x, y)), frame.widthM, "referee"));
                    },
                }} />
            <Marker position={[side.lat, side.lon]} icon={handles.side} draggable keyboard={false}
                eventHandlers={{
                    drag: (e) => {
                        const [, y] = toPitch(frame, at(e).lat, at(e).lng);
                        onChange(pitchOf(pitch.centre, bearing, frame.lengthM, Math.max(20, 2 * Math.abs(y)), "referee"));
                    },
                }} />
        </>
    );
}
