import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { type AccessSettings, accountHooks, resetLink } from "./access.ts";
import { type Db, tables } from "./db/index.ts";
import { clientIpHeader } from "./limits.ts";
import { resetMessage, sendQuietly } from "./mail.ts";

// Accounts, with Better Auth: email and password to start. The web UI uses a session cookie;
// apps send the session token as "Authorization: Bearer <token>" (the bearer plugin), taken from
// the set-auth-token header of the sign-in response. Garmin pairing (a code shown on the watch,
// entered on the website) uses Better Auth's device authorization (RFC 8628): the watch asks for a
// code, shows it, and polls until someone signed in approves it on the Link page. Who may sign up,
// whether a new account waits for approval, and suspended accounts are access.ts's (USR-2 to
// USR-4, USR-7). A forgotten password is reset by an emailed link when the server can send email.

export interface AuthSettings extends Omit<AccessSettings, "adminEmails"> {
    authSecret: string;
    adminEmails?: string[];
    /** Whether to limit tries (SEC-2); on in production. */
    rateLimit?: boolean;
}

export function createAuth(db: Db, config: AuthSettings) {
    // The mailer as it is when something is sent: an admin can change it while the server runs (ADM-1).
    const access: AccessSettings = {
        ...config,
        adminEmails: config.adminEmails ?? [],
        get mailer() {
            return config.mailer;
        },
        // ADM-5: the one code main.ts keeps, made again when the server is emptied (currentSetupCode).
        get setupCode() {
            return config.setupCode;
        },
        set setupCode(code) {
            config.setupCode = code;
        },
    };
    return betterAuth({
        appName: "LawFive",
        baseURL: config.publicUrl,
        basePath: "/v1/auth",
        secret: config.authSecret,
        database: drizzleAdapter(db, {
            provider: "pg",
            schema: { user: tables.user, session: tables.session, account: tables.account, verification: tables.verification, deviceCode: tables.deviceCode },
        }),
        emailAndPassword: {
            enabled: true,
            // USR-7: the link opens the web app's page, which sends the token with the new password.
            // The mailer is read when it's sent, as an admin can set email up while the server runs
            // (ADM-1); without one, app.ts answers that resets by email are off.
            resetPasswordTokenExpiresIn: 60 * 60,
            sendResetPassword: async ({ user, token }: { user: { email: string; name: string }; token: string }) => {
                sendQuietly(config.mailer, resetMessage(user.email, user.name, resetLink(config, token)));
            },
        },
        user: {
            additionalFields: {
                // USR-1 and USR-4; set by the server only, never from a sign-up.
                role: { type: "string", input: false, defaultValue: "user" },
                status: { type: "string", input: false, defaultValue: "active" },
            },
        },
        databaseHooks: accountHooks(db, access),
        // 90 days, renewed each day the session is used: a watch that syncs now and then stays linked.
        session: {
            expiresIn: 90 * 24 * 60 * 60,
            updateAge: 24 * 60 * 60,
            // SEC-13: set by app.ts when a watch's code becomes its token, never from a request.
            additionalFields: { scope: { type: "string", required: false, input: false } },
        },
        plugins: [
            bearer(),
            deviceAuthorization({
                expiresIn: "10m",
                interval: "5s",
                generateUserCode,
                validateClient: (clientId) => knownClients.has(clientId),
                verificationUri: `${config.publicUrl}/link`,
            }),
        ],
        // SEC-2: limits by the address app.ts works out, as the header alone can't be trusted. A few
        // wrong passwords are normal; thousands aren't.
        advanced: { ipAddress: { ipAddressHeaders: [clientIpHeader] } },
        rateLimit: {
            enabled: config.rateLimit ?? process.env.NODE_ENV === "production",
            customRules: {
                "/sign-in/email": { window: 60, max: 10 },
                "/sign-up/email": { window: 3600, max: 30 },
                "/request-password-reset": { window: 3600, max: 10 },
                "/device/code": { window: 60, max: 10 },
            },
        },
        telemetry: { enabled: false },
    });
}

export type Auth = ReturnType<typeof createAuth>;

/** Apps that can link with a code. */
export const knownClients = new Set(["lawfive-garmin", "lawfive-wear", "lawfive-applewatch"]);

/** Eight letters and digits that can't be mistaken for each other (no vowels, 0, O, 1 or I). */
const codeAlphabet = "BCDFGHJKLMNPQRSTVWXZ23456789";

export function generateUserCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => codeAlphabet[b % codeAlphabet.length]).join("");
}
