// The columns of a match import (IMP-2, IMP-9): what each is for, how to write it, and the other
// headings a file might use. One list for everything: the server reads files by it, the web app's
// column guide and the Excel example's Columns sheet show it, and it's in the API description and
// docs/requirements/importing.md (pnpm generate copies it there; a test checks the copy).

export interface ImportColumn {
    /** The import's own name for it. */
    id: string;
    /** As a CSV or Excel heading. */
    header: string;
    /** As a key in JSON. */
    json: string;
    /** What it's for and how to write it, for someone filling in a spreadsheet. */
    about: string;
    example: string;
    /** One of the columns a new match needs at least one of (a date, or its teams). */
    newMatch?: true;
    /** Other headings that mean the same, lower case with only letters and digits. */
    names: readonly string[];
}

export const importColumns = [
    {
        id: "id", header: "ID", json: "id", example: "5c1e2a9b-…",
        about: "LawFive's own ID for a match, as in a LawFive export. Leave it empty for a new match; with it, the row updates that match.",
        names: ["matchid", "lawfiveid"],
    },
    {
        id: "number", header: "Match number", json: "matchNumber", example: "BYL-1142",
        about: "The league's or assignor's number for the match. Importing a file again with the same number updates the match instead of adding a copy.",
        names: ["number", "matchno", "gamenumber", "gameno", "gameid", "externalid"],
    },
    {
        id: "assignor", header: "Assignor", json: "assignor", example: "Dana Whitfield",
        about: "Who assigned you the match: a person, or the assigning group's name.",
        names: ["assigner", "assignedby"],
    },
    {
        id: "status", header: "Status", json: "status", example: "scheduled",
        about: "scheduled, played, abandoned, canceled or postponed. A new match is scheduled when it's empty.",
        names: [],
    },
    {
        id: "date", header: "Date", json: "date", example: "2026-11-07", newMatch: true,
        about: "The day of the match: 2026-11-07, or the way your computer writes dates (11/7/2026 in the US, 7/11/2026 in most other places).",
        names: ["matchdate", "gamedate", "day"],
    },
    {
        id: "time", header: "Time", json: "time", example: "2:30 PM",
        about: "The kickoff time: 14:30 or 2:30 PM. A new match with a date needs one.",
        names: ["kickofftime", "starttime"],
    },
    {
        id: "kickoff", header: "Kickoff", json: "kickoff", example: "2026-11-07 14:30", newMatch: true,
        about: "The date and time together, instead of Date and Time. Add a UTC offset (2026-11-07T14:30-08:00) to fix the moment exactly.",
        names: ["start", "datetime"],
    },
    {
        id: "timeZone", header: "Time zone", json: "timeZone", example: "America/Los_Angeles",
        about: "Where the kickoff time is, by its name in the time zone database. Empty: the match's own time zone, or your computer's.",
        names: ["tz"],
    },
    {
        id: "home", header: "Home", json: "home", example: "Strikers U12", newMatch: true,
        about: "The home team's name.",
        names: ["hometeam", "homename"],
    },
    {
        id: "homeShort", header: "Home short name", json: "homeShortName", example: "STR",
        about: "Up to 4 letters for the home team on the watch. Empty: made from both team names (the first three letters or digits of each, skipping the words both names start with), and it follows them when they change.",
        names: ["homeshort", "homealias"],
    },
    {
        id: "homeColour", header: "Home color", json: "homeColour", example: "red",
        about: "The home team's color on the watch: black, white, red, orange, yellow, green, blue or purple, or a hex code like #D71920.",
        names: ["homecolor"],
    },
    {
        id: "away", header: "Away", json: "away", example: "Rovers U12", newMatch: true,
        about: "The away team's name.",
        names: ["awayteam", "awayname"],
    },
    {
        id: "awayShort", header: "Away short name", json: "awayShortName", example: "ROV",
        about: "Up to 4 letters for the away team on the watch. Empty: made from both team names (the first three letters or digits of each, skipping the words both names start with), and it follows them when they change.",
        names: ["awayshort", "awayalias"],
    },
    {
        id: "awayColour", header: "Away color", json: "awayColour", example: "#0057B8",
        about: "The away team's color on the watch, written like Home color.",
        names: ["awaycolor"],
    },
    {
        id: "competition", header: "Competition", json: "competition", example: "Bay Youth League U12 Boys",
        about: "The league, cup or tournament, by name. One you don't have yet is added, as a league.",
        names: ["league"],
    },
    {
        id: "venue", header: "Venue", json: "venue", example: "Twin Creeks Sports Complex",
        about: "Where it's played, by name. One you don't have yet is added; give it an address and a place on the map in Venues.",
        names: ["location", "ground"],
    },
    {
        id: "venueAddress", header: "Venue address", json: "venueAddress", example: "969 Caribbean Dr, Sunnyvale, CA 94089",
        about: "The venue's street address, for directions: given to a venue that's added, or one that has no address yet.",
        names: ["address", "site address"],
    },
    {
        id: "pitch", header: "Pitch", json: "pitch", example: "Field 3",
        about: "The pitch at the venue. It's added to the venue if the venue doesn't have it yet.",
        names: ["field"],
    },
    {
        id: "name", header: "Match name", json: "matchName", example: "Semi-final",
        about: "A name for the match itself, shown with the competition: a round, a final, a friendly's occasion.",
        names: ["name", "round"],
    },
    {
        id: "ageGroup", header: "Age group", json: "ageGroup", example: "U12",
        about: "As the league writes it: U12, U19, Adult, O35.",
        names: ["age"],
    },
    {
        id: "gender", header: "Gender", json: "gender", example: "female",
        about: "Who plays: male, female or co-ed (boys, girls, men, women and mixed work too).",
        names: [],
    },
    {
        id: "role", header: "Role", json: "role", example: "AR1",
        about: "Your role: referee, AR1, AR2 or fourth official. Empty: taken from a crew column with your name in it, if there is one.",
        names: ["yourrole", "myrole"],
    },
    {
        id: "referee", header: "Referee", json: "referee", example: "Priya Natarajan",
        about: "The referee's name, or one of their other names. Your own name makes it your role; someone you haven't saved yet is added to Referees. TBD or empty: nobody yet.",
        names: ["centrereferee", "centerreferee", "centre", "center"],
    },
    {
        id: "ar1", header: "AR1", json: "ar1", example: "Sam Rivera",
        about: "The first assistant referee's name, written like Referee.",
        names: ["assistantreferee1", "assistant1"],
    },
    {
        id: "ar2", header: "AR2", json: "ar2", example: "Jordan Lee",
        about: "The second assistant referee's name, written like Referee.",
        names: ["assistantreferee2", "assistant2"],
    },
    {
        id: "fourth", header: "Fourth official", json: "fourthOfficial", example: "Sam Rivera",
        about: "The fourth official's name, written like Referee.",
        names: ["fourth", "4thofficial", "4th"],
    },
    {
        id: "template", header: "Template", json: "template", example: "U12 league: 2×30",
        about: "One of your match templates, by name, for its format (periods, their length, breaks). It must already exist. Empty for a new match: the competition's template, or 2 × 45 minutes.",
        names: [],
    },
    {
        id: "periods", header: "Periods", json: "periods", example: "2",
        about: "How many periods, 1 to 4: 2 for halves, 4 for quarters, 1 for a tournament game of one period. Overrides the template's.",
        names: [],
    },
    {
        id: "periodLength", header: "Period length (min)", json: "periodLength", example: "30",
        about: "Minutes in each period. Overrides the template's.",
        names: ["periodminutes", "halflength", "halflengthmin"],
    },
    {
        id: "halfTime", header: "Half-time (min)", json: "halfTime", example: "5",
        about: "Minutes of break between periods. Overrides the template's.",
        names: ["break", "breakmin"],
    },
    {
        id: "teamSize", header: "Team size", json: "teamSize", example: "9",
        about: "Players a side on the field, 1 to 11. Overrides the template's.",
        names: ["players", "aside"],
    },
    {
        id: "fee", header: "Fee", json: "fee", example: "40.50",
        about: "What you're paid for the match, as a number.",
        names: ["pay", "feeamount"],
    },
    {
        id: "currency", header: "Currency", json: "currency", example: "USD",
        about: "The fee's currency, as a three-letter code (USD, GBP, EUR). Empty: your currency in Settings.",
        names: ["feecurrency"],
    },
    {
        id: "paid", header: "Paid", json: "paid", example: "no",
        about: "Whether you've been paid the fee: yes or no.",
        names: ["feepaid"],
    },
    {
        id: "tags", header: "Tags", json: "tags", example: "league, needs AR",
        about: "Labels to find and filter matches by, separated by commas.",
        names: [],
    },
    {
        id: "notes", header: "Notes", json: "notes", example: "Bring the spare flags.",
        about: "Anything to remember for the match.",
        names: [],
    },
    {
        id: "outlook", header: "Outlook", json: "outlook", example: "Top of the table meets second.",
        about: "What to expect: how competitive it'll be, the teams' strengths, history between them.",
        names: [],
    },
] as const satisfies readonly ImportColumn[];

export type ImportColumnId = (typeof importColumns)[number]["id"];

/** Lower case with only letters and digits, either spelling of color: Home color, home_colour and homeColour all become homecolour. */
export const squashColumnName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/color/g, "colour");

/** The footnote for the columns a new match needs. */
export const importColumnsNote = "A new match needs a date (Date and Time, or Kickoff) or its teams; everything else is optional, and an empty value never changes a match.";

/** The columns as a Markdown table, for the API description and docs/requirements/importing.md. */
export function importColumnsMarkdown(): string {
    const cell = (text: string) => text.replace(/\|/g, "\\|");
    return [
        "| Column | JSON | What it's for | Example | Needed |",
        "|---|---|---|---|---|",
        ...(importColumns as readonly ImportColumn[]).map((c) => `| ${c.header} | \`${c.json}\` | ${cell(c.about)} | ${cell(c.example)} | ${c.newMatch ? "New matches*" : "Optional"} |`),
        "",
        `\\* ${importColumnsNote}`,
    ].join("\n");
}

const start = "<!-- import-columns: generated from schema/src/importColumns.ts by pnpm generate -->";
const end = "<!-- /import-columns -->";

/** docs/requirements/importing.md with its copy of the columns table brought up to date. */
export function withImportColumns(requirements: string): string {
    const from = requirements.indexOf(start);
    const to = requirements.indexOf(end);
    if (from < 0 || to < from) {
        throw new Error(`docs/requirements/importing.md needs the markers ${start} and ${end} around the import columns table`);
    }
    return `${requirements.slice(0, from)}${start}\n\n${importColumnsMarkdown()}\n\n${requirements.slice(to)}`;
}
