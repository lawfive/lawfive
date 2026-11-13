import Foundation
import Security

/// The session's token (WCH-4), readable once the watch has been unlocked, so a sync can use it with the
/// screen off, and never leaving this watch.
enum WatchKeychain {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.lawfive.watch.session"]

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
