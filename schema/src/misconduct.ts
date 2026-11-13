import { z } from "zod";
import fa from "../misconduct/fa.json" with { type: "json" };
import ifab from "../misconduct/ifab.json" with { type: "json" };
import ussf from "../misconduct/ussf.json" with { type: "json" };

// Misconduct codes: each scheme (IFAB, US Soccer, The FA...) is a data file in schema/misconduct/,
// so schemes can be added without code changes. A card stores the scheme and code it was given
// under, so changing the user's scheme later doesn't change old matches.

export const SchemeId = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .meta({ id: "SchemeId", description: "A misconduct scheme's ID, the name of its file in schema/misconduct/ (ifab, ussf, fa)." });

const Code = z.object({
    code: z.string().min(1).max(12),
    description: z.string().min(1),
    short: z.string().min(1).max(22).optional().describe("A few words for a watch's list of reasons (EVT-14), \"Unsporting behavior\"; the description, cut short, when left out."),
});

export const MisconductScheme = z
    .object({
        id: SchemeId,
        name: z.string().min(1),
        source: z.string().describe("Where the codes come from."),
        cautions: z.array(Code).min(1),
        sendOffs: z.array(Code).min(1),
        secondCaution: z.string().describe("The send-off code for a second caution in the same match (2CT, S7)."),
    })
    .meta({ id: "MisconductScheme", description: "A set of caution and send-off codes." });

/** The code a card was given under. */
export const MisconductCode = z
    .object({
        scheme: SchemeId,
        code: z.string().min(1).max(12),
    })
    .meta({ id: "MisconductCode" });

export type MisconductScheme = z.infer<typeof MisconductScheme>;

/** The schemes that ship with LawFive, by id. */
export const misconductSchemes: Record<string, MisconductScheme> = { fa, ifab, ussf };

/** What a code means ("Unsporting behavior"), when its scheme ships with LawFive. */
export function misconductDescription(code: z.infer<typeof MisconductCode>): string | undefined {
    const scheme = misconductSchemes[code.scheme];
    return [...(scheme?.cautions ?? []), ...(scheme?.sendOffs ?? [])].find((c) => c.code === code.code)?.description;
}
