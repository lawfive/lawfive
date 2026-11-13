// Sending through Firebase Cloud Messaging's HTTP v1 API, signing in with the service account.

import type { Sealed } from "./handle.ts";

export type Sent = "sent" | "gone" | "failed";
export type Fetch = typeof fetch;

interface ServiceAccount {
    project_id: string;
    client_email: string;
    private_key: string;
    token_uri?: string;
}

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const b64url = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const textB64url = (text: string) => b64url(new TextEncoder().encode(text));

/** Kept between requests, as asking for one each time would be slow; each lasts an hour. */
let access: { token: string; expires: number; account: string } | undefined;

export function forgetAccessToken() {
    access = undefined;
}

async function signIn(account: ServiceAccount, fetcher: Fetch): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (access && access.account === account.client_email && access.expires > now + 60) {
        return access.token;
    }
    const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
    const unsigned = `${textB64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${textB64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }))}`;
    const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
    const answer = await fetcher(tokenUri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }),
    });
    if (!answer.ok) {
        throw new Error(`Firebase sign-in answered ${answer.status}`);
    }
    const body = await answer.json() as { access_token: string; expires_in: number };
    access = { token: body.access_token, expires: now + body.expires_in, account: account.client_email };
    return body.access_token;
}

/**
 * PUSH-2: a data message with the event and record only, so nothing about a match passes through
 * Firebase. Android gets it silently and writes its own notification. Apple only delivers reliably
 * what it can show, so the iPhone gets words that say nothing, for its app to replace.
 */
export function message(sealed: Sealed, type: string, id: string | undefined) {
    const collapse = id ? `${type}:${id}` : type;
    return {
        message: {
            token: sealed.token,
            data: { type, ...(id ? { id } : {}) },
            ...(sealed.platform === "android"
                ? { android: { priority: "HIGH", collapse_key: collapse, ttl: "3600s" } }
                : { apns: { headers: { "apns-priority": "10", "apns-collapse-id": collapse.slice(0, 64) }, payload: { aps: { alert: { title: "LawFive", body: "There's an update on a match." }, "mutable-content": 1 } } } }),
        },
    };
}

export async function send(serviceAccount: string, sealed: Sealed, type: string, id: string | undefined, fetcher: Fetch = fetch): Promise<Sent> {
    const account = JSON.parse(serviceAccount) as ServiceAccount;
    const post = async () => fetcher(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${await signIn(account, fetcher)}`, "content-type": "application/json" },
        body: JSON.stringify(message(sealed, type, id)),
    });
    let answer = await post();
    if (answer.status === 401) {
        forgetAccessToken();
        answer = await post();
    }
    if (answer.ok) {
        return "sent";
    }
    const text = await answer.text();
    // The app was removed or the token replaced (UNREGISTERED), or it was never a token for this
    // project (SENDER_ID_MISMATCH, or 400 for a malformed one): it will never work again.
    if (answer.status === 404 || /UNREGISTERED|SENDER_ID_MISMATCH/.test(text) || (answer.status === 400 && /registration token|"token"/i.test(text))) {
        return "gone";
    }
    console.error(`Firebase answered ${answer.status}`);
    return "failed";
}
