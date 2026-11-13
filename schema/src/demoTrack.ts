import type { MatchRecord } from "./matchRecord.ts";
import type { MatchTrack } from "./track.ts";

// A made-up track (TRK-1), for the server's demo and the marketing site's replay: once a second
// during each period, a referee keeping play between them and the assistants on the diagonal (left
// of play, ahead of it, a little wide when it's near a touchline), or an assistant level with play
// along their touchline over their half (TRK-9). Play itself is made up too: a ball that's carried
// up and down the pitch, changes hands, goes out for throw-ins, goal kicks and corners, and stops for
// fouls. The referee steers rather than turns on the spot, so the line curves, and walks, jogs, runs
// and now and then sprints as play needs, with a heart rate that follows the effort. The same every
// time (a seeded random number generator).

/** A small seeded random number generator (mulberry32), so the demo looks the same each run. */
function random(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const metresPerDegree = 6_371_008.8 * (Math.PI / 180);

export interface DemoPitch {
    /** Metres. */
    length: number;
    width: number;
    /** The length's bearing, degrees from north. */
    bearing: number;
}

/** A youth pitch, as on the demo's venues. */
export const demoPitch: DemoPitch = { length: 64, width: 46, bearing: 30 };

export function demoTrack(centre: { lat: number; lon: number }, periods: MatchRecord["periods"], assistant = false, pitch: DemoPitch = demoPitch, device = "garmin:venu2"): MatchTrack {
    const rand = random(7);
    const between = (from: number, to: number) => from + rand() * (to - from);
    const { length, width } = pitch;
    const angle = (pitch.bearing * Math.PI) / 180;
    // x along the length, toward the bearing; y across it, a quarter turn right (so +y is the bottom
    // of a drawing with x to the right).
    const toLatLon = (x: number, y: number) => ({
        lat: centre.lat + (x * Math.cos(angle) - y * Math.sin(angle)) / metresPerDegree,
        lon: centre.lon + (x * Math.sin(angle) + y * Math.cos(angle)) / (metresPerDegree * Math.cos((centre.lat * Math.PI) / 180)),
    });
    const [halfL, halfW] = [length / 2, width / 2];
    const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

    const start = Date.parse(periods[0].startedAt as string);
    const gps = { t: [] as number[], lat: [] as number[], lon: [] as number[] };
    const heartRate = { t: [] as number[], bpm: [] as number[] };
    // The referee's diagonal runs bottom left to top right; an assistant starts at the halfway line on
    // the bottom touchline and covers the right half.
    let [x, y] = assistant ? [0, halfW + 1] : [-4, 6];
    let [vx, vy] = [0, 0];
    let hr = assistant ? 100 : 105;
    for (const [p, period] of periods.entries()) {
        const from = Date.parse(period.startedAt as string) - start;
        // Play: the ball, the way it's going, which team has it (+1 attacks to the right), and how long
        // it's out of play for.
        let [bx, by, bvx, bvy] = [0, 0, 0, 0];
        let attack = p % 2 === 0 ? 1 : -1;
        let dead = 0;
        // The referee's own choice of spot, a few metres either way, held for a few seconds.
        let wander = { x: 0, y: 0 };
        let wanderUntil = 0;
        let sprint = -1;
        for (let s = 0; s <= period.playedSec; s++) {
            if (dead > 0) {
                dead--;
                [bvx, bvy] = [0, 0];
            } else {
                // Carried forward at a varying pace, often back and across, now and then a long ball or a
                // switch of play to the other side.
                const long = rand() < 0.04;
                const pace = long ? between(8, 16) : between(-1, 2.4);
                if (long && !assistant) {
                    sprint = s + 4 + Math.floor(rand() * 5); // the referee goes with it
                }
                bvx = bvx * 0.6 + attack * pace * 0.4 + (rand() - 0.5) * 2.5;
                bvy = bvy * 0.85 + (rand() - 0.5) * 3.5 - by * 0.01;
                if (rand() < 0.01) {
                    bvy = -Math.sign(by || 1) * between(10, 18);
                }
                bx += bvx;
                by += bvy;
                if (rand() < 0.045) {
                    attack = -attack; // a tackle or an interception
                }
                if (Math.abs(by) > halfW) {
                    by = Math.sign(by) * halfW; // a throw-in
                    dead = Math.floor(between(8, 20));
                } else if (Math.abs(bx) > halfL - 4) {
                    // At the goal line: a goal kick or a corner, then the other way.
                    const corner = rand() < 0.35;
                    bx = Math.sign(bx) * (corner ? halfL : halfL - 6);
                    by = corner ? (rand() < 0.5 ? -halfW : halfW) : between(-6, 6);
                    dead = Math.floor(corner ? between(20, 35) : between(12, 25));
                    attack = corner ? attack : -attack;
                } else if (rand() < 0.012) {
                    dead = Math.floor(between(15, 40)); // a foul, and a free kick
                }
            }
            // Where to be: the referee level with the ball or ahead of it, toward the diagonal, 10 to 20 m
            // away, wider at a set piece near goal; an assistant level with play in their half, just off
            // the touchline.
            let target;
            if (assistant) {
                target = { x: clamp(Math.max(bx, 0) + 2, halfL), y: halfW + 1 + (rand() - 0.5) * 0.6 };
            } else if (dead > 0 && Math.abs(bx) > halfL - 8) {
                // A corner or a goal kick: near the penalty area, on the diagonal's side.
                const end = Math.sign(bx);
                target = { x: end * (halfL - 12), y: -end * halfW * 0.4 };
            } else {
                // The diagonal level with play, a few metres ahead of it, pulled a little toward the ball,
                // and never on top of it.
                if (s >= wanderUntil) {
                    wander = { x: between(-6, 6), y: between(-7, 7) };
                    wanderUntil = s + 5 + Math.floor(rand() * 10);
                }
                const ahead = bx + attack * 5;
                target = { x: clamp(ahead + wander.x, halfL - 12), y: -ahead * (width / length) * 0.75 * 0.55 + by * 0.45 + wander.y };
                const [ax, ay] = [target.x - bx, target.y - by];
                const apart = Math.hypot(ax, ay);
                if (apart < 9) {
                    const push = (9 - apart) / (apart || 1);
                    target = { x: target.x + ax * push, y: clamp(target.y + ay * push, halfW - 1) };
                }
            }
            // Steering: the speed play needs, reached a little at a time, so turns are curves.
            const [dx, dy] = [target.x - x, target.y - y];
            const gap = Math.hypot(dx, dy);
            const want = s < sprint && gap > 4 ? between(5.8, 7.4) : gap < 3 ? between(1, 2) : gap < 8 ? between(1.8, 3) : gap < 14 ? between(2.6, 4) : gap < 24 ? between(4, 5.6) : between(5.6, 7.2);
            const [wx, wy] = gap > 0 ? [(dx / gap) * want, (dy / gap) * want] : [0, 0];
            const turn = assistant ? 0.6 : s < sprint ? 0.5 : 0.35;
            [vx, vy] = [vx + (wx - vx) * turn, vy + (wy - vy) * turn];
            x += vx;
            y += vy;
            const step = Math.hypot(vx, vy);
            hr += (Math.min(122 + step * 12, 186) - hr) * 0.06 + (rand() - 0.5) * 2;
            const at = toLatLon(x + (rand() - 0.5) * 0.8, y + (rand() - 0.5) * 0.8);
            const t = from + s * 1000;
            gps.t.push(t);
            gps.lat.push(Math.round(at.lat * 1e7) / 1e7);
            gps.lon.push(Math.round(at.lon * 1e7) / 1e7);
            heartRate.t.push(t + 400);
            heartRate.bpm.push(Math.round(hr));
        }
        // The break: heart rate drops while standing, and the next period kicks off from the middle.
        hr = 120;
        [vx, vy] = [0, 0];
        if (!assistant) {
            [x, y] = [4, -6];
        }
    }
    const corner = (sx: number, sy: number) => toLatLon((sx * length) / 2, (sy * width) / 2);
    return {
        source: { kind: "lawfive", device },
        start: new Date(start).toISOString(),
        gps,
        heartRate,
        // The assistant's pitch is left to be found from the touchline, on the standard diagonal's side.
        ...(assistant ? {} : { pitch: { corners: [corner(-1, -1), corner(1, -1)], centre, by: "referee" as const } }),
    };
}
