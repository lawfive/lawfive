package app.lawfive.wear

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import kotlinx.coroutines.flow.MutableSharedFlow

class MainActivity : ComponentActivity() {
    /** The watch's other button, for the match screen (INP-4). */
    val button = MutableSharedFlow<Unit>(extraBufferCapacity = 4)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppState.start(this)
        // For testing on an emulator: its address for the demo, and a layout to look at.
        if (BuildConfig.DEBUG) {
            intent.getStringExtra("server")?.let { AppState.setServer(it) }
            if (intent.hasExtra("heading")) Compass.fake = intent.getFloatExtra("heading", 0f)
            // UI-26: the sync screen partway through: "sent of total", or "stopped".
            intent.getStringExtra("syncScreen")?.let { AppState.showSyncScreenForTesting(it) }
            // UI-21: the match screen's choices, "clocks,mainClock,secondClock,breakClock,edge,names" as numbers (names 1 or 0).
            intent.getStringExtra("screen")?.split(",")?.mapNotNull { it.trim().toIntOrNull() }?.takeIf { it.size == 6 }?.let { v ->
                AppState.update { it.copy(screen = WatchScreen(v[0], v[1], v[2], v[3], v[4], v[5] == 1)) }
            }
            intent.getStringExtra("format")?.let { f -> AppState.update { it.copy(quick = json.decodeFromString(f)) } }
            // EVT-14: Card reasons on or off.
            if (intent.hasExtra("cardReasons")) AppState.update { it.copy(cardReasons = intent.getBooleanExtra("cardReasons", false)) }
            if (intent.getBooleanExtra("begin", false)) {
                AppState.beginMatch(AppState.saved.quick)
                AppState.changeMatch { selectKickoff(HOME); start(System.currentTimeMillis(), AppState.saved.chosenScreen) }
            }
            intent.getStringExtra("phase")?.let { phase ->
                val at = System.currentTimeMillis()
                AppState.changeMatch {
                    endPeriod(at)
                    if (phase != "break") {
                        endHalftime()
                        if (phase != "next") {
                            startNextPeriod(at)
                            endPeriod(at)
                            if (phase == "pens" || phase == "kicks") {
                                choosePenalties()
                                if (phase == "kicks") {
                                    selectPenaltyFirst(HOME)
                                    startPenalties()
                                    recordKick(true); recordKick(false); recordKick(true)
                                }
                            }
                            // ET-7: to ET1's kickoff screen, where the new toss's team is chosen.
                            if (phase == "et") {
                                chooseExtraTime(at)
                                endHalftime()
                            }
                            // ET-6: into extra time and a goal, with a format that has golden goal.
                            if (phase == "golden") {
                                chooseExtraTime(at)
                                endHalftime()
                                selectKickoff(HOME)
                                startNextPeriod(at)
                                addEvent(EVENT_GOAL, HOME, 10, at)
                            }
                        }
                    }
                }
            }
            if (intent.getBooleanExtra("stoppage", false)) AppState.changeMatch { toggleStoppage(System.currentTimeMillis() - 42_000) }
            if (intent.hasExtra("goals")) AppState.changeMatch { addEvent(EVENT_GOAL, AWAY, 9, System.currentTimeMillis()); addEvent(EVENT_GOAL, AWAY, 7, System.currentTimeMillis()); addEvent(EVENT_GOAL, HOME, 2, System.currentTimeMillis()) }
            if (intent.hasExtra("ago")) AppState.changeMatch { periodStart = System.currentTimeMillis() - intent.getLongExtra("ago", 0) * 1000 }
            // EVT-12: sin bins, "team,player,secondsAgo;…" (team 0 home, 1 away, player 0 for none), for a format with sinBins.
            intent.getStringExtra("sinBins")?.split(";")?.map { b -> b.split(",").mapNotNull { it.trim().toIntOrNull() } }?.filter { it.size == 3 }?.let { bins ->
                AppState.changeMatch { bins.forEach { (team, player, ago) -> addEvent(EVENT_SIN_BIN, team, player, System.currentTimeMillis() - ago * 1000L) } }
            }
            // TMR-13: suspended for a reason (0 weather, 1 lightning, 2 crowd trouble, 4 other), suspendAgo seconds back.
            if (intent.hasExtra("suspend")) AppState.changeMatch { suspend(intent.getIntExtra("suspend", 1), System.currentTimeMillis() - intent.getLongExtra("suspendAgo", 0) * 1000) }
        }
        // WCH-7: the system's questions come from the first launch's own screen (FirstLaunchPermissions), never at
        // Quick match or the kickoff; with nothing left to ask, that screen is skipped.
        if (!AppState.saved.permissionsAsked && missingAsks(this).isEmpty()) AppState.update { it.copy(permissionsAsked = true) }
        setContent { LawFiveWatch(button) }
    }

    override fun onResume() {
        super.onResume()
        AppState.resumes++
        // A match in progress goes on, whatever happened to the app (R-5).
        if (AppState.match?.let { it.phase != Phase.Done && it.periodStart != null } == true) MatchService.start(this)
        AppState.sync()
    }

    /** UI-12. */
    fun keepScreenOn(on: Boolean) {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_STEM_1 || keyCode == KeyEvent.KEYCODE_STEM_2) {
            button.tryEmit(Unit)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
