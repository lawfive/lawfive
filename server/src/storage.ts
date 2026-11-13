import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Where uploaded files are kept (FILE-4): a folder on the server's disk by default (UPLOADS_DIR, a
// Docker volume), or an S3-compatible bucket (S3_URL: AWS, Cloudflare R2, Backblaze B2, MinIO…).
// Keys are "<user id>/<attachment id>", and the same with ".thumb" for a thumbnail.

export interface FileStore {
    /** Where the files are, for the server's log (no credentials). */
    readonly where: string;
    put(key: string, data: Uint8Array, contentType: string): Promise<void>;
    /** The file, or undefined when there's none. */
    get(key: string): Promise<Uint8Array | undefined>;
    /** Removes the file; no error when it's already gone. */
    delete(key: string): Promise<void>;
}

const keyPattern = /^[A-Za-z0-9_-]+\/[0-9a-f-]{36}(\.[0-9a-f]{8})?(\.thumb)?$/;

function checkKey(key: string) {
    if (!keyPattern.test(key)) {
        throw new Error(`not a file key: ${key}`);
    }
}

/** Files in a folder, one subfolder per user. Checks the folder can be written to before it's used. */
export async function diskStore(dir: string): Promise<FileStore> {
    await mkdir(dir, { recursive: true });
    const probe = join(dir, ".write-check");
    await writeFile(probe, "");
    await rm(probe);
    return {
        where: dir,
        async put(key, data) {
            checkKey(key);
            const path = join(dir, key);
            await mkdir(dirname(path), { recursive: true });
            // Written beside it and renamed, so a half-written file is never served.
            await writeFile(`${path}.partial`, data);
            await rename(`${path}.partial`, path);
        },
        async get(key) {
            checkKey(key);
            try {
                return new Uint8Array(await readFile(join(dir, key)));
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                    return undefined;
                }
                throw e;
            }
        },
        async delete(key) {
            checkKey(key);
            await rm(join(dir, key), { force: true });
        },
    };
}

export interface S3Settings {
    /** The service's address, such as https://s3.us-east-1.amazonaws.com. */
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
}

/**
 * Reads S3_URL: https://ACCESS_KEY:SECRET@host/bucket, with ?region=… when the host doesn't say
 * (us-east-1 otherwise; auto for Cloudflare R2). The key and secret are URL-encoded where needed.
 */
export function parseS3Url(value: string): S3Settings {
    const url = new URL(value);
    const bucket = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!["https:", "http:"].includes(url.protocol) || !url.username || !url.password || !bucket || bucket.includes("/")) {
        throw new Error("S3_URL should look like https://ACCESS_KEY:SECRET@host/bucket");
    }
    const region = url.searchParams.get("region")
        ?? url.hostname.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com$/)?.[1]
        ?? (url.hostname.endsWith(".r2.cloudflarestorage.com") ? "auto" : "us-east-1");
    return {
        endpoint: `${url.protocol}//${url.host}`,
        bucket,
        region,
        accessKeyId: decodeURIComponent(url.username),
        secretAccessKey: decodeURIComponent(url.password),
    };
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
/** RFC 3986 encoding, as AWS signatures need: everything but unreserved characters. */
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Signs a request with AWS Signature Version 4: the headers to send with it. Path-style
 * addressing, which every S3-compatible service takes.
 */
export function signS3(s: S3Settings, method: string, path: string, headers: Record<string, string>, body: Uint8Array | undefined, now = new Date()): Record<string, string> {
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const day = amzDate.slice(0, 8);
    const all: Record<string, string> = {
        ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
        host: new URL(s.endpoint).host,
        "x-amz-content-sha256": sha256(body ?? ""),
        "x-amz-date": amzDate,
    };
    const names = Object.keys(all).sort();
    const canonical = [
        method,
        path.split("/").map((part) => encode(decodeURIComponent(part))).join("/"),
        "",
        ...names.map((n) => `${n}:${all[n].trim()}`),
        "",
        names.join(";"),
        all["x-amz-content-sha256"],
    ].join("\n");
    const scope = `${day}/${s.region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
    const key = hmac(hmac(hmac(hmac(`AWS4${s.secretAccessKey}`, day), s.region), "s3"), "aws4_request");
    const signature = createHmac("sha256", key).update(toSign).digest("hex");
    const { host, ...send } = all;
    return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${s.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

/** Files in an S3-compatible bucket. */
export function s3Store(s: S3Settings): FileStore {
    const call = async (method: string, key: string, body?: Uint8Array, contentType?: string) => {
        checkKey(key);
        const path = `/${s.bucket}/${key}`;
        const headers = signS3(s, method, path, contentType ? { "content-type": contentType } : {}, body);
        const res = await fetch(`${s.endpoint}${path}`, { method, headers, body: body as BodyInit | undefined, signal: AbortSignal.timeout(30_000) });
        if (!res.ok && !(res.status === 404 && method !== "PUT")) {
            throw new Error(`S3 ${method} ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
        }
        return res;
    };
    return {
        where: `${s.endpoint}/${s.bucket}`,
        async put(key, data, contentType) {
            await call("PUT", key, data, contentType);
        },
        async get(key) {
            const res = await call("GET", key);
            return res.status === 404 ? undefined : new Uint8Array(await res.arrayBuffer());
        },
        async delete(key) {
            await call("DELETE", key);
        },
    };
}
