// PUSH-1: one of these per server (a Durable Object, so its counts are exact and one request runs at
// a time), holding that server's count for the day and each of its devices'. A send reserves its
// place, and gives it back if Firebase didn't take it, as errors don't count. An alarm clears it all
// after midnight UTC, so a server that goes quiet leaves nothing behind (the privacy policy says so).
// PUSH-3: the first time each day a server reaches its own limit, or tries to send while blocked, it
// says so in the Worker's logs, naming the server's address only, so the operator can see whom to
// give more or to block.

export interface CounterStorage {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    deleteAll(): Promise<void>;
    setAlarm(at: number): Promise<void>;
}

export const DEVICE_PER_MINUTE = 5;
export const SERVER_PER_MINUTE = 120;

export type Reserved = { ok: true } | { ok: false; limit: "device" | "server"; retryAfter: number };
export type CounterRequest =
    | { op: "reserve"; device: string; deviceDaily: number; serverDaily: number; server?: string; now?: number }
    | { op: "release"; device: string; now?: number }
    | { op: "blocked"; server: string; now?: number };

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Seconds until midnight UTC. */
const untilTomorrow = (ms: number) => Math.ceil((86_400_000 - (ms % 86_400_000)) / 1000);
const untilNextMinute = (ms: number) => Math.ceil((60_000 - (ms % 60_000)) / 1000);

export class ServerCounter {
    private readonly storage: CounterStorage;
    /** This minute's counts. Only in memory: losing them lets a few more through, once. */
    private minute = { at: 0, server: 0, devices: new Map<string, number>() };

    constructor(state: { storage: CounterStorage }) {
        this.storage = state.storage;
    }

    async fetch(request: Request): Promise<Response> {
        const body = await request.json() as CounterRequest;
        const now = body.now ?? Date.now();
        if (body.op === "release") {
            await this.release(body.device, now);
            return Response.json({ ok: true });
        }
        if (body.op === "blocked") {
            await this.startDay(now);
            await this.logOnce("blocked", `${body.server} is blocked, and tried to send a notification`);
            return Response.json({ ok: true });
        }
        return Response.json(await this.reserve(body.device, body.deviceDaily, body.serverDaily, now, body.server));
    }

    /** Cloudflare calls this when the alarm goes off. */
    async alarm() {
        await this.storage.deleteAll();
    }

    private async startDay(now: number) {
        if (await this.storage.get<string>("day") !== dayOf(now)) {
            await this.storage.deleteAll();
            await this.storage.put("day", dayOf(now));
            await this.storage.setAlarm(now + untilTomorrow(now) * 1000 + 60_000);
        }
        const minute = Math.floor(now / 60_000);
        if (this.minute.at !== minute) {
            this.minute = { at: minute, server: 0, devices: new Map() };
        }
    }

    /** A line in the Worker's logs, once a day for each kind (cleared with the counts). */
    private async logOnce(kind: string, line: string) {
        if (await this.storage.get<boolean>(`logged:${kind}`)) {
            return;
        }
        await this.storage.put(`logged:${kind}`, true);
        console.log(line);
    }

    private async reserve(device: string, deviceDaily: number, serverDaily: number, now: number, address = "A server"): Promise<Reserved> {
        await this.startDay(now);
        const server = await this.storage.get<number>("server") ?? 0;
        if (server >= serverDaily) {
            await this.logOnce("daily", `${address} reached its daily limit of ${serverDaily} notifications`);
            return { ok: false, limit: "server", retryAfter: untilTomorrow(now) };
        }
        const count = await this.storage.get<number>(`d:${device}`) ?? 0;
        if (count >= deviceDaily) {
            return { ok: false, limit: "device", retryAfter: untilTomorrow(now) };
        }
        if (this.minute.server >= SERVER_PER_MINUTE) {
            await this.logOnce("minute", `${address} reached its limit of ${SERVER_PER_MINUTE} notifications a minute`);
            return { ok: false, limit: "server", retryAfter: untilNextMinute(now) };
        }
        const thisMinute = this.minute.devices.get(device) ?? 0;
        if (thisMinute >= DEVICE_PER_MINUTE) {
            return { ok: false, limit: "device", retryAfter: untilNextMinute(now) };
        }
        await this.storage.put("server", server + 1);
        await this.storage.put(`d:${device}`, count + 1);
        this.minute.server++;
        this.minute.devices.set(device, thisMinute + 1);
        return { ok: true };
    }

    private async release(device: string, now: number) {
        await this.startDay(now);
        const server = await this.storage.get<number>("server") ?? 0;
        const count = await this.storage.get<number>(`d:${device}`) ?? 0;
        await this.storage.put("server", Math.max(0, server - 1));
        await this.storage.put(`d:${device}`, Math.max(0, count - 1));
        this.minute.server = Math.max(0, this.minute.server - 1);
        const thisMinute = this.minute.devices.get(device) ?? 0;
        this.minute.devices.set(device, Math.max(0, thisMinute - 1));
    }
}
