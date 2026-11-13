package app.lawfive.data

// Did you know (TIP-1): the tips, and the roll that now and then shows one. The web app and the
// iPhone have the same list (web/src/tips.ts, mobile/ios/LawFive/Data/Tips.swift).

enum class TipArt { Corners, Coin, Direction, Cards, Undo, Money, Report, Calendar, Play, BellOff }

data class Tip(
    val id: String,
    val art: TipArt,
    val title: String,
    val body: String,
    val steps: List<String>,
    val note: String? = null,
    /** Only once a match has been played, as it means nothing before that. */
    val afterPlaying: Boolean = false,
)

/** TIP-2: the chance of a tip each time LawFive is opened. */
const val TIP_CHANCE = 0.08

val tips = listOf(
    Tip(
        "mark-pitch", TipArt.Corners, "Your watch can map the pitch",
        "Mark a pitch's corners on your watch and your heatmaps use the real field.",
        listOf("On the watch, open a downloaded match and scroll down to Mark pitch.", "Stand on a corner and press Start. It takes a few seconds of GPS.", "Walk to the next corner. Four is best; after two, Back saves what you have."),
        "It stays with the venue's pitch for later matches, until you mark it again.",
    ),
    Tip(
        "coin-toss", TipArt.Coin, "Forgot your coin?",
        "Your watch has one. Open the game menu before kickoff and choose Coin toss.",
        listOf("Before kickoff, swipe sideways or press Back to open the game menu.", "Choose Coin toss.", "Tap or press Start to flip it. Back returns to the match."),
        "The Laws expect a real coin, so save this one for casual games or a forgotten coin.",
    ),
    Tip(
        "kickoff-direction", TipArt.Direction, "Never lose track of which way to kick off",
        "Save the direction at the first kickoff, and later kickoff screens show an arrow pointing the way.",
        listOf("Choose the kickoff team, then open the game menu and choose Kickoff direction.", "Face the goal that team attacks and hold the watch up, as if reading the time.", "Press Start or tap Save. At the next kickoff, follow the arrow."),
        "For watches with a compatible compass, and it's only as accurate as the compass's calibration.",
    ),
    Tip(
        "undo", TipArt.Undo, "Wrong team on that goal?",
        "The game menu's Undo takes back the latest goal, card or shoot-out kick.",
        listOf("Swipe sideways or press Back to open the game menu.", "Choose Undo and confirm."),
        afterPlaying = true,
    ),
    Tip(
        "second-yellow", TipArt.Cards, "Add a number, catch a second yellow",
        "With the player's number on each caution, a second yellow for that number brings up a full red screen and a strong vibration.",
        listOf("Give the caution on the watch.", "When it asks for the player's number, enter both digits."),
        afterPlaying = true,
    ),
    Tip(
        "fee-paid", TipArt.Money, "Paid at the field?",
        "Mark the fee paid right on the watch. It works with no signal and goes up at the next sync.",
        listOf("On the watch, open the match.", "Turn on the Fee row, under Start match."),
    ),
    Tip(
        "match-report", TipArt.Report, "Your match report is ready",
        "Each caution and send-off, with its offense code, to print, save as a PDF or copy into your league's form.",
        listOf("On the website, open a played match.", "Choose Match report.", "Print it, or use Copy as text."),
        afterPlaying = true,
    ),
    Tip(
        "calendar", TipArt.Calendar, "Put your matches on your calendar",
        "Apple, Google and Outlook stay up to date through a private feed, with reminders and the forecast.",
        listOf("On the website, open Settings.", "Under Calendar, choose Turn on.", "Add it to your calendar app."),
    ),
    Tip(
        "replay", TipArt.Play, "Watch your match back",
        "Replay moves a marker along your run on the map, pausing at each goal and card, with your heart rate alongside.",
        listOf("On the website, open a played match with a track.", "Choose Replay on the map."),
        afterPlaying = true,
    ),
    Tip(
        "quiet-watch", TipArt.BellOff, "Keep messages off your watch during a match",
        "LawFive runs each match as a workout, so your watch's settings for workouts decide what comes through.",
        listOf(
            "Garmin: in Garmin Connect, choose your watch, then Sounds & Alerts, Smart Notifications and During an Activity, and set Allow Notifications to No.",
            "Apple Watch: before kickoff, turn on the Fitness Focus in Control Center.",
            "Wear OS: before kickoff, turn on Do Not Disturb in the quick settings.",
        ),
        note = "On Garmin it only applies while a match runs, so messages come through again afterward.",
    ),
)

/** One roll: usually nothing; otherwise one of the tips not yet dismissed that makes sense so far. */
fun chooseTip(done: Set<String>, played: Int, random: () -> Double = Math::random): Tip? {
    if (random() >= TIP_CHANCE) return null
    val left = tips.filter { it.id !in done && (!it.afterPlaying || played > 0) }
    return if (left.isEmpty()) null else left[(random() * left.size).toInt()]
}
