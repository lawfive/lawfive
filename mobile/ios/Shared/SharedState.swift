import Foundation
import Security

// What the app shares with its notification service extension (PUSH-5, NOTE-3), which asks the
// person's own server for a notification's details: the server's address and this phone's device
// header through the App Group, and the session's token through the keychain, in the App Group's
// access group. Nothing else of the account leaves the app.

enum SharedState {
    static let group = "group.app.lawfive"
    private static let serverKey = "server"
    private static let deviceKey = "device"

    /// The App Group's settings; nil where the build has no App Group (then the extension keeps its neutral words).
    static var defaults: UserDefaults? { UserDefaults(suiteName: group) }

    /// What a request from the extension needs besides the token: the server, and the header naming this phone.
    static func read(_ defaults: UserDefaults? = SharedState.defaults) -> (server: String, device: String)? {
        guard let d = defaults, let server = d.string(forKey: serverKey), !server.isEmpty else { return nil }
        return (server, d.string(forKey: deviceKey) ?? "ios")
    }

    /// Signed in to `server`, or signed out (nil).
    static func write(server: String?, device: String, to defaults: UserDefaults?) {
        guard let defaults else { return }
        if let server, !server.isEmpty {
            defaults.set(server, forKey: serverKey)
            defaults.set(device, forKey: deviceKey)
        } else {
            defaults.removeObject(forKey: serverKey)
            defaults.removeObject(forKey: deviceKey)
        }
    }
}

/// The session's token in the keychain (IOS-2), readable once the phone has been unlocked, so a
/// background sync and the notification service extension can use it, and never leaving this phone.
/// It's kept in the App Group's access group, for the extension; a build without the App Group keeps
/// it in the app's own.
enum Keychain {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.lawfive", kSecAttrAccount as String: "session"]

    /// In whichever access group it is.
    static func read() -> String? {
        var found: AnyObject?
        var ask = query
        ask[kSecReturnData as String] = true
        guard SecItemCopyMatching(ask as CFDictionary, &found) == errSecSuccess, let data = found as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Whether the token is where the extension can read it.
    static var shared: Bool {
        var ask = query
        ask[kSecAttrAccessGroup as String] = SharedState.group
        return SecItemCopyMatching(ask as CFDictionary, nil) == errSecSuccess
    }

    static func write(_ token: String?) {
        // Every copy, in any access group (one from before the App Group too).
        SecItemDelete(query as CFDictionary)
        guard let token else { return }
        var add = query
        add[kSecValueData as String] = Data(token.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        add[kSecAttrAccessGroup as String] = SharedState.group
        if SecItemAdd(add as CFDictionary, nil) != errSecSuccess {
            add.removeValue(forKey: kSecAttrAccessGroup as String)
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}
