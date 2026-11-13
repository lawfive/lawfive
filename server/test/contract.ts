import { type Endpoint, findEndpoint, responsesOf } from "@lawfive/schema";
import assert from "node:assert/strict";

// Checks requests and answers in the tests against the API description (schema/src/endpoints.ts),
// so the description can't drift from what the server does.

/** The described endpoint for a request, or a failed assertion when it isn't described. */
export function endpointFor(method: string, url: string): Endpoint {
    const path = new URL(url, "http://x").pathname;
    const found = findEndpoint(method, path);
    assert.ok(found, `${method} ${path} isn't in schema/src/endpoints.ts`);
    return found;
}

/** Fails when an answer isn't one the description lists, or its body has a different shape (fields missing, extra or wrong). */
export function checkAnswer(method: string, url: string, status: number, body: unknown, sent?: unknown) {
    const e = endpointFor(method, url);
    const where = `${method} ${url} → ${status}`;
    const answer = responsesOf(e)[status];
    assert.ok(answer, `${where} isn't a described answer`);
    if (answer.text !== undefined) {
        assert.equal(body, answer.text, where);
    } else if (answer.image || answer.zip) {
        assert.ok(body instanceof Uint8Array && body.byteLength > 0, `${where}: ${answer.zip ? "a zip" : "an image"}`);
    } else if (answer.csv || answer.calendar) {
        assert.equal(typeof body, "string", `${where}: ${answer.csv ? "CSV" : "iCalendar"}`);
    } else if (answer.body) {
        const parsed = answer.body.safeParse(body);
        assert.ok(parsed.success, `${where}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
        // Parsing drops fields the description doesn't have, so a difference means an undescribed field.
        assert.deepEqual(parsed.data, body, `${where}: the body has fields the description doesn't`);
    }
    if (sent !== undefined && e.body && status < 300) {
        const request = e.body.safeParse(sent);
        assert.ok(request.success, `${method} ${url}: the request worked, but the description says it's invalid: ${request.success ? "" : JSON.stringify(request.error.issues)}`);
    }
}
