import { Match, MatchRecord, defaultFormat, demoTrack, summarizeTrack, trackPitch } from "@lawfive/schema";
import { TrackSection } from "../components/TrackSection.tsx";
import { defaultSettings } from "../settings.ts";
import { render } from "./shell.tsx";

// lawfive.app's match replay (SITE-1, TRK-10): the website's track section, read-only, for a made-up
// match on the North Meadow in Central Park, New York (a public park's pitch, never anyone's home or
// a club's own ground), with the demo's track generator (schema/src/demoTrack.ts).

const kickoff = Date.parse("2026-10-17T14:00:00Z");
const at = (minutes: number) => new Date(kickoff + minutes * 60_000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const P = (number: number) => ({ kind: "player" as const, number });

const match = Match.parse({
    id: id(1), version: 1, updatedAt: at(120),
    status: "played", kickoff: at(0), timeZone: "America/New_York",
    format: { ...defaultFormat, trackStoppage: true },
    home: { name: "Strikers", alias: "STR", colour: "#D71920" },
    away: { name: "Rovers", alias: "ROV", colour: "#0057B8" },
    role: "referee", crew: [],
});

const record = MatchRecord.parse({
    id: id(2), version: 1, updatedAt: at(120), matchId: match.id, device: "garmin:fr965",
    outcome: "completed",
    periods: [{ period: 1, extraTime: false, startedAt: at(1), playedSec: 2832 }, { period: 2, extraTime: false, startedAt: at(63), playedSec: 2905 }],
    score: { home: 2, away: 1 },
    events: [
        { type: "goal", when: "play", period: 1, periodSec: 610, team: "home", player: 9 },
        { type: "caution", when: "play", period: 1, periodSec: 1480, team: "away", offender: P(4) },
        { type: "goal", when: "play", period: 1, periodSec: 2240, team: "away", player: 11 },
        { type: "periodEnd", when: "play", period: 1, periodSec: 2832 },
        { type: "caution", when: "play", period: 2, periodSec: 900, team: "home", offender: P(6) },
        { type: "goal", when: "play", period: 2, periodSec: 2410, team: "home", player: 7 },
        { type: "periodEnd", when: "play", period: 2, periodSec: 2905 },
    ],
});

// A full-size pitch in the North Meadow's northeast corner, along Manhattan's grid.
const track = demoTrack({ lat: 40.7926, lon: -73.9567 }, record.periods, false, { length: 100, width: 64, bearing: 29 }, "garmin:fr965");
const settings = defaultSettings();
const summary = summarizeTrack(track, record.periods, undefined, settings.sprintKph);
const pitch = trackPitch(track, record.periods);

export function mount(el: HTMLElement) {
    render(el, <TrackSection match={match} record={record} track={track} summary={summary} pitch={pitch} settings={settings} readOnly />);
}
