import { and, asc, eq, sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { type Db, tables } from "./db/index.ts";
import { type ContentType, docx, xlsx } from "./fileTypes.ts";
import type { FileStore } from "./storage.ts";

// The demo account's files (FILE-6): a parking map and ground rules on Twin Creeks, the league's
// rules, schedule and contacts on the Bay Youth League, and a team sheet on its next match there,
// so the website's Files cards have something in them. Made here rather than kept as files, and
// small: a one-page PDF (one with a thumbnail, as a phone would make, one without, as the website
// adds them), a real XLSX and DOCX, a CSV and a text file.

/** A one-page PDF of a title and lines of text, in Helvetica (ASCII only). */
function pdf(title: string, lines: string[]): Uint8Array {
    const text = (t: string) => `(${t.replace(/[\\()]/g, (ch) => `\\${ch}`)}) Tj`;
    const content = ["BT", "/F1 22 Tf", "56 736 Td", text(title), "/F1 12 Tf", "0 -34 Td", ...lines.flatMap((l) => [text(l), "0 -18 Td"]), "ET"].join("\n");
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (const [i, o] of objects.entries()) {
        offsets.push(out.length);
        out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return strToU8(out);
}

/** A PNG of a page with a heading, a plan of fields and lines of text: the PDF's first page, as a phone would draw it (FILE-12). */
function pageThumbnail(): Uint8Array {
    const width = 240;
    const height = 310;
    const pixels = Buffer.alloc((width * 3 + 1) * height);
    const paint = (x0: number, y0: number, x1: number, y1: number, [r, g, b]: [number, number, number]) => {
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const at = y * (width * 3 + 1) + 1 + x * 3;
                pixels[at] = r;
                pixels[at + 1] = g;
                pixels[at + 2] = b;
            }
        }
    };
    paint(0, 0, width, height, [255, 255, 255]);
    paint(22, 24, 170, 38, [32, 36, 34]);
    // The fields, in grass green with chalk lines, and the north lot.
    paint(22, 56, 218, 196, [62, 140, 76]);
    for (const [x, y] of [[32, 66], [126, 66], [32, 132], [126, 132]]) {
        paint(x, y, x + 82, y + 54, [255, 255, 255]);
        paint(x + 3, y + 3, x + 79, y + 51, [76, 160, 90]);
        paint(x + 40, y + 3, x + 42, y + 51, [255, 255, 255]);
    }
    paint(22, 204, 218, 226, [200, 200, 196]);
    for (let y = 240; y < 296; y += 14) {
        paint(22, y, y === 282 ? 140 : 210, y + 5, [176, 180, 178]);
    }
    const chunk = (type: string, data: Buffer) => {
        const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body));
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8);
    return new Uint8Array(Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "binary"), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]));
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const relationships = (target: string, type: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;

/** An Excel workbook of one sheet of text cells. */
function workbook(sheet: string, rows: string[][]): Uint8Array {
    const cells = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`).join("")}</row>`).join("");
    return zipSync({
        "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
        "_rels/.rels": strToU8(relationships("xl/workbook.xml", "officeDocument")),
        "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
        "xl/_rels/workbook.xml.rels": strToU8(relationships("worksheets/sheet1.xml", "worksheet")),
        "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`),
    });
}

/** A Word document of paragraphs. */
function document(paragraphs: string[]): Uint8Array {
    const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${xml(p)}</w:t></w:r></w:p>`).join("");
    return zipSync({
        "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
        "_rels/.rels": strToU8(relationships("word/document.xml", "officeDocument")),
        "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
    });
}

/** Adds the demo's files to the records they're for; records it can't find are skipped. `newId` gives the phones' fixtures the same ids every run. */
export async function seedDemoFiles(db: Db, store: FileStore, userId: string, newId: () => string = randomUUID) {
    const { records, attachment } = tables;
    const named = async (type: string, name: string) =>
        (await db.select({ id: records.id }).from(records).where(and(eq(records.userId, userId), eq(records.type, type), sql`${records.data}->>'name' = ${name}`)))[0]?.id;
    const venue = await named("venue", "Twin Creeks Sports Complex");
    const league = await named("competition", "Bay Youth League U12 Boys");
    const [match] = league ? await db.select({ id: records.id }).from(records)
        .where(and(eq(records.userId, userId), eq(records.type, "match"), sql`${records.data}->>'competitionId' = ${league}`, sql`${records.data}->>'status' = 'scheduled'`))
        .orderBy(asc(sql`${records.data}->>'kickoff'`)).limit(1) : [];
    const thumb = pageThumbnail();
    const files: { recordType: string; recordId?: string; name: string; contentType: ContentType; data: Uint8Array; thumb?: Uint8Array; daysAgo: number }[] = [
        {
            recordType: "venue", recordId: venue, name: "Parking and field map.pdf", contentType: "application/pdf", thumb, daysAgo: 30,
            data: pdf("Twin Creeks: parking and fields", ["Park in the north lot, off Caribbean Drive.", "Fields 1 to 4 are past the snack bar, in order from the lot.", "Referees check in at the scorer's table by Field 1.", "The gate closes 30 minutes after the last match."]),
        },
        {
            recordType: "venue", recordId: venue, name: "Ground rules.txt", contentType: "text/plain", daysAgo: 30,
            data: strToU8("Twin Creeks Sports Complex: ground rules\r\n\r\nNo dogs on the fields.\r\nNo metal studs on the turf fields.\r\nSpectators stay behind the rope, 2 yards back from the touchline.\r\nLightning: everyone off the fields at the first strike; 30 minutes after the last before play starts again.\r\nLost and found is at the snack bar.\r\n"),
        },
        {
            recordType: "competition", recordId: league, name: "BYL rules 2026-27.pdf", contentType: "application/pdf", daysAgo: 60,
            data: pdf("Bay Youth League: rules for 2026-27", ["U12: 9 a side, two halves of 30 minutes, a 5-minute break.", "Unlimited substitutions at throw-ins in your favor, goal kicks and halftime.", "No heading the ball in U12 matches: an indirect free kick to the other side.", "Build-out line in use for U10 and younger only.", "Send the match card to the league within 24 hours."]),
        },
        {
            recordType: "competition", recordId: league, name: "Fall schedule.xlsx", contentType: xlsx, daysAgo: 45,
            data: workbook("Schedule", [["Date", "Kickoff", "Home", "Away", "Venue", "Field"], ["Sat Nov 21", "9:00", "Strikers U12", "Rovers U12", "Twin Creeks", "Field 3"], ["Sat Nov 28", "10:00", "Cobras U12", "Strikers U12", "Twin Creeks", "Field 3"], ["Sat Dec 5", "10:00", "Rovers U12", "United U12", "Baylands Park", "Field A"]]),
        },
        {
            recordType: "competition", recordId: league, name: "Referee contacts.csv", contentType: "text/csv", daysAgo: 45,
            data: strToU8("Name,Role,Phone,Email\r\nDana Whitfield,Assignor,+1 555 0199,dana@example.com\r\nMarcus Bell,Referee coordinator,+1 555 0177,marcus@example.com\r\nLeague office,Match cards,+1 555 0150,cards@example.com\r\n"),
        },
        {
            recordType: "match", recordId: match?.id, name: "Team sheet - Strikers U12.docx", contentType: docx, daysAgo: 1,
            data: document(["Strikers U12: team sheet", "Coach: R. Alvarez. Assistant: K. Osei.", "Players: 18 listed, shirt numbers 1 to 22.", "Colors: red shirts, black shorts, red socks; goalkeeper in yellow."]),
        },
    ];
    const positions = new Map<string, number>();
    for (const f of files) {
        if (!f.recordId) {
            continue;
        }
        const id = newId();
        const fileKey = `${userId}/${id}`;
        const thumbKey = f.thumb ? `${fileKey}.thumb` : undefined;
        await store.put(fileKey, f.data, f.contentType);
        if (f.thumb && thumbKey) {
            await store.put(thumbKey, f.thumb, "image/png");
        }
        const position = positions.get(f.recordId) ?? 0;
        positions.set(f.recordId, position + 1);
        await db.insert(attachment).values({
            id, userId, recordType: f.recordType, recordId: f.recordId, kind: "file", contentType: f.contentType, name: f.name,
            size: f.data.byteLength, thumbSize: f.thumb?.byteLength, position, fileKey, thumbKey, createdAt: new Date(Date.now() - f.daysAgo * 86_400_000),
        });
    }
}
