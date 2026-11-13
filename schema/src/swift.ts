// Swift types for the iPhone app (mobile/ios), generated from the same registered schemas as the
// Kotlin ones (kotlin.ts), and made to survive a newer server in the same ways:
//   - enums are plain strings, with an enum of the known values beside them, so a value added later
//     doesn't fail to decode;
//   - unions (events, offenders) pick their case by the discriminator's value, with an unknown case
//     for a value added later, which keeps its JSON;
//   - optional fields default to nil, and fields the type doesn't know are ignored when decoding.

type Json = Record<string, unknown>;

const keywords = new Set(["as", "associatedtype", "break", "case", "catch", "class", "continue", "default", "defer", "deinit", "do", "else", "enum", "extension", "fallthrough",
    "false", "fileprivate", "for", "func", "guard", "if", "import", "in", "init", "inout", "internal", "is", "let", "nil", "operator", "precedencegroup", "private", "protocol",
    "public", "repeat", "rethrows", "return", "self", "Self", "static", "struct", "subscript", "super", "switch", "throw", "throws", "true", "try", "typealias", "var", "where", "while"]);
const name = (n: string) => (keywords.has(n) ? `\`${n}\`` : n);
const pascal = (s: string) => s.replace(/(^|[^A-Za-z0-9])([a-z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
const camel = (s: string) => {
    const p = pascal(s);
    return name(/^\d/.test(p) ? `_${p}` : p.charAt(0).toLowerCase() + p.slice(1));
};
const safeField = (n: string) => n.replace(/[^A-Za-z0-9_]/g, "_");
const refName = (ref: string) => ref.replace(/^#\/components\/schemas\//, "");
const conformances = "Codable, Hashable, Sendable";

function doc(text: unknown, indent = ""): string {
    if (typeof text !== "string" || !text) {
        return "";
    }
    return `${indent}/// ${text.replaceAll("\n", " ")}\n`;
}

export function swiftModels(schemas: Record<string, Json>): string {
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

    /** The Swift type for a schema; inline objects become structs named after where they are. */
    function typeOf(s: Json, context: string): string {
        if (typeof s.$ref === "string") {
            const id = refName(s.$ref);
            const target = schemas[id];
            return target && isEnum(target) ? "String" : id;
        }
        if (Array.isArray(s.type)) {
            const types = (s.type as string[]).filter((t) => t !== "null");
            const one = types.length === 1 ? typeOf({ ...s, type: types[0] }, context) : "JSONValue";
            return s.type.includes("null") ? `${one}?` : one;
        }
        const anyOf = (s.anyOf ?? s.oneOf) as Json[] | undefined;
        if (anyOf?.length && anyOf.every((o) => "const" in o)) {
            // A choice of fixed values: their type.
            const values = anyOf.map((o) => o.const);
            return values.every((v) => typeof v === "string") ? "String" : values.every((v) => Number.isInteger(v)) ? "Int" : "JSONValue";
        }
        if (anyOf) {
            const nonNull = anyOf.filter((o) => o.type !== "null");
            if (nonNull.length === 1) {
                return `${typeOf(nonNull[0], context)}?`.replace("??", "?");
            }
            return "JSONValue";
        }
        switch (s.type) {
            case "string":
                return "String";
            case "boolean":
                return "Bool";
            case "number":
                return "Double";
            case "integer":
                return "Int";
            case "array":
                if (s.prefixItems) {
                    return "JSONValue";
                }
                return `[${typeOf((s.items as Json) ?? {}, `${context}Item`).replace(/\?$/, "")}]`;
            case "object": {
                if (s.properties) {
                    emitStruct(context, s);
                    return context;
                }
                if (s.additionalProperties && typeof s.additionalProperties === "object") {
                    return `[String: ${typeOf(s.additionalProperties as Json, `${context}Value`).replace(/\?$/, "")}]`;
                }
                return "[String: JSONValue]";
            }
            default:
                return "JSONValue";
        }
    }

    function fields(s: Json, owner: string, fixed?: [string, string]): { body: string; renames: [string, string][] } {
        const required = new Set((s.required as string[] | undefined) ?? []);
        const renames: [string, string][] = [];
        const lines = Object.entries((s.properties as Record<string, Json>) ?? {}).map(([prop, p]) => {
            const field = safeField(prop);
            renames.push([name(field), prop]);
            if (fixed && prop === fixed[0]) {
                return `${doc(p.description, "    ")}    var ${name(field)}: String = "${fixed[1]}"`;
            }
            const type = typeOf(p, owner + pascal(prop));
            const optional = !required.has(prop) || type.endsWith("?");
            return `${doc(p.description, "    ")}    var ${name(field)}: ${type.replace(/\?$/, "")}${optional ? "? = nil" : ""}`;
        });
        return { body: lines.join("\n"), renames };
    }

    function emitStruct(structName: string, s: Json, fixed?: [string, string]) {
        if (emitted.has(structName)) {
            return;
        }
        emitted.add(structName);
        const { body, renames } = fields(s, structName, fixed);
        // Only a field that isn't a Swift name needs its JSON name spelled out, and then they all do.
        const keys = renames.some(([field, prop]) => field.replaceAll("`", "") !== prop)
            ? `\n\n    enum CodingKeys: String, CodingKey {\n${renames.map(([field, prop]) => `        case ${field} = "${prop}"`).join("\n")}\n    }`
            : "";
        out.push(`${doc(s.description)}struct ${structName}: ${conformances} {\n${body}${keys}\n}\n`);
    }

    function emitUnion(unionName: string, s: Json, key: string) {
        const options = s.oneOf as Json[];
        const variants = options.map((o) => {
            const value = String(((o.properties as Record<string, Json>)[key] as Json).const);
            return { value, structName: `${unionName}${pascal(value)}`, schema: o, caseName: camel(value) };
        });
        for (const v of variants) {
            emitStruct(v.structName, v.schema, [key, v.value]);
        }
        out.push(`${doc(s.description)}enum ${unionName}: ${conformances} {
${variants.map((v) => `    case ${v.caseName}(${v.structName})`).join("\n")}
    /// One of a kind this app doesn't know yet (from a newer server), its JSON kept.
    case unknown(JSONValue)

    var ${name(key)}: String {
        switch self {
${variants.map((v) => `        case .${v.caseName}: return "${v.value}"`).join("\n")}
        case .unknown(let value): return value["${key}"]?.string ?? ""
        }
    }

    init(from decoder: Decoder) throws {
        let keys = try decoder.container(keyedBy: JSONKey.self)
        switch try? keys.decode(String.self, forKey: JSONKey("${key}")) {
${variants.map((v) => `        case "${v.value}": self = .${v.caseName}(try ${v.structName}(from: decoder))`).join("\n")}
        default: self = .unknown(try JSONValue(from: decoder))
        }
    }

    func encode(to encoder: Encoder) throws {
        switch self {
${variants.map((v) => `        case .${v.caseName}(let value): try value.encode(to: encoder)`).join("\n")}
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}
`);
    }

    for (const [id, s] of Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))) {
        if (isEnum(s)) {
            const values = (s.enum as unknown[]).map(String);
            out.push(`${doc(s.description)}enum ${id} {\n${values.map((v) => `    static let ${camel(v)} = "${v}"`).join("\n")}\n    static let all = [${values.map(camel).join(", ")}]\n}\n`);
            continue;
        }
        const key = unionKey(s);
        if (key) {
            emitUnion(id, s, key);
            continue;
        }
        if (s.type === "object" && s.properties) {
            emitStruct(id, s);
            continue;
        }
        if (isScalarAlias(s) || s.type === "array" || s.type === "object") {
            out.push(`${doc(s.description)}typealias ${id} = ${typeOf(s, id)}\n`);
            continue;
        }
        out.push(`${doc(s.description)}typealias ${id} = JSONValue\n`);
    }

    return `// Generated by schema/src/swift.ts from the schemas in schema/src (pnpm generate in schema/). Don't edit.

import Foundation

/// A JSON object's key by name, for reading a union's discriminator.
struct JSONKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(_ string: String) { stringValue = string }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

/// Any JSON, for the fields the schema leaves open and for keeping records whole.
enum JSONValue: ${conformances} {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() {
            self = .null
        } else if let v = try? value.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? value.decode(Int.self) {
            self = .int(v)
        } else if let v = try? value.decode(Double.self) {
            self = .double(v)
        } else if let v = try? value.decode(String.self) {
            self = .string(v)
        } else if let v = try? value.decode([JSONValue].self) {
            self = .array(v)
        } else {
            self = .object(try value.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .null: try value.encodeNil()
        case .bool(let v): try value.encode(v)
        case .int(let v): try value.encode(v)
        case .double(let v): try value.encode(v)
        case .string(let v): try value.encode(v)
        case .array(let v): try value.encode(v)
        case .object(let v): try value.encode(v)
        }
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let fields) = self { return fields[key] }
        return nil
    }

    var string: String? {
        if case .string(let v) = self { return v }
        return nil
    }

    var int: Int? {
        if case .int(let v) = self { return v }
        return nil
    }

    var bool: Bool? {
        if case .bool(let v) = self { return v }
        return nil
    }

    var double: Double? {
        switch self {
        case .double(let v): return v
        case .int(let v): return Double(v)
        default: return nil
        }
    }

    var array: [JSONValue]? {
        if case .array(let v) = self { return v }
        return nil
    }

    var object: [String: JSONValue]? {
        if case .object(let v) = self { return v }
        return nil
    }
}

${out.join("\n")}`;
}
