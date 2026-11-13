import Foundation

// Did you know (TIP-1): the tips, and the roll that now and then shows one. The web app and the
// Android app have the same list (web/src/tips.ts, data/Tips.kt).

enum TipArt { case corners, coin, direction, cards, undo, money, report, calendar, play, bellOff }

struct Tip: Identifiable, Equatable {
    let id: String
    let art: TipArt
    let title: String
    let body: String
    let steps: [String]
    var note: String?
    /// Only once a match has been played, as it means nothing before that.
    var afterPlaying = false
}

/// TIP-2: the chance of a tip each time LawFive is opened.
let tipChance = 0.08

let tips: [Tip] = [
    Tip(id: "mark-pitch", art: .corners, title: "Your watch can map the pitch",
        body: "Mark a pitch's corners on your watch and your heatmaps use the real field.",
        steps: ["On the watch, open a downloaded match and scroll down to Mark pitch.", "Stand on a corner and press Start. It takes a few seconds of GPS.", "Walk to the next corner. Four is best; after two, Back saves what you have."],
        note: "It stays with the venue's pitch for later matches, until you mark it again."),
    Tip(id: "coin-toss", art: .coin, title: "Forgot your coin?",
        body: "Your watch has one. Open the game menu before kickoff and choose Coin toss.",
        steps: ["Before kickoff, swipe sideways or press Back to open the game menu.", "Choose Coin toss.", "Tap or press Start to flip it. Back returns to the match."],
        note: "The Laws expect a real coin, so save this one for casual games or a forgotten coin."),
    Tip(id: "kickoff-direction", art: .direction, title: "Never lose track of which way to kick off",
        body: "Save the direction at the first kickoff, and later kickoff screens show an arrow pointing the way.",
        steps: ["Choose the kickoff team, then open the game menu and choose Kickoff direction.", "Face the goal that team attacks and hold the watch up, as if reading the time.", "Press Start or tap Save. At the next kickoff, follow the arrow."],
        note: "For watches with a compatible compass, and it's only as accurate as the compass's calibration."),
    Tip(id: "undo", art: .undo, title: "Wrong team on that goal?",
        body: "The game menu's Undo takes back the latest goal, card or shoot-out kick.",
        steps: ["Swipe sideways or press Back to open the game menu.", "Choose Undo and confirm."],
        afterPlaying: true),
    Tip(id: "second-yellow", art: .cards, title: "Add a number, catch a second yellow",
        body: "With the player's number on each caution, a second yellow for that number brings up a full red screen and a strong vibration.",
        steps: ["Give the caution on the watch.", "When it asks for the player's number, enter both digits."],
        afterPlaying: true),
    Tip(id: "fee-paid", art: .money, title: "Paid at the field?",
        body: "Mark the fee paid right on the watch. It works with no signal and goes up at the next sync.",
        steps: ["On the watch, open the match.", "Turn on the Fee row, under Start match."]),
    Tip(id: "match-report", art: .report, title: "Your match report is ready",
        body: "Each caution and send-off, with its offense code, to print, save as a PDF or copy into your league's form.",
        steps: ["On the website, open a played match.", "Choose Match report.", "Print it, or use Copy as text."],
        afterPlaying: true),
    Tip(id: "calendar", art: .calendar, title: "Put your matches on your calendar",
        body: "Apple, Google and Outlook stay up to date through a private feed, with reminders and the forecast.",
        steps: ["On the website, open Settings.", "Under Calendar, choose Turn on.", "Add it to your calendar app."]),
    Tip(id: "replay", art: .play, title: "Watch your match back",
        body: "Replay moves a marker along your run on the map, pausing at each goal and card, with your heart rate alongside.",
        steps: ["On the website, open a played match with a track.", "Choose Replay on the map."],
        afterPlaying: true),
    Tip(id: "quiet-watch", art: .bellOff, title: "Keep messages off your watch during a match",
        body: "LawFive runs each match as a workout, so your watch's settings for workouts decide what comes through.",
        steps: ["Garmin: in Garmin Connect, choose your watch, then Sounds & Alerts, Smart Notifications and During an Activity, and set Allow Notifications to No.", "Apple Watch: before kickoff, turn on the Fitness Focus in Control Center.", "Wear OS: before kickoff, turn on Do Not Disturb in the quick settings."],
        note: "On Garmin it only applies while a match runs, so messages come through again afterward."),
]

/// One roll: usually nothing; otherwise one of the tips not yet dismissed that makes sense so far.
func chooseTip(done: Set<String>, played: Int, random: () -> Double = { Double.random(in: 0..<1) }) -> Tip? {
    guard random() < tipChance else { return nil }
    let left = tips.filter { !done.contains($0.id) && (!$0.afterPlaying || played > 0) }
    return left.isEmpty ? nil : left[Int(random() * Double(left.count))]
}
