// PUSH-2: a handle is a phone's Firebase token and its server's address, sealed so that only this
// relay can read or change them. The relay keeps no copy, so it stores nobody's token; and the server
// a handle belongs to can't be faked by whoever sends with it, which is what limits and blocks go by.

export interface Sealed {
    /** The phone's Firebase token. */
    token: string;
    /** The server the phone is signed in to, as server() returns it. */
    server: string;
    platform: "android" | "ios";
    /** Seconds since 1970. */
    expires: number;
}

export const HANDLE_DAYS = 90;
const VERSION = "v1";
const context = new TextEncoder().encode("lawfive-push-handle-v1");

async function key(secret: string): Promise<CryptoKey> {
    const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
    if (raw.length !== 32) {
        throw new Error("HANDLE_KEY must be 32 bytes, base64");
    }
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function seal(secret: string, sealed: Sealed): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context }, await key(secret), new TextEncoder().encode(JSON.stringify(sealed))));
    const out = new Uint8Array(iv.length + cipher.length);
    out.set(iv);
    out.set(cipher, iv.length);
    return `${VERSION}.${encode(out)}`;
}

/** What a handle holds; undefined if it's forged, altered, from an old key, or has expired. */
export async function open(secret: string, handle: string, nowSeconds = Date.now() / 1000): Promise<Sealed | undefined> {
    const [version, body] = handle.split(".");
    if (version !== VERSION || !body) {
        return undefined;
    }
    const secretKey = await key(secret);
    try {
        const bytes = decode(body);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: context }, secretKey, bytes.slice(12));
        const sealed = JSON.parse(new TextDecoder().decode(plain)) as Sealed;
        return sealed.expires > nowSeconds ? sealed : undefined;
    } catch {
        return undefined;
    }
}

/** A server's address in one spelling, as apps may write it differently; undefined if it isn't one. */
export function server(address: unknown): string | undefined {
    if (typeof address !== "string" || address.length > 300) {
        return undefined;
    }
    try {
        const url = new URL(address);
        if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
            return undefined;
        }
        return (url.origin + url.pathname).replace(/\/+$/, "");
    } catch {
        return undefined;
    }
}
