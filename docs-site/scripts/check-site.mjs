// After a build: every internal link and #anchor resolves, and nothing personal reached the pages.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../dist");
const pages = readdirSync(root, { recursive: true }).map((p) => join(root, String(p))).filter((p) => p.endsWith(".html"));
const ids = new Map();
const html = new Map();
for (const page of pages) {
    const text = readFileSync(page, "utf8");
    html.set(page, text);
    ids.set(page, new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

const decode = (s) => decodeURIComponent(s.replaceAll("&amp;", "&"));
const problems = [];
const forbidden = [/roach\.work/, /roachwork/, /192\.168\.\d/, /\/Users\/[a-z]/, /monkey-c-garmin-ref/, /scott@/i];
for (const [page, text] of html) {
    const from = relative(root, page);
    for (const rule of forbidden) if (rule.test(text)) problems.push(`${from}: contains ${rule}`);
    for (const [, href] of text.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
        if (/^(https?:|mailto:)/.test(href)) continue;
        const [path, anchor] = href.split("#");
        let target = path ? (path.startsWith("/") ? join(root, path) : resolve(dirname(page), path)) : page;
        if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
        if (!existsSync(target)) { problems.push(`${from}: broken link ${href}`); continue; }
        if (anchor && ids.has(target) && !ids.get(target).has(decode(anchor))) problems.push(`${from}: no anchor ${href}`);
    }
}
// The pages for AI agents: everything llms.txt lists is here, and nothing personal got into them.
const llms = readFileSync(join(root, "llms.txt"), "utf8");
for (const [, page] of llms.matchAll(/https:\/\/lawfive\.dev\/([^)\s]+)/g)) {
    if (!existsSync(join(root, page))) problems.push(`llms.txt: nothing at ${page}`);
}
for (const file of ["llms.txt", ...readdirSync(join(root, "agents")).map((f) => join("agents", f))]) {
    const text = readFileSync(join(root, file), "utf8");
    for (const rule of forbidden) if (rule.test(text)) problems.push(`${file}: contains ${rule}`);
}
console.log(`${pages.length} pages checked`);
if (problems.length) {
    console.error([...new Set(problems)].join("\n"));
    process.exit(1);
}
