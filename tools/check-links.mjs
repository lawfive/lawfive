// Checks the relative links in the repo's markdown: each file linked to exists, and each #anchor is a
// heading in it. lawfive.dev's pages (docs-site/src/content/) link by site path and have their own check.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.startsWith("docs-site/src/content/") && existsSync(join(root, f)));

// GitHub's anchors: lowercased, punctuation dropped, spaces to hyphens, repeats numbered.
const anchors = new Map();
function anchorsOf(file) {
    if (!anchors.has(file)) {
        const seen = new Map();
        const set = new Set();
        const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
        for (const [, heading] of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
            const base = heading.replace(/[`*_]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").toLowerCase()
                .replace(/[^\p{L}\p{N} -]/gu, "").replace(/ /g, "-");
            const n = seen.get(base) ?? 0;
            seen.set(base, n + 1);
            set.add(n ? `${base}-${n}` : base);
        }
        anchors.set(file, set);
    }
    return anchors.get(file);
}

const broken = [];
for (const file of files) {
    const path = join(root, file);
    const text = readFileSync(path, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        if (/^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
        const [link, anchor] = target.split("#");
        const dest = link ? resolve(dirname(path), decodeURI(link)) : path;
        if (!existsSync(dest)) { broken.push(`${file}: ${target} (no such file)`); continue; }
        if (anchor && dest.endsWith(".md") && statSync(dest).isFile() && !anchorsOf(dest).has(anchor.toLowerCase())) {
            broken.push(`${file}: ${target} (no such heading)`);
        }
    }
}
if (broken.length) {
    console.error(`Broken links:\n${broken.map((b) => `  ${b}`).join("\n")}`);
    process.exit(1);
}
console.log(`Links fine in ${files.length} markdown files`);
