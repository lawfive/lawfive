package app.lawfive.ui.screens

import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.BuildConfig
import app.lawfive.R
import app.lawfive.data.ApiException
import app.lawfive.data.AppLink
import app.lawfive.data.str
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.Gap
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.LinkButton
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.theme.colors
import app.lawfive.ui.components.pitchStripes
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.launch
import java.io.IOException

// Signing in (APP-2): the server (the one built in, or any address, checked first), then email
// and password; or a code from the web app, scanned or typed (APP-13), or an invitation (APP-14).
// Other new accounts are made on the website.

/** What the sign-in card shows instead of its form. */
private sealed interface Panel {
    data object Checking : Panel
    data object EnterCode : Panel
    data class Confirm(val server: String, val code: String, val name: String, val email: String) : Panel
    data class Invite(val server: String, val token: String, val invitedBy: String, val name: String?, val email: String?) : Panel
}

@Composable
fun SignInScreen() {
    val graph = LocalGraph.current
    val session by graph.session.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var server by rememberSaveable { mutableStateOf(session.server.ifEmpty { BuildConfig.DEFAULT_SERVER }) }
    var choosing by rememberSaveable { mutableStateOf(server.isEmpty()) }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    // APP-2, USR-7: where the chosen server's website makes accounts (its publicUrl, from GET /v1/meta), unless it's
    // closed to them, and where a forgotten password is reset.
    var website by remember { mutableStateOf(app.lawfive.AppGraph.Website(null, null)) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Android 17 asks before an app reaches the local network, where a server at home often is.
    val context = androidx.compose.ui.platform.LocalContext.current
    val localPermission = "android.permission.ACCESS_LOCAL_NETWORK"
    fun mayReachLocal() = Build.VERSION.SDK_INT < 37 || androidx.core.content.ContextCompat.checkSelfPermission(context, localPermission) == PackageManager.PERMISSION_GRANTED
    var retry by remember { mutableStateOf<(() -> Unit)?>(null) }
    val askLocal = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) retry?.invoke() else error = "LawFive couldn't reach the server. If it's on your home network, allow LawFive to use the local network in the phone's settings."
    }

    fun address(text: String): String {
        val t = text.trim().trimEnd('/')
        return if (t.startsWith("http://") || t.startsWith("https://")) t else "https://$t"
    }

    LaunchedEffect(server) {
        website = app.lawfive.AppGraph.Website(null, null)
        if (server.isBlank()) return@LaunchedEffect
        // Typing an address: wait until it settles.
        kotlinx.coroutines.delay(600)
        website = runCatching { graph.website(address(server)) }.getOrDefault(app.lawfive.AppGraph.Website(null, null))
    }

    // APP-13, APP-14: a link from the scanner, a typed code or the web app's Open in the app button.
    var panel by remember { mutableStateOf<Panel?>(null) }
    val link by graph.pendingLink.collectAsStateWithLifecycle()
    fun problem(e: Exception, server: String, panelAfter: Panel?) {
        panel = panelAfter
        error = when (e) {
            is ApiException -> e.message
            else -> "Couldn't reach ${server.substringAfter("://")}. Check your connection."
        }
    }
    LaunchedEffect(link) {
        val found = link ?: return@LaunchedEffect
        val back = if (panel == Panel.EnterCode) Panel.EnterCode else null
        panel = Panel.Checking
        error = null
        try {
            val url = graph.apiServer(found.server)
            panel = when (found) {
                is AppLink.SignIn -> graph.checkCode(url, found.code).let { (name, email) -> Panel.Confirm(url, found.code, name, email) }
                is AppLink.Invite -> graph.lookUpInvite(url, found.token).let {
                    Panel.Invite(url, found.token, it.str("invitedBy") ?: "An admin", it.str("name"), it.str("email"))
                }
            }
        } catch (e: ApiException) {
            problem(e, found.server, back)
        } catch (e: IOException) {
            android.util.Log.w("LawFive", "Following a link: $e")
            // A server at home needs Android 17's permission (APP-10); then the link is followed again.
            if (!mayReachLocal()) {
                panel = back
                retry = { graph.pendingLink.value = found }
                askLocal.launch(localPermission)
            } else {
                problem(e, found.server, back)
            }
        } finally {
            // Only once it's done: clearing it restarts this effect, which would stop the request.
            graph.pendingLink.value = null
        }
    }
    fun scan() {
        error = null
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(context, options).startScan()
            .addOnSuccessListener { barcode ->
                val found = barcode.rawValue?.let { AppLink.parse(it, BuildConfig.DEBUG) }
                if (found != null) graph.pendingLink.value = found else error = "That isn't a LawFive code. Scan the one on the web app's Get the app page, or an invitation."
            }
            .addOnFailureListener { e ->
                android.util.Log.w("LawFive", "Scanning: $e")
                error = "The scanner isn't available on this phone. Tap Enter a code instead."
            }
    }

    Box(Modifier.fillMaxSize().pitchStripes(colors.pitch, colors.pitchStripe).imePadding().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 420.dp).padding(16.dp).statusBarsPadding().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            // WEB-25: the lockup, chalk on the grass.
            app.lawfive.ui.components.Logo(42.sp)
            Gap(14)
            Text("Your matches, on your wrist and everywhere else.", style = MaterialTheme.typography.bodyMedium, color = colors.muted, textAlign = TextAlign.Center)
            Gap(24)
            LfCard {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    when (val shown = panel) {
                    Panel.Checking -> Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) { LoadingPitch() }
                    Panel.EnterCode -> EnterCode(server, { server = it; error = null }, busy, error,
                        onContinue = { code ->
                            error = null
                            val found = AppLink.serverOf(address(server), BuildConfig.DEBUG)?.let { url -> AppLink.normaliseCode(code)?.let { AppLink.SignIn(url, it) } }
                            if (found != null) graph.pendingLink.value = found else error = "Check the server's address. It needs to start with https."
                        },
                        onCancel = { panel = null; error = null })
                    is Panel.Confirm -> ConfirmSignIn(shown.server.substringAfter("://"), shown.name, shown.email, busy, error,
                        onConfirm = {
                            busy = true
                            error = null
                            scope.launch {
                                try {
                                    graph.session.setServer(shown.server)
                                    graph.signInWithCode(shown.server, shown.code)
                                } catch (e: ApiException) {
                                    error = e.message
                                } catch (e: IOException) {
                                    error = "Couldn't reach ${shown.server.substringAfter("://")}. Check your connection."
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        onCancel = { panel = null; error = null })
                    is Panel.Invite -> InviteForm(shown.server.substringAfter("://"), shown.invitedBy, shown.name, shown.email, busy, error,
                        onCreate = { name, mail, pass ->
                            busy = true
                            error = null
                            scope.launch {
                                try {
                                    graph.session.setServer(shown.server)
                                    graph.signUpWithInvite(shown.server, shown.token, name, mail, pass)
                                } catch (e: ApiException) {
                                    error = e.message
                                } catch (e: IOException) {
                                    error = "Couldn't reach ${shown.server.substringAfter("://")}. Check your connection."
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        onCancel = { panel = null; error = null })
                    null -> {
                    if (choosing) {
                        Field("Server", server, { server = it; error = null }, placeholder = "lawfive.example.com", keyboard = KeyboardType.Uri,
                            supporting = "Your LawFive server's address, as you open it in a browser.")
                    } else {
                        Column {
                            Text("Server", style = MaterialTheme.typography.bodySmall)
                            Text(server.removePrefix("https://"), style = MaterialTheme.typography.titleMedium)
                            LinkButton("Use another server") { choosing = true }
                        }
                    }
                    Field("Email", email, { email = it; error = null }, keyboard = KeyboardType.Email)
                    Field("Password", password, { password = it; error = null }, password = !showPassword, keyboard = KeyboardType.Password,
                        trailing = {
                            androidx.compose.material3.IconButton({ showPassword = !showPassword }) {
                                PhIcon(if (showPassword) Ph.EyeOff else Ph.Eye, if (showPassword) "Hide password" else "Show password", tint = colors.muted)
                            }
                        })
                    if (error != null) Text(error!!, color = colors.redText, style = MaterialTheme.typography.bodyMedium)
                    lateinit var signIn: () -> Unit
                    signIn = {
                        busy = true
                        error = null
                        scope.launch {
                            try {
                                val url = graph.checkServer(address(server))
                                graph.session.setServer(url)
                                graph.signIn(url, email, password)
                            } catch (e: ApiException) {
                                error = when (e.status) {
                                    401 -> "That email and password don't match an account."
                                    403 -> e.message
                                    0 -> e.message
                                    else -> e.message
                                }
                            } catch (e: IOException) {
                                android.util.Log.w("LawFive", "Signing in: $e")
                                if (!mayReachLocal()) {
                                    retry = signIn
                                    askLocal.launch(localPermission)
                                } else {
                                    error = "Couldn't reach ${address(server).removePrefix("https://")}. Check the address and your connection."
                                }
                            } finally {
                                busy = false
                            }
                        }
                    }
                    PrimaryButton(if (busy) "Signing in…" else "Sign in", enabled = !busy && server.isNotBlank() && email.isNotBlank() && password.isNotEmpty(), modifier = Modifier.fillMaxWidth(), onClick = signIn)
                    HorizontalDivider(Modifier.padding(vertical = 6.dp), color = colors.border)
                    SecondaryButton("Scan a QR code", { scan() }, Modifier.fillMaxWidth(), icon = Ph.Qr)
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        LinkButton("Enter a code") { error = null; panel = Panel.EnterCode }
                    }
                    }
                    }
                }
            }
            Gap(14)
            // APP-2: the server's own website, where its accounts are made, when it says where that is and takes new ones.
            val signUpAt = website.signUp
            val linkStyle = androidx.compose.ui.text.TextLinkStyles(androidx.compose.ui.text.SpanStyle(
                color = colors.brand, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
            ))
            // USR-7: a forgotten password is reset on the server's website, by a link it emails.
            website.forgotPassword?.let { reset ->
                Text(
                    androidx.compose.ui.text.buildAnnotatedString {
                        withLink(androidx.compose.ui.text.LinkAnnotation.Url(reset, linkStyle)) { append("Forgot your password?") }
                    },
                    style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(bottom = 10.dp),
                )
            }
            Text(
                androidx.compose.ui.text.buildAnnotatedString {
                    append("New to LawFive? Scan your invitation, or ")
                    if (signUpAt != null) {
                        withLink(androidx.compose.ui.text.LinkAnnotation.Url(signUpAt, linkStyle)) { append("make an account on the website") }
                    } else {
                        append("make an account on the website")
                    }
                    append(" and sign in here.")
                },
                style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center,
            )
        }
    }
}

/** An account waiting for approval (USR-4): nothing to see until an admin approves it. */
@Composable
fun WaitingScreen() {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    Box(Modifier.fillMaxSize().pitchStripes(colors.pitch, colors.pitchStripe).statusBarsPadding(), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 420.dp).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            app.lawfive.ui.components.Logo(38.sp)
            Text("WAITING FOR APPROVAL", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 8.dp))
            Text("An admin of this server approves new accounts. You'll be able to use LawFive once they have.", style = MaterialTheme.typography.bodyMedium,
                color = colors.muted, textAlign = TextAlign.Center)
            PrimaryButton("Check again", { scope.launch { graph.refreshAccount() } }, Modifier.fillMaxWidth())
            SecondaryButton("Sign out", { scope.launch { graph.signOut() } }, Modifier.fillMaxWidth(), icon = Ph.Out)
        }
    }
}
