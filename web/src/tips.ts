// Did you know (TIP-1): the tips, and the roll that now and then shows one. Android and the iPhone have
// the same list (mobile/android/.../data/Tips.kt, mobile/ios/LawFive/Data/Tips.swift).

export type TipArt = "corners" | "coin" | "direction" | "cards" | "undo" | "money" | "report" | "calendar" | "play" | "bellOff";

export type Tip = {
    id: string;
    art: TipArt;
    title: string;
    body: string;
    steps: string[];
    note?: string;
    /** Only once a match has been played, as it means nothing before that. */
    afterPlaying?: boolean;
};

/** TIP-2: the chance of a tip each time LawFive is opened. */
export const tipChance = 0.08;

export const tips: Tip[] = [
    {
        id: "mark-pitch", art: "corners", title: "Your watch can map the pitch",
        body: "Mark a pitch's corners on your watch and your heatmaps use the real field.",
        steps: ["On the watch, open a downloaded match and scroll down to Mark pitch.", "Stand on a corner and press Start. It takes a few seconds of GPS.", "Walk to the next corner. Four is best; after two, Back saves what you have."],
        note: "It stays with the venue's pitch for later matches, until you mark it again.",
    },
    {
        id: "coin-toss", art: "coin", title: "Forgot your coin?",
        body: "Your watch has one. Open the game menu before kickoff and choose Coin toss.",
        steps: ["Before kickoff, swipe sideways or press Back to open the game menu.", "Choose Coin toss.", "Tap or press Start to flip it. Back returns to the match."],
        note: "The Laws expect a real coin, so save this one for casual games or a forgotten coin.",
    },
    {
        id: "kickoff-direction", art: "direction", title: "Never lose track of which way to kick off",
        body: "Save the direction at the first kickoff, and later kickoff screens show an arrow pointing the way.",
        steps: ["Choose the kickoff team, then open the game menu and choose Kickoff direction.", "Face the goal that team attacks and hold the watch up, as if reading the time.", "Press Start or tap Save. At the next kickoff, follow the arrow."],
        note: "For watches with a compatible compass, and it's only as accurate as the compass's calibration.",
    },
    {
        id: "undo", art: "undo", title: "Wrong team on that goal?", afterPlaying: true,
        body: "The game menu's Undo takes back the latest goal, card or shoot-out kick.",
        steps: ["Swipe sideways or press Back to open the game menu.", "Choose Undo and confirm."],
    },
    {
        id: "second-yellow", art: "cards", title: "Add a number, catch a second yellow", afterPlaying: true,
        body: "With the player's number on each caution, a second yellow for that number brings up a full red screen and a strong vibration.",
        steps: ["Give the caution on the watch.", "When it asks for the player's number, enter both digits."],
    },
    {
        id: "fee-paid", art: "money", title: "Paid at the field?",
        body: "Mark the fee paid right on the watch. It works with no signal and goes up at the next sync.",
        steps: ["On the watch, open the match.", "Turn on the Fee row, under Start match."],
    },
    {
        id: "match-report", art: "report", title: "Your match report is ready", afterPlaying: true,
        body: "Each caution and send-off, with its offense code, to print, save as a PDF or copy into your league's form.",
        steps: ["On the website, open a played match.", "Choose Match report.", "Print it, or use Copy as text."],
    },
    {
        id: "calendar", art: "calendar", title: "Put your matches on your calendar",
        body: "Apple, Google and Outlook stay up to date through a private feed, with reminders and the forecast.",
        steps: ["On the website, open Settings.", "Under Calendar, choose Turn on.", "Add it to your calendar app."],
    },
    {
        id: "replay", art: "play", title: "Watch your match back", afterPlaying: true,
        body: "Replay moves a marker along your run on the map, pausing at each goal and card, with your heart rate alongside.",
        steps: ["On the website, open a played match with a track.", "Choose Replay on the map."],
    },
    {
        id: "quiet-watch", art: "bellOff", title: "Keep messages off your watch during a match",
        body: "LawFive runs each match as a workout, so your watch's settings for workouts decide what comes through.",
        steps: ["Garmin: in Garmin Connect, choose your watch, then Sounds & Alerts, Smart Notifications and During an Activity, and set Allow Notifications to No.", "Apple Watch: before kickoff, turn on the Fitness Focus in Control Center.", "Wear OS: before kickoff, turn on Do Not Disturb in the quick settings."],
        note: "On Garmin it only applies while a match runs, so messages come through again afterward.",
    },
];

/** One roll: usually nothing; otherwise one of the tips not yet dismissed that makes sense so far. */
export function chooseTip(done: string[], played: number, random: () => number = Math.random): Tip | undefined {
    if (random() >= tipChance) {
        return undefined;
    }
    const left = tips.filter((t) => !done.includes(t.id) && (!t.afterPlaying || played > 0));
    return left.length ? left[Math.floor(random() * left.length)] : undefined;
}

const doneKey = "lawfive.tipsDone";
const visitKey = "lawfive.tipThisVisit";

function tipsDone(): string[] {
    try {
        return JSON.parse(localStorage.getItem(doneKey) ?? "[]") as string[];
    } catch {
        return [];
    }
}

/**
 * TIP-2: rolled once a visit, and kept for it, so a tip doesn't come and go as pages change. A visit
 * that opens with a device prompt showing has no tip, even once the prompt is dismissed.
 */
export function tipForThisVisit(blocked: boolean, played: number): Tip | undefined {
    try {
        let id = sessionStorage.getItem(visitKey);
        if (id === null) {
            id = blocked ? "" : chooseTip(tipsDone(), played)?.id ?? "";
            sessionStorage.setItem(visitKey, id);
        }
        return tipsDone().includes(id) ? undefined : tips.find((t) => t.id === id);
    } catch {
        return undefined;
    }
}

/** Got it (TIP-3): this tip won't come back in this browser. */
export function dismissTip(id: string) {
    try {
        localStorage.setItem(doneKey, JSON.stringify([...tipsDone(), id]));
    } catch {
        // Not remembered in a private window; it may just come up again.
    }
}
