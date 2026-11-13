// The example files for importing matches (IMP-2), in public/examples/: the same three matches as
// CSV, Excel and JSON, the Excel one with the column guide as its second sheet (IMP-9). Run again
// after changing the columns (schema/src/importColumns.ts).
//   pnpm examples

import { type ImportColumnId, importColumns, importColumnsNote } from "@lawfive/schema";
import { writeFileSync } from "node:fs";
import writeExcelFile from "write-excel-file/node";

const dir = new URL("../public/examples/", import.meta.url).pathname;

/** The columns the examples fill in, as [heading in CSV and Excel, key in JSON]. */
const shown: ImportColumnId[] = [
    "number", "status", "date", "time", "home", "homeShort", "homeColour", "away", "awayShort", "awayColour",
    "competition", "venue", "pitch", "name", "ageGroup", "gender", "role", "referee", "ar1", "ar2", "fourth",
    "periods", "periodLength", "halfTime", "teamSize", "fee", "currency", "paid", "tags", "notes",
];
const columns = shown.map((id) => {
    const column = importColumns.find((c) => c.id === id)!;
    return [column.header, column.json] as const;
});

const matches: Partial<Record<string, string | number>>[] = [
    {
        matchNumber: "BYL-1142", status: "scheduled", date: "2027-03-06", time: "09:00",
        home: "Strikers U12", homeShortName: "STR", homeColour: "red", away: "Rovers U12", awayShortName: "ROV", awayColour: "blue",
        competition: "Bay Youth League U12 Boys", venue: "Twin Creeks Sports Complex", pitch: "Field 3",
        ageGroup: "U12", gender: "male", role: "referee", ar1: "Sam Rivera", ar2: "Jordan Lee",
        periods: 2, periodLength: 30, halfTime: 5, teamSize: 9, fee: 40, currency: "USD", paid: "no", tags: "league", notes: "Bring the spare flags.",
    },
    {
        matchNumber: "NPL-2207", status: "scheduled", date: "2027-03-06", time: "11:30",
        home: "Thunder FC", homeShortName: "THU", homeColour: "yellow", away: "Galaxy SC", awayShortName: "GAL", awayColour: "purple",
        competition: "NorCal Premier U14 Girls", venue: "Twin Creeks Sports Complex", pitch: "Field 1",
        ageGroup: "U14", gender: "female", role: "ar1", referee: "Priya Natarajan", ar2: "Jordan Lee",
        periods: 2, periodLength: 35, halfTime: 10, teamSize: 11, fee: 30, currency: "USD", paid: "no",
    },
    {
        matchNumber: "HC-SF1", status: "scheduled", date: "2027-03-13", time: "14:00",
        home: "Dynamo", homeShortName: "DYN", homeColour: "#FF7A00", away: "City", awayShortName: "CTY", awayColour: "#0057B8",
        competition: "Harvest Cup", venue: "Ortega Park", matchName: "Semi-final",
        ageGroup: "Adult", gender: "coed", role: "fourth", referee: "Sam Rivera", ar1: "Jordan Lee", ar2: "Priya Natarajan",
        periods: 2, periodLength: 45, halfTime: 15, teamSize: 11, fee: 55, currency: "USD", paid: "no", tags: "tournament, final stages",
    },
];

const csvField = (value: string | number | undefined) => {
    const text = value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
};
const csv = [columns.map(([name]) => name), ...matches.map((m) => columns.map(([, key]) => m[key]))].map((row) => row.map(csvField).join(",")).join("\r\n");
writeFileSync(`${dir}lawfive-matches.csv`, `${csv}\r\n`);

writeFileSync(`${dir}lawfive-matches.json`, `${JSON.stringify(matches, null, 2)}\n`);

// Excel: dates and times as real date and time cells, as most spreadsheets hold them.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const timeOfDay = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h * 60 + m) / 1440;
};
const sheet = [
    columns.map(([name]) => ({ value: name, fontWeight: "bold" as const })),
    ...matches.map((m) => columns.map(([, key]) => {
        const value = m[key];
        if (key === "date" && typeof value === "string") {
            return { value: day(value), type: Date, format: "yyyy-mm-dd" };
        }
        if (key === "time" && typeof value === "string") {
            return { value: timeOfDay(value), type: Number, format: "h:mm AM/PM" };
        }
        return value === undefined ? null : { value };
    })),
];
const guide = [
    ["Column", "JSON", "What it's for", "Example", "Needed"].map((value) => ({ value, fontWeight: "bold" as const })),
    ...importColumns.map((c) => [c.header, c.json, c.about, c.example, "newMatch" in c ? "New matches*" : "Optional"].map((value) => ({ value, wrap: true }))),
    [],
    [{ value: `* ${importColumnsNote} The import reads the Matches sheet and ignores this one.`, wrap: false }],
];
await writeExcelFile([
    { data: sheet as never, sheet: "Matches", columns: columns.map(([name]) => ({ width: Math.max(10, name.length + 2) })), stickyRowsCount: 1 },
    { data: guide as never, sheet: "Columns", columns: [{ width: 20 }, { width: 16 }, { width: 70 }, { width: 26 }, { width: 14 }], stickyRowsCount: 1 },
]).toFile(`${dir}lawfive-matches.xlsx`);

console.log(`Examples in ${dir}`);
