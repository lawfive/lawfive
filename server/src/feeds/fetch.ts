import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { addressProblem, publicLookup } from "../webhooks.ts";

// Fetching an assignor calendar (FEED-3) the way webhooks are sent (HOOK-4, SEC-4): public
// addresses only (unless the server allows private ones), at most 2 MB in 10 seconds, and a few
// redirects, each checked again before it's followed.

export const maxBytes = 2 * 1024 * 1024;
const timeoutMs = 10_000;
const maxRedirects = 3;

export type Fetched =
    | { status: "ok"; body: string; etag?: string; lastModified?: string }
    | { status: "unchanged" }
    /** The calendar isn't there for this link any more (404, 410), or it's refused (401, 403): after 3 in a row it's paused (FEED-9). */
    | { status: "gone"; problem: string }
    /** Anything that may pass: no answer, a server error. */
    | { status: "failed"; problem: string };

export interface FetchOptions {
    allowPrivate: boolean;
    etag?: string;
    lastModified?: string;
}

export type CalendarFetcher = (url: string, options: FetchOptions) => Promise<Fetched>;

/** https, or webcal read as https; http only where private addresses are allowed (for testing on a home network). */
export function calendarUrl(text: string, allowPrivate: boolean): { url: string } | { problem: string } {
    let url: URL;
    try {
        url = new URL(text.trim().replace(/^webcals?:\/\//i, "https://"));
    } catch {
        return { problem: "it isn't a web address" };
    }
    if (url.protocol === "https:" || (url.protocol === "http:" && allowPrivate)) {
        return { url: url.toString() };
    }
    return { problem: url.protocol === "http:" ? "it needs to start with https://" : "it needs to be an https:// or webcal:// address" };
}

/** The start of a link, to recognize it by without giving it away: its site. */
export function linkStart(url: string): string {
    return `${new URL(url).origin}/…`;
}

function get(url: string, headers: Record<string, string>, signal: AbortSignal, allowPrivate: boolean): Promise<{ code: number; location?: string; etag?: string; lastModified?: string; body?: string; tooBig?: boolean }> {
    const send = url.startsWith("https:") ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
        const req = send(url, { method: "GET", headers, signal, ...(allowPrivate ? {} : { lookup: publicLookup }) }, (res) => {
            const code = res.statusCode ?? 0;
            const header = (name: string) => {
                const v = res.headers[name];
                return Array.isArray(v) ? v[0] : v;
            };
            if (code < 200 || code >= 300) {
                res.resume();
                resolve({ code, location: header("location"), etag: header("etag"), lastModified: header("last-modified") });
                return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > maxBytes) {
                    res.destroy();
                    resolve({ code, tooBig: true });
                    return;
                }
                chunks.push(chunk);
            });
            res.on("end", () => resolve({ code, etag: header("etag"), lastModified: header("last-modified"), body: Buffer.concat(chunks).toString("utf8") }));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
    });
}

/** Reads a calendar link, asking only for what changed when it was read before. */
export const fetchCalendar: CalendarFetcher = async (start, options) => {
    const signal = AbortSignal.timeout(timeoutMs);
    let url = start;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const problem = await addressProblem(url, options.allowPrivate);
        if (problem) {
            return { status: hop === 0 ? "gone" : "failed", problem: `It can't be read: ${problem.replace("send webhooks to", "read")}.` };
        }
        let answer;
        try {
            answer = await get(url, {
                "user-agent": "LawFive-Calendars/1 (+https://lawfive.app)",
                accept: "text/calendar, */*;q=0.5",
                ...(options.etag ? { "if-none-match": options.etag } : {}),
                ...(options.lastModified ? { "if-modified-since": options.lastModified } : {}),
            }, signal, options.allowPrivate);
        } catch (e) {
            const name = (e as Error).name;
            return { status: "failed", problem: name === "TimeoutError" || name === "AbortError" ? `No answer in ${timeoutMs / 1000} seconds.` : `Couldn't connect: ${(e as Error).message}`.slice(0, 200) };
        }
        if ([301, 302, 303, 307, 308].includes(answer.code) && answer.location) {
            const next = calendarUrl(new URL(answer.location, url).toString(), options.allowPrivate);
            if ("problem" in next) {
                return { status: "failed", problem: `It sent us elsewhere, and ${next.problem}.` };
            }
            url = next.url;
            continue;
        }
        if (answer.code === 304) {
            return { status: "unchanged" };
        }
        if (answer.tooBig) {
            return { status: "failed", problem: "It's over 2 MB, more than a calendar of games should be." };
        }
        if (answer.code >= 200 && answer.code < 300) {
            return { status: "ok", body: answer.body ?? "", ...(answer.etag ? { etag: answer.etag } : {}), ...(answer.lastModified ? { lastModified: answer.lastModified } : {}) };
        }
        if ([401, 403, 404, 410].includes(answer.code)) {
            const why = answer.code === 404 || answer.code === 410 ? "the calendar isn't there any more" : "it's refused";
            return { status: "gone", problem: `The link stopped working: ${why} (${answer.code}). Make a new link in the assignor's site and paste it here.` };
        }
        return { status: "failed", problem: `The calendar's site answered ${answer.code}; it'll be tried again.` };
    }
    return { status: "failed", problem: "It sent us elsewhere too many times." };
};
