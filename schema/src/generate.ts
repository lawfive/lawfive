import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
// First, so types register in the same order however this file is reached.
import "./index.ts";
import * as api from "./api.ts";
import { type Endpoint, collectionDocs, endpoints, groups, responsesOf } from "./endpoints.ts";
import { kotlinModels } from "./kotlin.ts";
import { matchCaseFiles } from "./matchCasesGenerate.ts";
import { misconductFiles } from "./misconductGenerate.ts";
import { swiftModels } from "./swift.ts";
import { starterFormats } from "./format.ts";

// Builds the generated files from every schema registered with a meta `id` and the endpoint list:
// one JSON Schema file per type (referring to one another by file name), an OpenAPI 3.1 document
// with the endpoints and every type as a component (for generating Kotlin and Swift code), and
// API.md, the same reference for people to read, and agents/, the same split into pages an AI agent
// can fetch as it needs them (AGT-1), with the worked examples from guides/ (AGT-2).

type Json = Record<string, unknown>;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const componentRef = (id: string) => `#/components/schemas/${id}`;

/** Every registered type, as OpenAPI components. */
function componentSchemas(): Record<string, Json> {
    const components = z.toJSONSchema(z.globalRegistry, { target: "draft-2020-12", uri: componentRef });
    return Object.fromEntries(
        Object.entries(components.schemas).map(([id, schema]) => {
            const { $schema, ...rest } = schema;
            return [id, rest];
        }),
    );
}

/** The API as OpenAPI 3.1; a server describing itself (AGT-3) gives its own address and version. */
export function openApiDocument(self?: { url: string; version?: string }): Json {
    const schemas = componentSchemas();
    return {
        openapi: "3.1.0",
        info: {
            title: "LawFive API",
            version: self?.version ?? "1",
            description: "The API of a LawFive server, which the web app, the watch apps and the phone apps use. Generated from schema/src/endpoints.ts. https://lawfive.dev/llms.txt lists the same reference as smaller pages, with worked examples.",
            license: { name: "See lawfive.dev", url: "https://lawfive.dev" },
        },
        servers: self ? [{ url: self.url, description: "This server" }] : [
            { url: "https://api.lawfive.app", description: "LawFive's own service" },
            { url: "{server}", description: "A server of your own, or the demo", variables: { server: { default: "https://lawfive.example.org", description: "Its address, for example http://localhost:3000 for the demo." } } },
        ],
        security: [{ bearer: [] }, { session: [] }],
        tags: Object.entries(groups).map(([name, description]) => ({ name, description })),
        paths: paths((schema) => jsonSchema(schema, schemas)),
        components: {
            schemas,
            securitySchemes: {
                bearer: { type: "http", scheme: "bearer", description: "Apps: the token from set-auth-token (signing in) or access_token (linking a watch)." },
                session: { type: "apiKey", in: "cookie", name: "better-auth.session_token", description: "Browsers: the session cookie set by signing in." },
            },
        },
    };
}

export function generatedFiles(): Record<string, string> {
    const files: Record<string, string> = {};

    const perFile = z.toJSONSchema(z.globalRegistry, { target: "draft-2020-12", uri: (id) => `${id}.json` });
    for (const [id, schema] of Object.entries(perFile.schemas)) {
        files[`generated/json-schema/${id}.json`] = json({ $id: `${id}.json`, ...schema });
    }

    const schemas = componentSchemas();
    const schemaOf = (schema: z.ZodType) => jsonSchema(schema, schemas);

    files["generated/openapi.json"] = json(openApiDocument());
    files["generated/API.md"] = markdown(schemaOf, schemas);
    Object.assign(files, agentFiles(schemaOf, schemas));
    // The phone app's types (mobile/android builds this file in).
    files["generated/kotlin/LawFive.kt"] = kotlinModels(schemas);
    files["generated/swift/LawFive.swift"] = swiftModels(schemas);
    // WCH-2: the match rules' cases, for every copy's tests.
    Object.assign(files, matchCaseFiles());
    // EVT-14: the misconduct codes, for each watch's list of a card's reasons.
    Object.assign(files, misconductFiles());
    // SET-17: the starter formats, for the phones' copies to be checked against.
    files["generated/starter-formats.json"] = json(starterFormats);
    // SET-5: the short names' cases, for the phones' copies of the rule.
    Object.assign(files, shortNameFiles());
    return files;
}

/** SET-5: short-names.json in the phones' tests, as a string each one parses. */
function shortNameFiles(): Record<string, string> {
    const cases = JSON.stringify(JSON.parse(readFileSync(new URL("../short-names.json", import.meta.url), "utf8")));
    if (cases.includes("$") || cases.includes('"""') || cases.includes('"#')) {
        throw new Error("schema/short-names.json: a case's text can't be embedded in Kotlin or Swift");
    }
    const header = "// Generated by schema/scripts/generate.ts from schema/short-names.json (SET-5): don't edit; run pnpm generate.";
    const swift = `${header}\n\nlet shortNameCasesJSON = #"""\n${cases}\n"""#\n`;
    return {
        "generated/kotlin-tests/ShortNameCases.kt": `${header}\n\npackage app.lawfive.cases\n\nconst val SHORT_NAME_CASES_JSON = """${cases}"""\n`,
        "generated/swift-tests/ShortNameCases.swift": swift,
        // The iPhone's test target takes files only from its own folder.
        "../mobile/ios/LawFiveTests/ShortNameCases.swift": swift,
    };
}

/** A schema as JSON Schema for the OpenAPI document: a reference for a registered type, else inline with references to the components. */
function jsonSchema(schema: z.ZodType, components: Record<string, Json>): Json {
    const id = z.globalRegistry.get(schema)?.id;
    if (id) {
        return { $ref: componentRef(id) };
    }
    const { $schema, $defs, ...rest } = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Json;
    for (const name of Object.keys(($defs as Json | undefined) ?? {})) {
        if (!components[name]) {
            throw new Error(`${name} is used inline but isn't a registered type`);
        }
    }
    return JSON.parse(JSON.stringify(rest).replaceAll("\"#/$defs/", "\"#/components/schemas/"));
}

/** GET /v1/matches/{id} → getMatchesById. */
function operationId(e: Endpoint): string {
    const words = e.path.split("/").filter((s) => s && s !== "v1")
        .flatMap((s) => s.startsWith("{") ? ["by", s.slice(1, -1)] : s.split("-"));
    return e.method + words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

/** Whether an API key can use an endpoint, in words (KEY-3). */
function keyNote(e: Endpoint): string | undefined {
    if (e.signedIn === false || e.path.startsWith("/v1/auth/")) {
        return undefined;
    }
    return e.keyScope === "*:read" ? "API keys: any read scope; only those collections are included."
        : e.keyScope ? `API keys: need ${e.keyScope}.`
        : "Not with API keys.";
}

function parameters(e: Endpoint, schemaOf: (s: z.ZodType) => Json) {
    const list = [];
    for (const [where, object] of [["path", e.params], ["query", e.query]] as const) {
        for (const [name, schema] of Object.entries(object?.shape ?? {}) as [string, z.ZodType][]) {
            const required = !schema.safeParse(undefined).success;
            list.push({ name, in: where, required, ...(schema.description ? { description: schema.description } : {}), schema: schemaOf(schema) });
        }
    }
    return list;
}

/** A form upload as JSON Schema: its fields, and each file as binary. */
function formSchema(form: NonNullable<Endpoint["form"]>, schemaOf: (s: z.ZodType) => Json): Json {
    const files = Object.fromEntries(Object.entries(form.files).map(([name, description]) => [name, { type: "string", format: "binary", description }]));
    return { allOf: [schemaOf(form.fields), { type: "object", properties: files, required: ["file"] }] };
}

function paths(schemaOf: (s: z.ZodType) => Json) {
    const result: Record<string, Json> = {};
    for (const e of endpoints) {
        const responses = Object.fromEntries(Object.entries(responsesOf(e)).map(([status, r]) => [status, {
            description: r.description,
            ...(r.headers ? { headers: Object.fromEntries(Object.entries(r.headers).map(([name, description]) => [name, { description, schema: { type: "string" } }])) } : {}),
            ...(r.body ? { content: { "application/json": { schema: schemaOf(r.body) } } } : {}),
            ...(r.text ? { content: { "text/plain": { schema: { type: "string", const: r.text } } } } : {}),
            ...(r.csv ? { content: { "text/csv": { schema: { type: "string" } } } } : {}),
            ...(r.calendar ? { content: { "text/calendar": { schema: { type: "string" } } } } : {}),
            ...(r.image ? { content: { "image/*": { schema: { type: "string", format: "binary" } } } } : {}),
            ...(r.zip ? { content: { "application/zip": { schema: { type: "string", format: "binary" } } } } : {}),
        }]));
        const params = parameters(e, schemaOf);
        const description = [e.description, e.capability && `Only when GET /v1/meta lists the ${e.capability} capability.`, keyNote(e)].filter(Boolean).join(" ");
        result[e.path] ??= {};
        result[e.path][e.method] = {
            operationId: operationId(e),
            tags: [e.group],
            summary: e.summary,
            ...(description ? { description } : {}),
            ...(e.signedIn === false ? { security: [] } : {}),
            ...(params.length ? { parameters: params } : {}),
            ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: schemaOf(e.body) } } } } : {}),
            ...(e.file ? { requestBody: { required: true, description: e.file.description, content: { [e.file.contentType]: { schema: { type: "string", format: "binary" } } } } } : {}),
            ...(e.form ? { requestBody: { required: true, content: { "multipart/form-data": { schema: formSchema(e.form, schemaOf) } } } } : {}),
            responses,
        };
    }
    return result;
}

// API.md: the same, to read.

/** The API's own types, described in API.md; the data model's link to their JSON Schema files. */
const apiTypes = Object.values(api)
    .map((value) => (value instanceof z.ZodType ? z.globalRegistry.get(value)?.id : undefined))
    .filter((id): id is string => id !== undefined);

const anchor = (text: string) => text.toLowerCase().replace(/[^a-z0-9 -]/g, "").replaceAll(" ", "-");
const typeLink = (id: string) => apiTypes.includes(id) ? `[${id}](#${anchor(id)})` : `[${id}](json-schema/${id}.json)`;
const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

type TypeLink = (id: string) => string;

/** A JSON Schema as a short type, TypeScript style: `{ items: Match[] }`. */
function typeName(s: Json, link: TypeLink = typeLink): string {
    if (typeof s.$ref === "string") {
        return link(s.$ref.split("/").at(-1) as string);
    }
    if (s.const !== undefined) {
        return JSON.stringify(s.const);
    }
    if (Array.isArray(s.enum)) {
        return s.enum.map((v) => JSON.stringify(v)).join(" | ");
    }
    const options = (s.anyOf ?? s.oneOf) as Json[] | undefined;
    if (options) {
        return options.map((o) => typeName(o, link)).join(" | ");
    }
    if (s.type === "array") {
        if (Array.isArray(s.prefixItems)) {
            return `[${(s.prefixItems as Json[]).map((o) => typeName(o, link)).join(", ")}]`;
        }
        const item = typeName(s.items as Json, link);
        return item.includes(" ") ? `(${item})[]` : `${item}[]`;
    }
    if (s.type === "object") {
        const properties = Object.entries((s.properties as Record<string, Json> | undefined) ?? {});
        const required = (s.required as string[] | undefined) ?? [];
        return properties.length ? `{ ${properties.map(([k, v]) => `${k}${required.includes(k) ? "" : "?"}: ${typeName(v, link)}`).join(", ")} }` : "{}";
    }
    if (s.format === "date-time") {
        return "string (date and time)";
    }
    return Array.isArray(s.type) ? s.type.join(" | ") : String(s.type ?? "any");
}

const title = (e: Endpoint) => `${e.method.toUpperCase()} ${e.path}`;

/** One endpoint's section: what it does, its parameters and body, and its answers. */
function endpointLines(e: Endpoint, schemaOf: (s: z.ZodType) => Json, link: TypeLink = typeLink): string[] {
    const out: string[] = [];
    const line = (text = "") => out.push(text);
    line(`### ${title(e)}`);
    line();
    const notes = [e.signedIn === false && "No sign-in needed.", e.capability && `Only when \`GET /v1/meta\` lists \`${e.capability}\`.`, keyNote(e)?.replace(/(\S+:\S+?)(\.|;)/g, "`$1`$2")].filter(Boolean);
    line([`**${e.summary}.**`, e.description, ...notes].filter(Boolean).join(" "));
    line();
    const params = parameters(e, schemaOf);
    if (params.length) {
        line("| Parameter | In | Type | Description |");
        line("|---|---|---|---|");
        for (const p of params) {
            line(`| \`${p.name}\`${p.required ? "" : " (optional)"} | ${p.in} | ${cell(typeName(p.schema, link))} | ${cell(p.description ?? "")} |`);
        }
        line();
    }
    if (e.body) {
        line(`**Body:** ${typeName(schemaOf(e.body), link)}`);
        line();
    }
    if (e.file) {
        line(`**Body:** ${e.file.description} (${e.file.contentType})`);
        line();
    }
    if (e.form) {
        line(`**Body:** multipart/form-data: the fields of ${typeName(schemaOf(e.form.fields), link)}, and the files ${Object.entries(e.form.files).map(([name, what]) => `\`${name}\` (${what})`).join(", ")}`);
        line();
    }
    line("| Answer | Body | When |");
    line("|---|---|---|");
    for (const [status, r] of Object.entries(responsesOf(e))) {
        const body = r.text ? `\`${r.text}\` (text)` : r.csv ? "CSV" : r.calendar ? "iCalendar" : r.image ? "An image" : r.zip ? "A zip file" : r.body ? typeName(schemaOf(r.body), link) : "";
        const headers = r.headers ? ` Header: ${Object.keys(r.headers).map((h) => `\`${h}\``).join(", ")}.` : "";
        line(`| ${status} | ${cell(body)} | ${cell(r.description + headers)} |`);
    }
    line();
    return out;
}

/** One type's section: its fields, or the forms it can take. */
function typeLines(id: string, components: Record<string, Json>, link: TypeLink = typeLink): string[] {
    const out: string[] = [];
    const line = (text = "") => out.push(text);
    const s = components[id];
    line(`### ${id}`);
    line();
    if (s.description) {
        line(String(s.description));
        line();
    }
    const properties = Object.entries((s.properties as Record<string, Json> | undefined) ?? {});
    if (properties.length) {
        const required = (s.required as string[] | undefined) ?? [];
        line("| Field | Type | Description |");
        line("|---|---|---|");
        for (const [name, p] of properties) {
            line(`| \`${name}\`${required.includes(name) ? "" : " (optional)"} | ${cell(typeName(p, link))} | ${cell(String(p.description ?? ""))} |`);
        }
    } else if (Array.isArray(s.oneOf ?? s.anyOf)) {
        for (const option of (s.oneOf ?? s.anyOf) as Json[]) {
            line(`- ${typeName(option, link)}`);
        }
    } else {
        line(typeName(s, link));
    }
    if (typeof s.additionalProperties === "object") {
        line();
        line("It may have more fields.");
    }
    line();
    return out;
}

function markdown(schemaOf: (s: z.ZodType) => Json, components: Record<string, Json>): string {
    const out: string[] = [];
    const line = (text = "") => out.push(text);

    line("# LawFive API (v1)");
    line();
    line("<!-- Generated from schema/src/endpoints.ts and api.ts by `pnpm generate` in schema/. Don't edit; change those and regenerate. -->");
    line();
    line("The API of a LawFive server, which the web app, the watch apps and the phone apps use. The same reference as OpenAPI 3.1 is [openapi.json](openapi.json), for generating code or loading into an API tool.");
    line();
    line("- **Address:** everything is under `/v1` on the server: `https://api.lawfive.app/v1/...` for LawFive's own service, or your own server's address.");
    line("- **Signing in:** apps sign in (or link, for a watch), take the token and send it as `Authorization: Bearer <token>`. Browsers use the session cookie and must send an `Origin` header matching the server. Everything needs signing in unless it says otherwise; without it the answer is `401`.");
    line("- **API keys:** for scripts and integrations, made in Settings and sent the same way (`Authorization: Bearer lf_...`). Each key can use only the collections it was given; each endpoint says what a key needs, and a key without it gets `403`. See [API keys](#api-keys).");
    line("- **Errors:** a JSON body with `error`, a sentence a person can read ([ApiError](#apierror)); the account and linking endpoints have their own shapes ([AuthError](#autherror), [OAuthError](#oautherror)). Anything unexpected is a `500`. Every answer, errors included, has a `LawFive-Version` header with the server's version; an error without it came from something in front of the server (a proxy while the server restarts, say), so treat it as not reaching the server and try again rather than acting on its status.");
    line("- **Data:** JSON. Ids are UUIDs, times are ISO 8601 with a UTC offset, durations are whole seconds. Records are described in the data model ([docs/MATCH_CONFIG.md](../../docs/MATCH_CONFIG.md) and [json-schema/](json-schema/)).");
    line("- **Older servers:** check `capabilities` in `GET /v1/meta` before using address search or weather, which a server can switch off; ignore fields and capabilities you don't know.");
    line();

    // The collections all work the same way, so only matches are shown in full.
    const shown = (e: Endpoint) => e.group !== "Records" || e.path.startsWith("/v1/matches");
    const byGroup = Object.keys(groups).map((group) => [group, endpoints.filter((e) => e.group === group && shown(e))] as const);
    line("## Endpoints");
    line();
    line("| Endpoint | What it does |");
    line("|---|---|");
    for (const [, list] of byGroup) {
        for (const e of list) {
            line(`| [\`${title(e)}\`](#${anchor(title(e))}) | ${cell(e.summary)} |`);
        }
        if (list[0]?.group === "Records") {
            line(`| The same for ${Object.keys(collectionDocs).filter((c) => c !== "matches").map((c) => `\`${c}\``).join(", ")} | See [Records](#records) |`);
        }
    }
    line();

    for (const [group, list] of byGroup) {
        line(`## ${group}`);
        line();
        line(groups[group]);
        line();
        if (group === "Records") {
            line("| Collection | Record | Saved as | Notes |");
            line("|---|---|---|---|");
            for (const [name, c] of Object.entries(api.collections)) {
                const id = (s: z.ZodType) => typeLink(z.globalRegistry.get(s)?.id as string);
                line(`| \`/v1/${name}\` | ${id(c.record)} | ${id(c.input)} | ${cell(collectionDocs[name as api.CollectionName].note ?? "")} |`);
            }
            line();
            line("Each has the same four endpoints, shown here for matches.");
            line();
        }
        for (const e of list) {
            out.push(...endpointLines(e, schemaOf));
        }
    }

    line("## Types");
    line();
    line("The API's own types. Records and weather are in the data model: Match, MatchTemplate, MatchRecord, Venue, Competition, Referee, UserSettings and MatchWeather, each with a JSON Schema file in [json-schema/](json-schema/). The `<Record>Input` types are those records without `updatedAt` and `deletedAt`, and with `id` and `version` optional.");
    line();
    for (const id of apiTypes) {
        out.push(...typeLines(id, components));
    }
    return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

// agents/: the same reference in pages small enough to fetch one at a time (AGT-1).

const docsSite = "https://lawfive.dev";
const page = (lines: string[]) => `${lines.join("\n").replace(/\n+$/, "")}\n`;
/** Requirement IDs mean nothing outside this repo: "(USR-2 to USR-4)" and the "USR-7" in "(a code, USR-7)" go. */
const withoutRequirementIds = (text: string) => text
    .replace(/ ?\([A-Z]{2,5}-\d+(?:(?:, | to | and )[A-Z]{2,5}-\d+)*\)/g, "")
    .replace(/, [A-Z]{2,5}-\d+(?=[;)])/g, "")
    .replace(/\([A-Z]{2,5}-\d+, /g, "(");
const firstSentence = (text: string) => withoutRequirementIds(text).match(/^.*?\.(?= |$)/)?.[0] ?? text;

/** Every type a schema refers to, directly or through another. */
function typesIn(schema: unknown, components: Record<string, Json>, found = new Set<string>()): Set<string> {
    for (const [, id] of JSON.stringify(schema).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)) {
        if (!found.has(id)) {
            found.add(id);
            typesIn(components[id], components, found);
        }
    }
    return found;
}

function agentFiles(schemaOf: (s: z.ZodType) => Json, components: Record<string, Json>): Record<string, string> {
    const files: Record<string, string> = {};
    const dir = "generated/agents";
    const bodies = (e: Endpoint) => [
        e.body && schemaOf(e.body), e.form && schemaOf(e.form.fields), ...parameters(e, schemaOf).map((p) => p.schema),
        ...Object.values(responsesOf(e)).map((r) => r.body && schemaOf(r.body)),
    ];
    /** A record's input is the record with fewer fields, explained on the data model page. */
    const recordOfInput = (id: string) => id.endsWith("Input") && !apiTypes.includes(id) && components[id.slice(0, -5)] ? id.slice(0, -5) : undefined;
    const isDataModel = (id: string) => !apiTypes.includes(id);
    const linkFrom = (here: "group" | "model"): TypeLink => (id) => {
        const target = recordOfInput(id) ?? id;
        return isDataModel(id) && here === "group" ? `[${id}](data-model.md#${anchor(target)})` : `[${id}](#${anchor(target)})`;
    };

    const shown = (e: Endpoint) => e.group !== "Records" || e.path.startsWith("/v1/matches");
    const groupNames = Object.keys(groups);
    const slug = (group: string) => anchor(group);
    const guides = readdirSync(new URL("../guides/", import.meta.url)).filter((f) => f.endsWith(".md")).sort().map((file) => {
        const text = readFileSync(new URL(`../guides/${file}`, import.meta.url), "utf8");
        const [, heading, summary] = text.match(/^# (.+)\n\n(.+)\n/) as RegExpMatchArray;
        return { name: `guide-${file}`, text, heading, summary };
    });

    for (const group of groupNames) {
        const list = endpoints.filter((e) => e.group === group && shown(e));
        const out = [`# ${group}`, "", groups[group], "", "[The overview](overview.md) covers the address, signing in, API keys and errors.", ""];
        if (group === "Records") {
            out.push("| Collection | Record | Saved as | Notes |", "|---|---|---|---|");
            for (const [name, c] of Object.entries(api.collections)) {
                const id = (s: z.ZodType) => linkFrom("group")(z.globalRegistry.get(s)?.id as string);
                out.push(`| \`/v1/${name}\` | ${id(c.record)} | ${id(c.input)} | ${cell(collectionDocs[name as api.CollectionName].note ?? "")} |`);
            }
            out.push("", "Each has the same four endpoints, shown here for matches.", "");
        }
        out.push("## Endpoints", "");
        for (const e of list) {
            out.push(...endpointLines(e, schemaOf, linkFrom("group")));
        }
        const types = [...typesIn(list.flatMap(bodies), components)].filter((id) => !isDataModel(id)).sort();
        if (types.length) {
            out.push("## Types", "");
            for (const id of types) {
                out.push(...typeLines(id, components, linkFrom("group")));
            }
        }
        files[`${dir}/${slug(group)}.md`] = withoutRequirementIds(page(out));
    }

    const model = ["# The data model", "", "What's stored: the records and the types they're made of. A record's `<Record>Input` is what's sent to save it: the same without `updatedAt` and `deletedAt`, and with `id` and `version` optional. Each type also has a JSON Schema file, at `" + docsSite + "/schemas/<Type>.json`, for validating exactly.", ""];
    for (const id of Object.keys(components).filter((id) => isDataModel(id) && !recordOfInput(id)).sort()) {
        model.push(...typeLines(id, components, linkFrom("model")));
    }
    files[`${dir}/data-model.md`] = withoutRequirementIds(page(model));

    const scopes = Object.keys(api.collections).map((c) => `\`${c}\``).join(", ");
    const overview = [
        "# The LawFive API",
        "",
        "LawFive is for soccer referees: it keeps their matches, match reports, venues and the officials they work with. Everything it does goes through this API. Each person's data is their own, on the hosted service or a server someone runs themselves.",
        "",
        "## The basics",
        "",
        "- **Address:** everything is under `/v1` on the server: `https://api.lawfive.app` for the hosted service, or a server's own address. Ask the person which one they use.",
        "- **What a server offers:** `GET /v1/meta` needs no sign-in. Check `capabilities` before using address search or weather, which a server can switch off, and ignore fields and capabilities you don't know. A server may be older than these pages.",
        "- **This server's exact API:** `GET /v1/openapi.json` needs no sign-in, and describes the version that server runs. `openApiUrl` in `GET /v1/meta` is its full address; a server from before it has no such field.",
        "- **Data:** JSON. Ids are UUIDs chosen by the client, times are ISO 8601 with a UTC offset, and durations are whole seconds.",
        "- **Errors:** a JSON body with `error`, a sentence a person can read. `429` means too many tries: wait for the seconds in `Retry-After`. `413` means the request is too big. Every answer from the server has a `LawFive-Version` header; an error without it came from a proxy in front of the server (while it restarts, say), so try again rather than acting on its status.",
        "",
        "## API keys",
        "",
        "Integrations use an API key, which the person makes in the website's Settings → API keys and which is shown once. Send it as `Authorization: Bearer lf_...`. Ask for the least access the job needs.",
        "",
        `- **Access:** per collection, read or read and write, written \`<collection>:read\` and \`<collection>:write\`. The collections are ${scopes}.`,
        "- **`401`** means the key is unknown, deleted or expired, and **`403`** means it lacks that access; each says which.",
        "- **Closed to keys:** anything whose section says \"Not with API keys\", such as stats, photos, devices and managing webhooks. Those need the person signed in.",
        "",
        "## Pages",
        "",
        "| Page | What it covers |",
        "|---|---|",
        "| [The data model](data-model.md) | The records and every type they're made of |",
        ...guides.map((g) => `| [${g.heading}](${g.name}) | ${g.summary} |`),
        ...groupNames.map((g) => `| [${g}](${slug(g)}.md) | ${cell(firstSentence(groups[g]))} |`),
    ];
    files[`${dir}/overview.md`] = withoutRequirementIds(page(overview));

    for (const g of guides) {
        files[`${dir}/${g.name}`] = g.text;
    }

    const url = (name: string) => `${docsSite}/agents/${name}`;
    /** Whether an integration can use a group: something in it takes an API key, or none of it needs signing in. */
    const forKeys = (g: string) => {
        const list = endpoints.filter((e) => e.group === g);
        return list.some((e) => e.keyScope) || list.every((e) => e.signedIn === false);
    };
    const reference = (keys: boolean) => groupNames.filter((g) => forKeys(g) === keys).map((g) => `- [${g}](${url(`${slug(g)}.md`)}): ${firstSentence(groups[g])}`);
    files[`${dir}/llms.txt`] = page([
        "# LawFive API",
        "",
        "> LawFive is for soccer referees: it keeps their matches, match reports, venues and the officials they work with. Integrations reach a person's own data on the hosted service or a self-hosted server, using an API key they make in Settings.",
        "",
        "Start with the overview, then fetch only the pages the job needs. Every page is Markdown.",
        "",
        "## Start here",
        "",
        `- [Overview](${url("overview.md")}): the address, API keys, errors and what's on each page.`,
        `- [The data model](${url("data-model.md")}): the records and every type they're made of.`,
        "",
        "## Worked examples",
        "",
        ...guides.map((g) => `- [${g.heading}](${url(g.name)}): ${g.summary}`),
        "",
        "## API reference, for integrations",
        "",
        ...reference(true),
        "",
        "## API reference, not open to API keys",
        "",
        ...reference(false),
        "",
        "## Optional",
        "",
        `- [OpenAPI 3.1](${docsSite}/openapi.json): the whole API for generating clients or loading into tools, about 600 KB. A server's own copy, matching its version, is at \`/v1/openapi.json\`.`,
        `- [JSON Schema for a match](${docsSite}/schemas/Match.json): one file per type, at \`/schemas/<Type>.json\`.`,
    ]);
    return files;
}
