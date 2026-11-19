package app.lawfive.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.LinkButton
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.theme.colors

// The panels in the sign-in card for signing in with a code (APP-13) and making an account, from an
// invitation (APP-14) or not (APP-29). SignInScreen holds what's happening; these only show it.

/** A rounded tile with an icon, as at the top of the web app's Link a watch and Get the app pages. */
@Composable
private fun PanelTile(icon: Ph) {
    Box(Modifier.size(56.dp).background(colors.brandSoft, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
        PhIcon(icon, size = 28.dp, tint = colors.brandStrong)
    }
}

@Composable
private fun PanelHead(icon: Ph, title: String, line: String) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PanelTile(icon)
        Text(title, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
        Text(line, style = MaterialTheme.typography.bodyMedium, color = colors.muted, textAlign = TextAlign.Center)
    }
}

/** "Sign in to this server as this person?", so a code from somewhere else can't sign the phone in unasked. */
@Composable
fun ConfirmSignIn(host: String, name: String, email: String, busy: Boolean, error: String?, onConfirm: () -> Unit, onCancel: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PanelHead(Ph.Mobile, "Sign in on this phone?", "On the server $host")
        Row(
            Modifier.fillMaxWidth().background(colors.surface2, RoundedCornerShape(10.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PhIcon(Ph.Portrait, null, tint = colors.muted)
            Column {
                Text(name, style = MaterialTheme.typography.titleMedium)
                Text(email, style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
        }
        Text("Only continue if this is you and you trust this server.", style = MaterialTheme.typography.bodySmall, color = colors.muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        if (error != null) Text(error, color = colors.redText, style = MaterialTheme.typography.bodyMedium)
        PrimaryButton(if (busy) "Signing in…" else "Sign in", onConfirm, Modifier.fillMaxWidth(), enabled = !busy)
        SecondaryButton("Cancel", onCancel, Modifier.fillMaxWidth(), enabled = !busy)
    }
}

/** The form for an invitation, as on the web's page; one for a single address keeps it. */
@Composable
fun InviteForm(
    host: String, invitedBy: String, invitedName: String?, invitedEmail: String?, busy: Boolean, error: String?,
    onCreate: (name: String, email: String, password: String) -> Unit, onCancel: () -> Unit,
) {
    var name by rememberSaveable { mutableStateOf(invitedName ?: "") }
    var email by rememberSaveable { mutableStateOf(invitedEmail ?: "") }
    var password by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PanelHead(Ph.Mail, "$invitedBy invited you", "Make your account on $host")
        AccountFields(host, name, { name = it }, email, { email = it }, password, { password = it }, fixedEmail = invitedEmail, approval = false,
            busy = busy, error = error, onCreate = { onCreate(name.trim(), email.trim(), password) })
        SecondaryButton("Cancel", onCancel, Modifier.fillMaxWidth(), enabled = !busy)
    }
}

/**
 * APP-29: making an account on the phone, on a server that takes new ones. Sign in, and Use another
 * server, go back to signing in with the email typed here; so does Sign in instead, when the address
 * already has an account (`exists`).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CreateAccount(
    host: String, approval: Boolean, startEmail: String, busy: Boolean, error: String?, exists: Boolean,
    onCreate: (name: String, email: String, password: String) -> Unit, onSignIn: (email: String) -> Unit, onOtherServer: (email: String) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf(startEmail) }
    var password by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PanelHead(Ph.Invite, "Create your account", "On $host")
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { LinkButton("Use another server") { onOtherServer(email.trim()) } }
        AccountFields(host, name, { name = it }, email, { email = it }, password, { password = it }, fixedEmail = null, approval = approval,
            busy = busy, error = if (exists) "There's already an account with this email." else error,
            onCreate = { onCreate(name.trim(), email.trim(), password) },
            afterError = { if (exists) SecondaryButton("Sign in instead", { onSignIn(email.trim()) }, Modifier.fillMaxWidth()) })
        // Wrapping whole, so a narrow phone with large text puts Sign in under the question. Sign in
        // instead says the same once the address is known to have an account.
        if (!exists) FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, itemVerticalAlignment = Alignment.CenterVertically) {
            Text("Already have an account?", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
            LinkButton("Sign in") { onSignIn(email.trim()) }
        }
    }
}

/**
 * The fields both forms share (APP-14, APP-29): Name, Email (or the invitation's, fixed), Password,
 * then the approval note, the hosted service's terms, any problem, and Create account.
 */
@Composable
private fun AccountFields(
    host: String, name: String, onName: (String) -> Unit, email: String, onEmail: (String) -> Unit, password: String, onPassword: (String) -> Unit,
    fixedEmail: String?, approval: Boolean, busy: Boolean, error: String?, onCreate: () -> Unit, afterError: @Composable () -> Unit = {},
) {
    var showPassword by remember { mutableStateOf(false) }
    Field("Name", name, onName)
    if (fixedEmail != null) {
        Column {
            Text("Email", style = MaterialTheme.typography.bodySmall)
            Text(fixedEmail, style = MaterialTheme.typography.titleMedium)
            Text("The invitation is for this address.", style = MaterialTheme.typography.bodySmall, color = colors.muted)
        }
    } else {
        Field("Email", email, onEmail, keyboard = KeyboardType.Email)
    }
    Field("Password", password, onPassword, password = !showPassword, keyboard = KeyboardType.Password, supporting = "At least 8 characters.",
        trailing = {
            androidx.compose.material3.IconButton({ showPassword = !showPassword }) {
                PhIcon(if (showPassword) Ph.EyeOff else Ph.Eye, if (showPassword) "Hide password" else "Show password", tint = colors.muted)
            }
        })
    // USR-4: the account waits for an admin.
    if (approval) Text("An admin of this server approves new accounts before they can be used.", color = colors.muted, style = MaterialTheme.typography.bodySmall)
    // SITE-5: the hosted service's; a self-hosted server has its own, or none.
    if (host.endsWith("lawfive.app")) {
        Text(
            androidx.compose.ui.text.buildAnnotatedString {
                append("By making an account you agree to LawFive's ")
                withLink(androidx.compose.ui.text.LinkAnnotation.Url("https://lawfive.app/terms.html")) { append("terms") }
                append(" and ")
                withLink(androidx.compose.ui.text.LinkAnnotation.Url("https://lawfive.app/privacy.html")) { append("privacy policy") }
                append(".")
            },
            color = colors.muted, style = MaterialTheme.typography.bodySmall,
        )
    }
    if (error != null) Text(error, color = colors.redText, style = MaterialTheme.typography.bodyMedium)
    afterError()
    PrimaryButton(if (busy) "Making your account…" else "Create account", onCreate, Modifier.fillMaxWidth(),
        enabled = !busy && name.isNotBlank() && (fixedEmail ?: email).isNotBlank() && password.length >= 8)
}

/** Shows a code's dash without it being in the text, so typing never moves the cursor. */
private object CodeGroups : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val long = text.length > 4
        return TransformedText(
            AnnotatedString(if (long) "${text.take(4)}-${text.drop(4)}" else text.text),
            object : OffsetMapping {
                override fun originalToTransformed(offset: Int) = if (long && offset > 4) offset + 1 else offset
                override fun transformedToOriginal(offset: Int) = if (long && offset > 4) offset - 1 else offset
            },
        )
    }
}

/** Typing the code instead of scanning it, as on the watch: two groups of four, in JetBrains Mono. */
@Composable
fun EnterCode(server: String, onServer: (String) -> Unit, busy: Boolean, error: String?, onContinue: (String) -> Unit, onCancel: () -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PanelHead(Ph.Qr, "Enter the code", "In LawFive on the web, open Get the app. It shows the code and the server.")
        Field("Server", server, onServer, placeholder = "lawfive.example.com", keyboard = KeyboardType.Uri)
        Field("Code", code, { text -> code = text.uppercase().filter { it in 'A'..'Z' || it in '0'..'9' }.take(8) }, placeholder = "XXXX-XXXX", mono = true, visual = CodeGroups)
        if (error != null) Text(error, color = colors.redText, style = MaterialTheme.typography.bodyMedium)
        PrimaryButton(if (busy) "Checking…" else "Continue", { onContinue(code) }, Modifier.fillMaxWidth(), enabled = !busy && server.isNotBlank() && code.length == 8)
        SecondaryButton("Cancel", onCancel, Modifier.fillMaxWidth(), enabled = !busy)
    }
}
