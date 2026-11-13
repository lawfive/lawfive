import assert from "node:assert/strict";
import { test } from "node:test";
import { inviteMessage, mailOptions } from "../src/mail.ts";

// USR-5 and WEB-25: an email's HTML card shows the wordmark, sent inside the email as an inline picture.

test("an email carries its wordmark inline, at half its pixels", () => {
    const options = mailOptions("LawFive <lawfive@example.com>", inviteMessage("sam@example.com", "Sam", "Alex", "https://app.example.com/invite/abc", 14));
    const [wordmark] = options.attachments;
    assert.equal(options.attachments.length, 1);
    assert.equal(wordmark.contentDisposition, "inline");
    // A PNG, drawn at 2x.
    assert.deepEqual([...wordmark.content.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(""), "PNG");
    const width = wordmark.content.readUInt32BE(16);
    const height = wordmark.content.readUInt32BE(20);
    assert.ok(options.html.includes(`src="cid:${wordmark.cid}"`));
    assert.ok(options.html.includes(`width="${Math.round(width / 2)}" height="${Math.round(height / 2)}"`));
    assert.ok(options.html.includes(`alt="LawFive"`));
    // The plain text has the link on a line of its own.
    assert.ok(options.text.endsWith("Make your account: https://app.example.com/invite/abc\n"));
});
