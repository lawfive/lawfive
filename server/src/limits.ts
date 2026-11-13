import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { BlockList, isIP } from "node:net";
import { privateAddress } from "./webhooks.ts";

// SEC-2: who's asking, and how often. The address is the connection's own, unless that connection
// comes from a proxy listed in TRUSTED_PROXIES (SEC-14). Then it's the last address in
// X-Forwarded-For that isn't another listed proxy, as anything before that the visitor could have
// written itself; behind a second proxy, such as Cloudflare, TRUSTED_IP_HEADER names the header that
// one sets (CF-Connecting-IP). With TRUSTED_PROXIES empty, the default, no proxy is believed.

/** Better Auth reads this header for its rate limits; app.ts always sets it itself. */
export const clientIpHeader = "x-lawfive-client-ip";

/** Whether an address is a proxy to believe. */
export type Trusts = (ip: string) => boolean;

/** An IPv4 address inside an IPv6 one, as a server listening on both sees it: ::ffff:172.18.0.3. */
const plain = (ip: string) => ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1] ?? ip;

/**
 * SEC-14: TRUSTED_PROXIES, read once at startup: addresses and ranges (172.18.0.0/16, 10.0.0.5,
 * fd00::/8), and "private" for every private range. A mistyped entry stops the server starting,
 * naming it, rather than quietly trusting nothing.
 */
export function trustedProxies(setting: string | undefined): { trusts: Trusts; entries: string[] } {
    const entries = (setting ?? "").split(",").map((e) => e.trim()).filter(Boolean);
    const list = new BlockList();
    let privateRanges = false;
    for (const entry of entries) {
        if (entry.toLowerCase() === "private") {
            privateRanges = true;
            continue;
        }
        const [address, bits, extra] = entry.split("/");
        const type = isIP(address);
        const prefix = bits === undefined ? undefined : Number(bits);
        if (!type || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(bits) || prefix > (type === 4 ? 32 : 128)))) {
            throw new Error(`TRUSTED_PROXIES: "${entry}" isn't an address, a range such as 172.18.0.0/16, or private`);
        }
        const family = type === 4 ? "ipv4" : "ipv6";
        if (prefix === undefined) {
            list.addAddress(address, family);
        } else {
            list.addSubnet(address, prefix, family);
        }
    }
    return {
        entries,
        trusts: (ip) => {
            const bare = plain(ip);
            const type = isIP(bare);
            return type !== 0 && ((privateRanges && privateAddress(bare)) || list.check(bare, type === 4 ? "ipv4" : "ipv6"));
        },
    };
}

/**
 * The visitor, from the connection's address and what a believed proxy says. Exported for the
 * tests, which have no connection: a missing one counts as a believed proxy.
 */
export function visitorOf(peer: string | undefined, forwarded: string | undefined, fromHeader: string | undefined, trusts: Trusts): string {
    if (peer && !trusts(peer)) {
        return peer;
    }
    if (fromHeader && isIP(fromHeader.trim())) {
        return fromHeader.trim();
    }
    const chain = (forwarded ?? "").split(",").map((a) => a.trim()).filter((a) => isIP(a));
    for (let i = chain.length - 1; i >= 0; i--) {
        if (i === 0 || !trusts(chain[i])) {
            return chain[i];
        }
    }
    return peer ?? "unknown";
}

let warned = false;

export function clientIp(c: Context, trustedHeader?: string, trusts: Trusts = () => false): string {
    let peer: string | undefined;
    try {
        peer = getConnInfo(c).remote.address;
    } catch {
        // No connection: the tests' requests.
    }
    const forwarded = c.req.header("x-forwarded-for");
    // SEC-14: a proxy nobody listed makes every visitor one address, so say so once.
    if (!warned && peer && forwarded && !trusts(peer)) {
        warned = true;
        console.warn(`Requests are coming through a proxy at ${plain(peer)} that isn't in TRUSTED_PROXIES, so every visitor counts as that one address for limits on wrong passwords. Set TRUSTED_PROXIES (see .env.example).`);
    }
    return visitorOf(peer, forwarded, trustedHeader ? c.req.header(trustedHeader) : undefined, trusts);
}

/** At most `max` requests per address in each window; the answers past that say to wait. */
export function rateLimit(max: number, windowMs: number, ipOf: (c: Context) => string): MiddlewareHandler {
    const seen = new Map<string, { count: number; ends: number }>();
    return async (c, next) => {
        const now = Date.now();
        if (seen.size > 10_000) {
            for (const [key, entry] of seen) {
                if (entry.ends <= now) {
                    seen.delete(key);
                }
            }
        }
        const key = ipOf(c);
        const entry = seen.get(key);
        if (!entry || entry.ends <= now) {
            seen.set(key, { count: 1, ends: now + windowMs });
        } else if (++entry.count > max) {
            return c.json({ error: "Too many tries. Wait a little and try again." }, 429, { "retry-after": String(Math.ceil((entry.ends - now) / 1000)) });
        }
        await next();
    };
}
