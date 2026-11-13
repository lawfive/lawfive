import Foundation

// What a QR code or a lawfive:// link asks the app to do (APP-13, APP-14). The web app's QR codes
// hold its own pages, so a phone's camera can open them too: https://server/get-app#CODE for
// signing in and https://server/invite/TOKEN for an invitation. The web pages open the app with
// lawfive://sign-in?server=…&code=… and lawfive://invite?server=…&token=….

enum AppLink: Equatable, Sendable {
    case signIn(server: String, code: String)
    case invite(server: String, token: String)

    var server: String {
        switch self {
        case .signIn(let server, _), .invite(let server, _): return server
        }
    }

    /// Upper case, letters and digits only, or nil unless it's eight of them.
    static func normalizeCode(_ text: String) -> String? {
        let code = text.uppercased().filter { ("A"..."Z").contains($0) || ("0"..."9").contains($0) }
        return code.count == 8 ? code : nil
    }

    /// The link, or nil when it isn't one of ours. http only with allowHttp, as a debug build can reach a local server.
    static func parse(_ text: String, allowHttp: Bool = false) -> AppLink? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: trimmed), let scheme = parts.scheme?.lowercased() else { return nil }
        switch scheme {
        case "lawfive":
            let query = Dictionary((parts.queryItems ?? []).compactMap { item in item.value.map { (item.name, $0) } }, uniquingKeysWith: { a, _ in a })
            guard let server = query["server"].flatMap({ serverOf($0, allowHttp: allowHttp) }) else { return nil }
            return make(parts.host, server, code: query["code"], token: query["token"])
        case "http", "https":
            guard let server = serverOf(trimmed, allowHttp: allowHttp) else { return nil }
            var path = parts.path
            while path.hasSuffix("/") { path.removeLast() }
            if path == "/get-app" { return make("sign-in", server, code: parts.fragment, token: nil) }
            if path.hasPrefix("/invite/") { return make("invite", server, code: nil, token: String(path.dropFirst("/invite/".count))) }
            return nil
        default:
            return nil
        }
    }

    private static func make(_ kind: String?, _ server: String, code: String?, token: String?) -> AppLink? {
        switch kind {
        case "sign-in":
            return code.flatMap(normalizeCode).map { .signIn(server: server, code: $0) }
        case "invite":
            guard let token, token.range(of: "^[A-Za-z0-9_-]{11,99}$", options: .regularExpression) != nil else { return nil }
            return .invite(server: server, token: token)
        default:
            return nil
        }
    }

    /// The address's origin. A name before an @ could pass for the server's own, so it's refused.
    static func serverOf(_ address: String, allowHttp: Bool = false) -> String? {
        guard let parts = URLComponents(string: address.trimmingCharacters(in: .whitespacesAndNewlines)), let scheme = parts.scheme?.lowercased() else { return nil }
        guard scheme == "https" || (scheme == "http" && allowHttp) else { return nil }
        guard let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil else { return nil }
        return "\(scheme)://\(host)\(parts.port.map { ":\($0)" } ?? "")"
    }

    /// SEC-5: plain http only to a server on the referee's own network: loopback, a private or
    /// link-local address, or a name ending in .local. iOS's local-networking exception lets any IP
    /// address through, so this is the check that keeps a password off a stranger's http server.
    static func isLocalNetwork(_ host: String) -> Bool {
        let h = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if h == "localhost" || h.hasSuffix(".local") { return true }
        let v4 = h.split(separator: ".", omittingEmptySubsequences: false).map { Int($0) }
        if v4.count == 4, v4.allSatisfy({ ($0 ?? -1) >= 0 && ($0 ?? 256) <= 255 }) {
            let a = v4[0]!, b = v4[1]!
            return a == 10 || a == 127 || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168) || (a == 169 && b == 254)
        }
        if h.contains(":") {
            return h == "::1" || h.hasPrefix("fe8") || h.hasPrefix("fe9") || h.hasPrefix("fea") || h.hasPrefix("feb") || h.hasPrefix("fc") || h.hasPrefix("fd")
        }
        return false
    }
}
