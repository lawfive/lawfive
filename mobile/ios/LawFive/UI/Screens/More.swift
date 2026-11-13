import SwiftUI
import UIKit

// More (IOS-4, as APP-8): the account, and the rest of the app in the website's groups (WEB-31).

/// The hosted service's web app has its own address; a self-hosted server serves both from one.
func websiteURL(server: String, path: String = "") -> URL? {
    var site = server
    while site.hasSuffix("/") { site.removeLast() }
    return URL(string: site.replacingOccurrences(of: "https://api.lawfive.app", with: "https://app.lawfive.app") + path)
}

/// WEB-29: Help, lawfive.app's support page, with the common questions and how to reach us (the same on the website and Android).
let helpURL = URL(string: "https://lawfive.app/support")!

private struct RowArrow: View {
    var icon: Ph = .next
    var body: some View { PhIcon(icon, size: 18, tint: LF.muted) }
}

/// DEMO-9: lawfive.app's Try a match with the account's match screen, team swipes and its most recently active linked
/// watch (GET /v1/devices comes most recent first; a five-button Garmin with none, or offline).
@MainActor func tryMatchPage(_ graph: AppGraph) async -> BrowserPage? {
    let s = graph.records.effectiveSettings
    let devices = (try? await graph.api.call("GET", "/v1/devices")?["devices"]?.array) ?? []
    let latest = devices.first { watchKinds.contains($0["kind"]?.string ?? "") }
    let watch = TryMatch.watch(for: latest?["kind"]?.string, name: latest?["name"]?.string)
    return TryMatch.url(watch: watch, screen: ScreenSetup(s.watchScreen), teamSwipes: s.teamSwipes ?? "upDown").map(BrowserPage.init)
}

struct MoreScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.openURL) private var openURL
    @State private var signingOut = false
    /// DEMO-9: Try a match, open in the browser view.
    @State private var trying: BrowserPage?
    @Environment(\.dynamicTypeSize) private var textSize

    /// The initials, the name and the email.
    private var who: some View {
        let session = graph.session
        return HStack(spacing: 16) {
            Avatar(text: initials(session.name ?? "?"), background: LF.chalk, foreground: LF.board, size: 54)
            VStack(alignment: .leading, spacing: 3) {
                Text((session.name ?? "").uppercased()).font(.display(28, relativeTo: .title2)).foregroundStyle(LF.onBoardStrong).lineLimit(2).minimumScaleFactor(0.7)
                if let email = session.email {
                    Text(email).font(.lfBodyMedium).foregroundStyle(LF.onBoardMuted).lineLimit(1).minimumScaleFactor(0.7)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    private var signOut: some View {
        Button { signingOut = true } label: {
            Text("SIGN OUT").lfWord(17).foregroundStyle(LF.onBoardStrong).padding(.vertical, 10).padding(.leading, 4).frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel("Sign out")
    }

    var body: some View {
        Page("More", status: true) {
            // Who's signed in, on a board (WEB-24): the initials in a chalk circle, the name in black italic
            // capitals, the email, Sign out in words.
            Board {
                // Sign out beside the name; under it at larger text sizes, so the email isn't cut.
                Group {
                    if textSize > .large {
                        VStack(alignment: .leading, spacing: 4) {
                            who
                            signOut.padding(.leading, 70)
                        }
                    } else {
                        HStack(spacing: 16) {
                            who
                            signOut
                        }
                    }
                }
                .padding(.horizontal, 18).padding(.vertical, 18)
            }
            // WEB-31: the website's More groups (moreGroups), divided as Settings' are: the places of their
            // own with Settings among them, then getting set up and help. The phone has no admin pages;
            // admins use the website's.
            VStack(spacing: 24) {
                LfCard {
                    ListRow(title: "Competitions", sub: "Leagues, cups and tournaments", divider: false, action: { nav.push(.competitions) }, leading: { Avatar(icon: .competitions) }, trailing: { RowArrow() })
                    ListRow(title: "Templates", sub: "Formats you use often", action: { nav.push(.templates) }, leading: { Avatar(icon: .templates) }, trailing: { RowArrow() })
                    // QUIZ-7.
                    ListRow(title: "Quiz", sub: "How well do you know the Laws of the Game?", action: { nav.push(.quiz) }, leading: { Avatar(icon: .quiz) }, trailing: { RowArrow() })
                    // DEMO-8, DEMO-9: lawfive.app's, as the phone hasn't its own, with the account's screen and watch.
                    ListRow(title: "Try a match", sub: "The watch app, on lawfive.app", action: { Task { trying = await tryMatchPage(graph) } }, leading: { Avatar(icon: .play) }, trailing: { RowArrow(icon: .link) })
                    ListRow(title: "Settings", sub: "Units, your watch, calendars and your account", action: { nav.push(.settings) }, leading: { Avatar(icon: .settings) }, trailing: { RowArrow() })
                }
                .browser($trying)
                LfCard {
                    ListRow(title: "Link a watch", sub: linkWatchSub(), divider: false, action: { nav.push(.link) }, leading: { Avatar(icon: .watch) }, trailing: { RowArrow() })
                    ListRow(title: "Help", sub: "Questions, and how to reach us", action: { openURL(helpURL) }, leading: { Avatar(icon: .help) }, trailing: { RowArrow(icon: .link) })
                }
            }
            .padding(.top, 24)
        }
        .confirm("Sign out?", isPresented: $signingOut, message: "The account's copy on this phone goes; changes not sent yet are lost.", action: "Sign out") {
            Task { await graph.signOut() }
        }
    }
}

/// Sprint speed (TRK-11), in the unit the user reads speeds in, as on the web; kept in km/h whichever.
/// Empty goes back to the default.
struct SprintSpeedField: View {
    let kph: Double?
    let unit: String
    let onChange: (Double?) -> Void
    @State private var text: String?

    private var perKph: Double { unit == "mi" ? 1 / 1.609344 : 1 }
    private var label: String { unit == "mi" ? "mph" : "km/h" }

    private func shown(_ value: Double) -> String {
        let rounded = (value * perKph * 10).rounded() / 10
        return rounded == rounded.rounded() ? "\(Int(rounded))" : "\(rounded)"
    }

    private func asKph(_ typed: String) -> Double? {
        Double(typed.replacingOccurrences(of: ",", with: ".")).map { ($0 / perKph * 10).rounded() / 10 }
    }

    var body: some View {
        let current = text ?? kph.map(shown) ?? ""
        let valid = current.isEmpty || asKph(current).map { (15...35).contains($0) } == true
        Field("Sprint speed (\(label))", text: Binding(get: { current }, set: { typed in
            text = typed
            if typed.isEmpty { onChange(nil) } else if let value = asKph(typed), (15...35).contains(value) { onChange(value) }
        }), placeholder: shown(21), keyboard: .decimalPad, supporting: valid ? "Where sprinting starts in your match figures" : "Between \(shown(15)) and \(shown(35)) \(label)")
        .onChange(of: unit) { _, _ in text = nil }
    }
}

/// PLAN-6: the plan, when it ends, and how much of each limit is used, two to a row as on Android, in Settings → Your data.
struct PlanRows: View {
    let plan: AccountPlan

    var body: some View {
        ListRow(title: plan.plan.name, sub: planEnd(plan).map { "\($0). Nothing in your account is lost then." } ?? "What your account can use on this server",
                leading: { Avatar(icon: .plan) }, trailing: { EmptyView() })
        let lines = planLines(plan)
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 16, alignment: .top), GridItem(.flexible(), spacing: 16, alignment: .top)], alignment: .leading, spacing: 14) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in PlanFigure(line: line) }
        }
        .padding(.leading, 68).padding(.trailing, 16).padding(.bottom, 16)
    }
}

private struct PlanFigure: View {
    let line: PlanLine

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(line.label).font(.lfLabelMedium).foregroundStyle(LF.muted)
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                if line.of == "at most" { Text("at most ").font(.lfBodySmall).foregroundStyle(LF.muted) }
                Text(line.figure).font(.display(20, relativeTo: .title3))
                if let of = line.of, of != "at most" { Text(" \(of)").font(.lfBodySmall).foregroundStyle(LF.muted) }
            }
            if let share = line.share {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(LF.border)
                        Capsule().fill(share >= 1 ? LF.red : share >= 0.8 ? LF.yellow : LF.brand).frame(width: g.size.width * share)
                    }
                }
                .frame(height: 5).padding(.top, 4)
                .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// SEC-6: "120 MB of 2.0 GB".
func storageLine(used: Double, limit: Double?) -> String {
    limit.map { "\(storageSize(used)) of \(storageSize($0))" } ?? storageSize(used)
}

/// "45 min", "1 hour", "1 h 15 min".
func beforeText(_ minutes: Int) -> String {
    let h = minutes / 60, m = minutes % 60
    if h == 0 { return "\(m) min" }
    return m == 0 ? "\(h) \(h == 1 ? "hour" : "hours")" : "\(h) h \(m) min"
}

private let reminderTimes = (6...22).flatMap { h in [String(format: "%02d:00", h), String(format: "%02d:30", h)] }

/// IOS-10, as APP-21: says exactly what goes, offers a copy first, and asks for the password, as the
/// web does (USR-7). Nothing can be deleted while the copy is still coming.
struct DeleteAccountSheet: View {
    let email: String
    let server: String
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var busy = false
    @State private var problem: String?
    @State private var saving = false
    @State private var saved = false
    @State private var saveProblem: String?
    @State private var copy: URL?
    @State private var choosing = false

    private func line(_ icon: Ph, _ text: String) -> some View {
        HStack(spacing: 10) {
            PhIcon(icon, size: 18, tint: LF.muted)
            Text(text).font(.lfBodyMedium).foregroundStyle(LF.text)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Delete your account?").font(.lfTitleLarge).foregroundStyle(LF.text)
                    Text("\(email) on \(server). This can't be undone.").font(.lfBodyMedium).foregroundStyle(LF.muted)
                }
                VStack(alignment: .leading, spacing: 8) {
                    line(.matches, "Matches, match reports and tracks")
                    line(.photos, "Photos, venues and referees")
                    line(.competitions, "Competitions, templates and settings")
                    line(.watch, "Phones and watches get signed out")
                }
                VStack(alignment: .leading, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Keep a copy first").font(.lfTitleSmall).foregroundStyle(LF.text)
                        Text(saveProblem ?? (saved ? "Saved. It can be restored on any LawFive server." : "One zip of everything, which can be restored on any LawFive server."))
                            .font(.lfBodySmall).foregroundStyle(saveProblem != nil ? LF.redText : LF.muted)
                    }
                    SecondaryButton(saving ? "Getting your copy…" : saved ? "Download again" : "Download my data", icon: saved ? .check : .download, enabled: !saving && !busy, wide: true) {
                        Task { await getCopy() }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LF.surface2, in: RoundedRectangle(cornerRadius: 6))
                Field("Your password, to confirm", text: Binding(get: { password }, set: { password = $0; problem = nil }), contentType: .password, secure: true)
                if let problem {
                    Text(problem).font(.lfBodySmall).foregroundStyle(LF.redText)
                }
                VStack(spacing: 8) {
                    PrimaryButton(busy ? "Deleting…" : "Delete my account", icon: .trash, enabled: !password.isEmpty && !busy && !saving, wide: true, danger: true) {
                        Task { await delete() }
                    }
                    SecondaryButton("Keep my account", enabled: !busy && !saving, wide: true) { dismiss() }
                }
            }
            .padding(20)
        }
        .background(LF.surface)
        .keyboardDone()
        .interactiveDismissDisabled(busy || saving)
        .presentationDetents([.height(660), .large])
        .fileMover(isPresented: $choosing, file: copy) { result in
            if case .success = result { saved = true }
            saving = false
        }
    }

    private func getCopy() async {
        saving = true
        saved = false
        saveProblem = nil
        do {
            copy = try await graph.api.download("/v1/export", name: "lawfive-export.zip")
            choosing = true
        } catch {
            saveProblem = "That didn't finish. Try again with a connection."
            saving = false
        }
    }

    private func delete() async {
        busy = true
        problem = nil
        do {
            try await graph.deleteAccount(password: password)
            // IOS-10: signed out, so the sign-in page shows rather than this, now about no one.
            dismiss()
        } catch let e as ServerError {
            // The server's own words, such as being its only admin.
            problem = e.message.prefix(1).uppercased() + e.message.dropFirst()
        } catch {
            problem = "Couldn't reach the server, so nothing was deleted. Try again with a connection."
        }
        busy = false
    }
}

/// The phone's match reminders (IOS-6), in Settings → Match day.
struct RemindersSettings: View {
    @Environment(AppGraph.self) private var graph
    @Environment(\.openURL) private var openURL
    @State private var denied = false

    private func update(_ change: (inout ReminderSettings) -> Void) {
        var next = graph.reminders.settings
        change(&next)
        graph.reminders.update(next, matches: graph.records.matches ?? [], venues: graph.records.venues ?? [])
    }

    var body: some View {
        let s = graph.reminders.settings
        LfCard {
            ToggleRow("Remind me of matches", sub: "Notifications on this phone, as well as or instead of your calendar's", divider: false, isOn: Binding(get: { s.enabled }, set: { on in
                guard on else {
                    withAnimation { update { $0.enabled = false } }
                    return
                }
                Task {
                    if await graph.reminders.askToNotify() {
                        denied = false
                        withAnimation { update { $0.enabled = true } }
                    } else {
                        denied = true
                    }
                }
            }))
            if denied {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Notifications are off for LawFive in the phone's settings.").font(.lfBodySmall).foregroundStyle(LF.muted)
                    SecondaryButton("Open Settings") { if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) } }
                }
                .padding(.horizontal, 16).padding(.bottom, 14)
            }
            if s.enabled {
                VStack(alignment: .leading, spacing: 10) {
                    FieldLabel(text: "Before kickoff")
                    Flow {
                        ForEach(s.minutesBefore.sorted(), id: \.self) { m in
                            // A brand chip with Phosphor's close: tapping it removes the reminder.
                            Button { update { $0.minutesBefore.removeAll { $0 == m } } } label: {
                                HStack(spacing: 4) {
                                    Text(beforeText(m)).font(.lfLabelMedium).foregroundStyle(LF.brandStrong)
                                    PhIcon(.close, size: 12, tint: LF.brandStrong, label: "Remove")
                                }
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(LF.brandSoft, in: Capsule())
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    Choice("Add a reminder", value: Int?.none, options: stride(from: 15, through: 180, by: 15).filter { !s.minutesBefore.contains($0) }, text: { $0.map(beforeText) ?? "Choose" }) { m in
                        if let m, s.minutesBefore.count < 12 { update { $0.minutesBefore.append(m) } }
                    }
                    Choice("The day before, at", value: s.dayBefore, options: reminderTimes, allowNone: "None", text: { $0 ?? "None" }) { v in update { $0.dayBefore = v } }
                    Choice("The day of, at", value: s.dayOf, options: reminderTimes, allowNone: "None", text: { $0 ?? "None" }) { v in update { $0.dayOf = v } }
                }
                .padding(16)
            }
        }
    }
}

/// SYNC-15: Garmin Connect can be opened here, which is how Garmin's SDK shares the watches (by its `gcm-ciq`
/// scheme, listed in Info.plist's LSApplicationQueriesSchemes).
@MainActor private func garminConnectOpens() -> Bool { URL(string: "gcm-ciq://").map { UIApplication.shared.canOpenURL($0) } ?? false }

/// SYNC-15: Link a watch's row in More and Settings offers "from this phone" only where Garmin Connect is.
@MainActor func linkWatchSub() -> String { garminConnectOpens() ? "From this phone, or with a code" : "With the code on your watch" }

/// Link a watch from this phone (IOS-9, as APP-12; the paired Apple Watch, decision 4c), or with the
/// code a watch shows, looked up, then approved (SYNC-1). SYNC-15: every way ends on what next.
struct LinkWatchScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.scenePhase) private var phase
    @State private var code = ""
    @State private var device: String?
    /// SYNC-15: the app asking to link, from the code's lookup (`lawfive-garmin`, `lawfive-wear`, `lawfive-applewatch`).
    @State private var client: String?
    @State private var checked: String?
    @State private var done = false
    @State private var problem: String?
    /// SYNC-15: without Garmin Connect, the code comes first and there's no Garmin section; checked again on coming back.
    @State private var garminConnect = garminConnectOpens()

    private var clean: String { code.uppercased().filter { $0.isLetter || $0.isNumber } }

    private func next() async {
        do {
            let answer = try await graph.api.call("GET", "/v1/auth/device?user_code=\(clean)")
            guard answer?["status"]?.string == "pending" else { throw ServerError(status: 400, message: "That code has expired or been used. Get a new one on the watch.", body: nil) }
            device = answer?["device_name"]?.string
            client = answer?["client_id"]?.string
            checked = clean
        } catch let e as ServerError {
            problem = e.status == 400 || e.status == 404 ? "That code isn't right, or it has expired. Check the watch." : e.message
        } catch {
            problem = "No connection to the server."
        }
    }

    /// SYNC-15: the watch just linked, whichever way: with the code, the paired Apple Watch, or a Garmin from this phone.
    private var linked: LinkedWatch? {
        if done { return LinkedWatch(name: device, watch: TryMatch.watch(for: client, name: device)) }
        if let state = graph.appleWatch.linker?.state, state.watch == AppleWatchLink.watchId, state.step == .linked {
            return LinkedWatch(name: nil, watch: "apple")
        }
        if let bridge = graph.watch, let state = bridge.linker.state, state.step == .linked {
            let name = bridge.watches.first { $0.id == state.watch }?.name
            return LinkedWatch(name: name, watch: TryMatch.watch(for: "garmin", name: name))
        }
        return nil
    }

    /// Done: linking starts afresh, and the page goes back to where it was opened from.
    private func finish() {
        done = false
        checked = nil
        code = ""
        device = nil
        client = nil
        if graph.appleWatch.linker?.state?.step == .linked { graph.appleWatch.withdraw() }
        if graph.watch?.linker.state?.step == .linked { graph.watch?.linker.dismiss() }
        nav.pop()
    }

    private var sub: String {
        let apple = graph.appleWatch.offered
        if garminConnect {
            return apple ? "Link your Apple Watch or a Garmin from this phone, or any watch with the code it shows." : "Link a Garmin from this phone, or any watch with the code it shows."
        }
        return apple ? "Link your Apple Watch from this phone, or any watch with the code it shows." : "Link any watch with the code it shows."
    }

    var body: some View {
        Page("Link a watch", sub: sub, large: false) {
            if let linked {
                LinkedPanel(linked: linked, onDone: finish)
            } else {
                if graph.appleWatch.paired { AppleWatchSection() }
                if garminConnect { GarminWatches() }
                SectionTitle("With a code")
                codeCard
                if !garminConnect {
                    // SYNC-15: where a Garmin would link from, once Garmin Connect is on this phone.
                    Text("Have a Garmin? [Install Garmin Connect](https://apps.apple.com/app/garmin-connect/id583446403) and it links from here.")
                        .font(.lfBodyMedium).foregroundStyle(LF.muted).tint(LF.brand)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14).padding(.horizontal, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                WatchAppHint()
            }
        }
        .sensoryFeedback(.success, trigger: linked != nil) { _, now in now }
        .onChange(of: phase) { _, now in
            if now == .active { garminConnect = garminConnectOpens() }
        }
    }

    private var codeCard: some View {
        LfCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                if let checked {
                    Text(device.map { "Link this \($0)?" } ?? "Link this watch?").font(.lfTitleLarge).foregroundStyle(LF.text)
                    Text("It will download your matches and upload the ones you referee.").font(.lfBodyMedium).foregroundStyle(LF.text)
                    HStack(spacing: 8) {
                        PrimaryButton("Link") {
                            Task {
                                do {
                                    try await graph.api.call("POST", "/v1/auth/device/approve", body: .object(["userCode": .string(checked)]))
                                    done = true
                                } catch {
                                    problem = error.localizedDescription
                                }
                            }
                        }
                        SecondaryButton("Cancel") {
                            Task {
                                _ = try? await graph.api.call("POST", "/v1/auth/device/deny", body: .object(["userCode": .string(checked)]))
                                self.checked = nil
                                code = ""
                            }
                        }
                    }
                } else {
                    // The menus each watch really has: Garmin's Link account asks for the server, then Get a code.
                    Text("On your watch, open LawFive and go to Settings → Account → Link account. On a Garmin, then choose Get a code. The watch shows an eight-character code.")
                        .font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                    Field("Code", text: Binding(get: { code }, set: {
                        code = String($0.uppercased().prefix(9))
                        problem = nil
                    }), placeholder: "XXXX-XXXX", capitalization: .characters, mono: true)
                    PrimaryButton("Next", enabled: clean.count >= 8) { Task { await next() } }
                }
                if let problem { Text(problem).font(.lfBodyMedium).foregroundStyle(LF.redText) }
            }
        }
    }
}

/// SYNC-15: a watch just linked: its name if known, and which of Try a match's watches it is (DEMO-9).
struct LinkedWatch: Equatable {
    /// As the server or Garmin Connect named it ("Galaxy Watch4", "Venu 2"); nil when it didn't say.
    var name: String?
    /// `garmin`, `venu`, `wearos` or `apple` (TryMatch.watches).
    var watch: String

    var heading: String { name.map { "\($0) is linked" } ?? (watch == "apple" ? "Your Apple Watch is linked" : "Your watch is linked") }
    var called: String { name ?? (watch == "apple" ? "Apple Watch" : "watch") }

    /// APP-7: only a Garmin syncs through the phone; the others sync on their own.
    var line: String {
        watch == "garmin" || watch == "venu"
            ? "It's downloading your next matches. It syncs through your phone when it's nearby, even with no signal at the field."
            : "It's downloading your next matches. It syncs on its own whenever it's online, so a match you finish with no signal goes up once it's back."
    }
}

/// SYNC-15: what next, once a watch is linked: the tick, what the watch does now, then the account's match screen
/// with Set it up, Try a match on that watch with it (DEMO-9, in the browser view), and Done.
private struct LinkedPanel: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    let linked: LinkedWatch
    let onDone: () -> Void
    @State private var trying: BrowserPage?

    var body: some View {
        let s = graph.records.effectiveSettings
        let screen = ScreenSetup(s.watchScreen)
        VStack(spacing: 0) {
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    ZStack {
                        Circle().fill(LF.brandSoft)
                        PhIcon(.check, size: 32, tint: LF.brandStrong)
                    }
                    .frame(width: 64, height: 64)
                    Text(linked.heading).font(.lfHeadlineSmall).foregroundStyle(LF.text).multilineTextAlignment(.center)
                        .accessibilityAddTraits(.isHeader)
                    Text(linked.line).font(.lfBodyMedium).foregroundStyle(LF.muted).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity)
            }
            SectionTitle("Next", small: true)
            LfCard {
                ListRow(title: "Your match screen", sub: screenLine(screen), divider: false, leading: { Avatar(icon: .watch) }, trailing: {
                    SecondaryButton("Set it up") { nav.push(.matchScreen) }
                })
                ListRow(title: "Try a match on your \(linked.called)", sub: "See how a match runs on it, with your match screen. Nothing is saved.", leading: { Avatar(icon: .play) }, trailing: {
                    SecondaryButton("Try it") {
                        trying = TryMatch.url(watch: linked.watch, screen: screen, teamSwipes: s.teamSwipes ?? "upDown").map(BrowserPage.init)
                    }
                })
            }
            PrimaryButton("Done", wide: true, action: onDone).padding(.top, 20)
        }
        .browser($trying)
    }
}

/// Where to get LawFive for a watch, for someone who hasn't got it yet (the same words on the website and Android).
private struct WatchAppHint: View {
    var body: some View {
        // A link in the words, so it wraps on a narrow phone; it opens in the browser.
        Text("Don't have LawFive on your watch yet? [How to get it](https://lawfive.dev/apps/watches/)")
            .font(.lfBodyMedium).foregroundStyle(LF.muted).tint(LF.brand)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 14).padding(.horizontal, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Decision 4c: the paired Apple Watch, linked from this phone over WatchConnectivity, when LawFive is on
/// it; linking with a code below stays for when this doesn't reach it.
private struct AppleWatchSection: View {
    @Environment(AppGraph.self) private var graph

    var body: some View {
        let link = graph.appleWatch!
        let linker = link.linker!
        SectionTitle("Apple Watch, from this phone")
        LfCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Avatar(icon: .watch)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Your Apple Watch").font(.lfTitleMedium).foregroundStyle(LF.text)
                        Text(link.installed ? "LawFive is on it" : "LawFive isn't on it yet").font(.lfBodySmall).foregroundStyle(LF.muted)
                    }
                    Spacer(minLength: 0)
                }
                if !link.installed {
                    Text("Install it from the Watch app on this phone, under Available Apps, then come back here.")
                        .font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                } else if let state = linker.state, state.watch == AppleWatchLink.watchId {
                    LinkProgress(state: state, name: "your Apple Watch", offering: "Open LawFive on your Apple Watch, and choose Link when it asks.",
                                 onCancel: { link.withdraw() }, onAgain: { linker.offer(AppleWatchLink.watchId) })
                } else {
                    Text("It's linked to your account here, with no code to type. Open LawFive on the watch first.")
                        .font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                    PrimaryButton("Link your Apple Watch", icon: .watch, wide: true) { linker.offer(AppleWatchLink.watchId) }
                }
            }
        }
    }
}

/// How linking a watch from this phone is going: waiting for the watch, linked, or what went wrong, with what to do next.
private struct LinkProgress: View {
    let state: LinkState
    /// The watch as the words name it: "Venu 2", "your Apple Watch".
    let name: String
    /// While the offer waits: what to do on the watch.
    let offering: String
    let onCancel: () -> Void
    let onAgain: () -> Void

    var body: some View {
        switch state.step {
        case .offering, .linking:
            VStack(alignment: .leading, spacing: 6) {
                Text(state.step == .offering ? offering : "Linking \(name)…").font(.lfBodyMedium).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    LoadingPitch(inline: true)
                    Text("Waiting for your watch").font(.lfBodySmall).foregroundStyle(LF.muted)
                    Spacer(minLength: 0)
                    SecondaryButton("Cancel", action: onCancel)
                }
            }
            .padding(12)
            .background(LF.surface2, in: RoundedRectangle(cornerRadius: 6))
        case .linked:
            // SYNC-15: Link a watch shows what next in place of the page (LinkedPanel).
            EmptyView()
        case .declined, .busy, .noAnswer, .failed:
            VStack(alignment: .leading, spacing: 8) {
                Text(state.message ?? (state.step == .declined ? "The watch said no." : state.step == .busy ? "The watch is in a match. Try again after it." : "The watch didn't answer. Open LawFive on it, and try again."))
                    .font(.lfBodyMedium).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    PrimaryButton("Try again", action: onAgain)
                    SecondaryButton("Cancel", action: onCancel)
                }
            }
        }
    }
}

/// IOS-9, as APP-12: the Garmin watches shared with this app, each with Link and how it's going.
private struct GarminWatches: View {
    @Environment(AppGraph.self) private var graph

    var body: some View {
        let bridge = graph.watch!
        SectionTitle("Garmin, from this phone")
        LfCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                if bridge.watches.isEmpty {
                    Text("Garmin Connect shares your Garmin watches with LawFive. It opens, you choose them, and it comes back here. For \(graph.appleWatch.offered ? "a Wear OS watch" : "an Apple Watch or Wear OS watch"), use a code below.")
                        .font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                }
                ForEach(bridge.watches) { w in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 10) {
                            Avatar(icon: .watch)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(w.name).font(.lfTitleMedium).foregroundStyle(LF.text)
                                Text(!w.connected ? "Not connected right now" : w.hasLawFive == false ? "LawFive isn't on this watch yet" : "Connected")
                                    .font(.lfBodySmall).foregroundStyle(LF.muted)
                            }
                            Spacer(minLength: 0)
                            if bridge.linker.state?.watch != w.id {
                                SecondaryButton("Link", enabled: w.connected && w.hasLawFive != false) { bridge.linker.offer(w.id) }
                            }
                        }
                        if let state = bridge.linker.state, state.watch == w.id {
                            LinkProgress(state: state, name: w.name, offering: "Open LawFive on \(w.name), and press Start when it asks to link.",
                                         onCancel: { bridge.linker.dismiss() }, onAgain: { bridge.linker.offer(state.watch) })
                        }
                    }
                }
                if bridge.needsGarminConnect {
                    Text("This needs the Garmin Connect app, from the App Store.").font(.lfBodyMedium).foregroundStyle(LF.redText)
                }
                SecondaryButton(bridge.watches.isEmpty ? "Choose watches in Garmin Connect" : "Change watches", wide: true) { bridge.chooseWatches() }
            }
        }
    }
}
