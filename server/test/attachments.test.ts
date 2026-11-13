import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { imageType } from "../src/attachments.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { type FileStore, diskStore, parseS3Url, s3Store, signS3 } from "../src/storage.ts";
import { checkAnswer } from "./contract.ts";

// Attachments (FILE-1 to FILE-5): photos uploaded to matches, venues and referees, kept in the
// file store, served only to their owner, in order, and deleted with their record or account.

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
let files: FileStore;
let app: ReturnType<typeof createApp>;

/** The smallest files that look like each kind of image; the server checks only how they start. */
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const gif = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");

async function call(method: string, path: string, token: string, body?: unknown) {
    const form = body instanceof FormData;
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, authorization: `Bearer ${token}`, ...(body === undefined || form ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    const parsed = res.headers.get("content-type")?.startsWith("image/") ? new Uint8Array(await res.arrayBuffer()) : await res.json();
    checkAnswer(method, path, res.status, parsed, form ? undefined : body);
    return { status: res.status, body: parsed, headers: res.headers };
}

async function signUp(email: string) {
    const res = await app.request("/v1/auth/sign-up/email", {
        method: "POST",
        headers: { origin: publicUrl, "content-type": "application/json" },
        body: JSON.stringify({ name: "Photo Tester", email, password: "correct horse battery" }),
    });
    return res.headers.get("set-auth-token") as string;
}

function upload(recordType: string, recordId: string, file: Uint8Array<ArrayBuffer>, extra: Record<string, string | Uint8Array<ArrayBuffer>> = {}) {
    const form = new FormData();
    form.set("recordType", recordType);
    form.set("recordId", recordId);
    form.set("file", new Blob([file]), "photo.jpg");
    for (const [name, value] of Object.entries(extra)) {
        if (typeof value === "string") {
            form.set(name, value);
        } else {
            form.set(name, new Blob([value]), name);
        }
    }
    return form;
}

/** Waits for work done after the answer (deleting a record's files). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

before(async () => {
    await migrate(db, { migrationsFolder });
    files = await diskStore(mkdtempSync(join(tmpdir(), "lawfive-files-")));
    app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { files });
});

describe("attachments", () => {
    let session: string;
    const referee = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9";
    const other = "2c3d4e5f-6071-4829-93a4-b5c6d7e8f901";
    const venue = "3d4e5f60-7182-4930-a4b5-c6d7e8f90123";
    let first: { id: string; url: string; thumbUrl: string };

    test("a photo is uploaded to a record, with a thumbnail, and fetched back", async () => {
        // The server's first account is its admin (USR-8); this one can then delete itself.
        await signUp("owner@example.com");
        session = await signUp("photos@example.com");
        assert.equal((await call("PUT", `/v1/referees/${referee}`, session, { name: "Sam Rivera" })).status, 201);
        assert.equal((await call("PUT", `/v1/venues/${venue}`, session, { name: "Twin Creeks", pitches: [] })).status, 201);

        const made = await call("POST", "/v1/attachments", session, upload("referee", referee, jpeg, { thumb: png, caption: " At the final ", width: "2000", height: "1500" }));
        assert.equal(made.status, 201);
        first = made.body;
        assert.equal(made.body.contentType, "image/jpeg");
        assert.equal(made.body.size, jpeg.byteLength);
        assert.equal(made.body.caption, "At the final");
        assert.deepEqual([made.body.width, made.body.height, made.body.position], [2000, 1500, 0]);

        const file = await call("GET", first.url, session);
        assert.deepEqual(file.body, jpeg);
        assert.equal(file.headers.get("content-type"), "image/jpeg");
        assert.match(file.headers.get("cache-control")!, /private.*immutable/);
        assert.deepEqual((await call("GET", first.thumbUrl, session)).body, png);
    });

    test("only images are taken, on records that exist", async () => {
        assert.equal((await call("POST", "/v1/attachments", session, upload("referee", referee, gif))).status, 400, "a GIF");
        assert.equal((await call("POST", "/v1/attachments", session, upload("referee", referee, new TextEncoder().encode("<svg/>")))).status, 400);
        assert.equal((await call("POST", "/v1/attachments", session, upload("referee", referee, jpeg, { thumb: gif }))).status, 400, "the thumbnail too");
        assert.equal((await call("POST", "/v1/attachments", session, upload("match", referee, jpeg))).status, 404, "no such match");
        assert.equal((await call("POST", "/v1/attachments", session, upload("competition", referee, jpeg))).status, 400, "not a kind that has photos");
        const big = new Uint8Array(11 * 1024 * 1024);
        big.set(jpeg);
        assert.equal((await call("POST", "/v1/attachments", session, upload("venue", venue, big))).status, 400, "over 10 MB");
        assert.equal(imageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "image/webp");
    });

    test("photos keep their order; moving one first makes it the referee's picture", async () => {
        const second = await call("POST", "/v1/attachments", session, upload("referee", referee, png));
        assert.equal(second.body.position, 1);
        assert.equal(second.body.thumbUrl, `/v1/attachments/${second.body.id}/thumb`);
        assert.deepEqual((await call("GET", second.body.thumbUrl, session)).body, png, "the file itself when there's no thumbnail");

        let list = await call("GET", `/v1/attachments?recordType=referee&recordId=${referee}`, session);
        assert.deepEqual(list.body.attachments.map((a: { id: string }) => a.id), [first.id, second.body.id]);

        const moved = await call("PUT", `/v1/attachments/${second.body.id}`, session, { position: 0, caption: "Headshot" });
        assert.deepEqual([moved.body.position, moved.body.caption], [0, "Headshot"]);
        list = await call("GET", "/v1/attachments?recordType=referee&first=true", session);
        assert.deepEqual(list.body.attachments.map((a: { id: string }) => a.id), [second.body.id]);
        const cleared = await call("PUT", `/v1/attachments/${second.body.id}`, session, { caption: null });
        assert.equal(cleared.body.caption, undefined);
        assert.equal((await call("GET", "/v1/attachments?recordType=team", session)).status, 400);
    });

    test("a cropped or turned photo takes the old one's place, at a new address (FILE-8)", async () => {
        const before = (await call("GET", `/v1/attachments?recordType=referee&recordId=${referee}`, session)).body.attachments.find((x: { id: string }) => x.id === first.id);
        const form = new FormData();
        form.set("file", new Blob([png]), "photo.png");
        form.set("thumb", new Blob([jpeg]), "thumb.jpg");
        form.set("width", "800");
        form.set("height", "800");
        const replaced = await call("PUT", `/v1/attachments/${first.id}/file`, session, form);
        assert.equal(replaced.status, 200);
        assert.equal(replaced.body.id, first.id);
        assert.deepEqual([replaced.body.caption, replaced.body.position], [before.caption, before.position], "its caption and place stay");
        assert.deepEqual([replaced.body.contentType, replaced.body.size, replaced.body.width, replaced.body.height], ["image/png", png.byteLength, 800, 800]);
        assert.match(replaced.body.url, /\/file\?v=\w{8}$/);
        assert.notEqual(replaced.body.thumbUrl, before.thumbUrl, "a new address, so a kept copy isn't shown");
        assert.deepEqual((await call("GET", replaced.body.url, session)).body, png);
        assert.deepEqual((await call("GET", replaced.body.thumbUrl, session)).body, jpeg);
        const gifForm = new FormData();
        gifForm.set("file", new Blob([gif]), "photo.gif");
        assert.equal((await call("PUT", `/v1/attachments/${first.id}/file`, session, gifForm)).status, 400, "only images");
        first = replaced.body;
    });

    test("they're private to their owner", async () => {
        const stranger = await signUp("stranger@example.com");
        assert.equal((await call("GET", first.url, stranger)).status, 404);
        assert.equal((await call("PUT", `/v1/attachments/${first.id}`, stranger, { caption: "Mine now" })).status, 404);
        const theirs = new FormData();
        theirs.set("file", new Blob([jpeg]), "photo.jpg");
        assert.equal((await call("PUT", `/v1/attachments/${first.id}/file`, stranger, theirs)).status, 404, "nor replace it");
        assert.equal((await call("DELETE", `/v1/attachments/${first.id}`, stranger)).status, 404);
        assert.equal((await call("GET", `/v1/attachments?recordType=referee&recordId=${referee}`, stranger)).body.attachments.length, 0);
        assert.equal((await call("POST", "/v1/attachments", stranger, upload("referee", referee, jpeg))).status, 404, "not their referee");
    });

    test("merging referees keeps everyone's photos, after the kept one's", async () => {
        assert.equal((await call("PUT", `/v1/referees/${other}`, session, { name: "S. Rivera" })).status, 201);
        const theirs = await call("POST", "/v1/attachments", session, upload("referee", other, jpeg));
        assert.equal((await call("POST", `/v1/referees/${referee}/merge`, session, { from: [other], name: "Sam Rivera" })).status, 200);
        await settle();
        const list = await call("GET", `/v1/attachments?recordType=referee&recordId=${referee}`, session);
        assert.equal(list.body.attachments.length, 3);
        assert.deepEqual(list.body.attachments.at(-1), { ...theirs.body, recordId: referee, position: 2 });
    });

    test("deleting a photo, its record or the account deletes the files", async () => {
        const [row] = await db.select().from(tables.attachment).where(eq(tables.attachment.id, first.id));
        assert.ok(await files.get(row.fileKey));
        assert.equal((await call("DELETE", `/v1/attachments/${first.id}`, session)).status, 200);
        assert.equal(await files.get(row.fileKey), undefined);
        assert.equal(await files.get(row.thumbKey!), undefined);
        assert.equal((await call("GET", first.url, session)).status, 404);

        const atVenue = await call("POST", "/v1/attachments", session, upload("venue", venue, jpeg));
        const venueKeys = (await db.select().from(tables.attachment)).filter((a) => a.id === atVenue.body.id).map((a) => a.fileKey);
        assert.equal((await call("DELETE", `/v1/venues/${venue}?version=1`, session)).status, 200);
        await settle();
        assert.equal((await call("GET", atVenue.body.url, session)).status, 404);
        assert.equal(await files.get(venueKeys[0]), undefined);

        const left = await db.select().from(tables.attachment);
        assert.ok(left.length > 0);
        const res = await app.request("/v1/account/delete", {
            method: "POST",
            headers: { origin: publicUrl, authorization: `Bearer ${session}`, "content-type": "application/json" },
            body: JSON.stringify({ password: "correct horse battery" }),
        });
        assert.equal(res.status, 200);
        for (const a of left) {
            assert.equal(await files.get(a.fileKey), undefined, "the account's files are gone");
        }
        assert.equal((await db.select().from(tables.attachment)).length, 0);
    });
});

describe("file stores", () => {
    test("a disk store refuses keys that would leave its folder", async () => {
        await assert.rejects(files.put("../escape/2c3d4e5f-6071-4829-93a4-b5c6d7e8f901", jpeg, "image/jpeg"));
        await assert.rejects(files.get("user/../../etc/passwd"));
    });

    test("S3_URL is read for the endpoint, bucket, region and credentials", () => {
        assert.deepEqual(parseS3Url("https://AKID:se%2Fcret@s3.eu-west-2.amazonaws.com/lawfive-photos"), {
            endpoint: "https://s3.eu-west-2.amazonaws.com", bucket: "lawfive-photos", region: "eu-west-2", accessKeyId: "AKID", secretAccessKey: "se/cret",
        });
        assert.equal(parseS3Url("https://k:s@abc123.r2.cloudflarestorage.com/photos").region, "auto");
        assert.equal(parseS3Url("http://k:s@minio.local:9000/photos?region=home").region, "home");
        assert.equal(parseS3Url("http://k:s@minio.local:9000/photos").region, "us-east-1");
        assert.throws(() => parseS3Url("https://s3.amazonaws.com/photos"), /ACCESS_KEY/);
        assert.throws(() => parseS3Url("https://k:s@s3.amazonaws.com/"), /bucket/);
    });

    test("requests are signed with AWS Signature Version 4 (AWS's own worked example)", () => {
        // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html: GET Object.
        const headers = signS3(
            { endpoint: "https://examplebucket.s3.amazonaws.com", bucket: "examplebucket", region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" },
            "GET", "/test.txt", { Range: "bytes=0-9" }, undefined, new Date("2013-05-24T00:00:00Z"),
        );
        assert.equal(headers.authorization, "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    });

    test("an S3 store puts, gets and deletes objects in its bucket", async () => {
        const objects = new Map<string, Buffer>();
        const seen: string[] = [];
        const server = createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (c) => chunks.push(c));
            req.on("end", () => {
                seen.push(`${req.method} ${req.url} ${req.headers.authorization?.startsWith("AWS4-HMAC-SHA256 ") ? "signed" : "unsigned"}`);
                if (req.method === "PUT") {
                    objects.set(req.url!, Buffer.concat(chunks));
                    res.writeHead(200).end();
                } else if (req.method === "GET") {
                    const found = objects.get(req.url!);
                    res.writeHead(found ? 200 : 404).end(found);
                } else {
                    objects.delete(req.url!);
                    res.writeHead(204).end();
                }
            });
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        after(() => server.close());
        const store = s3Store(parseS3Url(`http://key:secret@127.0.0.1:${(server.address() as AddressInfo).port}/photos`));
        const key = "user1/2c3d4e5f-6071-4829-93a4-b5c6d7e8f901";
        await store.put(key, jpeg, "image/jpeg");
        assert.deepEqual(await store.get(key), jpeg);
        await store.delete(key);
        assert.equal(await store.get(key), undefined);
        assert.deepEqual(seen, [`PUT /photos/${key} signed`, `GET /photos/${key} signed`, `DELETE /photos/${key} signed`, `GET /photos/${key} signed`]);
    });
});
