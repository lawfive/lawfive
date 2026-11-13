import { eq, inArray, lt } from "drizzle-orm";
import { type Db, tables } from "./db/index.ts";
import { type Mailer, lockedMessage, sendQuietly } from "./mail.ts";

// SEC-12: wrong passwords are counted per email address, whether or not an account has it, so a
// lockout never says which addresses have accounts. The first few are free; then the address is
// locked for a minute, doubling with each wrong password after a lock ends, to at most an hour.
// While locked even the right password is refused. A right password, a password reset or an admin's
// Unlock clears it; the count forgets after a day without a wrong one, and the row is deleted then
// (forget), as the privacy policy says. Kept in the database, so a restart doesn't hand out fresh tries.

const { signInLock, user } = tables;

export const freeTries = 5;
const minute = 60_000;
const longestLock = 60 * minute;
const forgetAfter = 24 * 60 * minute;

/** "afjk@Example.com " and "afjk@example.com" are the same address. */
export const lockKey = (email: string) => email.trim().toLowerCase();

/** How long the lock is after this many wrong passwords in a row (none before the free tries are used). */
export function lockLength(failures: number): number {
    return failures < freeTries ? 0 : Math.min(longestLock, minute * 2 ** (failures - freeTries));
}

export function lockoutsOf(db: Db, mail: { mailer?: Mailer; publicUrl: string }) {
    return {
        /** When the address is locked, how many seconds are left. */
        async locked(email: string, now = Date.now()): Promise<number | undefined> {
            const [row] = await db.select().from(signInLock).where(eq(signInLock.email, lockKey(email)));
            const left = row?.lockedUntil ? row.lockedUntil.getTime() - now : 0;
            return left > 0 ? Math.ceil(left / 1000) : undefined;
        },

        /** A wrong password: counts it, and locks the address once the free tries are used. */
        async failed(email: string, now = Date.now()): Promise<void> {
            const key = lockKey(email);
            const [row] = await db.select().from(signInLock).where(eq(signInLock.email, key));
            const fresh = !row || now - row.lastFailureAt.getTime() > forgetAfter;
            const failures = fresh ? 1 : row.failures + 1;
            const length = lockLength(failures);
            const lockedUntil = length ? new Date(now + length) : null;
            const values = { failures, lastFailureAt: new Date(now), lockedUntil };
            await db.insert(signInLock).values({ email: key, ...values }).onConflictDoUpdate({ target: signInLock.email, set: values });
            // Tell the account's owner, the first lock in a day, when the server can send email.
            const told = !fresh && row.notifiedAt && now - row.notifiedAt.getTime() < forgetAfter;
            if (length && !told && mail.mailer) {
                const [owner] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.email, key));
                if (owner) {
                    await db.update(signInLock).set({ notifiedAt: new Date(now) }).where(eq(signInLock.email, key));
                    sendQuietly(mail.mailer, lockedMessage(owner.email, owner.name, `${mail.publicUrl}/settings`));
                }
            }
        },

        /** Signed in, a new password, an admin's Unlock, or the account deleted. */
        async clear(email: string): Promise<void> {
            await db.delete(signInLock).where(eq(signInLock.email, lockKey(email)));
        },

        /** Deletes the addresses with no wrong password for a day, which would count from fresh anyway. */
        async forget(now = Date.now()): Promise<void> {
            await db.delete(signInLock).where(lt(signInLock.lastFailureAt, new Date(now - forgetAfter)));
        },

        /** When each of these addresses is locked until, for the People page. */
        async lockedUntil(emails: string[], now = Date.now()): Promise<Map<string, Date>> {
            const rows = emails.length ? await db.select().from(signInLock).where(inArray(signInLock.email, emails.map(lockKey))) : [];
            return new Map(rows.filter((r) => r.lockedUntil && r.lockedUntil.getTime() > now).map((r) => [r.email, r.lockedUntil as Date]));
        },
    };
}

export type Lockouts = ReturnType<typeof lockoutsOf>;
