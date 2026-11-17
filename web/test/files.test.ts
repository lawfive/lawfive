import assert from "node:assert/strict";
import { test } from "node:test";
import { canLookAt, describeFile, downloadUrl, fileKind } from "../src/files.ts";

// FILE-6, FILE-11, FILE-12: how the Files card describes a file, and where it downloads it from.

const pdf = "application/pdf" as const;

test("a file's line is its kind and size", () => {
    assert.equal(describeFile({ contentType: pdf, size: 1_258_291 }), "PDF · 1.2 MB");
    assert.equal(describeFile({ contentType: "text/csv", size: 198 }), "CSV · 198 bytes");
    assert.equal(describeFile({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 48_000 }), "Spreadsheet · 47 KB");
    assert.equal(describeFile({ contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 15 * 1024 * 1024 }), "Word · 15 MB");
    assert.equal(describeFile({ contentType: "image/jpeg", size: 2048 }), "Photo · 2 KB");
});

test("photos, CSV and text can be looked at here; the rest are downloaded", () => {
    assert.deepEqual(([pdf, "text/csv", "text/plain", "image/png"] as const).map((contentType) => canLookAt({ contentType })), [false, true, true, true]);
    assert.equal(fileKind({ contentType: "text/plain" }), "txt");
});

test("Download asks for a download, also of a photo, and keeps a replaced file's version", () => {
    assert.equal(downloadUrl({ url: "/v1/attachments/1/file" }), "/v1/attachments/1/file?download=1");
    assert.equal(downloadUrl({ url: "/v1/attachments/1/file?v=a1b2c3d4" }), "/v1/attachments/1/file?v=a1b2c3d4&download=1");
});
