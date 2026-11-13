// Writes src/garminModels.ts: each Garmin part number LawFive's watch app is built for (the
// products in watch-garmin/manifest.xml, regional versions included), with the watch's name, from
// the Connect IQ SDK's device files. Run after adding a watch to the manifest:
//   node scripts/garminModels.ts [devices folder]
// The devices folder defaults to the SDK Manager's on macOS.

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const devices = process.argv[2] ?? join(homedir(), "Library/Application Support/Garmin/ConnectIQ/Devices");
const manifest = readFileSync(new URL("../../watch-garmin/manifest.xml", import.meta.url), "utf8");
const products = [...manifest.matchAll(/product id="([^"]+)"/g)].map((m) => m[1]);
const models = new Map<string, string>();
for (const product of products) {
    const device = JSON.parse(readFileSync(join(devices, product, "compiler.json"), "utf8")) as {
        displayName: string; worldWidePartNumber: string; partNumbers?: { number?: string }[];
    };
    // "Venu® 2" → "Venu 2"; a watch sold under several names keeps the first.
    const name = device.displayName.replace(/[®™]/g, "").split(" / ")[0].trim();
    for (const number of [device.worldWidePartNumber, ...(device.partNumbers ?? []).flatMap((p) => p.number ?? [])]) {
        if (!models.has(number)) {
            models.set(number, name);
        }
    }
}
const rows = [...models].sort(([a], [b]) => a.localeCompare(b)).map(([number, name]) => `    "${number}": "${name}",`).join("\n");
writeFileSync(new URL("../src/garminModels.ts", import.meta.url), `// Garmin watches by part number, as a watch reports it (System.getDeviceSettings().partNumber), for
// the watches LawFive's app is built for. Written by scripts/garminModels.ts from the Connect IQ SDK.

const models: Record<string, string> = {
${rows}
};

/** "Venu 2" for a Garmin part number ("006-B3703-00"), or undefined for one LawFive doesn't know. */
export function garminModelName(partNumber: string | undefined): string | undefined {
    return partNumber ? models[partNumber.trim().toUpperCase()] : undefined;
}
`);
console.log(`${models.size} part numbers for ${products.length} watches`);
