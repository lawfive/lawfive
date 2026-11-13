// Makes the API reference and examples pages, the pages for AI agents and the downloads from schema/generated, which `pnpm generate` in
// schema/ keeps up to date, so the docs can't drift from the API's description.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const generated = new URL("../../schema/generated/", import.meta.url);
const repo = "https://github.com/lawfive/lawfive/blob/main";

const body = readFileSync(new URL("API.md", generated), "utf8")
    .replace(/^<!--[\s\S]*?-->\s*/m, "")
    .replace(/^# .*\n/m, "")
    .replaceAll("](openapi.json)", "](/openapi.json)")
    .replaceAll("[json-schema/](json-schema/)", "[JSON Schema](/schemas/Match.json)")
    .replace(/\]\(json-schema\/([\w-]+\.json)\)/g, "](/schemas/$1)")
    .replace(/\]\(\.\.\/\.\.\/([^)]+)\)/g, `](${repo}/$1)`);

// A generated link can point at a type the reference doesn't list. Show its name without the link.
const slug = (heading) => heading.toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");
const anchors = new Set([...body.matchAll(/^#+ (.+)$/gm)].map((m) => slug(m[1])));
const linked = body.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (link, label, anchor) => {
    if (anchors.has(anchor)) return link;
    console.warn(`API reference: no section for ${label}`);
    return label;
});

const page = `---
title: API reference
description: Every endpoint of the LawFive API, with its parameters, bodies, answers and errors.
tableOfContents:
  maxHeadingLevel: 2
editUrl: false
---

${linked.trimStart()}`;

writeFileSync(new URL("../src/content/docs/api/reference.md", import.meta.url), page);
cpSync(new URL("openapi.json", generated), new URL("../public/openapi.json", import.meta.url));

// For AI agents: llms.txt at the root, as they expect, and the pages it lists.
const agents = new URL("../public/agents/", import.meta.url);
rmSync(agents, { recursive: true, force: true });
cpSync(new URL("agents/", generated), agents, { recursive: true });
cpSync(new URL("llms.txt", agents), new URL("../public/llms.txt", import.meta.url));
rmSync(new URL("llms.txt", agents));

// The worked examples, as one page for people, from the same files. The tests run their code.
const guides = readdirSync(new URL("agents/", generated)).filter((file) => file.startsWith("guide-")).sort()
    .map((file) => readFileSync(new URL(`agents/${file}`, generated), "utf8").replace(/^# /, "## ").trimEnd());
writeFileSync(new URL("../src/content/docs/api/examples.md", import.meta.url), `---
title: Worked examples
description: Complete examples for the LawFive API, from reading matches to saving safely and checking webhooks.
editUrl: false
---

Each example runs against a real server in LawFive's tests, as written here. They're in JavaScript, and the steps are the same in any language.

${guides.join("\n\n")}
`);
const schemas = new URL("../public/schemas/", import.meta.url);
rmSync(schemas, { recursive: true, force: true });
mkdirSync(schemas, { recursive: true });
cpSync(new URL("json-schema/", generated), schemas, { recursive: true });
