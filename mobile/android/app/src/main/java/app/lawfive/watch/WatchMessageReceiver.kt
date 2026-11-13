package app.lawfive.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import app.lawfive.LawFiveApplication
import java.util.concurrent.atomic.AtomicBoolean

// The watch through the phone (APP-7): Garmin Connect's messages from the watch, declared in the
// manifest so they start the app when it isn't running (at the ground, the referee won't have it
// open). The app stays awake until the watch has its answer.

class WatchMessageReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as? LawFiveApplication ?: return
        val pending = goAsync()
        val finished = AtomicBoolean(false)
        val finish = { if (finished.compareAndSet(false, true)) pending.finish() }
        // Android allows a receiver a minute; a request that takes longer is answered (or kept) anyway.
        Handler(Looper.getMainLooper()).postDelayed(finish, LIMIT_MS)
        app.graph.watch.receive(intent, finish)
    }

    private companion object {
        const val LIMIT_MS = 50_000L
    }
}
