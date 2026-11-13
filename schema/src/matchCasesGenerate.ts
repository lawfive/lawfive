import { readdirSync, readFileSync } from "node:fs";
import { type MatchCase, MatchCaseFile, type MatchStep, type ScreenCase, caseMs } from "./matchCases.ts";

// WCH-2: the match cases (schema/match-cases/*.json) as each copy of the rules runs them. Times become
// milliseconds and actions one shape ({ do: "start" }, { do: "event", type: "G", team: "home" }), so the
// runners in Kotlin, Swift and Monkey C stay small.

const folder = new URL("../match-cases/", import.meta.url).pathname;

/** Every case, checked against the schema; a file that doesn't fit stops `pnpm generate` and the tests. */
export function readMatchCases(): { screen: ScreenCase[]; match: MatchCase[] } {
    const screen: ScreenCase[] = [];
    const match: MatchCase[] = [];
    for (const file of readdirSync(folder).filter((f) => f.endsWith(".json")).sort()) {
        const parsed = MatchCaseFile.safeParse(JSON.parse(readFileSync(`${folder}${file}`, "utf8")));
        if (!parsed.success) {
            throw new Error(`schema/match-cases/${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
        }
        screen.push(...(parsed.data.screen ?? []));
        match.push(...(parsed.data.match ?? []).map((c) => ({ ...c, name: `${file.replace(/\.json$/, "")} › ${c.name}` })));
    }
    return { screen, match };
}

/**
 * A screen case played out on a watch: kickoff at 0:00, the first half ended at 45:00 and the second
 * kicked off after the 15-minute half-time, with the stoppage taken to end at the moment (or a second
 * before it, when it's not running). The watches check the clocks, the added time, the ring and the
 * break clock; the pills are the setup pictures' own, as the halfway break there is made up.
 */
export function screenAsSteps(c: ScreenCase): MatchCase | undefined {
    const { stoppage: _s, breakPill: _b, ...expect } = c.expect;
    if (Object.keys(expect).length === 0) {
        return undefined;
    }
    const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}${ms % 1000 ? `.${Math.round((ms % 1000) / 100)}` : ""}`;
    const steps: MatchStep[] = [{ at: "0:00", do: [{ kickoff: "home" }, "start"] }];
    let from = 0;
    if (c.at.phase === "halftime" || c.at.period === 1) {
        steps.push({ at: "45:00", do: "endPeriod" });
        from = caseMs("45:00");
    }
    if (c.at.phase === "running" && c.at.period === 1) {
        steps.push({ at: "60:00", do: ["endHalftime", "startNextPeriod"] });
        from = caseMs("60:00");
    }
    const moment = from + caseMs(c.at.elapsed);
    const stoppage = c.at.phase === "running" && c.at.stoppage ? caseMs(c.at.stoppage) : 0;
    if (stoppage > 0) {
        const end = c.at.stoppageRunning ? moment : moment - 1000;
        steps.push({ at: time(end - stoppage), do: "stoppage" });
        if (!c.at.stoppageRunning) {
            steps.push({ at: time(end), do: "stoppage" });
        }
    }
    steps.push({ at: time(moment), expect });
    const tracked = c.tracked !== false;
    return { name: `screen › ${c.name}`, ...(c.ids ? { ids: c.ids } : {}), format: { trackStoppage: tracked }, ...(c.screen ? { screen: c.screen } : {}), steps: steps.sort((a, b) => caseMs(a.at) - caseMs(b.at)) };
}

type Action = Exclude<MatchStep["do"], undefined | unknown[]>;

const officialRoles = ["headCoach", "assistantCoach", "other"];

function action(a: Action): Record<string, unknown> {
    if (typeof a === "string") {
        return { do: a };
    }
    if ("kickoff" in a) {
        return { do: "kickoff", team: a.kickoff };
    }
    if ("penaltyFirst" in a) {
        return { do: "penaltyFirst", team: a.penaltyFirst };
    }
    if ("event" in a) {
        return { do: "event", type: a.event, team: a.team, ...(a.player !== undefined ? { player: a.player } : {}) };
    }
    if ("official" in a) {
        // EVT-15: the role as the watches keep it, 0 head coach, 1 assistant coach, 2 other.
        return { do: "official", type: a.official, team: a.team, role: officialRoles.indexOf(a.role) };
    }
    if ("adjustClock" in a) {
        return { do: "adjustClock", sec: a.adjustClock };
    }
    if ("adjustAdded" in a) {
        return { do: "adjustAdded", sec: a.adjustAdded };
    }
    if ("kick" in a) {
        return { do: "kick", scored: a.kick === "scored" };
    }
    if ("suspend" in a) {
        return { do: "suspend", reason: a.suspend };
    }
    if ("reason" in a) {
        // EVT-14: the card's reason, by its code.
        return { do: "reason", code: a.reason };
    }
    return { do: "abandon", reason: a.abandon };
}

/** A case with times in milliseconds and actions in one shape, as the runners read it. */
function runnable(c: MatchCase) {
    return {
        name: c.name,
        format: c.format ?? {},
        screen: c.screen ?? {},
        steps: c.steps.map((s) => ({
            at: caseMs(s.at),
            do: (s.do === undefined ? [] : Array.isArray(s.do) ? s.do : [s.do]).map((a) => action(a as Action)),
            ...(s.expect ? { expect: s.expect } : {}),
        })),
    };
}

/** A screen case as the website's and phones' pictures read it, with milliseconds. */
function screenRunnable(c: ScreenCase) {
    const ms = (t?: string) => (t === undefined ? undefined : caseMs(t));
    return {
        name: c.name,
        screen: c.screen ?? {},
        tracked: c.tracked !== false,
        at: { ...c.at, elapsed: caseMs(c.at.elapsed), stoppage: ms(c.at.stoppage) ?? 0, stoppageRunning: c.at.stoppageRunning ?? false, breakStarted: ms(c.at.breakStarted) },
        expect: c.expect,
    };
}

/** Monkey C has no JSON reader: the cases as a literal, for the Garmin watch's tests (MatchTests.mc). */
function monkeyC(value: unknown, indent = ""): string {
    if (value === null || value === undefined) {
        return "null";
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (typeof value === "number") {
        return String(value);
    }
    if (typeof value === "string") {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    const inner = `${indent}    `;
    if (Array.isArray(value)) {
        return value.length === 0 ? "[]" : `[\n${value.map((v) => `${inner}${monkeyC(v, inner)}`).join(",\n")}\n${indent}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return entries.length === 0 ? "{}" : `{\n${entries.map(([k, v]) => `${inner}"${k}" => ${monkeyC(v, inner)}`).join(",\n")}\n${indent}}`;
}

/**
 * A class file holds a string constant of at most 65,535 bytes, so Kotlin gets the JSON as constants
 * of up to 60 KB each, cut between two objects (after a `,` before a `{`, so no cut lands inside a
 * string, an escape or a `$`), joined when the tests run. Swift and Monkey C have no such limit.
 */
function kotlinChunks(json: string, limit = 60_000): string[] {
    const bytes = (s: string) => new TextEncoder().encode(s).length;
    const chunks: string[] = [];
    let start = 0;
    while (bytes(json.slice(start)) > limit) {
        let cut = -1;
        for (let i = json.indexOf(",{", start); i !== -1 && bytes(json.slice(start, i + 1)) <= limit; i = json.indexOf(",{", i + 1)) {
            cut = i + 1;
        }
        if (cut === -1) {
            throw new Error("schema/match-cases: no place to cut the cases into Kotlin constants");
        }
        chunks.push(json.slice(start, cut));
        start = cut;
    }
    chunks.push(json.slice(start));
    return chunks;
}

function kotlin(header: string, json: string): string {
    const chunks = kotlinChunks(json);
    const constants = chunks.map((c, i) => `private const val PART_${i} = """${c}"""\n`).join("");
    // joinToString, not +: the compiler would fold const + const back into one constant.
    const parts = chunks.map((_, i) => `PART_${i}`).join(", ");
    return `${header}\n\npackage app.lawfive.cases\n\n${constants}\nval MATCH_CASES_JSON: String = listOf(${parts}).joinToString("")\n`;
}

/** The generated copies, by path from schema/. */
export function matchCaseFiles(): Record<string, string> {
    const cases = readMatchCases();
    const match = [...cases.match, ...cases.screen.map(screenAsSteps).filter((c) => c !== undefined)].map(runnable);
    const screen = cases.screen.map(screenRunnable);
    const all = JSON.stringify({ screen, match });
    if (all.includes('"""') || all.includes("${") || all.includes('"#')) {
        throw new Error("schema/match-cases: a case's text can't be embedded in Kotlin or Swift");
    }
    const header = "// Generated by schema/scripts/generate.ts from schema/match-cases/*.json (WCH-2): don't edit; run pnpm generate.";
    const swift = `${header}\n\nlet matchCasesJSON = #"""\n${all}\n"""#\n`;
    return {
        "generated/match-cases.json": `${JSON.stringify({ screen, match }, null, 2)}\n`,
        "generated/kotlin-tests/MatchCases.kt": kotlin(header, all),
        "generated/swift-tests/MatchCases.swift": swift,
        // The iPhone's test target takes files only from its own folder.
        "../mobile/ios/LawFiveTests/MatchCases.swift": swift,
        "../watch-garmin/source/MatchCases.mc": `${header.replace("//", "//!")}\n\nimport Toybox.Lang;\n\n(:debug)\nfunction matchCases() as Array<Dictionary> {\n    return ${monkeyC(match, "    ")} as Array<Dictionary>;\n}\n`,
    };
}
