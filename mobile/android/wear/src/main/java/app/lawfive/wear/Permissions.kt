package app.lawfive.wear

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// WCH-7: what the app asks the system for, explained once in LawFive's words the first time it opens, and
// asked together from there; never at Quick match or the kickoff. Refused, the match still runs without what
// it was for, and Settings → Permissions says what's off and where to turn it back on.

/** One thing asked for: what the system calls it, LawFive's name for it, what it's for and what goes without it. */
data class Ask(val permission: String, val name: String, val why: String, val without: String)

/** Everything the app asks for on this watch, in the order it's explained. */
fun asks(): List<Ask> = buildList {
    add(Ask(Manifest.permission.ACCESS_FINE_LOCATION, "Location", "Your track on the pitch", "No track"))
    add(Ask(Workout.heartRatePermission, "Heart rate", "Your heart rate in the track", "No heart rate in the track"))
    add(Ask(Manifest.permission.ACTIVITY_RECOGNITION, "Physical activity", "The distance you run", "No distance run"))
    if (Build.VERSION.SDK_INT >= 33) add(Ask(Manifest.permission.POST_NOTIFICATIONS, "Notifications", "The match clock while the screen is off", "No clock in the notifications"))
}

fun missingAsks(context: Context) = asks().filter { context.checkSelfPermission(it.permission) != PackageManager.PERMISSION_GRANTED }

/** The watch's own app page, where a permission refused twice can be turned back on. */
fun openAppSettings(context: Context) {
    runCatching {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** Each one's name over a line about it. */
private fun LazyListScope.explained(list: List<Ask>, line: (Ask) -> String) {
    list.forEach { a ->
        item {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                T(a.name, 14.sp, C.text, FontWeight.SemiBold)
                T(line(a), 12.5.sp, C.dim, FontWeight.Normal, lines = 2)
            }
        }
    }
}

/** WCH-7: the first time the app opens, before any system question. */
@Composable
fun FirstLaunchPermissions() {
    val context = LocalContext.current
    val missing = remember { missingAsks(context) }
    var refused by remember { mutableStateOf<List<Ask>?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val no = missing.filter { result[it.permission] != true && context.checkSelfPermission(it.permission) != PackageManager.PERMISSION_GRANTED }
        if (no.isEmpty()) AppState.update { it.copy(permissionsAsked = true) } else refused = no
    }
    val done = { AppState.update { it.copy(permissionsAsked = true) } }
    val shown = refused
    if (shown != null) {
        WatchList("The match still runs") {
            explained(shown) { it.without }
            item { T("To allow it later: Settings → Permissions, here in LawFive", 12.5.sp, C.dim, FontWeight.Normal, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), lines = 3) }
            item { PillButton("Done", onClick = done) }
        }
        return
    }
    WatchList("Before your first match") {
        item { T("LawFive asks the watch for:", 13.sp, C.dim, FontWeight.Normal, Modifier.padding(bottom = 2.dp)) }
        explained(missing) { it.why }
        item { T("Without them the match still runs", 12.5.sp, C.dim, FontWeight.Normal, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), lines = 2) }
        item { PillButton("Continue") { launcher.launch(missing.map { it.permission }.toTypedArray()) } }
        item { PillButton("Not now", C.row, onClick = done) }
    }
}

/** WCH-7: Settings → Permissions: what's allowed, and a way to allow the rest. */
@Composable
fun PermissionsPage() {
    val context = LocalContext.current
    val resumes = AppState.resumes
    var asked by remember { mutableIntStateOf(0) }
    val missing = remember(resumes, asked) { missingAsks(context) }
    var triedOnce by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        asked++
        triedOnce = true
    }
    // The system asks again only if it wasn't refused for good; after that it's the app's own page.
    val allow = { if (triedOnce) openAppSettings(context) else launcher.launch(missing.map { it.permission }.toTypedArray()) }
    WatchList("Permissions") {
        asks().forEach { a ->
            item {
                val on = a !in missing
                MenuRow(a.name, if (on) "Allowed" else "Not allowed") { if (!on) allow() }
            }
        }
        if (missing.isNotEmpty()) {
            item { PillButton(if (triedOnce) "App settings" else "Allow", onClick = allow) }
            item { T("Or on the watch: Settings → Apps → LawFive → Permissions", 12.sp, C.dim, FontWeight.Normal, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), lines = 3) }
        }
    }
}
