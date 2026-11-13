import SwiftUI
import UIKit

// Settings (IOS-4, as APP-4), in the groups the website has (WEB-33, the owner's choice, 2026-11-09),
// as Android's Settings.kt: You, Your watch, Match day, New matches, Units and money, Fitness, Your
// data and About; then, apart at the end, erasing this phone's copy. What only the website does
// (assignor calendars, API keys, webhooks, the server's own settings) stays there.

private let schemes: [(String, String)] = [("ifab", "Laws of the Game"), ("ussf", "United States"), ("fa", "England")]

/// CAL-3: when the calendar feed's events start, as the website offers it: at kickoff, or every 15 minutes up to 3 hours before.
private let arriveOptions = [0] + Array(stride(from: 15, through: 180, by: 15))

/// lawfive.dev's Watches page: which watches, and how to get LawFive on one.
let watchesURL = URL(string: "https://lawfive.dev/apps/watches/")!

private struct RowArrow: View {
    var icon: Ph = .next
    var body: some View { PhIcon(icon, size: 18, tint: LF.muted) }
}

/// Which of the account's details is being changed.
private enum AccountEdit: String, Identifiable {
    case name, email, password
    var id: String { rawValue }
}

/// A time as the website's formatWhen: "8:12 PM", "yesterday, 8:12 PM", "tomorrow, 8:12 PM" or "Sat, Nov 7, 8:12 PM".
func whenText(_ t: Date, zone: TimeZone = .current, now: Date = AppClock.now) -> String {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    let days = c.dateComponents([.day], from: c.startOfDay(for: now), to: c.startOfDay(for: t)).day ?? 0
    let time = formatTime(t, zone: zone)
    switch days {
    case 0: return time
    case -1: return "yesterday, \(time)"
    case 1: return "tomorrow, \(time)"
    default: return "\(formatShortDay(t, zone: zone)), \(time)"
    }
}

struct SettingsScreen: View {
    /// A group to open the page at (Get ready's Change for the units, WEB-32).
    var at: String?
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.openURL) private var openURL
    @State private var calendar: String?
    @State private var calendarKnown = false
    /// GET /v1/devices; nil before it answers (offline).
    @State private var devices: [JSONValue]?
    @Environment(\.scenePhase) private var phase
    /// WEB-33: every phone and browser shown, not just the latest; not kept between visits.
    @State private var allSessions = false
    @State private var meta: ServerMeta?
    @State private var erasing = false
    @State private var deleting = false
    @State private var editing: AccountEdit?
    /// SEC-7: which sign-out everywhere else is being confirmed.
    @State private var signingOutBrowsers = false
    @State private var unlinkingAll = false
    /// SEC-7: the one device whose unlink (or a browser's sign-out) is being confirmed.
    @State private var unlinking: JSONValue?
    @State private var storage: String?
    @State private var plan: AccountPlan?
    @State private var copied = false
    @State private var currency = ""
    @State private var canceling = false
    @State private var cancelFailed = false
    /// DEMO-9: Try a match, open in the browser view.
    @State private var trying: BrowserPage?

    /// A new account has no settings record yet: it's shown the defaults, and the first change makes it.
    private func save(_ change: @escaping (inout UserSettings) -> Void) {
        Task { await graph.records.saveSettings(change) }
    }

    var body: some View {
        let session = graph.session
        let s = graph.records.effectiveSettings
        let watches = devices?.filter { watchKinds.contains($0["kind"]?.string ?? "") }
        let others = devices?.filter { !watchKinds.contains($0["kind"]?.string ?? "") }
        Page("Settings", large: false) {
            if let at { JumpTo(id: at) }
            // USR-10, USR-9, USR-7, PLAN-9: who you are, and where you're signed in.
            SectionTitle("You").id("you")
            LfCard {
                ListRow(title: "Name", sub: session.name, divider: false, action: { editing = .name }, leading: { Avatar(text: initials(session.name ?? "?")) }, trailing: { PhIcon(.edit, size: 18, tint: LF.muted, label: "Change your name") })
                ListRow(title: "Email", sub: session.email, action: { editing = .email }, leading: { Avatar(icon: .mail) }, trailing: { PhIcon(.edit, size: 18, tint: LF.muted, label: "Change your email") })
                // USR-9: a new address waiting for its link, in amber, with Cancel.
                if let waiting = session.pendingEmail { pendingEmail(waiting, until: instantOf(session.pendingEmailUntil), current: session.email ?? "") }
                ListRow(title: "Password", sub: "Watches and devices already signed in stay signed in.", action: { editing = .password }, leading: { Avatar(icon: .eye) }, trailing: { PhIcon(.edit, size: 18, tint: LF.muted, label: "Change your password") })
                // PLAN-9: where the account is; a plan ends at midnight there. Any zone can be chosen on the website.
                let here = TimeZone.current.identifier
                let zone = s.timeZone ?? here
                ListRow(title: "Time zone", sub: zone.replacingOccurrences(of: "_", with: " ") + (zone == here ? " · set by your phone" : " · not this phone's"), leading: { Avatar(icon: .clock) }, trailing: { EmptyView() })
                Text("For games from your assignor's calendar that don't say their time zone, and when a plan ends (at midnight here). Each match keeps its own.")
                    .font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // Under the row's words, past its icon (16 + 38 + 14).
                    .padding(.leading, 68).padding(.trailing, 16).padding(.bottom, 14).padding(.top, -6)
                if zone != here {
                    // The zone's city, so the button's words fit a phone's width.
                    SecondaryButton("Use this phone's: \(GetReady.zoneName(here).replacingOccurrences(of: " time", with: ""))", wide: true) { save { $0.timeZone = here } }
                        .padding(.horizontal, 16).padding(.bottom, 14)
                }
            }
            SectionTitle("Where you're signed in", small: true)
            LfCard {
                if let others {
                    // WEB-33: this phone first, then the most recently active; the latest five, with Show all for the rest.
                    let sessions = others.sorted { a, b in
                        let (ac, bc) = (a["current"]?.bool == true, b["current"]?.bool == true)
                        return ac != bc ? ac : (a["lastActiveAt"]?.string ?? "") > (b["lastActiveAt"]?.string ?? "")
                    }
                    let folds = sessions.count > latestSessions
                    ForEach(Array((folds && !allSessions ? Array(sessions.prefix(latestSessions)) : sessions).enumerated()), id: \.offset) { i, d in deviceRow(d, divider: i > 0) }
                    if folds {
                        ListRow(title: allSessions ? "Show fewer" : "Show all (\(sessions.count))", action: { withAnimation(.snappy(duration: 0.25)) { allSessions.toggle() } }, leading: { EmptyView() }, trailing: {
                            PhIcon(.chevron, size: 18, tint: LF.muted).rotationEffect(.degrees(allSessions ? 180 : 0))
                        })
                        .accessibilityValue(allSessions ? "Expanded" : "Collapsed")
                    }
                } else {
                    Text("Shown when there's signal.").font(.lfBodyMedium).foregroundStyle(LF.muted).padding(16).frame(maxWidth: .infinity, alignment: .leading)
                }
                if let devices, devices.count > 1 {
                    if devices.contains(where: { $0["kind"]?.string == "browser" && $0["current"]?.bool != true }) {
                        ListRow(title: "Sign out other browsers", sub: "Watches and phones stay linked", action: { signingOutBrowsers = true },
                                leading: { Avatar(icon: .globe) }, trailing: { EmptyView() })
                    }
                    ListRow(title: "Unlink everything else", sub: "If you've lost a device, or think someone else is signed in", action: { unlinkingAll = true },
                            leading: { Avatar(icon: .out, background: LF.surface2, foreground: LF.red) }, trailing: { EmptyView() })
                }
            }

            // The watch: linked ones and linking another, the match screen, team swipes.
            SectionTitle("Your watch").id("watch")
            VStack(spacing: 12) {
                LfCard {
                    if let watches {
                        if watches.isEmpty {
                            Text("No watch is linked yet.").font(.lfBodyMedium).foregroundStyle(LF.muted).padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach(Array(watches.enumerated()), id: \.offset) { i, d in deviceRow(d, divider: i > 0) }
                    } else {
                        Text("Your linked watches show when there's signal.").font(.lfBodyMedium).foregroundStyle(LF.muted).padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ListRow(title: "Link a watch", sub: linkWatchSub(), action: { nav.push(.link) }, leading: { Avatar(icon: .plus) }, trailing: { RowArrow() })
                    ListRow(title: "How to get LawFive on your watch", sub: "Which watches, and how to put it on yours", action: { openURL(watchesURL) }, leading: { Avatar(icon: .help) }, trailing: { RowArrow(icon: .link) })
                }
                // UI-24, UI-27: the latest change wins, here, on the website or on a watch.
                LfCard {
                    MatchScreenSummary(saved: s.watchScreen).padding(16)
                    Hairline()
                    // DEMO-9: lawfive.app's Try a match in the app's browser view, with this screen, the team swipes and the most
                    // recently active linked watch (GET /v1/devices comes most recent first; a five-button Garmin with none).
                    ListRow(title: "Try a match", sub: "On lawfive.app: your watch with this screen. Nothing is saved.", divider: false, action: {
                        let latest = watches?.first
                        let watch = TryMatch.watch(for: latest?["kind"]?.string, name: latest?["name"]?.string)
                        trying = TryMatch.url(watch: watch, screen: ScreenSetup(s.watchScreen), teamSwipes: s.teamSwipes ?? "upDown").map(BrowserPage.init)
                    }, leading: { Avatar(icon: .play) }, trailing: { RowArrow(icon: .link) })
                }
                // INP-10: Garmin and Apple watches; a Wear OS watch always swipes sideways, so it's left out with only those.
                if watches?.isEmpty != false || watches?.contains(where: { $0["kind"]?.string != "wearos" }) == true {
                    LfCard(padding: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Choice("Team swipes", value: s.teamSwipes ?? "upDown", options: ["upDown", "sideways"], text: { ["upDown": "Up and down", "sideways": "Sideways"][$0 ?? "upDown"] ?? "" }) { v in save { $0.teamSwipes = v ?? "upDown" } }
                            hint("On Garmin and Apple watches, how a swipe opens a team's controls: down for home and up for away, or right for home and left for away. Wear OS watches always swipe sideways.")
                        }
                    }
                }
            }

            // Getting to the ground on time: this phone's reminders, the calendar feed, directions.
            SectionTitle("Match day").id("match-day")
            VStack(spacing: 12) {
                RemindersSettings()
                LfCard {
                    if let calendar {
                        ListRow(title: "Your calendar feed", sub: calendar, divider: false, leading: { Avatar(icon: .calendar) }, trailing: { EmptyView() })
                        Flow(spacing: 8) {
                            SecondaryButton(copied ? "Copied" : "Copy", icon: copied ? .check : .copy) {
                                UIPasteboard.general.string = calendar
                                copied = true
                            }
                            // The system's own Subscribe to Calendar.
                            SecondaryButton("Add to Calendar", icon: .calendar) {
                                if let url = URL(string: calendar.replacingOccurrences(of: "^https?://", with: "webcal://", options: .regularExpression)) { openURL(url) }
                            }
                        }
                        .padding(.horizontal, 16).padding(.bottom, 14)
                        .sensoryFeedback(.success, trigger: copied)
                        // CAL-3: the feed's own times, once there's a feed to have them.
                        Hairline()
                        VStack(alignment: .leading, spacing: 8) {
                            Choice("Events start", value: s.calendarArriveMin ?? 30, options: arriveOptions, text: { m in (m ?? 0) == 0 ? "At kickoff" : "\(beforeText(m!)) before" }) { m in save { $0.calendarArriveMin = m ?? 30 } }
                            hint("When your calendar shows you as busy from, for travel and warming up. The description gives the kickoff.")
                        }
                        .padding(16)
                    } else {
                        ListRow(title: "Your matches in your calendar", sub: calendarKnown ? "Turn on the calendar feed to subscribe in Calendar or another app." : "Shown when there's signal.", divider: false, leading: { Avatar(icon: .calendar) }, trailing: { EmptyView() })
                        if calendarKnown {
                            PrimaryButton("Turn on") {
                                Task { calendar = try? await graph.api.call("POST", "/v1/calendar", body: .object([:]))?["url"]?.string }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16).padding(.bottom, 14)
                        }
                    }
                }
                // WEB-14: where Directions open, for the account, so the website and phones agree.
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Choice("Directions open in", value: s.mapsApp ?? "auto", options: ["auto", "google", "apple"], text: { ["auto": "Automatic (Apple Maps)", "google": "Google Maps", "apple": "Apple Maps"][$0 ?? "auto"] ?? "" }) { v in save { $0.mapsApp = v ?? "auto" } }
                        hint("On the website, the Android app and the iPhone app. Automatic is Apple Maps in the iPhone app and Google Maps everywhere else.")
                    }
                }
            }

            // SET-17: what a new match on the form starts with; a competition can have its own codes and template.
            SectionTitle("New matches").id("new-matches")
            LfCard(padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Choice("Usual role", value: s.usualRole ?? "referee", options: roleOrder, text: { roleNamesInFull[$0 ?? "referee"] ?? "Referee" }) { r in save { $0.usualRole = r ?? "referee" } }
                    hint("Your role on a new match. Change it on the match when it's different.")
                    UsualFormatChoice(usual: s.usualFormat, templates: graph.records.templates ?? []) { u in save { $0.usualFormat = u } }
                    hint((s.usualFormat.map { describeFormat($0.format) } ?? "Not chosen yet: \(describeFormat(schemaDefaultFormat)), 11 a side")
                         + ". A new match starts with it, unless its competition has a template; saving a new match makes its format the usual one.")
                    Choice("Misconduct codes", value: s.misconductScheme, options: schemes.map(\.0), text: { id in schemes.first { $0.0 == id }?.1 ?? id ?? "" }) { v in save { $0.misconductScheme = v ?? "ifab" } }
                    hint("The codes for cautions and send-offs. A competition can use a different set.")
                }
            }

            SectionTitle("Units and money").id("units")
            LfCard {
                VStack(alignment: .leading, spacing: 10) {
                    Choice("Distance", value: s.distanceUnit, options: ["km", "mi"], text: { $0 == "mi" ? "Miles" : "Kilometers" }) { v in save { $0.distanceUnit = v ?? "km" } }
                    hint("The distance you cover in matches; also rain (inches with miles) and wind.")
                    Choice("Temperature", value: s.temperatureUnit, options: ["c", "f"], text: { $0 == "f" ? "°F" : "°C" }) { v in save { $0.temperatureUnit = v ?? "c" } }
                    hint("Match-day forecasts.")
                    Field("Currency", text: Binding(get: { currency }, set: { v in
                        currency = String(v.uppercased().prefix(3))
                        if currency.count == 3, currency.allSatisfy(\.isLetter) { save { $0.currency = currency } }
                    }), capitalization: .characters, supporting: "For new match fees. Each fee keeps its own currency. A three-letter code: USD, GBP, EUR")
                }
                .padding(16)
                .onAppear { currency = s.currency }
                // Get ready's "Your units and time zone" lands here: the zone itself is under You.
                Hairline()
                JumpRow(title: "Time zone", sub: (s.timeZone ?? TimeZone.current.identifier).replacingOccurrences(of: "_", with: " ") + ", under You", to: "you")
            }

            SectionTitle("Fitness").id("fitness")
            LfCard {
                NumberField("Maximum heart rate", value: s.maxHeartRate, placeholder: "Not set", supporting: "For the heart-rate zones on match pages. Your highest reading from a hard effort is best; 220 minus your age is a rough guide.") { v in
                    if v == nil || (100...240).contains(v!) { save { $0.maxHeartRate = v } }
                }
                .padding(16)
                SprintSpeedField(kph: s.sprintKph, unit: s.distanceUnit ?? "km") { kph in save { $0.sprintKph = kph } }
                    .padding(.horizontal, 16).padding(.bottom, 16)
            }

            SectionTitle("Your data").id("data")
            LfCard { YourData(plan: plan, storage: storage) { deleting = true } }

            // VER-2: this app's version and the server's.
            SectionTitle("About").id("about")
            LfCard {
                ListRow(title: "LawFive for iPhone", sub: "\(AppInfo.version) · \(AppInfo.commit)", divider: false, leading: { Avatar(icon: .info) }, trailing: { EmptyView() })
                ListRow(title: "Server", sub: hostOf(session.server) + " · " + (meta.map { m in m.version.map { "LawFive \($0)" + (m.commit.flatMap { $0 == "unknown" ? nil : " · \($0)" } ?? "") } ?? "version unknown" } ?? "its version shows when there's signal"),
                        leading: { Avatar(icon: .globe) }, trailing: { EmptyView() })
                ListRow(title: "Help", sub: "Questions, and how to reach us", action: { openURL(helpURL) }, leading: { Avatar(icon: .help) }, trailing: { RowArrow(icon: .link) })
                // SITE-5: the hosted service's; a self-hosted server has its own, or none.
                if session.server.hasSuffix("lawfive.app") {
                    ListRow(title: "Privacy and terms", sub: "What the hosted service keeps, and the terms for using it", action: { if let url = URL(string: "https://lawfive.app/privacy.html") { openURL(url) } },
                            leading: { Avatar(icon: .report) }, trailing: { RowArrow(icon: .link) })
                }
                ListRow(title: "Data and licenses", sub: "The weather, maps and address search, and what LawFive is built with", action: { nav.push(.licenses) }, leading: { Avatar(icon: .note) }, trailing: { RowArrow() })
            }

            // IOS-5, as APP-11: apart at the end, as it's this phone's alone.
            LfCard {
                ListRow(title: "Erase this phone's LawFive data", sub: "Only this phone: signs out and removes everything LawFive keeps here", divider: false, action: { erasing = true },
                        leading: { Avatar(icon: .trash, background: LF.surface2, foreground: LF.red) }, trailing: { EmptyView() })
            }
            .padding(.top, 36)
        }
        .keyboardDone()
        .browser($trying)
        // On opening and on coming back to it (from Link a watch, say), and on a pull with a sync first (IOS-3).
        .task { await load() }
        .refreshable { await graph.pullToSync(); await load() }
        // SEC-7, SYNC-6: the devices again when the app comes back, as a watch may have been unlinked on itself meanwhile.
        .onChange(of: phase) { _, now in if now == .active { Task { await loadDevices() } } }
        .confirm("Sign out your other browsers?", isPresented: $signingOutBrowsers, message: "Watches and phones stay linked.", action: "Sign out") {
            Task { await signOutOthers("browsers") }
        }
        .confirm(unlinkTitle, isPresented: Binding(get: { unlinking != nil }, set: { if !$0 { unlinking = nil } }), message: unlinkMessage,
                 action: unlinking?["kind"]?.string == "browser" ? "Sign out" : "Unlink") {
            if let id = unlinking?["id"]?.string { Task { await unlink(id) } }
        }
        .confirm("Unlink everything else?", isPresented: $unlinkingAll, message: "Watches stop syncing and other phones sign out until you link them again.", action: "Unlink everything") {
            Task { await signOutOthers("all") }
        }
        .sheet(isPresented: $deleting) {
            DeleteAccountSheet(email: session.email ?? "", server: hostOf(session.server))
                .environment(graph)
                .tint(LF.brand)
        }
        .sheet(item: $editing) { edit in
            Group {
                switch edit {
                case .name: NameSheet(current: session.name ?? "")
                case .email: EmailSheet(current: session.pendingEmail ?? session.email ?? "")
                case .password: PasswordSheet()
                }
            }
            .environment(graph)
            .tint(LF.brand)
        }
        .confirm("Erase LawFive on this phone?", isPresented: $erasing, message: "Signs out, and removes the account's copy, changes not sent yet, reminders and settings from this phone. Your account and what's on the server stay.", action: "Erase") {
            Task { await graph.eraseThisPhone() }
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
    }

    private func hostOf(_ server: String) -> String {
        var s = server.replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    /// USR-9: "Check {new} for a link", until when, and Cancel, on amber.
    private func pendingEmail(_ waiting: String, until: Date?, current: String) -> some View {
        VStack(spacing: 0) {
            Hairline()
            HStack(alignment: .center, spacing: 12) {
                PhIcon(.mail, size: 20, tint: LF.amberText)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Check \(waiting) for a link").font(.barlow(16, .bold, relativeTo: .headline)).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                    Text("Your email changes when you open it" + (until.map { ", until \(whenText($0))" } ?? "") + ". Until then you sign in with \(current)." + (cancelFailed ? " Couldn't cancel; try again." : ""))
                        .font(.lfBodySmall).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                SecondaryButton(canceling ? "Canceling…" : "Cancel", enabled: !canceling) {
                    canceling = true
                    cancelFailed = false
                    Task {
                        do { try await graph.cancelEmailChange() } catch { cancelFailed = true }
                        canceling = false
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(LF.amberSoft)
        }
    }

    /// WEB-33: how many phones and browsers show before Show all.
    private let latestSessions = 5

    private var unlinkTitle: String {
        let name = unlinking?["name"]?.string ?? ""
        return unlinking?["kind"]?.string == "browser" ? "Sign out \(name)?" : "Unlink \(name)?"
    }

    private var unlinkMessage: String {
        watchKinds.contains(unlinking?["kind"]?.string ?? "") ? "It stops syncing until you link it again." : "It's signed out until you sign in on it again."
    }

    /// A device the account is signed in on (GET /v1/devices): what it is, when it was last active, and its app's version;
    /// any but this phone with Unlink (Sign out for a browser), as on the website (SEC-7).
    private func deviceRow(_ d: JSONValue, divider: Bool) -> some View {
        let kind = d["kind"]?.string
        let sub = [
            d["current"]?.bool == true ? "This phone" : nil,
            d["lastActiveAt"]?.string.flatMap { instantOf($0) }.map { "active \(timeAgo($0))" },
            d["firmware"]?.string.map { kind == "android" ? "Android \($0)" : kind == "ios" ? "iOS \($0)" : "firmware \($0)" },
            // VER-3: the LawFive app's version on it.
            d["appVersion"]?.string.map { "LawFive \($0)" },
            // SEC-13: a watch's link, which only syncs matches.
            d["watchOnly"]?.bool == true ? "syncs matches only" : nil,
        ].compactMap { $0 }.joined(separator: " · ")
        return ListRow(title: d["name"]?.string ?? "", sub: sub, divider: divider,
                       leading: { Avatar(icon: kind == "browser" ? .globe : kind == "android" || kind == "ios" ? .phone : .watch) }, trailing: {
                           if d["current"]?.bool != true {
                               SecondaryButton(kind == "browser" ? "Sign out" : "Unlink") { unlinking = d }
                           }
                       })
    }

    private func loadDevices() async {
        if let list = try? await graph.api.call("GET", "/v1/devices")?["devices"]?.array { devices = list }
    }

    /// What Settings fetches from the server itself; what's shown stays without signal.
    private func load() async {
        // USR-9: whether a new email waits for its link.
        await graph.refreshAccount()
        await loadDevices()
        calendar = try? await graph.api.call("GET", "/v1/calendar")?["url"]?.string
        calendarKnown = true
        meta = await graph.meta() ?? meta
        if let s = try? await graph.api.call("GET", "/v1/account/storage") { storage = storageLine(used: s["usedBytes"]?.double ?? 0, limit: s["limitBytes"]?.double) }
        // PLAN-6: servers from before plans have none, and show storage alone.
        if let p = try? await graph.api.call("GET", "/v1/account/plan")?.decoded(as: AccountPlan.self) { plan = p }
    }

    /// SEC-7: one device.
    private func unlink(_ id: String) async {
        _ = try? await graph.api.call("DELETE", "/v1/devices/\(id)")
        devices = (try? await graph.api.call("GET", "/v1/devices")?["devices"]?.array) ?? devices
    }

    /// SEC-7.
    private func signOutOthers(_ scope: String) async {
        _ = try? await graph.api.call("POST", "/v1/devices/sign-out-others", body: .object(["scope": .string(scope)]))
        devices = (try? await graph.api.call("GET", "/v1/devices")?["devices"]?.array) ?? devices
    }
}

/// Opens the page at a group (Get ready's Change), once the page has laid out.
private struct JumpTo: View {
    let id: String
    @Environment(\.pageScroll) private var scroll

    var body: some View {
        Color.clear.frame(height: 0)
            .task {
                try? await Task.sleep(for: .milliseconds(350))
                withAnimation(.snappy(duration: 0.3)) { scroll?.scrollTo(id, anchor: .top) }
            }
    }
}

/// A row that scrolls the page to another group (Units and money's Time zone, under You).
private struct JumpRow: View {
    let title: String
    let sub: String
    let to: String
    @Environment(\.pageScroll) private var scroll

    var body: some View {
        ListRow(title: title, sub: sub, divider: false, action: { withAnimation(.snappy(duration: 0.3)) { scroll?.scrollTo(to, anchor: .top) } },
                leading: { EmptyView() }, trailing: { PhIcon(.chevron, size: 18, tint: LF.muted, label: "Go to You").rotationEffect(.degrees(180)) })
    }
}

/// SET-17: the usual format, as the website's: As last saved (while it's none of the others), the starter formats, then the templates.
private struct UsualFormatChoice: View {
    let usual: UsualFormat?
    let templates: [MatchTemplate]
    let onChange: (UsualFormat) -> Void

    var body: some View {
        let choice = usualFormatChoice(usual, templates: templates)
        let own = templates.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        let options = (choice.id == "last" ? ["last"] : []) + starterFormats.map { "starter:\($0.id)" }
        Choice("Usual format", value: choice.id, options: options, groups: [(heading: "Your templates", options: own.map { "template:\($0.id)" })], text: { id in
            switch id {
            case "unset", nil: return "Choose a format…"
            case "last": return choice.name
            default:
                if let s = starterFormats.first(where: { "starter:\($0.id)" == id }) { return s.name }
                return own.first { "template:\($0.id)" == id }?.name ?? choice.name
            }
        }) { id in
            guard let id, id != choice.id, id != "last" else { return }
            if let s = starterFormats.first(where: { "starter:\($0.id)" == id }) {
                onChange(UsualFormat(format: s.format, starterId: s.id, changedAt: nowString()))
            } else if let t = own.first(where: { "template:\($0.id)" == id }) {
                onChange(UsualFormat(format: t.format, templateId: t.id, changedAt: nowString()))
            }
        }
    }
}

/// Your data: a copy of everything (the zip the website gives, which any LawFive server can restore), importing matches, and what the plan allows.
private struct YourData: View {
    let plan: AccountPlan?
    let storage: String?
    let onDelete: () -> Void
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.openURL) private var openURL
    @State private var saving = false
    @State private var saved = false
    @State private var problem: String?
    @State private var copy: URL?
    @State private var choosing = false

    var body: some View {
        ListRow(title: saving ? "Getting your copy…" : "Download everything",
                sub: problem ?? (saved ? "Saved. It can be restored on any LawFive server." : "Everything in your account as one zip: a backup, or for moving to another server"),
                divider: false, action: { if !saving { Task { await getCopy() } } }, leading: { Avatar(icon: saved ? .check : .download) }, trailing: { EmptyView() })
            .fileMover(isPresented: $choosing, file: copy) { result in
                if case .success = result { saved = true }
                saving = false
            }
        // On the website, which reads the zip: the phone has no file to give it more than once.
        ListRow(title: "Restore from an export", sub: "On the website: adds what an export has that this account doesn't", action: {
            if let url = websiteURL(server: graph.session.server, path: "/settings#data") { openURL(url) }
        }, leading: { Avatar(icon: .upload) }, trailing: { RowArrow(icon: .link) })
        ListRow(title: "Import matches", sub: "From a spreadsheet or JSON file", action: { nav.push(.importMatches) }, leading: { Avatar(icon: .matches) }, trailing: { RowArrow() })
        if let plan {
            PlanRows(plan: plan)
        } else if let storage {
            ListRow(title: "Photos and tracks", sub: storage, leading: { Avatar(icon: .photos) }, trailing: { EmptyView() })
        }
        // IOS-10, as APP-21.
        ListRow(title: "Delete your account", sub: "Your matches, venues, referees, tracks and everything else, for good.", action: onDelete,
                leading: { Avatar(icon: .trash, background: LF.surface2, foreground: LF.red) }, trailing: { EmptyView() })
    }

    private func getCopy() async {
        saving = true
        saved = false
        problem = nil
        do {
            copy = try await graph.api.download("/v1/export", name: "lawfive-export.zip")
            choosing = true
        } catch {
            problem = "That didn't finish. Try again with a connection."
            saving = false
        }
    }
}

/// A sheet for the account (a chalk panel, the title in black italic capitals), with Cancel and its own button at its foot.
private struct AccountSheet<Content: View>: View {
    let title: String
    var text: String?
    let busy: Bool
    @ViewBuilder let content: () -> Content
    @State private var height: CGFloat = 360

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(title.uppercased()).font(.display(26, relativeTo: .title2)).foregroundStyle(LF.text)
                if let text { Text(text).font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true) }
                content()
            }
            .padding(20)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        }
        .background(LF.surface)
        .ground(.panel)
        .keyboardDone()
        .interactiveDismissDisabled(busy)
        .fittedDetents(height)
    }
}

/// Cancel and the sheet's own button, at its foot.
private struct SheetButtons: View {
    let text: String
    var enabled = true
    let cancel: (() -> Void)?
    let action: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Spacer(minLength: 0)
            if let cancel { SecondaryButton("Cancel", action: cancel) }
            PrimaryButton(text, enabled: enabled, action: action)
        }
        .padding(.top, 4)
    }
}

/// USR-10: your name, with the same rule as signing up.
private struct NameSheet: View {
    let current: String
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var busy = false
    @State private var problem: String?

    var body: some View {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        AccountSheet(title: "Change your name", busy: busy) {
            Field("Name", text: Binding(get: { name }, set: { name = String($0.prefix(100)); problem = nil }), capitalization: .words, contentType: .name,
                  supporting: "Your phones and watches show it the next time they sync.")
            if let problem { Text(problem).font(.lfBodySmall).foregroundStyle(LF.redText) }
            SheetButtons(text: busy ? "Saving…" : "Change name", enabled: !trimmed.isEmpty && trimmed != current && !busy, cancel: { dismiss() }) {
                busy = true
                Task {
                    do {
                        try await graph.changeName(trimmed)
                        dismiss()
                    } catch let e as ServerError {
                        problem = e.status == 400 ? "A name is 1 to 100 characters." : e.message
                    } catch {
                        problem = "Couldn't reach the server. Try again with a connection."
                    }
                    busy = false
                }
            }
        }
        .onAppear { name = current }
    }
}

/// USR-7, USR-9: a new email, with the password; on a server that can email, it waits for the link sent to it.
private struct EmailSheet: View {
    let current: String
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var problem: String?
    @State private var canEmail = false

    var body: some View {
        AccountSheet(title: "Change your email", busy: busy) {
            Field("New email", text: Binding(get: { email }, set: { email = $0; problem = nil }), keyboard: .emailAddress, capitalization: .never, contentType: .emailAddress,
                  supporting: canEmail ? "We'll email it a link. Your email changes when you open it, within 24 hours." : "You sign in with it from now on.")
            Field("Your password", text: Binding(get: { password }, set: { password = $0; problem = nil }), contentType: .password, secure: true)
            if let problem { Text(problem).font(.lfBodySmall).foregroundStyle(LF.redText) }
            SheetButtons(text: busy ? "Saving…" : "Change email", enabled: email.orNil != nil && !password.isEmpty && email.trimmingCharacters(in: .whitespaces) != current && !busy, cancel: { dismiss() }) {
                busy = true
                Task {
                    do {
                        // USR-9: with a link emailed, You shows the change waiting.
                        try await graph.changeEmail(email, password: password)
                        dismiss()
                    } catch let e as ServerError {
                        problem = e.body?["issues"] != nil ? "That email address doesn't look right." : e.message.prefix(1).uppercased() + e.message.dropFirst()
                    } catch {
                        problem = "Couldn't reach the server. Try again with a connection."
                    }
                    busy = false
                }
            }
        }
        .onAppear { email = current }
        .task { canEmail = await graph.meta()?.capabilities.contains("email") == true }
    }
}

/// USR-7: a new password, with the current one.
private struct PasswordSheet: View {
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var current = ""
    @State private var next = ""
    @State private var again = ""
    @State private var busy = false
    @State private var done = false
    @State private var problem: String?

    var body: some View {
        if done {
            AccountSheet(title: "Password changed", text: "Use it next time you sign in. Watches and devices already signed in stay signed in.", busy: false) {
                SheetButtons(text: "Done", cancel: nil) { dismiss() }
            }
            .sensoryFeedback(.success, trigger: done)
        } else {
            let mismatch = !again.isEmpty && again != next
            AccountSheet(title: "Change your password", busy: busy) {
                Field("Current password", text: Binding(get: { current }, set: { current = $0; problem = nil }), contentType: .password, secure: true)
                Field("New password", text: Binding(get: { next }, set: { next = String($0.prefix(128)); problem = nil }), contentType: .newPassword, secure: true, supporting: "At least 8 characters")
                Field("New password again", text: Binding(get: { again }, set: { again = String($0.prefix(128)) }), contentType: .newPassword, secure: true, supporting: mismatch ? "The two don't match." : nil)
                if let problem { Text(problem).font(.lfBodySmall).foregroundStyle(LF.redText) }
                SheetButtons(text: busy ? "Saving…" : "Change password", enabled: !current.isEmpty && next.count >= 8 && again == next && !busy, cancel: { dismiss() }) {
                    busy = true
                    Task {
                        do {
                            try await graph.changePassword(current: current, next: next)
                            done = true
                        } catch let e as ServerError {
                            problem = e.body?["code"]?.string?.contains("INVALID_PASSWORD") == true ? "Your current password isn't right." : e.message.prefix(1).uppercased() + e.message.dropFirst()
                        } catch {
                            problem = "Couldn't reach the server. Try again with a connection."
                        }
                        busy = false
                    }
                }
            }
        }
    }
}

/// Data and licenses (WX-8), as the website's and Android's: where the data comes from (following what
/// this server uses), LawFive's own, and what the app is built with.
struct LicensesScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(\.openURL) private var openURL
    @State private var meta: ServerMeta?

    private struct Credit {
        let name: String
        let url: String
        let what: String
        var license: (String, String)?
    }

    var body: some View {
        let mit = ("MIT", "https://opensource.org/license/mit")
        let odbl = ("ODbL", "https://opendatacommons.org/licenses/odbl/")
        let ofl = ("SIL Open Font License 1.1", "https://openfontlicense.org")
        let data: [Credit]? = meta.map { m in
            [
                m.weather.map { _ in Credit(name: "Open-Meteo", url: "https://open-meteo.com", what: "Weather forecasts for matches, from national weather services' models", license: ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/")) },
                Credit(name: "Apple Maps", url: "https://www.apple.com/legal/internet-services/maps/", what: "The maps in the iPhone app, and Directions when they open in Apple Maps"),
                m.geocoder.map { g in
                    let nominatim = g.url.contains("nominatim.openstreetmap.org")
                    return Credit(name: nominatim ? "Nominatim" : (URL(string: g.url)?.host ?? g.url), url: nominatim ? "https://nominatim.org" : g.url, what: "Address search for venues, with data © OpenStreetMap contributors", license: odbl)
                },
            ].compactMap { $0 }
        }
        let software = [
            Credit(name: "SwiftUI and Apple's frameworks", url: "https://developer.apple.com/documentation", what: "The app's screens, maps, notifications, background sync and the Apple Watch"),
            Credit(name: "SQLite", url: "https://sqlite.org", what: "The phone's copy of your matches", license: ("Public domain", "https://sqlite.org/copyright.html")),
            Credit(name: "Garmin Connect IQ Mobile SDK", url: "https://developer.garmin.com/connect-iq/", what: "Syncing a Garmin watch through this phone", license: ("Garmin's license", "https://developer.garmin.com/connect-iq/sdk/")),
            Credit(name: "Phosphor Icons", url: "https://phosphoricons.com", what: "The icons", license: mit),
            Credit(name: "Barlow and Barlow Condensed", url: "https://github.com/jpt/barlow", what: "The typeface for text and headings", license: ofl),
            Credit(name: "JetBrains Mono", url: "https://www.jetbrains.com/lp/mono/", what: "The typeface for codes and addresses", license: ofl),
        ]
        Page("Data and licenses", sub: "Where LawFive's data comes from, and what it's built with.", large: false) {
            SectionTitle("Data")
            if let data { credits(data) } else { Text("Shown when there's signal.").font(.lfBodyMedium).foregroundStyle(LF.muted) }
            SectionTitle("LawFive")
            LfCard {
                ListRow(title: "Open source", sub: "LawFive is open source, and you can run your own server. The code and its license are at lawfive.dev.", divider: false,
                        action: { if let url = URL(string: "https://lawfive.dev") { openURL(url) } }, leading: { EmptyView() }, trailing: { RowArrow(icon: .link) })
            }
            SectionTitle("Built with")
            credits(software)
        }
        .task { meta = await graph.meta() }
    }

    private func credits(_ list: [Credit]) -> some View {
        LfCard {
            ForEach(Array(list.enumerated()), id: \.offset) { i, c in
                ListRow(title: c.name, sub: c.what, divider: i > 0, action: { if let url = URL(string: c.url) { openURL(url) } }, leading: { EmptyView() }, trailing: {
                    if let license = c.license {
                        Button { if let url = URL(string: license.1) { openURL(url) } } label: { Chip(license.0) }
                            .buttonStyle(PressStyle())
                            .accessibilityLabel("The license, \(license.0)")
                    }
                })
            }
        }
    }
}
