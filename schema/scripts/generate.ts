// Writes generated/json-schema/<Name>.json and generated/openapi.json from the Zod definitions, and
// the import columns table in docs/requirements/importing.md. generated/fixtures/ is written by the server.
// Run `pnpm generate` after changing src/; the tests fail while the generated files are out of date.

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { generatedFiles } from "../src/generate.ts";
import { withImportColumns } from "../src/importColumns.ts";

const root = new URL("..", import.meta.url).pathname;
// generated/fixtures/ is the server's (pnpm fixtures there), so it stays.
mkdirSync(`${root}generated`, { recursive: true });
for (const entry of readdirSync(`${root}generated`).filter((e) => e !== "fixtures")) {
    rmSync(`${root}generated/${entry}`, { recursive: true, force: true });
}
for (const [path, content] of Object.entries(generatedFiles())) {
    mkdirSync(`${root}${path.slice(0, path.lastIndexOf("/"))}`, { recursive: true });
    writeFileSync(`${root}${path}`, content);
}
// docs/requirements/importing.md keeps a copy of the import columns table (IMP-9).
const requirements = `${root}../docs/requirements/importing.md`;
writeFileSync(requirements, withImportColumns(readFileSync(requirements, "utf8")));
// The iPhone app bundles a copy of the quiz, for no signal (QUIZ-1); its project takes files only from its own folder.
copyFileSync(`${root}quiz/questions-en.json`, `${root}../mobile/ios/LawFive/Resources/questions-en.json`);
// And the misconduct codes, for correcting a result (RES-1).
for (const file of readdirSync(`${root}misconduct`).filter((f) => f.endsWith(".json"))) {
    copyFileSync(`${root}misconduct/${file}`, `${root}../mobile/ios/LawFive/Resources/misconduct-${file}`);
}
console.log("Wrote generated/ and the import columns in docs/requirements/importing.md");
