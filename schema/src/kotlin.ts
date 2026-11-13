// Kotlin types for the phone app (mobile/android), generated from the same registered schemas as
// the JSON Schema files and the OpenAPI document, so the app and the server can't drift apart.
// kotlinx.serialization data classes, made to survive a newer server:
//   - enums are plain strings, with an object of the known values beside them, so a value added
//     later doesn't fail to decode;
//   - unions (events, offenders) pick their class by the discriminator's value, with an Unknown
//     class for a value added later;
//   - optional fields default to null, and the app's Json ignores fields it doesn't know.

type Json = Record<string, unknown>;

const keywords = new Set(["as", "break", "class", "continue", "do", "else", "false", "for", "fun", "if", "in", "interface", "is", "null", "object",
    "package", "return", "super", "this", "throw", "true", "try", "typealias", "typeof", "val", "var", "when", "while"]);
const name = (n: string) => (keywords.has(n) ? `\`${n}\`` : n);
const pascal = (s: string) => s.replace(/(^|[^A-Za-z0-9])([a-z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
const constName = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase().replace(/^(\d)/, "_$1") || "EMPTY";
const refName = (ref: string) => ref.replace(/^#\/components\/schemas\//, "");
const intMax = 2 ** 31 - 1;

function doc(text: unknown, indent = ""): string {
    if (typeof text !== "string" || !text) {
        return "";
    }
    return `${indent}/** ${text.replaceAll("*/", "*∕").replaceAll("\n", " ")} */\n`;
}

export function kotlinModels(schemas: Record<string, Json>): string {
    const out: string[] = [];
    const emitted = new Set<string>();

    const isEnum = (s: Json) => s.type === "string" && Array.isArray(s.enum);
    const isScalarAlias = (s: Json) => s.type === "string" || s.type === "integer" || s.type === "number" || s.type === "boolean";
    const unionKey = (s: Json): string | undefined => {
        const options = s.oneOf as Json[] | undefined;
        if (!options?.every((o) => o.type === "object")) {
            return undefined;
        }
        const first = Object.entries((options[0].properties as Record<string, Json>) ?? {}).find(([, p]) => "const" in p)?.[0];
        return first && options.every((o) => "const" in (((o.properties as Record<string, Json>) ?? {})[first] ?? {})) ? first : undefined;
    };

    /** The Kotlin type for a schema; inline objects become classes named after where they are. */
    function typeOf(s: Json, context: string): string {
        if (typeof s.$ref === "string") {
            const target = schemas[refName(s.$ref)];
            const id = refName(s.$ref);
            if (target && isEnum(target)) {
                return "String";
            }
            return id;
        }
        if (Array.isArray(s.type)) {
            const types = (s.type as string[]).filter((t) => t !== "null");
            const one = types.length === 1 ? typeOf({ ...s, type: types[0] }, context) : "JsonElement";
            return s.type.includes("null") ? `${one}?` : one;
        }
        const anyOf = (s.anyOf ?? s.oneOf) as Json[] | undefined;
        if (anyOf?.length && anyOf.every((o) => "const" in o)) {
            // A choice of fixed values: their type.
            const values = anyOf.map((o) => o.const);
            return values.every((v) => typeof v === "string") ? "String" : values.every((v) => Number.isInteger(v)) ? "Int" : "JsonElement";
        }
        if (anyOf) {
            const nonNull = anyOf.filter((o) => o.type !== "null");
            if (nonNull.length === 1) {
                return `${typeOf(nonNull[0], context)}?`.replace("??", "?");
            }
            return "JsonElement";
        }
        switch (s.type) {
            case "string":
                return "String";
            case "boolean":
                return "Boolean";
            case "number":
                return "Double";
            case "integer": {
                const min = typeof s.minimum === "number" ? s.minimum : -Infinity;
                const max = typeof s.maximum === "number" ? s.maximum : Infinity;
                return min >= -intMax - 1 && max <= intMax ? "Int" : "Long";
            }
            case "array":
                if (s.prefixItems) {
                    return "JsonArray";
                }
                return `List<${typeOf((s.items as Json) ?? {}, `${context}Item`).replace(/\?$/, "")}>`;
            case "object": {
                if (s.properties) {
                    emitClass(context, s);
                    return context;
                }
                if (s.additionalProperties && typeof s.additionalProperties === "object") {
                    return `Map<String, ${typeOf(s.additionalProperties as Json, `${context}Value`).replace(/\?$/, "")}>`;
                }
                return "JsonObject";
            }
            default:
                return "JsonElement";
        }
    }

    function fields(s: Json, owner: string, fixed?: [string, string]): string {
        const required = new Set((s.required as string[] | undefined) ?? []);
        return Object.entries((s.properties as Record<string, Json>) ?? {}).map(([prop, p]) => {
            const annotation = prop !== prop.replace(/[^A-Za-z0-9_]/g, "") ? `    @SerialName("${prop}")\n` : "";
            if (fixed && prop === fixed[0]) {
                return `${doc(p.description, "    ")}${annotation}    val ${name(prop)}: String = "${fixed[1]}",`;
            }
            let type = typeOf(p, owner + pascal(prop));
            const optional = !required.has(prop) || type.endsWith("?");
            type = type.replace(/\?$/, "");
            return `${doc(p.description, "    ")}${annotation}    val ${name(prop)}: ${type}${optional ? "? = null" : ""},`;
        }).join("\n");
    }

    function emitClass(className: string, s: Json, parent?: string, fixed?: [string, string]) {
        if (emitted.has(className)) {
            return;
        }
        emitted.add(className);
        const body = fields(s, className, fixed);
        out.push(`${doc(s.description)}@Serializable\ndata class ${className}(\n${body}\n)${parent ? ` : ${parent}` : ""}\n`);
    }

    function emitUnion(unionName: string, s: Json, key: string) {
        const options = s.oneOf as Json[];
        const variants = options.map((o) => {
            const value = String(((o.properties as Record<string, Json>)[key] as Json).const);
            return { value, className: `${unionName}${pascal(value)}`, schema: o };
        });
        out.push(`${doc(s.description)}@Serializable(with = ${unionName}Serializer::class)\nsealed interface ${unionName} {\n    val ${name(key)}: String\n}\n`);
        for (const v of variants) {
            emitted.delete(v.className);
            emitClass(v.className, v.schema, unionName, [key, v.value]);
            // The discriminator is the interface's.
            const last = out.length - 1;
            out[last] = out[last].replace(`    val ${name(key)}: String = "${v.value}",`, `    override val ${name(key)}: String = "${v.value}",`);
        }
        out.push(`/** A ${unionName} of a kind this app doesn't know yet (from a newer server). */\n@Serializable\ndata class ${unionName}Unknown(override val ${name(key)}: String = "") : ${unionName}\n`);
        const cases = variants.map((v) => `            "${v.value}" -> ${v.className}.serializer()`).join("\n");
        out.push(`object ${unionName}Serializer : JsonContentPolymorphicSerializer<${unionName}>(${unionName}::class) {
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<${unionName}> =
        when ((element as? JsonObject)?.get("${key}")?.let { (it as? JsonPrimitive)?.content }) {
${cases}
            else -> ${unionName}Unknown.serializer()
        }
}
`);
    }

    for (const [id, s] of Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))) {
        if (isEnum(s)) {
            const values = (s.enum as unknown[]).map(String);
            out.push(`${doc(s.description)}object ${id} {\n${values.map((v) => `    const val ${constName(v)} = "${v}"`).join("\n")}\n    val all = listOf(${values.map((v) => constName(v)).join(", ")})\n}\n`);
            continue;
        }
        const key = unionKey(s);
        if (key) {
            emitUnion(id, s, key);
            continue;
        }
        if (s.type === "object" && s.properties) {
            emitClass(id, s);
            continue;
        }
        if (isScalarAlias(s) || s.type === "array" || (s.type === "object")) {
            out.push(`${doc(s.description)}typealias ${id} = ${typeOf(s, id)}\n`);
            continue;
        }
        out.push(`${doc(s.description)}typealias ${id} = JsonElement\n`);
    }

    return `// Generated by schema/src/kotlin.ts from the schemas in schema/src (pnpm generate in schema/). Don't edit.
@file:Suppress("unused", "PropertyName", "ClassName")

package app.lawfive.schema

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

${out.join("\n")}`;
}
