import BackgroundTasks
import Foundation
import Observation
import UIKit

// The app's parts, made once: the session, the API, the phone's database, sync and the records.

@MainActor
@Observable
final class AppGraph {
    let session: SessionStore
    let api: Api
    let db: Db
    let records: Records
    let reminders: Reminders
    @ObservationIgnored private(set) var sync: SyncEngine!
    @ObservationIgnored private(set) var weather: WeatherStore!
    /// Stats, with the last answer for each set of filters (STAT-13).
    @ObservationIgnored private(set) var stats: StatsStore!
    /// Finding duplicates and merging, worked out by the server (DUP-11).
    @ObservationIgnored private(set) var merging: Merging!
    /// IOS-9: the Garmin watch through this phone.
    @ObservationIgnored private(set) var watch: WatchBridge!
    /// Which matches are on which watch (SYNC-14), kept for when there's no signal.
    @ObservationIgnored private(set) var onWatch: OnWatchStore!
    /// Decision 4c: the paired Apple Watch, linked from this phone over WatchConnectivity.
    @ObservationIgnored private(set) var appleWatch: AppleWatchLink!

    /// A QR code or lawfive:// link waiting for the sign-in screen (APP-13, APP-14).
    var pendingLink: AppLink?
    /// A notification tapped: the match to open once the app is showing (APP-6).
    var pendingMatch: String?
    /// Directions iOS wouldn't open (WEB-14): the maps app and the place, for RootView to say so.
    var directionsRefused: (app: String, place: String)?
    /// Each referee's picture (their first photo), fetched when signal allows and kept for the session.
    var refereePictures: [String: Attachment] = [:]

    @ObservationIgnored private var serverMeta: ServerMeta?
    @ObservationIgnored private var pendingSync: Task<Void, Never>?
    /// APP-3: when a pull to refresh last synced, for the sync line's check.
    private(set) var pulledAt: Date?
    static let backgroundTask = "app.lawfive.sync"

    /// The app's own: its settings, its database and Application Support for what's kept (the weather,
    /// stats and watches). The snapshot tests give it their own, and `protocols` that answer as a server.
    init(defaults: UserDefaults = .standard, dbFile: URL? = Db.defaultFile, folder: URL = .applicationSupportDirectory, protocols: [AnyClass] = []) {
        let session = SessionStore(defaults: defaults)
        self.session = session
        api = Api(session: session, protocols: protocols)
        db = Db(file: dbFile)
        records = Records(db: db)
        reminders = Reminders(defaults: defaults)
        // CAL-3: the reminders' times are the account's.
        reminders.account = { [records] in records.effectiveSettings }
        sync = SyncEngine(api: api, db: db, session: session) { [weak self] in await self?.forgetAccount() }
        watch = WatchBridge(api: api) { [weak session] in
            guard let session, session.signedIn else { return nil }
            return (session.server, session.name ?? session.email ?? "")
        }
        watch.relay.activity = sync.activity
        watch.start()
        weather = WeatherStore(api: api, file: folder.appending(path: "weather.json")) { [weak self] in await self?.meta()?.capabilities.contains("weather") == true }
        stats = StatsStore(api: api, file: folder.appending(path: "stats.json"))
        merging = Merging(api: api)
        onWatch = OnWatchStore(api: api, file: folder.appending(path: "on-watch.json"))
        appleWatch = AppleWatchLink(api: api) { [weak session] in
            guard let session, session.signedIn else { return nil }
            return (session.server, session.name ?? session.email ?? "")
        }
        appleWatch.start()
        records.changed = { [weak self] in self?.requestSync() }
        // APP-26: a match the Garmin watch handed over comes back down soon, for the summary.
        sync.activity.watchSent = { [weak self] in self?.requestSync() }
        // APP-16: the sync screen finishes and closes on time.
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.sync.activity.tick()
            }
        }
        Task { await records.reload() }
    }

    /// A sync soon: changes made one after another go together.
    func requestSync(delay: Double = 1.5) {
        pendingSync?.cancel()
        pendingSync = Task {
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await syncNow()
        }
    }

    /// APP-3: a pull to refresh. The spinner stays long enough to see, and a sync that worked gets a
    /// success tap and a check in the sync line for a moment (the match page has no line, so just the tap).
    func pullToSync() async {
        let started = Date()
        // After any sync already going, as Android does, so the pull gets one of its own.
        while sync.running { try? await Task.sleep(for: .milliseconds(100)) }
        let worked = await syncNow()
        let left = 0.6 - Date().timeIntervalSince(started)
        if left > 0 { try? await Task.sleep(for: .seconds(left)) }
        if worked {
            pulledAt = Date()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    /// A sync and what follows one; true when it worked.
    @discardableResult
    func syncNow() async -> Bool {
        let worked = await sync.sync()
        await records.reload()
        // APP-26: one deleted before it was shown isn't waiting any more.
        let gone = session.fromWatch.filter { id in !records.matchRecords.contains { $0.id == id } }
        if !gone.isEmpty { session.shownFromWatch(gone) }
        if worked {
            await fillTimeZone()
            await adoptPhoneTimes()
            reminders.reschedule(matches: records.matches ?? [], venues: records.venues ?? [])
            await weather.refresh()
            await watch.relay.refresh()
            await onWatch.refresh()
        }
        return worked
    }

    /// APP-6: before the reminders' times were the account's, each phone kept its own. The first sync after
    /// uploads them if the account has none, then forgets them here.
    private func adoptPhoneTimes() async {
        guard let taken = reminders.takePhoneTimes(),
              let up = ReminderTimes.toUpload(phone: taken.times, enabled: taken.enabled, account: records.settings) else { return }
        await records.saveSettings { up.into(&$0) }
    }

    /// CAL-3: new reminder times for the account, which the calendar feed and the other phones follow.
    func updateReminderTimes(_ next: ReminderTimes) async {
        await records.saveSettings { next.into(&$0) }
        reminders.reschedule(matches: records.matches ?? [], venues: records.venues ?? [])
    }

    /// PLAN-9: an account's time zone comes from the first browser or phone that signs in. Only on a
    /// server with plans: an older one drops the field, and filling it in again would sync forever.
    private func fillTimeZone() async {
        guard var settings = records.settings, settings.timeZone == nil, await meta()?.capabilities.contains("plans") == true else { return }
        settings.timeZone = TimeZone.current.identifier
        await records.save(Collections.settings, id: settings.id, settings)
    }

    // IOS-3: iOS runs this when it sees fit, usually every so often; opening the app syncs too.
    func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: AppGraph.backgroundTask)
        request.earliestBeginDate = Date().addingTimeInterval(30 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// WEB-14: Directions to a place ("lat,lon" or an address) in the maps app chosen in Settings, or
    /// `app`. iOS can refuse, as when Screen Time blocks Maps; then the app says so.
    func openDirections(to place: String, app chosen: String? = nil) {
        let app = chosen ?? records.settings?.mapsApp
        guard let url = directionsURL(to: place, app: app) else { return }
        UIApplication.shared.open(url) { [weak self] opened in
            if !opened { self?.directionsRefused = (app == "google" ? "Google Maps" : "Apple Maps", place) }
        }
    }

    func openDirections(lat: Double, lon: Double) { openDirections(to: "\(lat),\(lon)") }

    /// GET /v1/meta: the server's description (what it offers), fetched once a run; nil offline.
    func meta() async -> ServerMeta? {
        if let serverMeta { return serverMeta }
        serverMeta = try? await api.call("GET", "/v1/meta")?.decoded(as: ServerMeta.self)
        return serverMeta
    }

    /// Whether the server finds duplicates and previews merges (DUP-11); servers from before it don't.
    func mergingOffered() async -> Bool {
        await meta()?.capabilities.contains("merging") == true
    }

    /// A server's website, from GET /v1/meta's publicUrl: where its accounts are made (APP-2), unless it
    /// takes no new ones, and where a forgotten password is reset (USR-7); nil for either when it doesn't say.
    struct Website: Equatable {
        var signUp: URL?
        var forgotPassword: URL?
    }

    func website(_ server: String) async -> Website {
        guard let meta = try? await api.call("GET", "/v1/meta", server: server), meta["product"]?.string == "LawFive",
              var site = meta["publicUrl"]?.string?.orNil, site.hasPrefix("https://") || site.hasPrefix("http://") else { return Website() }
        while site.hasSuffix("/") { site.removeLast() }
        return Website(signUp: meta["signUp"]?.string == "closed" ? nil : URL(string: site + "/signup"), forgotPassword: URL(string: site + "/forgot-password"))
    }

    /// The server's address if it's a LawFive server.
    func checkServer(_ server: String) async throws -> String {
        let meta = try await api.call("GET", "/v1/meta", server: server)
        guard meta?["product"]?.string == "LawFive" else { throw ServerError(status: 0, message: "That isn't a LawFive server", body: nil) }
        return server
    }

    /// The address a link's server wants apps to use (API_URL, which may differ from the web app's).
    func apiServer(_ server: String) async throws -> String {
        let meta = try await api.call("GET", "/v1/meta", server: server)
        guard meta?["product"]?.string == "LawFive" else { throw ServerError(status: 0, message: "That isn't a LawFive server", body: nil) }
        return meta?["apiUrl"]?.string.flatMap { AppLink.serverOf($0, allowHttp: AppInfo.isDebug) } ?? server
    }

    /// Whose a sign-in code is (APP-13): their name and email, for the phone to ask first.
    func checkCode(server: String, code: String) async throws -> (name: String, email: String) {
        let answer = try await api.call("POST", "/v1/app-sign-in/check", body: .object(["code": .string(code)]), server: server)
        return (answer?["name"]?.string ?? "", answer?["email"]?.string ?? "")
    }

    /// Signs in with a code (APP-13): the server gives this phone a session of its own.
    func signInWithCode(server: String, code: String) async throws {
        let answer = try await api.call("POST", "/v1/app-sign-in/redeem", body: .object(["code": .string(code)]), server: server)
        guard let token = answer?["token"]?.string else { throw ServerError(status: 0, message: "The server didn't sign you in", body: nil) }
        await finishSignIn(server: server, token: token, user: answer?["user"], email: "")
    }

    /// Looks an invitation up (APP-14): who it's from, and the name and address it's for.
    func lookUpInvite(server: String, token: String) async throws -> JSONValue? {
        try await api.call("GET", "/v1/invite/\(token)", server: server)
    }

    /// Makes an account with an invitation (APP-14) and signs in with it.
    func signUpWithInvite(server: String, invite: String, name: String, email: String, password: String) async throws {
        let body: JSONValue = .object(["name": .string(name), "email": .string(email), "password": .string(password), "invite": .string(invite)])
        let (answer, response) = try await api.callRaw("POST", "/v1/auth/sign-up/email", body: body, server: server)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token") else { throw ServerError(status: 0, message: "The server didn't sign you in", body: nil) }
        await finishSignIn(server: server, token: token, user: answer?["user"], email: email)
    }

    /// Signs in with email and password (IOS-2); the token comes back in set-auth-token.
    func signIn(server: String, email: String, password: String) async throws {
        let body: JSONValue = .object(["email": .string(email.trimmingCharacters(in: .whitespaces)), "password": .string(password)])
        let (answer, response) = try await api.callRaw("POST", "/v1/auth/sign-in/email", body: body, server: server)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token") else { throw ServerError(status: 0, message: "The server didn't sign you in", body: nil) }
        await finishSignIn(server: server, token: token, user: answer?["user"], email: email)
    }

    private func finishSignIn(server: String, token: String, user: JSONValue?, email: String) async {
        serverMeta = nil
        records.forgetDefaults()
        await db.clear()
        session.signedIn(server: server, token: token, userId: user?["id"]?.string ?? "", name: user?["name"]?.string ?? "", email: user?["email"]?.string ?? email, status: user?["status"]?.string ?? "active")
        await refreshAccount()
        await records.reload()
        requestSync(delay: 0)
    }

    /// The account's status (waiting for approval, suspended) and name.
    func refreshAccount() async {
        do {
            let account = try await api.call("GET", "/v1/account")
            let was = session.status
            let now = account?["status"]?.string ?? "active"
            session.setStatus(now, name: account?["name"]?.string, email: account?["email"]?.string)
            session.setAccount(name: account?["name"]?.string, email: account?["email"]?.string, pendingEmail: account?["pendingEmail"]?.string, pendingEmailUntil: account?["pendingEmailUntil"]?.string)
            // Just approved (the waiting page's Check again): sync now, so Matches doesn't open on the
            // sync that failed while the account waited.
            if was != "active", now == "active" { requestSync(delay: 0) }
        } catch let e as ServerError {
            if e.status == 401 { await forgetAccount() }
        } catch {
            // Offline: keep what we knew.
        }
    }

    /// USR-10: a new name for the account, with the same rule as signing up (1 to 100 characters, trimmed). Throws what the server said.
    func changeName(_ name: String) async throws {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        try await api.call("POST", "/v1/auth/update-user", body: .object(["name": .string(trimmed)]))
        session.setStatus(session.status, name: trimmed)
        await refreshAccount()
    }

    /// USR-7, USR-9: a new email, with the password. On a server that can send email the address waits
    /// for its owner to follow the link sent to it (true); without, it changes straight away (false).
    @discardableResult
    func changeEmail(_ email: String, password: String) async throws -> Bool {
        let answer = try await api.call("PUT", "/v1/account/email", body: .object(["email": .string(email.trimmingCharacters(in: .whitespaces)), "password": .string(password)]))
        session.setAccount(name: answer?["name"]?.string, email: answer?["email"]?.string, pendingEmail: answer?["pendingEmail"]?.string, pendingEmailUntil: answer?["pendingEmailUntil"]?.string)
        return answer?["pendingEmail"]?.string != nil
    }

    /// USR-9: the link sent to a new address stops working, and the email stays as it is.
    func cancelEmailChange() async throws {
        let answer = try await api.call("DELETE", "/v1/account/email")
        session.setAccount(name: answer?["name"]?.string, email: answer?["email"]?.string, pendingEmail: answer?["pendingEmail"]?.string, pendingEmailUntil: answer?["pendingEmailUntil"]?.string)
    }

    /// USR-7: a new password, with the current one. Other devices stay signed in.
    func changePassword(current: String, next: String) async throws {
        try await api.call("POST", "/v1/auth/change-password", body: .object(["currentPassword": .string(current), "newPassword": .string(next)]))
    }

    func signOut() async {
        // Signed out on the phone whatever the server says.
        _ = try? await api.call("POST", "/v1/auth/sign-out", body: .object([:]))
        await forgetAccount()
    }

    /// APP-21: deletes the account on its server, with the password; then everything of it here goes
    /// too. Throws what the server said (a wrong password, or the server's only admin) with nothing changed.
    func deleteAccount(password: String) async throws {
        try await api.call("POST", "/v1/account/delete", body: .object(["password": .string(password)]))
        watch.relay.forgetEverything()
        await forgetAccount()
    }

    /// The account's copy and the session go (signed out, or the session ended elsewhere).
    func forgetAccount() async {
        pendingMatch = nil
        pendingSync?.cancel()
        session.signedOut()
        weather.clear()
        stats.clear()
        onWatch.clear()
        refereePictures = [:]
        serverMeta = nil
        records.forgetDefaults()
        await db.clear()
        await records.reload()
        reminders.reschedule(matches: [], venues: [])
        ImageLoader.shared.clear()
    }

    /// IOS-5 (as APP-11): signs out and removes everything LawFive keeps here, tips and server choice too.
    func eraseThisPhone() async {
        await signOut()
        reminders.update(ReminderSettings(), matches: [], venues: [])
        if let name = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: name) }
        UserDefaults.standard.set(true, forKey: "installed")
    }

    func loadRefereePictures() async {
        // Offline, or a server without photos: initials it is.
        guard let answer = try? await api.call("GET", "/v1/attachments?recordType=referee&first=true"),
              let list = try? answer["attachments"]?.decoded(as: [Attachment].self) else { return }
        refereePictures = Dictionary(list.map { ($0.recordId, $0) }, uniquingKeysWith: { a, _ in a })
    }
}
