import SwiftUI
import VisionKit

// Signing in (IOS-2): the server (the one built in, or any address, checked first), then email and
// password; or a code from the web app, scanned or typed (APP-13), or an invitation (APP-14). Other
// new accounts are made on the website.

/// What the sign-in card shows instead of its form.
private enum Panel: Equatable {
    case checking
    case enterCode
    case confirm(server: String, code: String, name: String, email: String)
    case invite(server: String, token: String, invitedBy: String, name: String?, email: String?)
}

/// IOS-2: what iOS refuses, in words.
private let plainHttpRefused = "This server needs https. Plain http only works for a server on your own network, by its IP address or a name ending in .local."

private func hostOf(_ server: String) -> String { server.replacingOccurrences(of: "^https?://", with: "", options: .regularExpression) }

private func address(_ text: String) -> String {
    var t = text.trimmingCharacters(in: .whitespaces)
    while t.hasSuffix("/") { t.removeLast() }
    return t.hasPrefix("http://") || t.hasPrefix("https://") ? t : "https://\(t)"
}

struct SignInScreen: View {
    @Environment(AppGraph.self) private var graph
    @State private var server = ""
    @State private var choosing = false
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var panel: Panel?
    @State private var scanning = false
    @State private var emailFocused = false
    @State private var passwordFocused = false
    /// APP-2, USR-7: the shown server's website: where it makes accounts (its PUBLIC_URL's /signup), when it
    /// has one and takes new accounts, and where a forgotten password is reset.
    @State private var website = AppGraph.Website()

    private var canSignIn: Bool { !busy && server.orNil != nil && email.orNil != nil && !password.isEmpty }

    /// The shown server's website, from its /v1/meta; nothing offline.
    private func lookUpWebsite() async {
        website = AppGraph.Website()
        let shown = address(server)
        let found = await graph.website(shown)
        if shown == address(server) { website = found }
    }

    private func trouble(_ e: Error, _ server: String, back: Panel?) {
        panel = back
        error = (e as? ServerError)?.message ?? "Couldn't reach \(hostOf(server)). Check your connection."
    }

    private func follow(_ link: AppLink) async {
        let back: Panel? = panel == .enterCode ? .enterCode : nil
        panel = .checking
        error = nil
        do {
            let url = try await graph.apiServer(link.server)
            switch link {
            case .signIn(_, let code):
                let who = try await graph.checkCode(server: url, code: code)
                panel = .confirm(server: url, code: code, name: who.name, email: who.email)
            case .invite(_, let token):
                let found = try await graph.lookUpInvite(server: url, token: token)
                panel = .invite(server: url, token: token, invitedBy: found?["invitedBy"]?.string ?? "An admin", name: found?["name"]?.string, email: found?["email"]?.string)
            }
        } catch {
            trouble(error, link.server, back: back)
        }
        graph.pendingLink = nil
    }

    private func signIn() async {
        busy = true
        error = nil
        defer { busy = false }
        // SEC-5: a release build sends a password over plain http only on the referee's own network.
        if !AppInfo.isDebug, let parts = URLComponents(string: address(server)), parts.scheme == "http", !AppLink.isLocalNetwork(parts.host ?? "") {
            error = plainHttpRefused
            return
        }
        do {
            let url = try await graph.checkServer(address(server))
            graph.session.setServer(url)
            try await graph.signIn(server: url, email: email, password: password)
        } catch let e as ServerError {
            error = e.status == 401 ? "That email and password don't match an account." : e.message
        } catch URLError.appTransportSecurityRequiresSecureConnection {
            self.error = plainHttpRefused
        } catch {
            self.error = "Couldn't reach \(hostOf(address(server))). Check the address and your connection."
        }
    }

    private func during(_ work: @escaping () async throws -> Void, server: String) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                graph.session.setServer(server)
                try await work()
            } catch {
                self.error = (error as? ServerError)?.message ?? "Couldn't reach \(hostOf(server)). Check your connection."
            }
        }
    }

    var body: some View {
        ScrollViewReader { scroller in
        ScrollView {
            VStack(spacing: 0) {
                // WEB-25: the lockup in chalk on the grass.
                Logo(size: 44)
                Text("Your matches, on your wrist and everywhere else.").font(.barlow(15, .medium)).foregroundStyle(LF.muted).multilineTextAlignment(.center).padding(.top, 12)
                LfCard(padding: 20) { card }.padding(.top, 24)
                // USR-7: a forgotten password is reset on the server's website, by a link it emails.
                if let reset = website.forgotPassword {
                    Link("Forgot your password?", destination: reset)
                        .font(.barlow(15, .semibold, relativeTo: .subheadline)).foregroundStyle(LF.brand).underline()
                        // 44 pt to tap (for gloves), as a button, though it reads as a line of words.
                        .padding(.horizontal, 12).frame(minHeight: 44).contentShape(Rectangle())
                        .padding(.top, 4)
                }
                Group {
                    // The website's sign-up, when the server has one to link to.
                    if let signUpURL = website.signUp, let words = try? AttributedString(markdown: "New to LawFive? Scan your invitation, or [make an account on the website](\(signUpURL.absoluteString)) and sign in here.") {
                        Text(words)
                    } else {
                        Text("New to LawFive? Scan your invitation, or make an account on the website and sign in here.")
                    }
                }
                .font(.lfBodySmall).foregroundStyle(LF.muted).tint(LF.brand).multilineTextAlignment(.center).padding(.top, 14)
            }
            .frame(maxWidth: 420)
            .padding(16).padding(.top, 40)
            .frame(maxWidth: .infinity)
        }
        // With the keyboard up (the iPhone SE's covers half the screen), Sign in stays in view under the field.
        .onChange(of: emailFocused || passwordFocused) { _, typing in
            if typing { withAnimation(.easeOut(duration: 0.25)) { scroller.scrollTo("signIn", anchor: .bottom) } }
        }
        }
        .background { PitchStripes() }
        // As a tab's first page: the board behind the status bar, so the card scrolls under it, not the clock.
        .statusBand()
        .scrollDismissesKeyboard(.interactively)
        .onAppear {
            if server.isEmpty { server = graph.session.server.isEmpty ? AppInfo.defaultServer : graph.session.server }
            choosing = server.isEmpty
        }
        .task(id: server) {
            // Typing a server's address: looked up once it's been still for a moment.
            if choosing { try? await Task.sleep(for: .milliseconds(600)) }
            guard !Task.isCancelled else { return }
            await lookUpWebsite()
        }
        .onChange(of: graph.pendingLink, initial: true) { _, link in
            if let link { Task { await follow(link) } }
        }
        .sheet(isPresented: $scanning) {
            ScanSheet { text in
                scanning = false
                if let found = AppLink.parse(text, allowHttp: AppInfo.isDebug) {
                    graph.pendingLink = found
                } else {
                    error = "That isn't a LawFive code. Scan the one on the web app's Get the app page, or an invitation."
                }
            }
        }
    }

    @ViewBuilder
    private var card: some View {
        VStack(alignment: .leading, spacing: 10) {
            switch panel {
            case .checking:
                LoadingPitch()
            case .enterCode:
                EnterCode(server: $server, busy: busy, error: error, onContinue: { code in
                    error = nil
                    if let url = AppLink.serverOf(address(server), allowHttp: AppInfo.isDebug), let normal = AppLink.normalizeCode(code) {
                        graph.pendingLink = .signIn(server: url, code: normal)
                    } else {
                        error = "Check the server's address. It needs to start with https."
                    }
                }, onCancel: {
                    panel = nil
                    error = nil
                })
            case .confirm(let url, let code, let name, let mail):
                ConfirmSignIn(host: hostOf(url), name: name, email: mail, busy: busy, error: error, onConfirm: {
                    during({ try await graph.signInWithCode(server: url, code: code) }, server: url)
                }, onCancel: {
                    panel = nil
                    error = nil
                })
            case .invite(let url, let token, let invitedBy, let name, let mail):
                InviteForm(host: hostOf(url), invitedBy: invitedBy, invitedName: name, invitedEmail: mail, busy: busy, error: error, onCreate: { name, mail, pass in
                    during({ try await graph.signUpWithInvite(server: url, invite: token, name: name, email: mail, password: pass) }, server: url)
                }, onCancel: {
                    panel = nil
                    error = nil
                })
            case nil:
                form
            }
        }
    }

    @ViewBuilder
    private var form: some View {
        if choosing {
            Field("Server", text: $server, placeholder: "lawfive.example.com", keyboard: .URL, capitalization: .never, supporting: "Your LawFive server's address, as you open it in a browser.")
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("Server").font(.lfBodySmall).foregroundStyle(LF.muted)
                Text(server.replacingOccurrences(of: "https://", with: "")).font(.lfTitleMedium).foregroundStyle(LF.text)
                Button { choosing = true } label: { Text("Use another server").font(.lfLabelLarge).foregroundStyle(LF.brand).padding(.vertical, 4) }.buttonStyle(.plain)
            }
        }
        Field("Email", text: $email, keyboard: .emailAddress, capitalization: .never, contentType: .username, focus: $emailFocused)
            .submitLabel(.next)
            .onSubmit { passwordFocused = true }
        // Return signs in, as the button does.
        Field("Password", text: $password, capitalization: .never, contentType: .password, secure: true, focus: $passwordFocused)
            .submitLabel(.go)
            .onSubmit { if canSignIn { Task { await signIn() } } }
        if let error { Text(error).font(.lfBodyMedium).foregroundStyle(LF.redText).fixedSize(horizontal: false, vertical: true) }
        PrimaryButton(busy ? "Signing in…" : "Sign in", enabled: canSignIn, wide: true) {
            Task { await signIn() }
        }
        .id("signIn")
        Hairline().padding(.vertical, 6)
        SecondaryButton("Scan a QR code", icon: .qr, wide: true) {
            error = nil
            if ScanSheet.available {
                scanning = true
            } else {
                error = "The scanner isn't available on this phone. Tap Enter a code instead."
            }
        }
        Button {
            error = nil
            panel = .enterCode
        } label: {
            Text("Enter a code").font(.lfLabelLarge).foregroundStyle(LF.brand).frame(maxWidth: .infinity).padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }
}

/// The native QR scanner, full height, with Cancel.
private struct ScanSheet: View {
    let found: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @MainActor static var available: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    var body: some View {
        NavigationStack {
            Scanner(found: found)
                .ignoresSafeArea()
                .navigationTitle("Scan a QR code")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private struct Scanner: UIViewControllerRepresentable {
        let found: (String) -> Void

        func makeUIViewController(context: Context) -> DataScannerViewController {
            let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, isHighlightingEnabled: true)
            scanner.delegate = context.coordinator
            try? scanner.startScanning()
            return scanner
        }

        func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}
        func makeCoordinator() -> Coordinator { Coordinator(found: found) }

        final class Coordinator: NSObject, DataScannerViewControllerDelegate {
            let found: (String) -> Void
            private var done = false
            init(found: @escaping (String) -> Void) { self.found = found }

            func dataScanner(_ scanner: DataScannerViewController, didAdd added: [RecognizedItem], allItems: [RecognizedItem]) {
                for case .barcode(let code) in added {
                    if let text = code.payloadStringValue, !done {
                        done = true
                        found(text)
                    }
                }
            }
        }
    }
}

/// An account waiting for approval (USR-4): nothing to see until an admin approves it.
struct WaitingScreen: View {
    @Environment(AppGraph.self) private var graph

    var body: some View {
        VStack(spacing: 12) {
            Logo(size: 40).padding(.bottom, 8)
            Text("WAITING FOR APPROVAL").font(.lfHeadlineSmall).foregroundStyle(LF.text)
            Text("An admin of this server approves new accounts. You'll be able to use LawFive once they have.").font(.lfBodyMedium).foregroundStyle(LF.muted).multilineTextAlignment(.center)
            PrimaryButton("Check again", wide: true) { Task { await graph.refreshAccount() } }
            SecondaryButton("Sign out", icon: .out, wide: true) { Task { await graph.signOut() } }
        }
        .frame(maxWidth: 420)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .statusBand()
    }
}

/// A rounded tile with an icon, as at the top of the web app's Link a watch and Get the app pages.
private struct PanelHead: View {
    let icon: Ph
    let title: String
    let line: String

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(LF.brandSoft)
                PhIcon(icon, size: 28, tint: LF.brandStrong)
            }
            .frame(width: 56, height: 56)
            Text(title).font(.lfHeadlineSmall).foregroundStyle(LF.text).multilineTextAlignment(.center).padding(.top, 6)
            Text(line).font(.lfBodyMedium).foregroundStyle(LF.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

/// "Sign in to this server as this person?", so a code from somewhere else can't sign the phone in unasked.
private struct ConfirmSignIn: View {
    let host: String
    let name: String
    let email: String
    let busy: Bool
    let error: String?
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            PanelHead(icon: .mobile, title: "Sign in on this phone?", line: "On the server \(host)")
            HStack(spacing: 12) {
                PhIcon(.portrait, tint: LF.muted)
                VStack(alignment: .leading) {
                    Text(name).font(.lfTitleMedium).foregroundStyle(LF.text)
                    Text(email).font(.lfBodySmall).foregroundStyle(LF.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(LF.surface2, in: RoundedRectangle(cornerRadius: 6))
            Text("Only continue if this is you and you trust this server.").font(.lfBodySmall).foregroundStyle(LF.muted).multilineTextAlignment(.center)
            if let error { Text(error).font(.lfBodyMedium).foregroundStyle(LF.redText) }
            PrimaryButton(busy ? "Signing in…" : "Sign in", enabled: !busy, wide: true, action: onConfirm)
            SecondaryButton("Cancel", enabled: !busy, wide: true, action: onCancel)
        }
    }
}

/// The form for an invitation, as on the web's page; one for a single address keeps it.
private struct InviteForm: View {
    let host: String
    let invitedBy: String
    let invitedName: String?
    let invitedEmail: String?
    let busy: Bool
    let error: String?
    let onCreate: (String, String, String) -> Void
    let onCancel: () -> Void
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PanelHead(icon: .mail, title: "\(invitedBy) invited you", line: "Make your account on \(host)")
            Field("Name", text: $name, capitalization: .words, contentType: .name)
            if let invitedEmail {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Email").font(.lfBodySmall).foregroundStyle(LF.muted)
                    Text(invitedEmail).font(.lfTitleMedium).foregroundStyle(LF.text)
                    Text("The invitation is for this address.").font(.lfBodySmall).foregroundStyle(LF.muted)
                }
            } else {
                Field("Email", text: $email, keyboard: .emailAddress, capitalization: .never, contentType: .username)
            }
            Field("Password", text: $password, capitalization: .never, contentType: .newPassword, secure: true, supporting: "At least 8 characters.")
            // SITE-5: the hosted service's; a self-hosted server has its own, or none.
            if host.hasSuffix("lawfive.app") {
                Text("By making an account you agree to LawFive's [terms](https://lawfive.app/terms.html) and [privacy policy](https://lawfive.app/privacy.html).")
                    .font(.lfBodySmall).foregroundStyle(LF.muted).tint(LF.brand)
            }
            if let error { Text(error).font(.lfBodyMedium).foregroundStyle(LF.redText) }
            PrimaryButton(busy ? "Making your account…" : "Create account", enabled: !busy && name.orNil != nil && (invitedEmail ?? email).orNil != nil && password.count >= 8, wide: true) {
                onCreate(name.trimmingCharacters(in: .whitespaces), (invitedEmail ?? email).trimmingCharacters(in: .whitespaces), password)
            }
            SecondaryButton("Cancel", enabled: !busy, wide: true, action: onCancel)
        }
        .onAppear { name = invitedName ?? "" }
    }
}

/// Typing the code instead of scanning it, as on the watch: two groups of four, in JetBrains Mono.
private struct EnterCode: View {
    @Binding var server: String
    let busy: Bool
    let error: String?
    let onContinue: (String) -> Void
    let onCancel: () -> Void
    @State private var code = ""

    private var clean: String { code.uppercased().filter { ("A"..."Z").contains($0) || ("0"..."9").contains($0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PanelHead(icon: .qr, title: "Enter the code", line: "In LawFive on the web, open Get the app. It shows the code and the server.")
            Field("Server", text: $server, placeholder: "lawfive.example.com", keyboard: .URL, capitalization: .never)
            Field("Code", text: Binding(get: {
                clean.count > 4 ? "\(clean.prefix(4))-\(clean.dropFirst(4))" : clean
            }, set: {
                code = String($0.uppercased().filter { ("A"..."Z").contains($0) || ("0"..."9").contains($0) }.prefix(8))
            }), placeholder: "XXXX-XXXX", capitalization: .characters, mono: true)
            if let error { Text(error).font(.lfBodyMedium).foregroundStyle(LF.redText) }
            PrimaryButton(busy ? "Checking…" : "Continue", enabled: !busy && server.orNil != nil && clean.count == 8, wide: true) { onContinue(clean) }
            SecondaryButton("Cancel", enabled: !busy, wide: true, action: onCancel)
        }
    }
}
