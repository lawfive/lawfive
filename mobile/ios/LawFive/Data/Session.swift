import Foundation
import Observation
import Security

// Who's signed in, to which server (IOS-2), and where sync got to (IOS-3). The token is kept in the
// keychain; the rest in the app's own settings.

@MainActor
@Observable
final class SessionStore {
    private(set) var server: String
    private(set) var token: String?
    private(set) var userId: String?
    private(set) var name: String?
    private(set) var email: String?
    /// active, pending (waiting for approval) or suspended.
    private(set) var status: String
    private(set) var cursor: Int
    /// APP-16, APP-26: the first sync after signing in hasn't finished yet. Set at sign-in and cleared once
    /// a sync has pulled everything, even nothing; not guessed from the cursor, which an empty account keeps at 0.
    private(set) var firstSync: Bool
    /// When sync last finished; nil before the first.
    private(set) var lastSync: Date?
    /// The tips dismissed on this phone (TIP-3); they stay through signing out.
    private(set) var tipsDone: Set<String>
    /// APP-26: match reports that came in from a watch, waiting to be shown, kept until the summary
    /// closes so a sync in the background or the app closing in between doesn't lose them.
    private(set) var fromWatch: [String]
    /// USR-9: a new email waiting for its owner to follow the link sent to it, and until when (an ISO time).
    private(set) var pendingEmail: String?
    private(set) var pendingEmailUntil: String?

    var signedIn: Bool { token != nil }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        server = defaults.string(forKey: "server") ?? ""
        userId = defaults.string(forKey: "userId")
        name = defaults.string(forKey: "name")
        email = defaults.string(forKey: "email")
        status = defaults.string(forKey: "status") ?? "active"
        cursor = defaults.integer(forKey: "cursor")
        firstSync = defaults.bool(forKey: "firstSync")
        lastSync = defaults.object(forKey: "lastSync") as? Date
        tipsDone = Set(defaults.stringArray(forKey: "tipsDone") ?? [])
        fromWatch = defaults.stringArray(forKey: "fromWatch") ?? []
        pendingEmail = defaults.string(forKey: "pendingEmail")
        pendingEmailUntil = defaults.string(forKey: "pendingEmailUntil")
        // A keychain item outlives the app being deleted; a fresh install starts signed out.
        token = defaults.bool(forKey: "installed") ? Keychain.read() : nil
        if !defaults.bool(forKey: "installed") {
            Keychain.write(nil)
            defaults.set(true, forKey: "installed")
        }
    }

    func signedIn(server: String, token: String, userId: String, name: String, email: String, status: String) {
        self.server = server
        self.token = token
        self.userId = userId
        self.name = name
        self.email = email
        self.status = status
        cursor = 0
        firstSync = true
        lastSync = nil
        fromWatch = []
        pendingEmail = nil
        pendingEmailUntil = nil
        Keychain.write(token)
        save()
    }

    func setStatus(_ status: String, name: String? = nil, email: String? = nil) {
        self.status = status
        if let name { self.name = name }
        if let email { self.email = email }
        save()
    }

    /// USR-9, USR-10: the account as GET /v1/account (or a change to it) gave it: its name, email and any new email waiting.
    func setAccount(name: String?, email: String?, pendingEmail: String?, pendingEmailUntil: String?) {
        if let name { self.name = name }
        if let email { self.email = email }
        if let pendingEmail, let pendingEmailUntil {
            self.pendingEmail = pendingEmail
            self.pendingEmailUntil = pendingEmailUntil
        } else {
            self.pendingEmail = nil
            self.pendingEmailUntil = nil
        }
        save()
    }

    func setServer(_ server: String) {
        self.server = server
        save()
    }

    func synced(cursor: Int, at date: Date) {
        self.cursor = cursor
        lastSync = date
        save()
    }

    /// The first sync after signing in has pulled everything there was.
    func firstSyncDone() {
        guard firstSync else { return }
        firstSync = false
        save()
    }

    /// APP-26: match reports a sync brought from a watch, to show.
    func cameFromWatch(_ ids: [String]) {
        let new = ids.filter { !fromWatch.contains($0) }
        guard !new.isEmpty else { return }
        fromWatch += new
        save()
    }

    /// APP-26: the summary closed (or some of them are gone): these aren't waiting any more.
    func shownFromWatch(_ ids: [String]? = nil) {
        let before = fromWatch
        fromWatch = ids.map { ids in fromWatch.filter { !ids.contains($0) } } ?? []
        if fromWatch != before { save() }
    }

    func tipDone(_ id: String) {
        tipsDone.insert(id)
        save()
    }

    /// Signed out: the token and where sync got to go; the server stays for signing in again.
    func signedOut() {
        token = nil
        userId = nil
        name = nil
        email = nil
        status = "active"
        cursor = 0
        firstSync = false
        lastSync = nil
        fromWatch = []
        pendingEmail = nil
        pendingEmailUntil = nil
        Keychain.write(nil)
        save()
    }

    private func save() {
        defaults.set(server, forKey: "server")
        defaults.set(userId, forKey: "userId")
        defaults.set(name, forKey: "name")
        defaults.set(email, forKey: "email")
        defaults.set(status, forKey: "status")
        defaults.set(cursor, forKey: "cursor")
        defaults.set(firstSync, forKey: "firstSync")
        defaults.set(lastSync, forKey: "lastSync")
        defaults.set(Array(tipsDone), forKey: "tipsDone")
        defaults.set(fromWatch, forKey: "fromWatch")
        defaults.set(pendingEmail, forKey: "pendingEmail")
        defaults.set(pendingEmailUntil, forKey: "pendingEmailUntil")
    }
}

/// The session's token in the keychain, readable once the phone has been unlocked (so a background sync can use it).
enum Keychain {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.lawfive", kSecAttrAccount as String: "session"]

    static func read() -> String? {
        var found: AnyObject?
        var ask = query
        ask[kSecReturnData as String] = true
        guard SecItemCopyMatching(ask as CFDictionary, &found) == errSecSuccess, let data = found as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ token: String?) {
        SecItemDelete(query as CFDictionary)
        guard let token else { return }
        var add = query
        add[kSecValueData as String] = Data(token.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}
