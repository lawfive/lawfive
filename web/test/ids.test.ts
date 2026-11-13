import assert from "node:assert/strict";
import { test } from "node:test";
import { newId } from "../src/ids.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("a new ID is a version 4 UUID", () => {
    assert.match(newId(), uuid);
});

test("without randomUUID (a page on plain HTTP), the ID is still a version 4 UUID, and new each time", () => {
    // Hidden as a browser hides it; it lives on Crypto's prototype, so an own property covers it.
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    let ids: Set<string>;
    try {
        ids = new Set(Array.from({ length: 200 }, () => newId()));
    } finally {
        delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
    assert.equal(ids.size, 200);
    for (const id of ids) {
        assert.match(id, uuid);
    }
});
