import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import type { SignUpMode } from "../src/config.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import type { Message } from "../src/mail.ts";
import { checkAnswer } from "./contract.ts";

// Admins, approval and invitations (USR-1 to USR-5), on servers set up each way.

const publicUrl = "http://localhost:3000";
const password = "correct horse battery";

async function server(mode: SignUpMode, withMail = true) {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const sent: Message[] = [];
    const access: AccessSettings = {
        signUp: mode,
        adminEmails: ["boss@example.com"],
        publicUrl,
        ...(withMail ? { mailer: { send: async (m: Message) => void sent.push(m) } } : {}),
    };
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });

    async function call(method: string, path: string, token?: string, body?: unknown) {
        const res = await app.request(path, {
            method,
            headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed, token: res.headers.get("set-auth-token") ?? undefined };
    }
    const signUp = (email: string, name: string, invite?: string) =>
        call("POST", "/v1/auth/sign-up/email", undefined, { name, email, password, ...(invite ? { invite } : {}) });
    const signIn = (email: string) => call("POST", "/v1/auth/sign-in/email", undefined, { email, password });
    // Emails go out without being waited for.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    return { call, signUp, signIn, sent, settle };
}

describe("sign-up with approval", async () => {
    const s = await server("approval");
    let boss: string;
    let sam: string;
    let samId: string;

    test("the server says approval is needed", async () => {
        const meta = await s.call("GET", "/v1/meta");
        assert.equal(meta.body.signUp, "approval");
        assert.ok(meta.body.capabilities.includes("email"));
    });

    test("an address in ADMIN_EMAILS is an admin straight away", async () => {
        const up = await s.signUp("Boss@example.com", "The Boss");
        boss = up.token!;
        assert.deepEqual((await s.call("GET", "/v1/account", boss)).body, { id: up.body.user.id, name: "The Boss", email: "boss@example.com", status: "active", admin: true });
    });

    test("anyone else waits, sees only their account, and can't link a watch", async () => {
        const up = await s.signUp("sam@example.com", "Sam Lee");
        assert.equal(up.status, 200);
        assert.equal(up.body.user.status, "pending");
        sam = up.token!;
        samId = up.body.user.id;
        assert.equal((await s.call("GET", "/v1/account", sam)).body.status, "pending");
        assert.equal((await s.call("GET", "/v1/matches", sam)).status, 403);
        assert.equal((await s.call("POST", "/v1/api-keys", sam, { name: "x", scopes: ["matches:read"] })).status, 403);
        const approve = await s.call("POST", "/v1/auth/device/approve", sam, { userCode: "BCDFGHJK" });
        assert.equal(approve.status, 403);
        assert.equal(approve.body.code, "ACCOUNT_PENDING");
        assert.equal((await s.signIn("sam@example.com")).status, 200, "they can still sign in");
    });

    test("admins are emailed about it, and see them first", async () => {
        await s.settle();
        const waiting = s.sent.find((m) => m.subject === "Sam Lee is waiting for approval");
        assert.equal(waiting?.to, "boss@example.com");
        assert.equal(waiting?.action?.url, `${publicUrl}/people`);
        const people = (await s.call("GET", "/v1/people", boss)).body.people;
        assert.deepEqual(people.map((p: { name: string; status: string }) => [p.name, p.status]), [["Sam Lee", "pending"], ["The Boss", "active"]]);
        assert.equal(people[1].adminFromSetting, true);
    });

    test("approving lets them in and emails them", async () => {
        assert.equal((await s.call("GET", "/v1/people", sam)).status, 403);
        const approved = await s.call("POST", `/v1/people/${samId}/approve`, boss, {});
        assert.equal(approved.body.status, "active");
        assert.equal((await s.call("GET", "/v1/matches", sam)).status, 200);
        await s.settle();
        assert.equal(s.sent.at(-1)?.to, "sam@example.com");
        assert.equal(s.sent.at(-1)?.subject, "Your LawFive account is ready");
        assert.equal((await s.call("GET", "/v1/people", sam)).status, 403, "still not an admin");
        const emails = s.sent.length;
        assert.equal((await s.call("POST", `/v1/people/${samId}/approve`, boss, {})).status, 200, "approving again changes nothing");
        await s.settle();
        assert.equal(s.sent.length, emails, "and emails no one");
    });

    test("declining deletes a waiting account, and only a waiting one", async () => {
        const up = await s.signUp("nope@example.com", "No Thanks");
        assert.equal((await s.call("POST", `/v1/people/${up.body.user.id}/decline`, boss, {})).status, 200);
        assert.equal((await s.signIn("nope@example.com")).status, 401);
        assert.equal((await s.call("POST", `/v1/people/${samId}/decline`, boss, {})).status, 409);
        assert.equal((await s.call("POST", "/v1/people/nobody/decline", boss, {})).status, 404);
    });

    test("admins make other admins, but not themselves or ADMIN_EMAILS", async () => {
        const made = await s.call("PUT", `/v1/people/${samId}/admin`, boss, { admin: true });
        assert.equal(made.body.admin, true);
        assert.equal((await s.call("GET", "/v1/account", sam)).body.admin, true);
        const bossId = (await s.call("GET", "/v1/account", boss)).body.id;
        assert.equal((await s.call("PUT", `/v1/people/${bossId}/admin`, sam, { admin: false })).status, 409, "ADMIN_EMAILS");
        assert.equal((await s.call("PUT", `/v1/people/${samId}/admin`, sam, { admin: false })).status, 409, "themselves");
        assert.equal((await s.call("PUT", `/v1/people/${samId}/admin`, boss, { admin: false })).body.admin, false);
    });
});

describe("invitations, with sign-up closed", async () => {
    const s = await server("closed");
    let boss: string;

    test("after the first account, nobody can sign up without one", async () => {
        boss = (await s.signUp("boss@example.com", "The Boss")).token!;
        const refused = await s.signUp("someone@example.com", "Someone");
        assert.equal(refused.status, 400);
        assert.equal(refused.body.code, "SIGN_UP_CLOSED");
        assert.equal((await s.call("GET", "/v1/meta")).body.signUp, "closed");
    });

    test("an invitation for an address, emailed, works once and only for that address", async () => {
        const made = await s.call("POST", "/v1/invites", boss, { email: "Ana@Example.com", name: "Ana", send: true });
        assert.equal(made.status, 201);
        assert.equal(made.body.emailed, true);
        const { invite } = made.body;
        assert.equal(invite.email, "ana@example.com");
        assert.ok(invite.emailedAt);
        const token = invite.link.split("/invite/")[1];
        assert.equal(invite.link, `${publicUrl}/invite/${token}`);
        const email = s.sent.at(-1)!;
        assert.equal(email.to, "ana@example.com");
        assert.equal(email.subject, "The Boss invited you to LawFive");
        assert.equal(email.action?.url, invite.link);

        const lookup = await s.call("GET", `/v1/invite/${token}`);
        assert.deepEqual({ ...lookup.body, expiresAt: undefined }, { email: "ana@example.com", name: "Ana", invitedBy: "The Boss", expiresAt: undefined });
        const wrong = await s.signUp("other@example.com", "Other", token);
        assert.equal(wrong.body.code, "INVITE_EMAIL_MISMATCH");
        const up = await s.signUp("ana@example.com", "Ana Silva", token);
        assert.equal(up.status, 200);
        assert.equal(up.body.user.status, "active");
        assert.equal((await s.call("GET", "/v1/matches", up.token)).status, 200);

        assert.equal((await s.signUp("ana2@example.com", "Ana again", token)).body.code, "INVITE_INVALID");
        assert.equal((await s.call("GET", `/v1/invite/${token}`)).status, 410);
        const listed = (await s.call("GET", "/v1/invites", boss)).body.invites[0];
        assert.equal(listed.usedBy, "Ana Silva");
        assert.equal((await s.call("DELETE", `/v1/invites/${listed.id}`, boss)).status, 404, "a used one stays");
        const people = (await s.call("GET", "/v1/people", boss)).body.people;
        assert.equal(people.find((p: { name: string }) => p.name === "Ana Silva").invitedBy, "The Boss");
    });

    test("a link for anyone, cancelled", async () => {
        const made = await s.call("POST", "/v1/invites", boss, {});
        assert.equal(made.body.emailed, false);
        const token = made.body.invite.link.split("/invite/")[1];
        assert.equal((await s.call("GET", `/v1/invite/${token}`)).body.email, undefined);
        assert.equal((await s.call("DELETE", `/v1/invites/${made.body.invite.id}`, boss)).status, 200);
        assert.equal((await s.call("GET", `/v1/invite/${token}`)).status, 404);
        assert.equal((await s.signUp("late@example.com", "Late", token)).body.code, "INVITE_INVALID");
        assert.equal((await s.call("GET", "/v1/invite/not-a-real-token-at-all")).status, 404);
    });

    test("SEC-8: a link for anyone makes one account, even with two sign-ups at once", async () => {
        const made = await s.call("POST", "/v1/invites", boss, {});
        const token = made.body.invite.link.split("/invite/")[1];
        const both = await Promise.all([s.signUp("one@example.com", "One", token), s.signUp("two@example.com", "Two", token)]);
        assert.deepEqual(both.map((r) => r.status).sort(), [200, 400]);
    });

    test("not for someone who has an account, and only admins invite", async () => {
        assert.equal((await s.call("POST", "/v1/invites", boss, { email: "ana@example.com" })).status, 409);
        assert.equal((await s.call("POST", "/v1/invites", boss, { email: "not an email" })).status, 400);
        const ana = (await s.signIn("ana@example.com")).token;
        assert.equal((await s.call("POST", "/v1/invites", ana, {})).status, 403);
        assert.equal((await s.call("GET", "/v1/invites", ana)).status, 403);
    });
});

describe("without email", async () => {
    const s = await server("open", false);

    test("invitations aren't emailed, and open sign-up needs nothing", async () => {
        assert.ok(!(await s.call("GET", "/v1/meta")).body.capabilities.includes("email"));
        const boss = (await s.signUp("boss@example.com", "The Boss")).token;
        const made = await s.call("POST", "/v1/invites", boss, { email: "kim@example.com", send: true });
        assert.equal(made.body.emailed, false);
        assert.equal((await s.signUp("anyone@example.com", "Anyone")).body.user.status, "active");
    });

    test("USR-9: without email, a change of email is made straight away, with the password", async () => {
        const token = (await s.signIn("anyone@example.com")).token;
        const changed = await s.call("PUT", "/v1/account/email", token, { email: "someone@example.com", password });
        assert.equal(changed.status, 200);
        assert.equal(changed.body.email, "someone@example.com");
        assert.equal(changed.body.pendingEmail, undefined);
    });
});

// USR-7: forgotten passwords, suspending and deleting accounts, people's own account, and who can sign up.

const tokenOf = (link: string) => link.split("/reset-password/")[1];

describe("forgotten passwords", async () => {
    const s = await server("open");
    let boss: string;

    test("an emailed link sets a new password, once", async () => {
        boss = (await s.signUp("boss@example.com", "The Boss")).token!;
        const kim = await s.signUp("kim@example.com", "Kim Park");
        const asked = await s.call("POST", "/v1/auth/request-password-reset", undefined, { email: "kim@example.com" });
        assert.equal(asked.status, 200);
        await s.settle();
        const mail = s.sent.find((m) => m.to === "kim@example.com" && m.subject.includes("Reset"));
        assert.ok(mail?.action?.url.startsWith(`${publicUrl}/reset-password/`), "a link to the web app's page");
        const token = tokenOf(mail!.action!.url);
        assert.equal((await s.call("POST", "/v1/auth/reset-password", undefined, { token, newPassword: "a brand new password" })).status, 200);
        assert.equal((await s.call("POST", "/v1/auth/reset-password", undefined, { token, newPassword: "and another one" })).status, 400, "it works once");
        assert.equal((await s.signIn("kim@example.com")).status, 401, "the old password doesn't work");
        assert.equal((await s.call("POST", "/v1/auth/sign-in/email", undefined, { email: "kim@example.com", password: "a brand new password" })).status, 200);
        assert.equal((await s.call("GET", "/v1/account", kim.token)).status, 200, "devices already signed in stay signed in");
    });

    test("an unknown address gets the same answer, and no email", async () => {
        const before = s.sent.length;
        const asked = await s.call("POST", "/v1/auth/request-password-reset", undefined, { email: "nobody@example.com" });
        assert.equal(asked.status, 200);
        await s.settle();
        assert.equal(s.sent.length, before);
    });

    test("an admin's reset link works the same way, for others only", async () => {
        const sam = await s.signUp("sam@example.com", "Sam Lee");
        const samId = sam.body.user.id;
        assert.equal((await s.call("POST", `/v1/people/${samId}/reset-link`, sam.token, {})).status, 403, "admins only");
        const bossId = (await s.call("GET", "/v1/account", boss)).body.id;
        assert.equal((await s.call("POST", `/v1/people/${bossId}/reset-link`, boss, {})).status, 409, "not your own");
        const made = await s.call("POST", `/v1/people/${samId}/reset-link`, boss, {});
        assert.equal(made.status, 201);
        assert.ok(Date.parse(made.body.expiresAt) - Date.now() > 23 * 3_600_000, "for 24 hours");
        assert.equal((await s.call("POST", "/v1/auth/reset-password", undefined, { token: tokenOf(made.body.link), newPassword: "sams new password" })).status, 200);
        assert.equal((await s.call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password: "sams new password" })).status, 200);
    });

    test("changing your own password needs the current one", async () => {
        const lee = (await s.signUp("lee@example.com", "Lee Chan")).token!;
        assert.equal((await s.call("POST", "/v1/auth/change-password", lee, { currentPassword: "wrong password", newPassword: "lees new password" })).status, 400);
        assert.equal((await s.call("POST", "/v1/auth/change-password", lee, { currentPassword: password, newPassword: "lees new password" })).status, 200);
        assert.equal((await s.call("POST", "/v1/auth/sign-in/email", undefined, { email: "lee@example.com", password: "lees new password" })).status, 200);
        assert.equal((await s.call("GET", "/v1/account", lee)).status, 200, "still signed in");
    });
});

describe("forgotten passwords, without email", async () => {
    const s = await server("open", false);

    test("asking for an email says the server can't, and an admin's link still works", async () => {
        const boss = (await s.signUp("boss@example.com", "The Boss")).token!;
        const asked = await s.call("POST", "/v1/auth/request-password-reset", undefined, { email: "boss@example.com" });
        assert.equal(asked.status, 400);
        assert.equal(asked.body.code, "RESET_PASSWORD_DISABLED");
        const kimId = (await s.signUp("kim@example.com", "Kim Park")).body.user.id;
        const made = await s.call("POST", `/v1/people/${kimId}/reset-link`, boss, {});
        assert.equal((await s.call("POST", "/v1/auth/reset-password", undefined, { token: tokenOf(made.body.link), newPassword: "kims new password" })).status, 200);
    });
});

describe("suspending and deleting accounts", async () => {
    const s = await server("open");
    const boss = (await s.signUp("boss@example.com", "The Boss")).token!;
    const bossId = (await s.call("GET", "/v1/account", boss)).body.id;
    const kim = await s.signUp("kim@example.com", "Kim Park");
    const kimId = kim.body.user.id;

    test("a suspended account is signed out, can't sign in, and its key and calendar stop", async () => {
        const key = (await s.call("POST", "/v1/api-keys", kim.token, { name: "Script", scopes: ["matches:read"] })).body.key;
        const feed = (await s.call("POST", "/v1/calendar", kim.token, {})).body.url as string;
        const feedPath = new URL(feed).pathname;
        assert.equal((await s.call("GET", feedPath)).status, 200);

        assert.equal((await s.call("PUT", `/v1/people/${kimId}/suspended`, kim.token, { suspended: true })).status, 403, "admins only");
        const suspended = await s.call("PUT", `/v1/people/${kimId}/suspended`, boss, { suspended: true });
        assert.equal(suspended.body.status, "suspended");
        assert.equal((await s.call("GET", "/v1/account", kim.token)).status, 401, "signed out everywhere");
        const signIn = await s.signIn("kim@example.com");
        assert.equal(signIn.status, 403);
        assert.equal(signIn.body.code, "ACCOUNT_SUSPENDED");
        assert.equal((await s.call("GET", "/v1/matches", key)).status, 401);
        assert.equal((await s.call("GET", feedPath)).status, 403);

        assert.equal((await s.call("PUT", `/v1/people/${kimId}/suspended`, boss, { suspended: false })).body.status, "active");
        assert.equal((await s.signIn("kim@example.com")).status, 200);
        assert.equal((await s.call("GET", "/v1/matches", key)).status, 200);
    });

    test("not your own account, or one ADMIN_EMAILS makes an admin", async () => {
        assert.equal((await s.call("PUT", `/v1/people/${bossId}/suspended`, boss, { suspended: true })).status, 409);
        await s.call("PUT", `/v1/people/${kimId}/admin`, boss, { admin: true });
        const kimToken = (await s.signIn("kim@example.com")).token!;
        assert.equal((await s.call("PUT", `/v1/people/${bossId}/suspended`, kimToken, { suspended: true })).status, 409);
        assert.equal((await s.call("DELETE", `/v1/people/${bossId}`, kimToken)).status, 409);
        assert.equal((await s.call("DELETE", `/v1/people/${bossId}`, boss)).status, 409, "your own is deleted in Settings");
    });

    test("deleting an account deletes everything in it", async () => {
        const sam = await s.signUp("sam@example.com", "Sam Lee");
        await s.call("PUT", `/v1/matches/${crypto.randomUUID()}`, sam.token, { status: "scheduled", format: { periods: 2, periodSec: 2700, breakSec: 900, halfwayBreak: false, halfwayBreakSec: 120, teamSize: 11, clock: "up", trackStoppage: false, goalTypes: false, extraTime: false, extraTimePeriods: 2, extraTimePeriodSec: 900, penalties: false }, home: {}, away: {} });
        assert.equal((await s.call("DELETE", `/v1/people/${sam.body.user.id}`, boss)).body.ok, true);
        assert.equal((await s.call("GET", "/v1/account", sam.token)).status, 401);
        assert.equal((await s.signIn("sam@example.com")).status, 401);
        const again = await s.signUp("sam@example.com", "Sam Lee");
        assert.deepEqual((await s.call("GET", "/v1/matches", again.token)).body.items, [], "a new account starts empty");
    });
});

describe("your own account", async () => {
    const s = await server("open");
    const boss = (await s.signUp("boss@example.com", "The Boss")).token!;
    const kim = (await s.signUp("kim@example.com", "Kim Park")).token!;
    const lee = (await s.signUp("lee@example.com", "Lee Chan")).token!;

    test("changing your email needs your password, and a free address that ADMIN_EMAILS doesn't list", async () => {
        const change = (token: string, email: string, pw = password) => s.call("PUT", "/v1/account/email", token, { email, password: pw });
        assert.equal((await change(kim, "kim.park@example.com", "wrong password")).status, 400);
        assert.equal((await change(kim, "not an email")).status, 400);
        assert.equal((await change(kim, "lee@example.com")).status, 409, "taken");
        assert.equal((await change(kim, "boss@example.com")).status, 409, "would make Kim an admin");
        assert.equal((await change(boss, "theboss@example.com")).status, 409, "ADMIN_EMAILS has it");
        // USR-9: this server can email, so the new address gets a link, and nothing changes until it's followed.
        const asked = await change(kim, "Kim.Park@example.com");
        assert.equal(asked.status, 202);
        assert.equal(asked.body.email, "kim@example.com");
        assert.equal(asked.body.pendingEmail, "kim.park@example.com");
        await s.settle();
        const mail = s.sent.find((m) => m.to === "kim.park@example.com")!;
        assert.match(mail.subject, /Confirm your new email/);
        const token = mail.action!.url.split("/confirm-email/")[1];
        assert.ok(token);
        assert.equal((await s.signIn("kim@example.com")).status, 200, "the old address still works");
        assert.equal((await s.call("GET", "/v1/account", kim)).body.pendingEmail, "kim.park@example.com");
        // The link works without signing in, once.
        assert.equal((await s.call("POST", "/v1/account/email/confirm", undefined, { token: "not-the-token-at-all" })).status, 400);
        assert.deepEqual((await s.call("POST", "/v1/account/email/confirm", undefined, { token })).body, { email: "kim.park@example.com" });
        assert.equal((await s.call("POST", "/v1/account/email/confirm", undefined, { token })).status, 400, "used");
        assert.equal((await s.signIn("kim.park@example.com")).status, 200);
        assert.equal((await s.signIn("kim@example.com")).status, 401);
        const account = (await s.call("GET", "/v1/account", kim)).body;
        assert.equal(account.email, "kim.park@example.com");
        assert.equal(account.pendingEmail, undefined);
        await s.settle();
        assert.ok(s.sent.some((m) => m.to === "kim@example.com" && /has changed/.test(m.subject)), "the old address is told");
    });

    test("USR-9: a change waiting can be canceled or replaced, and the address must still be free", async () => {
        const change = (email: string) => s.call("PUT", "/v1/account/email", lee, { email, password });
        const linkTo = async (email: string) => {
            await s.settle();
            return s.sent.filter((m) => m.to === email).at(-1)!.action!.url.split("/confirm-email/")[1];
        };
        assert.equal((await change("lee.one@example.com")).status, 202);
        const first = await linkTo("lee.one@example.com");
        assert.equal((await change("lee.two@example.com")).body.pendingEmail, "lee.two@example.com");
        const second = await linkTo("lee.two@example.com");
        assert.equal((await s.call("POST", "/v1/account/email/confirm", undefined, { token: first })).status, 400, "replaced");
        const canceled = await s.call("DELETE", "/v1/account/email", lee);
        assert.equal(canceled.body.pendingEmail, undefined);
        assert.equal((await s.call("POST", "/v1/account/email/confirm", undefined, { token: second })).status, 400, "canceled");
        // Someone else takes the address before the link is followed.
        assert.equal((await change("lee.three@example.com")).status, 202);
        const third = await linkTo("lee.three@example.com");
        await s.signUp("lee.three@example.com", "Another Lee");
        assert.equal((await s.call("POST", "/v1/account/email/confirm", undefined, { token: third })).status, 409);
        assert.equal((await s.call("GET", "/v1/account", lee)).body.email, "lee@example.com");
    });

    test("USR-10: the name changes through update-user, with sign-up's rule, and nothing else does", async () => {
        const rename = (body: unknown, token = kim) => s.call("POST", "/v1/auth/update-user", token, body);
        assert.equal((await rename({ name: "  Kim Park-Lee " })).status, 200);
        assert.equal((await s.call("GET", "/v1/account", kim)).body.name, "Kim Park-Lee", "trimmed");
        assert.equal((await rename({ name: "   " })).status, 400);
        assert.equal((await rename({ name: "x".repeat(101) })).status, 400);
        assert.equal((await rename({ name: "Kim", image: "https://example.com/me.png" })).status, 400);
        assert.equal((await rename({ role: "admin" })).status, 400);
        assert.equal((await s.call("GET", "/v1/account", kim)).body.admin, false);
        assert.equal((await rename({ name: "Nobody" }, "no-such-token")).status, 401);
        assert.equal((await s.call("POST", "/v1/auth/sign-up/email", undefined, { name: " ", email: "blank@example.com", password })).status, 400);
    });

    test("deleting your account needs your password, and leaves the server an admin", async () => {
        assert.equal((await s.call("POST", "/v1/account/delete", kim, { password: "wrong password" })).status, 400);
        assert.equal((await s.call("POST", "/v1/account/delete", boss, { password })).status, 409, "the only admin");
        assert.equal((await s.call("POST", "/v1/account/delete", kim, { password })).body.ok, true);
        assert.equal((await s.call("GET", "/v1/account", kim)).status, 401);
    });
});

describe("who can sign up, changed in the web app", async () => {
    const s = await server("open");

    test("an admin's choice overrides SIGN_UP", async () => {
        const boss = (await s.signUp("boss@example.com", "The Boss")).token!;
        const kim = (await s.signUp("kim@example.com", "Kim Park")).token!;
        assert.equal((await s.call("PUT", "/v1/server-settings", kim, { signUp: "closed" })).status, 403);
        assert.equal((await s.call("PUT", "/v1/server-settings", boss, { signUp: "nobody" })).status, 400);
        assert.deepEqual((await s.call("PUT", "/v1/server-settings", boss, { signUp: "closed" })).body.settings, [{ key: "signUp", env: "SIGN_UP", source: "default", value: "closed" }]);
        assert.equal((await s.call("GET", "/v1/meta")).body.signUp, "closed");
        assert.equal((await s.signUp("lee@example.com", "Lee Chan")).body.code, "SIGN_UP_CLOSED");
        await s.call("PUT", "/v1/server-settings", boss, { signUp: "approval" });
        assert.equal((await s.signUp("lee@example.com", "Lee Chan")).body.user.status, "pending");
    });
});

describe("a new server's first account (USR-8)", async () => {
    const empty = async (adminEmails: string[], setupCode?: string, makeSetupCode?: () => string) => {
        const pg = new PGlite();
        const db = drizzle(pg, { schema: tables });
        await migrate(db, { migrationsFolder });
        const access: AccessSettings = { signUp: "closed", adminEmails, publicUrl, ...(setupCode ? { setupCode } : {}), ...(makeSetupCode ? { makeSetupCode } : {}) };
        // As main.ts does: one code for the wizard and the sign-up.
        const auth = createAuth(db, {
            ...access,
            authSecret: "test-secret-that-is-at-least-32-characters",
            get setupCode() {
                return access.setupCode;
            },
            set setupCode(code) {
                access.setupCode = code;
            },
        });
        const app = createApp(db, auth, { access });
        const call = async (method: string, path: string, token?: string, body?: unknown) => {
            const res = await app.request(path, {
                method,
                headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: res.status, body: await res.json(), token: res.headers.get("set-auth-token") ?? undefined };
        };
        const signUp = (email: string) => call("POST", "/v1/auth/sign-up/email", undefined, { name: email, email, password });
        return { call, signUp };
    };

    test("on a closed server it can still be made, and it runs the server; the next can't", async () => {
        const s = await empty([]);
        assert.equal((await s.call("GET", "/v1/meta")).body.firstAccount, true);
        const first = await s.signUp("first@example.com");
        assert.equal(first.status, 200);
        const account = await s.call("GET", "/v1/account", first.token);
        assert.equal(account.body.admin, true);
        assert.equal((await s.call("GET", "/v1/meta")).body.firstAccount, undefined);
        assert.equal((await s.signUp("second@example.com")).status, 400);
    });

    test("ADM-5: with a setup code, the first account needs it, then goes on to set the server up", async () => {
        const s = await empty([], "BCDF-GHJK-LMNP");
        const meta = (await s.call("GET", "/v1/meta")).body;
        assert.equal(meta.firstAccount, true);
        assert.equal(meta.setupCodeNeeded, true);
        assert.equal((await s.call("POST", "/v1/setup/check", undefined, { code: "WRONG" })).status, 400);
        assert.equal((await s.call("POST", "/v1/setup/check", undefined, { code: "bcdfghjklmnp" })).status, 200);
        assert.equal((await s.signUp("thief@example.com")).status, 400);
        const first = await s.call("POST", "/v1/auth/sign-up/email", undefined, { name: "Boss", email: "boss@example.com", password, setupCode: "BCDF-GHJK-LMNP" });
        assert.equal(first.status, 200);
        assert.equal((await s.call("GET", "/v1/account", first.token)).body.admin, true);
        const pending = (await s.call("GET", "/v1/meta")).body;
        assert.equal(pending.firstAccount, undefined);
        assert.equal(pending.setupCodeNeeded, undefined);
        assert.equal(pending.setupPending, true);
        assert.equal((await s.call("POST", "/v1/setup/check", undefined, { code: "BCDF-GHJK-LMNP" })).status, 404);
        assert.equal((await s.call("POST", "/v1/setup/finish", first.token)).status, 200);
        assert.equal((await s.call("GET", "/v1/meta")).body.setupPending, undefined);
    });

    test("SEC-8: ADMIN_EMAILS doesn't let its address skip the setup code, nor later the sign-up rules", async () => {
        const s = await empty(["boss@example.com"], "BCDF-GHJK-LMNP");
        assert.equal((await s.call("GET", "/v1/meta")).body.setupCodeNeeded, true);
        const claimed = await s.signUp("boss@example.com");
        assert.equal(claimed.status, 400);
        assert.equal(claimed.body.code, "SETUP_CODE");
        const first = await s.call("POST", "/v1/auth/sign-up/email", undefined, { name: "Owner", email: "owner@example.com", password, setupCode: "BCDF-GHJK-LMNP" });
        assert.equal((await s.call("GET", "/v1/account", first.token)).body.admin, true, "the first account runs the server");
        const later = await s.signUp("boss@example.com");
        assert.equal(later.body.code, "SIGN_UP_CLOSED", "closed means closed, for a listed address too");
        await s.call("PUT", "/v1/server-settings", first.token, { signUp: "open" });
        const waiting = await s.signUp("boss@example.com");
        assert.equal(waiting.body.user.status, "pending", "open sign-up, but a listed address waits for an admin");
        assert.equal((await s.signUp("anyone@example.com")).body.user.status, "active");
    });

    test("SEC-8: a server with no accounts makes a code when it needs one, as when it's emptied after starting", async () => {
        const made: string[] = [];
        const s = await empty([], undefined, () => {
            made.push("CDFG-HJKL-MNPQ");
            return "CDFG-HJKL-MNPQ";
        });
        assert.equal((await s.call("GET", "/v1/meta")).body.setupCodeNeeded, true);
        assert.equal(made.length, 1);
        assert.equal((await s.signUp("thief@example.com")).body.code, "SETUP_CODE");
        const first = await s.call("POST", "/v1/auth/sign-up/email", undefined, { name: "Owner", email: "owner@example.com", password, setupCode: "CDFG-HJKL-MNPQ" });
        assert.equal(first.status, 200);
        assert.equal(made.length, 1, "one code until the first account");
    });
});
