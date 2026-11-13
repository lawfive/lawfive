import { z } from "zod";
import { Colour, Currency, Id, LocalDate, Position, Role, Timestamp, TimeZone, syncFields } from "./common.ts";
import { ClockStyle, MatchFormat } from "./format.ts";
import { SchemeId } from "./misconduct.ts";

// The records a user keeps: matches, templates, venues, competitions, referees and settings.
// Everything belongs to one user; if two LawFive users officiate the same match, each has their own copy.

const text = (max: number) => z.string().min(1).max(max);

/** Free-text labels ("indoor", "needs AR"), on matches, venues and referees; compared ignoring case. */
export const Tags = z
    .array(z.string().trim().min(1).max(30))
    .max(20)
    .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, "Tags must be unique (ignoring case).")
    .meta({ id: "Tags" });

export const Team = z
    .object({
        name: text(60).optional(),
        alias: text(4).optional().describe("A short name typed for the watch. With none, one is made from the two team names: the first three letters or digits of each in capitals, skipping the words both names start with when those would be the same (L84_Roach and L84_Smith show ROA and SMI), or HOM/AWY with no name (SET-5). Leave it out to have it follow the names."),
        colour: Colour.optional().describe("The team's primary color; the watch picks black or white text for contrast."),
    })
    .meta({ id: "Team", description: "A team as typed in for one match. Saved teams come later, tied to a competition." });

export const Fee = z
    .object({
        amount: z.number().nonnegative(),
        currency: Currency,
        paid: z.boolean(),
    })
    .meta({ id: "Fee" });

export const CrewMember = z
    .object({
        role: Role,
        refereeId: Id.optional().describe("A saved referee."),
        name: text(100).optional().describe("A name typed in, when no saved referee is linked."),
    })
    .refine((m) => m.refereeId !== undefined || m.name !== undefined, "A crew member needs a refereeId or a name.")
    .meta({ id: "CrewMember", description: "Another official on the match." });

export const ExternalRef = z
    .object({
        source: z.string().regex(/^[a-z0-9-]+$/).max(40).describe("Where the ID comes from: manual, csv, or an assignor system."),
        id: text(100),
    })
    .meta({ id: "ExternalRef", description: "A match ID from outside LawFive, unique per user and source; a re-import with the same one updates the match." });

export const Gender = z.enum(["male", "female", "coed"]).meta({ id: "Gender", description: "Who plays: male, female or co-ed (mixed)." });

export const MatchStatus = z.enum(["scheduled", "played", "abandoned", "cancelled", "postponed"]).meta({ id: "MatchStatus" });

export const PitchMarking = z
    .object({
        corners: z.array(Position).min(2).max(4).describe("Two to four of the pitch's corners, in any order, as walked on the watch."),
        at: Timestamp.describe("When they were marked."),
    })
    .meta({ id: "PitchMarking", description: "Pitch corners marked on the watch (TRK-13)." });

export const Match = z
    .object({
        ...syncFields,
        name: text(100).optional(),
        status: MatchStatus,
        kickoff: Timestamp.optional(),
        timeZone: TimeZone.optional().describe("The venue's time zone, for showing the kickoff in local time."),
        format: MatchFormat.describe("A copy of the format, so editing the template later doesn't change this match."),
        templateId: Id.optional().describe("The template the format was copied from."),
        home: Team,
        away: Team,
        gender: Gender.optional(),
        ageGroup: text(30).optional().describe("Free text, as leagues write it: U12, U19, Adult, O35."),
        competitionId: Id.optional(),
        venueId: Id.optional(),
        pitchId: Id.optional().describe("One of the venue's pitches."),
        role: Role.optional().describe("The user's role in this match."),
        crew: z.array(CrewMember).describe("The other officials."),
        notes: z.string().max(2000).optional(),
        outlook: z.string().max(2000).optional().describe("What to expect: competitive, one-sided, team strengths and so on."),
        fee: Fee.optional(),
        external: ExternalRef.optional(),
        assignor: text(100).optional().describe("Who assigned the match (SET-15): a name, typed in or set by an integration or import."),
        tags: Tags.optional(),
        pitchMarking: PitchMarking.optional().describe("The pitch's corners as marked on the watch for this match (TRK-13)."),
    })
    .meta({ id: "Match", description: "One referee's own copy of a match." });

export const MatchTemplate = z
    .object({
        ...syncFields,
        name: text(60),
        format: MatchFormat,
        defaults: z
            .object({
                fee: Fee.optional(),
            })
            .describe("Filled into a match made from this template, or from a competition that uses it, when the match has none. Not the user's role: that depends on the match."),
    })
    .meta({ id: "MatchTemplate", description: "A reusable match format, such as \"U12 league: 2×30, 5 min half-time\"." });

export const Pitch = z
    .object({
        id: Id,
        name: text(60),
        aliases: z.array(text(60)).max(20).optional().describe("Other names it goes by, such as those of pitches combined into it by a merge (DUP-7); imports and pickers find the pitch by them."),
        position: Position.optional().describe("Where the pitch itself is, which can be some way from the venue's address."),
        markings: z.array(PitchMarking).max(20).optional()
            .describe("Its corners as marked on the watch, oldest first (TRK-13). Each is used for matches kicking off after it, until a later one."),
    })
    .meta({ id: "Pitch" });

export const Venue = z
    .object({
        ...syncFields,
        name: text(100),
        aliases: z.array(text(100)).max(50).optional().describe("Other names it goes by, such as the ones merged into this venue (DUP-7); imports and searches find the venue by them."),
        address: z.string().max(300).optional().describe("Street address; often where you park."),
        position: Position.optional().describe("The address's position (parking), for directions."),
        pitches: z.array(Pitch).describe("Named pitches (\"Field 3\"), each with its own position."),
        notes: z.string().max(2000).optional(),
        tags: Tags.optional(),
        distinctFrom: z.array(Id).max(500).optional().describe("Venues the user said aren't the same place, so they aren't suggested as duplicates again (DUP-7)."),
    })
    .meta({ id: "Venue" });

export const CompetitionType = z.enum(["league", "tournament", "cup", "friendly"]).meta({ id: "CompetitionType" });

export const Competition = z
    .object({
        ...syncFields,
        name: text(100),
        organiser: text(100).optional(),
        type: CompetitionType,
        season: text(30).optional().describe("Season label, for example 2026-27."),
        startDate: LocalDate.optional(),
        endDate: LocalDate.optional(),
        ageGroup: text(30).optional(),
        level: text(60).optional(),
        templateId: Id.optional().describe("The match template for this competition's matches: picking the competition fills the format (and fee)."),
        misconductScheme: SchemeId.optional().describe("Overrides the user's default scheme for this competition's matches."),
        notes: z.string().max(2000).optional(),
    })
    .meta({ id: "Competition", description: "One competition for one season; next season is a new record." });

export const Referee = z
    .object({
        ...syncFields,
        name: text(100),
        shortName: text(30).optional().describe("What the officials line on match cards calls them (WEB-20); without it, their surname as guessed from the name."),
        aliases: z.array(text(100)).max(50).optional().describe("Other names they go by, such as the ones merged into this referee (DUP-3); imports and searches find the referee by them."),
        email: z.email().optional(),
        phone: text(30).optional(),
        notes: z.string().max(2000).optional(),
        tags: Tags.optional(),
        distinctFrom: z.array(Id).max(500).optional().describe("Referees the user said aren't the same person, so they aren't suggested as duplicates again (DUP-5)."),
    })
    .meta({ id: "Referee", description: "Someone the user officiates with." });

export const DistanceUnit = z.enum(["km", "mi"]).meta({ id: "DistanceUnit" });
export const TemperatureUnit = z.enum(["c", "f"]).meta({ id: "TemperatureUnit" });

export const WatchLayout = z
    .enum(["default", "stacked", "minimal", "scoreboard", "sideBySide", "ring"])
    .meta({ id: "WatchLayout", description: "The running screen as watch builds from before the four choices (UI-21) know it: the nearest of the six old layouts. scoreboard is no longer offered." });

export const WatchClocks = z
    .enum(["one", "stacked", "sideBySide"])
    .meta({ id: "WatchClocks", description: "One clock, or two: a smaller second clock under the first, or two the same size side by side (UI-21)." });

export const BreakClockStyle = z
    .enum(["down", "up"])
    .meta({ id: "BreakClockStyle", description: "How the break clock counts (TMR-4): down is the time left, up the time taken." });

export const WatchEdge = z
    .enum(["none", "ring", "time"])
    .meta({ id: "WatchEdge", description: "What the edge of the running screen shows (UI-21): nothing, the ring (UI-23) or the time of day (UI-25)." });

export const WatchScreen = z
    .object({
        layout: WatchLayout.describe("For older watch builds: the nearest old layout, kept in step with the fields below."),
        secondClock: ClockStyle.describe("What the second clock shows (UI-22); down is the time left. Never the same as mainClock."),
        clocks: WatchClocks.optional().describe("Missing in setups saved before the four choices (UI-21): worked out from layout."),
        mainClock: ClockStyle.optional().describe("How the match clock counts (TMR-11); up (Match time) when missing."),
        breakClock: BreakClockStyle.optional().describe("How the break clock counts (TMR-4); down when missing."),
        edge: WatchEdge.optional().describe("Missing in older setups: worked out from layout."),
        names: z.boolean().optional().describe("The team names over the clock, or false for scores only. Missing in older setups: worked out from layout."),
        changedAt: Timestamp.describe("When it was last changed, wherever that was: the latest change wins (UI-24)."),
    })
    .meta({ id: "WatchScreen", description: "How the watch's running screen looks, for all the account's watches (UI-21, UI-24)." });

export const TeamSwipes = z
    .enum(["upDown", "sideways"])
    .meta({ id: "TeamSwipes", description: "How a swipe on the watch's match screen opens a team's controls (INP-10): upDown is down for home and up for away, with sideways swipes for the game menu; sideways is right for home and left for away, with up for the game menu." });

export const UsualFormat = z
    .object({
        format: MatchFormat,
        templateId: Id.optional().describe("The template it came from, if it did, so the form can show its name."),
        starterId: z.string().max(30).optional().describe("The starter format it came from (starterFormats' id, \"us-u10\"), if it did and is unchanged."),
        changedAt: Timestamp.describe("When it was last set."),
    })
    .meta({ id: "UsualFormat", description: "The format new matches start with (SET-17): the last one saved on a match form, or one chosen in Settings." });

export const UserSettings = z
    .object({
        ...syncFields,
        misconductScheme: SchemeId.describe("The default scheme for cards; a competition can override it."),
        currency: Currency.describe("Default currency for fees."),
        distanceUnit: DistanceUnit,
        temperatureUnit: TemperatureUnit,
        timeZone: TimeZone.optional().describe("Where the person is (PLAN-9): a plan ends at the end of its last day here. Filled in from the first browser or phone that signs in."),
        mapsApp: z.enum(["auto", "google", "apple"]).optional().describe("Where Directions open (WEB-14): auto (Apple Maps in the iPhone app, Google Maps everywhere else, the same when not set), or always Google Maps or Apple Maps."),
        maxHeartRate: z.int().min(100).max(240).optional().describe("Beats a minute, for heart-rate zones (TRK-4)."),
        sprintKph: z.number().min(15).max(35).optional().describe("Where sprinting starts, in km/h, for the speed bands and sprints (TRK-11); the other bands scale with it. 21 when not set."),
        calendarArriveMin: z.int().min(0).max(180).optional().describe("Minutes before kickoff the calendar feed's events start, for travel and warming up (CAL-3); 0 starts them at kickoff. 30 when not set."),
        calendarReminderMin: z.int().min(0).max(2880).optional().describe("Before several reminders (CAL-3): minutes before kickoff for the calendar feed's one reminder; 0 for none. Used only when none of calendarReminders, calendarDayBefore and calendarDayOf is set; 60 when nothing is."),
        calendarReminders: z.array(z.int().min(15).max(180).refine((m) => m % 15 === 0, "15-minute steps")).max(12).optional()
            .describe("The calendar feed's reminders, in minutes before kickoff (CAL-3): 15-minute steps up to 3 hours."),
        calendarDayBefore: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("A reminder the day before a match at this time (HH:MM, in the match's time zone); none when not set."),
        watchScreen: WatchScreen.optional().describe("Missing until it's first chosen: watches then keep two clocks stacked (time left over match time) with the time of day and names, or their own choice."),
        teamSwipes: TeamSwipes.optional().describe("For Garmin and Apple watches (INP-10); upDown when not set. Wear OS watches always swipe sideways, as a swipe down from the top opens their quick settings."),
        calendarDayOf: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("A reminder on the day of a match at this time (HH:MM, in the match's time zone), when that's before the event starts; none when not set."),
        nextMatchCollapsed: z.boolean().optional().describe("The match list's next match folded to a single strip (WEB-27); open when not set."),
        usualRole: Role.optional().describe("The role a new match starts with on the match forms (SET-17); referee when not set. An import, an integration or a quick match from the watch keeps its own."),
        usualFormat: UsualFormat.optional().describe("The format a new match starts with on the match forms (SET-17): the last one saved on a form, or chosen in Settings. Not set until then: forms start from defaultFormat (2×45), offering the starter formats. A competition's template still wins."),
        getReady: z
            .object({
                hidden: z.boolean().optional().describe("Hide this list was chosen."),
                unitsConfirmed: z.boolean().optional().describe("They're right was chosen for the units and time zone guessed."),
            })
            .optional()
            .describe("Get ready on Matches (WEB-32), the same on the website and the phones: what the person chose there, so it follows them to another browser or phone."),
    })
    .meta({ id: "UserSettings", description: "The user's preferences; one per user, first set from the browser's language when the account is created." });

export type Team = z.infer<typeof Team>;
export type Match = z.infer<typeof Match>;
export type MatchTemplate = z.infer<typeof MatchTemplate>;
export type Venue = z.infer<typeof Venue>;
export type Competition = z.infer<typeof Competition>;
export type Referee = z.infer<typeof Referee>;
export type UserSettings = z.infer<typeof UserSettings>;
export type UsualFormat = z.infer<typeof UsualFormat>;
