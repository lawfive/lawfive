import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { zipSync, strToU8 } from "fflate";
import { imageType } from "../src/attachments.ts";
import { cleanName, contentDisposition } from "../src/fileTypes.ts";
import { filesUsed } from "../src/usage.ts";
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
    const parsed = res.headers.get("content-type")?.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
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

function upload(recordType: string, recordId: string, file: Uint8Array<ArrayBuffer>, extra: Record<string, string | Uint8Array<ArrayBuffer>> = {}, fileName = "photo.jpg") {
    const form = new FormData();
    form.set("recordType", recordType);
    form.set("recordId", recordId);
    form.set("file", new Blob([file]), fileName);
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
    app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { files, webhooks: { allowPrivate: true, retryEveryMs: 0 } });
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
        assert.equal((await call("POST", "/v1/attachments", session, upload("referee", referee, jpeg, { kind: "file" }))).status, 400, "a referee has photos, not files");
        assert.equal((await call("POST", "/v1/attachments", session, upload("team", referee, jpeg))).status, 400, "not a kind of record that has attachments");
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

// Files (FILE-6 to FILE-15): documents on matches, venues and competitions, checked from their
// contents, named safely, always downloaded, reached by API keys through their record, and heard
// of by webhooks.
describe("files", () => {
    let session: string;
    const venue = "4e5f6071-8293-4a41-b5c6-d7e8f9012345";
    const competition = "5f607182-93a4-4b52-86d7-e8f901234567";
    const match = "60718293-a4b5-4c63-97e8-f90123456789";
    const bytes = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
    const zipOf = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))) as Uint8Array<ArrayBuffer>;
    const types = (main: string) => `<?xml version="1.0"?><Types><Override PartName="/x" ContentType="${main}"/></Types>`;
    const pdf = bytes("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
    const xlsx = zipOf({ "[Content_Types].xml": types("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"), "xl/workbook.xml": "<workbook/>" });
    const xlsm = zipOf({ "[Content_Types].xml": types("application/vnd.ms-excel.sheet.macroEnabled.main+xml"), "xl/workbook.xml": "<workbook/>", "xl/vbaProject.bin": "macros" });
    const docx = zipOf({ "[Content_Types].xml": types("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"), "word/document.xml": "<document/>" });
    const docm = zipOf({ "[Content_Types].xml": types("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"), "word/document.xml": "<document/>", "word/vbaProject.bin": "macros" });
    const pptx = zipOf({ "[Content_Types].xml": types("application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"), "ppt/presentation.xml": "<p/>" });
    const csv = bytes("date,home,away\n2026-11-21,Strikers U12,Rovers U12\n");
    const windowsText = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x72, 0x75, 0x6c, 0x65, 0x73, 0x0d, 0x0a]);
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]);
    const list = async (recordType: string, recordId: string, kind?: string) =>
        (await call("GET", `/v1/attachments?recordType=${recordType}&recordId=${recordId}${kind ? `&kind=${kind}` : ""}`, session)).body.attachments as { id: string; name?: string; kind: string; contentType: string; position: number; url: string; thumbUrl: string; hasThumb: boolean }[];

    test("each kind is taken, from its contents, as a file with its name", async () => {
        session = await signUp("files@example.com");
        assert.equal((await call("PUT", `/v1/venues/${venue}`, session, { name: "Twin Creeks", pitches: [] })).status, 201);
        assert.equal((await call("PUT", `/v1/competitions/${competition}`, session, { name: "Bay Youth League", type: "league" })).status, 201);
        const { id, version, updatedAt, ...example } = JSON.parse(readFileSync(new URL("../../schema/examples/Match.quick.json", import.meta.url), "utf8"));
        const saved = await call("PUT", `/v1/matches/${match}`, session, { ...example, status: "scheduled", kickoff: "2026-11-21T09:00:00-08:00", home: { name: "Strikers U12" }, away: { name: "Rovers U12" }, competitionId: competition, venueId: venue });
        assert.equal(saved.status, 201, JSON.stringify(saved.body));
        const cases = [
            [pdf, "Field map.pdf", "application/pdf", "Field map.pdf"],
            [xlsx, "Schedule.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Schedule.xlsx"],
            [csv, "Schedule.CSV", "text/csv", "Schedule.csv"],
            [docx, "Incident form.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Incident form.docx"],
            [windowsText, "Ground rules", "text/plain", "Ground rules.txt"],
        ] as const;
        for (const [file, name, type, kept] of cases) {
            const made = await call("POST", "/v1/attachments", session, upload("venue", venue, file, {}, name));
            assert.equal(made.status, 201, name);
            assert.deepEqual([made.body.kind, made.body.contentType, made.body.name], ["file", type, kept], name);
        }
        const photo = await call("POST", "/v1/attachments", session, upload("venue", venue, jpeg, {}, "Parking.jpeg"));
        assert.deepEqual([photo.body.kind, photo.body.name], ["photo", undefined], "a photo on a venue goes in its grid");
        // Unless it's added as a file.
        const asFile = await call("POST", "/v1/attachments", session, upload("venue", venue, jpeg, { kind: "file" }, "Parking.jpeg"));
        assert.deepEqual([asFile.body.kind, asFile.body.name, asFile.body.hasThumb], ["file", "Parking.jpg", true]);
        const files = await list("venue", venue, "file");
        assert.deepEqual(files.map((f) => f.name), ["Field map.pdf", "Schedule.xlsx", "Schedule.csv", "Incident form.docx", "Ground rules.txt", "Parking.jpg"]);
        assert.deepEqual(files.map((f) => f.position), [0, 1, 2, 3, 4, 5], "files are in their own order");
        assert.equal((await list("venue", venue)).length, 1, "only photos without kind, as before files");
        assert.equal((await list("venue", venue, "all")).length, 7);
        assert.equal(files[0].hasThumb, false, "a PDF added without a thumbnail shows its icon");
        assert.equal((await call("GET", files[0].thumbUrl, session)).status, 404);
        const withThumb = await call("POST", "/v1/attachments", session, upload("competition", competition, pdf, { thumb: png }, "Rules.pdf"));
        assert.deepEqual([withThumb.body.kind, withThumb.body.hasThumb], ["file", true], "a competition's are always files");
        assert.deepEqual((await call("GET", withThumb.body.thumbUrl, session)).body, png);
    });

    test("anything else is refused, saying what it is and what's taken", async () => {
        const refused = async (file: Uint8Array<ArrayBuffer>, name: string, pattern: RegExp, recordType = "venue", id = venue, extra = {}) => {
            const res = await call("POST", "/v1/attachments", session, upload(recordType, id, file, extra, name));
            assert.equal(res.status, 400, name);
            assert.match(res.body.error, pattern, name);
        };
        await refused(bytes("<!doctype html><script>alert(1)</script>"), "rules.pdf", /Web pages, SVG and XML.*LawFive keeps PDF/);
        await refused(bytes("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "map.txt", /Web pages, SVG and XML/);
        await refused(bytes("  \uFEFF<?xml version='1.0'?><data/>"), "data.csv", /Web pages, SVG and XML/);
        await refused(bytes("not really a pdf"), "rules.pdf", /name says it's a PDF, but it isn't one/);
        await refused(xlsm, "Schedule.xlsx", /macros/);
        await refused(docm, "Form.docx", /macros/);
        await refused(pptx, "Slides.pptx", /kind of Office file/);
        await refused(zipOf({ "a.txt": "hi" }), "files.zip", /archives/);
        await refused(bytes("PK\x03\x04 not a zip at all"), "Schedule.xlsx", /name says it's an Excel spreadsheet/);
        await refused(ole, "Schedule.xls", /Older Office files/);
        await refused(exe, "setup.exe", /Programs/);
        await refused(new TextEncoder().encode("GIF89a\x01\x00\x01\x00") as Uint8Array<ArrayBuffer>, "x.gif", /GIF/);
        await refused(bytes("alert(1)"), "script.js", /\.js files aren't taken/);
        await refused(new Uint8Array(0), "empty.txt", /empty/);
        await refused(pdf, "Photo.pdf", /files, not photos/, "competition", competition, { kind: "photo" });
        const big = new Uint8Array(20 * 1024 * 1024 + 1);
        big.set(pdf);
        await refused(big, "Huge.pdf", /too big: at most 20 MB/);
        // At most 20 files a record, beside its photos.
        for (let i = (await list("competition", competition, "file")).length; i < 20; i++) {
            assert.equal((await call("POST", "/v1/attachments", session, upload("competition", competition, csv, {}, `Sheet ${i}.csv`))).status, 201);
        }
        const over = await call("POST", "/v1/attachments", session, upload("competition", competition, csv, {}, "One more.csv"));
        assert.equal(over.status, 400);
        assert.match(over.body.error, /at most 20 files/);
    });

    test("names are cleaned: no folders, control or direction characters, and the real ending (FILE-10)", async () => {
        const named = async (name: string) => (await call("POST", "/v1/attachments", session, upload("match", match, pdf, {}, name))).body;
        assert.equal((await named("invoice\u202Efdp.exe")).name, "invoicefdp.exe.pdf", "a right-to-left override can't make it look like a PDF");
        assert.equal((await named("C:\\Users\\ref\\Desktop\\Team sheet.PDF")).name, "Team sheet.pdf");
        assert.equal((await named("../../etc/passwd")).name, "passwd.pdf");
        assert.equal((await named("\u200B\u2066Match card\u2069\t\n.docx")).name, "Match card.pdf", "a wrong ending is replaced");
        assert.equal((await named("...")).name, "File.pdf");
        const long = await named(`${"é".repeat(200)}.pdf`);
        assert.equal(Array.from(long.name as string).length, 120);
        assert.match(long.name, /^é+\.pdf$/);
        assert.equal(cleanName("Zuschauerplätze.pdf".normalize("NFD"), "application/pdf"), "Zuschauerplätze.pdf".normalize("NFC"));

        const renamed = await call("PUT", `/v1/attachments/${long.id}`, session, { name: "Parking" });
        assert.equal(renamed.body.name, "Parking.pdf", "a renamed file keeps its ending");
        assert.equal((await call("PUT", `/v1/attachments/${long.id}`, session, { name: "Parking.docx" })).body.name, "Parking.pdf");
        assert.equal((await call("PUT", `/v1/attachments/${long.id}`, session, { name: " \u202E " })).status, 400);
        const photo = (await list("venue", venue))[0];
        assert.equal((await call("PUT", `/v1/attachments/${photo.id}`, session, { name: "Mine" })).status, 400, "photos have captions");
    });

    test("every file but a photo is a download, with its name, its type, nosniff and a sandbox (FILE-11)", async () => {
        const map = await call("POST", "/v1/attachments", session, upload("venue", venue, pdf, {}, "Café map \"north\".pdf"));
        const got = await call("GET", map.body.url, session);
        assert.deepEqual(got.body, pdf);
        assert.equal(got.headers.get("content-type"), "application/pdf");
        assert.equal(got.headers.get("content-disposition"), "attachment; filename=\"Cafe map _north_.pdf\"; filename*=UTF-8''Caf%C3%A9%20map%20%22north%22.pdf");
        assert.equal(got.headers.get("x-content-type-options"), "nosniff");
        assert.equal(got.headers.get("content-security-policy"), "default-src 'none'; sandbox");
        const text = (await list("venue", venue, "file")).find((f) => f.name === "Ground rules.txt")!;
        const plain = await call("GET", text.url, session);
        assert.equal(plain.headers.get("content-type"), "text/plain; charset=windows-1252", "text in the older Windows encoding says so");
        assert.match(plain.headers.get("content-disposition")!, /^attachment; /);
        const csvFile = (await list("venue", venue, "file")).find((f) => f.name === "Schedule.csv")!;
        assert.equal((await call("GET", csvFile.url, session)).headers.get("content-type"), "text/csv; charset=utf-8");

        const photo = (await list("venue", venue))[0];
        const shown = await call("GET", photo.url, session);
        assert.match(shown.headers.get("content-disposition")!, /^inline; filename="Photo.jpg"/, "a photo is shown in place");
        const saved = await call("GET", `${photo.url}?download=1`, session);
        assert.match(saved.headers.get("content-disposition")!, /^attachment; filename="Photo.jpg"/, "or downloaded with download=1");
        assert.equal(contentDisposition("attachment", "Spielplan ✓ 100%.pdf"), "attachment; filename=\"Spielplan _ 100_.pdf\"; filename*=UTF-8''Spielplan%20%E2%9C%93%20100%25.pdf");
    });

    test("thumbnails count against the account's room (SEC-6)", async () => {
        const [user] = await db.select().from(tables.user).where(eq(tables.user.email, "files@example.com"));
        const before = await filesUsed(db, user.id);
        await call("POST", "/v1/attachments", session, upload("venue", venue, pdf, { thumb: png }, "Counted.pdf"));
        assert.equal(await filesUsed(db, user.id), before + pdf.byteLength + png.byteLength);
    });

    test("API keys reach a file through its record's access (FILE-14)", async () => {
        const key = async (scopes: string[]) => (await call("POST", "/v1/api-keys", session, { name: scopes.join(" "), scopes })).body.key as string;
        const venuesRead = await key(["venues:read"]);
        const files = await list("venue", venue, "file");
        assert.equal((await call("GET", `/v1/attachments?recordType=venue&recordId=${venue}&kind=file`, venuesRead)).body.attachments.length, files.length);
        assert.deepEqual((await call("GET", files[0].url, venuesRead)).body, pdf);
        assert.equal((await call("POST", "/v1/attachments", venuesRead, upload("venue", venue, pdf, {}, "Mine.pdf"))).status, 403, "reading isn't adding");
        assert.equal((await call("PUT", `/v1/attachments/${files[0].id}`, venuesRead, { name: "Mine" })).status, 403);
        assert.equal((await call("DELETE", `/v1/attachments/${files[0].id}`, venuesRead)).status, 403);
        const matchFiles = await list("match", match, "file");
        assert.equal((await call("GET", `/v1/attachments?recordType=match&recordId=${match}&kind=file`, venuesRead)).status, 403, "not a match's");
        assert.equal((await call("GET", matchFiles[0].url, venuesRead)).status, 403);
        assert.equal((await call("GET", matchFiles[0].thumbUrl, venuesRead)).status, 403);
        const templatesOnly = await key(["match-templates:write"]);
        const none = await call("GET", `/v1/attachments?recordType=venue&recordId=${venue}`, templatesOnly);
        assert.equal(none.status, 403);
        assert.match(none.body.error, /needs read access/);

        const matchesWrite = await key(["matches:write"]);
        const added = await call("POST", "/v1/attachments", matchesWrite, upload("match", match, csv, {}, "Team sheet.csv"));
        assert.equal(added.status, 201);
        assert.equal((await call("PUT", `/v1/attachments/${added.body.id}`, matchesWrite, { name: "Team sheet (home)" })).body.name, "Team sheet (home).csv");
        assert.equal((await call("POST", "/v1/attachments", matchesWrite, upload("venue", venue, csv, {}, "Not mine.csv"))).status, 403, "nor a venue's");
        assert.equal((await call("DELETE", `/v1/attachments/${added.body.id}`, matchesWrite)).status, 200);
    });

    test("webhooks on the record's topic hear of a file added, changed and deleted, without the file (FILE-15)", async () => {
        const hook = await call("POST", "/v1/webhooks", session, { url: "http://127.0.0.1:9/hook", topics: ["competition"] });
        assert.equal(hook.status, 201);
        const made = await call("POST", "/v1/attachments", session, upload("match", match, pdf, {}, "Not heard.pdf"));
        const compFile = (await list("competition", competition, "file"))[0];
        await call("PUT", `/v1/attachments/${compFile.id}`, session, { name: "Rules 2026" });
        await call("DELETE", `/v1/attachments/${compFile.id}`, session);
        await settle();
        const deliveries = await db.select().from(tables.webhookDelivery).where(eq(tables.webhookDelivery.webhookId, hook.body.id));
        const events = deliveries.map((d) => d.event).sort();
        assert.deepEqual(events, ["attachment.deleted", "attachment.updated"], "a match's file isn't on the competition topic");
        const updated = deliveries.find((d) => d.event === "attachment.updated")!.payload as { data: Record<string, unknown> };
        assert.deepEqual([updated.data.id, updated.data.recordType, updated.data.name, updated.data.url], [compFile.id, "competition", "Rules 2026.pdf", compFile.url]);
        assert.ok(!("file" in updated.data) && !("bytes" in updated.data));
        assert.ok(made.body.id);
    });

    test("deleting a competition deletes its files", async () => {
        const rows = await db.select().from(tables.attachment).where(eq(tables.attachment.recordId, competition));
        const v = (await call("GET", `/v1/competitions/${competition}`, session)).body.version;
        assert.equal((await call("DELETE", `/v1/competitions/${competition}?version=${v}`, session)).status, 200);
        // The files go after the rows, in the background: wait for them rather than a fixed time.
        const left = async () => (await Promise.all(rows.map((r) => files.get(r.fileKey)))).filter((f) => f !== undefined).length;
        for (let tries = 0; tries < 50 && await left() > 0; tries++) {
            await settle();
        }
        assert.equal((await db.select().from(tables.attachment).where(eq(tables.attachment.recordId, competition))).length, 0);
        assert.equal(await left(), 0);
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
