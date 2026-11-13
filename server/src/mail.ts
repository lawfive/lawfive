import { readFileSync } from "node:fs";
import { createTransport } from "nodemailer";
import type { MailSettings } from "./config.ts";

// Email (USR-5): invitations, approvals for servers that approve new accounts, and password resets
// (USR-7). Optional: with no SMTP server set up, admins send invitation and reset links themselves
// and see who's waiting in the web app. Sending never holds up a request for long, and a failure
// is logged rather than shown.

export interface Message {
    to: string;
    subject: string;
    /** Plain text, with the link on a line of its own. */
    text: string;
    /** The button under the text: what it says and where it goes. */
    action?: { label: string; url: string };
}

export interface Mailer {
    send(message: Message): Promise<void>;
}

/** Sends through an SMTP server. */
export function smtpMailer(settings: MailSettings): Mailer {
    const transport = createTransport(settings.url);
    return {
        async send(message) {
            await transport.sendMail(mailOptions(settings.from, message));
        },
    };
}

/** What's sent for a message: plain text, the HTML card, and the wordmark it shows. */
export function mailOptions(from: string, message: Message) {
    return {
        from,
        to: message.to,
        subject: message.subject,
        text: message.action ? `${message.text}\n\n${message.action.label}: ${message.action.url}\n` : `${message.text}\n`,
        html: html(message),
        attachments: [{ filename: "lawfive.png", content: wordmark, cid: wordmarkCid, contentDisposition: "inline" as const }],
    };
}

/** Sends without waiting, logging a failure (the request it came from carries on). */
export function sendQuietly(mailer: Mailer | undefined, message: Message): void {
    mailer?.send(message).catch((error: unknown) => console.error(`Couldn't email ${message.to}: ${error instanceof Error ? error.message : error}`));
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

// WEB-25: the header is the board across the top of the website, the L5 mark beside LAWFIVE. Mail apps
// can't load its font, so the wordmark is a picture (drawn at 2x by web/scripts/icons.ts, `pnpm icons`),
// sent inside the email rather than linked, so it shows without loading remote images and from servers
// the internet can't reach. With pictures off, "LawFive" shows in its place.
const wordmark = readFileSync(new URL("./mail-wordmark.png", import.meta.url));
const wordmarkCid = "wordmark@lawfive";
/** The wordmark's size on screen, half its pixels (from the PNG's header). */
const wordmarkSize = { width: Math.round(wordmark.readUInt32BE(16) / 2), height: Math.round(wordmark.readUInt32BE(20) / 2) };
const board = "#0b0e0d";

/** A plain, centered card under the board, in LawFive's green, which reads well in light and dark mail apps. */
function html(message: Message): string {
    const paragraphs = message.text.split("\n\n").map((p) => `<p style="margin:0 0 14px">${escape(p).replace(/\n/g, "<br>")}</p>`).join("");
    const button = message.action
        ? `<p style="margin:22px 0 8px"><a href="${escape(message.action.url)}" style="display:inline-block;background:#0b6b47;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:9px">${escape(message.action.label)}</a></p>`
            + `<p style="margin:14px 0 0;font-size:13px;color:#6b7470">Or open this link: <a href="${escape(message.action.url)}" style="color:#0b6b47">${escape(message.action.url)}</a></p>`
        : "";
    return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f3f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1b211e;font-size:15px;line-height:1.5">`
        + `<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e3e6e4">`
        + `<div style="background:${board};border-radius:13px 13px 0 0;padding:15px 24px">`
        + `<img src="cid:${wordmarkCid}" width="${wordmarkSize.width}" height="${wordmarkSize.height}" alt="LawFive" style="display:block;border:0;color:#f4f2e9;font-weight:800;font-style:italic;font-size:22px;line-height:${wordmarkSize.height}px">`
        + `</div>`
        + `<div style="padding:24px 26px 28px">${paragraphs}${button}</div>`
        + `</div></body></html>`;
}

// The messages.

export function inviteMessage(to: string, name: string | undefined, invitedBy: string, link: string, days: number): Message {
    return {
        to,
        subject: `${invitedBy} invited you to LawFive`,
        text: `Hi${name ? ` ${name}` : ""},\n\n${invitedBy} has invited you to LawFive, for running matches on your watch and keeping track of them afterward.\n\nThe invitation works for ${days} days.`,
        action: { label: "Make your account", url: link },
    };
}

export function waitingMessage(to: string, who: { name: string; email: string }, peopleUrl: string): Message {
    return {
        to,
        subject: `${who.name} is waiting for approval`,
        text: `${who.name} (${who.email}) has made a LawFive account. They can't use it until an admin approves it.`,
        action: { label: "Approve or decline", url: peopleUrl },
    };
}

export function approvedMessage(to: string, name: string, url: string): Message {
    return {
        to,
        subject: "Your LawFive account is ready",
        text: `Hi ${name},\n\nYour LawFive account has been approved, so you can start using it.`,
        action: { label: "Open LawFive", url },
    };
}

/** ADM-4: Send a test email, from Settings → Server. */
export function testMessage(to: string, name: string, url: string): Message {
    return {
        to,
        subject: "LawFive can send email",
        text: `Hi ${name},\n\nThis is the test email from your LawFive server's settings. It arrived, so invitations, approvals and password resets will too.`,
        action: { label: "Open LawFive", url },
    };
}

export function resetMessage(to: string, name: string, link: string): Message {
    return {
        to,
        subject: "Reset your LawFive password",
        text: `Hi ${name},\n\nSomeone, hopefully you, asked to reset the password for your LawFive account. The link works once, for an hour.\n\nIf it wasn't you, ignore this email: your password stays as it is.`,
        action: { label: "Choose a new password", url: link },
    };
}

/** SEC-12: the account locked after wrong passwords; sent at most once a day. */
export function lockedMessage(to: string, name: string, settingsUrl: string): Message {
    return {
        to,
        subject: "Wrong passwords for your LawFive account",
        text: `Hi ${name},\n\nSomeone tried several wrong passwords for your LawFive account, so signing in is paused for a few minutes. Watches and phones already signed in carry on as before.\n\nIf it was you, wait a little or reset your password from the sign-in page. If it wasn't, nothing's needed; you can change your password in Settings.`,
        action: { label: "Open Settings", url: settingsUrl },
    };
}

/** PLAN-6: a plan ends soon (7 days, then 1 day, before). */
export function planEndingMessage(to: string, name: string, plan: string, then: string, endsOn: string, days: number, url: string): Message {
    const when = new Date(`${endsOn}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    return {
        to,
        subject: days <= 1 ? `Your ${plan} plan ends tomorrow` : `Your ${plan} plan ends in ${days} days`,
        text: `Hi ${name},\n\nYour LawFive account's ${plan} plan ends after ${when}. Then it moves to ${then}, with that plan's limits. Nothing in your account is lost, but adding more of anything over those limits won't work.\n\nTo keep ${plan}, ask an admin of your LawFive server.`,
        action: { label: "See your plan", url },
    };
}

/** USR-9: a link to the new address, which changes the account's email when followed. */
export function confirmEmailMessage(to: string, name: string, link: string): Message {
    return {
        to,
        subject: "Confirm your new email for LawFive",
        text: `Hi ${name},\n\nSomeone, hopefully you, asked to use this address for their LawFive account. Follow the link to make the change; until then, the account keeps its old address. The link works once, for 24 hours.\n\nIf it wasn't you, ignore this email: nothing changes.`,
        action: { label: "Use this address", url: link },
    };
}

/** USR-9: to the old address, once the new one is confirmed. */
export function emailChangedMessage(to: string, name: string, email: string, settingsUrl: string): Message {
    return {
        to,
        subject: "Your LawFive email has changed",
        text: `Hi ${name},\n\nYour LawFive account now uses ${email}, so this address no longer signs in.\n\nIf you didn't change it, ask an admin of your LawFive server to help you back in.`,
        action: { label: "Open Settings", url: settingsUrl },
    };
}
