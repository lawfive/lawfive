import { z } from "zod";

// Building blocks shared by every record. See docs/ARCHITECTURE.md, "Data model".

/** A UUID made by whichever device created the record, so phones can create records offline. */
export const Id = z.uuid().meta({ id: "Id", description: "UUID made by the device that created the record." });

/** A moment in time, with its UTC offset (`2026-11-07T10:00:00-08:00`). */
export const Timestamp = z.iso.datetime({ offset: true }).meta({ id: "Timestamp", description: "ISO 8601 date and time with a UTC offset." });

/** A calendar date (`2026-11-07`). */
export const LocalDate = z.iso.date().meta({ id: "LocalDate", description: "ISO 8601 date." });

/** An IANA time zone name (`America/Los_Angeles`). */
export const TimeZone = z.string().min(1).max(64).describe("IANA time zone name, for example America/Los_Angeles.");

/** Durations are whole seconds everywhere (the watch uses seconds; 2.5 minutes is 150). */
export const Seconds = z.int().nonnegative();

/** A colour as `#RRGGBB`. */
export const Colour = z.string().regex(/^#[0-9A-Fa-f]{6}$/).describe("Color as #RRGGBB.");

/** The watch's team colours (SET-14), in its order. */
export const teamColours: { name: string; hex: string }[] = [
    { name: "Black", hex: "#000000" },
    { name: "White", hex: "#FFFFFF" },
    { name: "Red", hex: "#D71920" },
    { name: "Orange", hex: "#FF7A00" },
    { name: "Yellow", hex: "#FFD100" },
    { name: "Green", hex: "#00A651" },
    { name: "Blue", hex: "#0057B8" },
    { name: "Purple", hex: "#6A2C91" },
];

/** A three-letter ISO 4217 currency code (`USD`). */
export const Currency = z.string().regex(/^[A-Z]{3}$/).describe("ISO 4217 currency code, for example USD.");

/** A GPS position in decimal degrees (WGS 84). */
export const Position = z
    .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
    })
    .meta({ id: "Position", description: "GPS position in decimal degrees (WGS 84)." });

export const Side = z.enum(["home", "away"]).meta({ id: "Side" });

/** The officials' roles on a crew. */
export const Role = z.enum(["referee", "ar1", "ar2", "fourth"]).meta({ id: "Role" });

/**
 * Fields every stored record carries, for offline sync: phones send changes from an outbox and
 * then ask the server for everything changed since their last sync.
 */
export const syncFields = {
    id: Id,
    version: z.int().min(1).describe("Raised by the server on every change; clients send the version they last saw so conflicts can be spotted."),
    updatedAt: Timestamp,
    deletedAt: Timestamp.optional().describe("Set when the record is deleted; deleted records are kept so other devices learn of the deletion."),
};
