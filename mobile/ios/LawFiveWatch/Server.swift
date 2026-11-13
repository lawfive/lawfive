import Foundation
import WatchKit

// WCH-4: straight to the server, over the watch's own connection, with the same API as the Garmin watch.

struct ServerRefused: Error {
    let status: Int
    let error: String?
}

struct Server: Sendable {
    let base: String
    static let clientId = "lawfive-applewatch"

    /// "applewatch; model=Watch7,3; os=11.0; app=2026.10.31" (VER-3): the server names the device from it,
    /// and the iPhone asks for this watch's token in it when it links the watch (PhoneLink.swift).
    @MainActor static let deviceHeader: String = {
        let d = WKInterfaceDevice.current()
        let version = (Bundle.main.object(forInfoDictionaryKey: "LFVersion") as? String) ?? "dev"
        return "applewatch; model=\(hardwareModel.replacingOccurrences(of: ";", with: " ")); os=\(d.systemVersion); app=\(version)"
    }()

    /// Which Apple Watch this is, "Watch7,3", for the match report's device and the header (STAT-15):
    /// the server names it ("Apple Watch Series 9"), where WKInterfaceDevice's model says only "Apple
    /// Watch". A simulator gives the Mac's, so the watch it plays instead.
    @MainActor static let hardwareModel: String = {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"], !simulated.isEmpty {
            return String(simulated.prefix(40))
        }
        var system = utsname()
        uname(&system)
        let machine = withUnsafeBytes(of: &system.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        return String((machine.isEmpty ? WKInterfaceDevice.current().model : machine).prefix(40))
    }()

    @MainActor private func call(_ method: String, _ path: String, token: String?, body: Data?) async throws -> Data {
        var trimmed = base
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard let url = URL(string: trimmed + path) else { throw URLError(.badURL) }
        var r = URLRequest(url: url, timeoutInterval: 30)
        r.httpMethod = method
        r.setValue(Self.deviceHeader, forHTTPHeaderField: "X-LawFive-Device")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if method != "GET" {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = body ?? Data("{}".utf8)
        }
        let (data, response) = try await URLSession.shared.data(for: r)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            let answer = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            // APP-23: only the server's own answer (its LawFive-Version header, or an older one's JSON)
            // counts; a proxy's 404 or 502 while it restarts is as if it couldn't be reached, so nothing is dropped.
            guard http.value(forHTTPHeaderField: "LawFive-Version") != nil || answer != nil else { throw URLError(.badServerResponse) }
            let error = answer?["error"] as? String
            throw ServerRefused(status: http.statusCode, error: error)
        }
        return data
    }

    @MainActor func get(_ path: String, token: String?) async throws -> Data { try await call("GET", path, token: token, body: nil) }
    @MainActor func post(_ path: String, token: String?, body: Data?) async throws -> Data { try await call("POST", path, token: token, body: body) }

    struct DeviceCode: Decodable {
        var device_code: String
        var user_code: String
        var verification_uri: String?
        var interval: Int?
        var expires_in: Int?
    }

    /// SYNC-1: a code to enter on the website.
    @MainActor func deviceCode() async throws -> DeviceCode {
        let body = try JSONSerialization.data(withJSONObject: ["client_id": Self.clientId])
        return try JSONDecoder().decode(DeviceCode.self, from: try await post("/v1/auth/device/code", token: nil, body: body))
    }

    /// The token once it's approved; nil while it's still waiting.
    @MainActor func deviceToken(_ deviceCode: String) async throws -> String? {
        struct Answer: Decodable { var access_token: String? }
        let body = try JSONSerialization.data(withJSONObject: [
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": deviceCode, "client_id": Self.clientId,
        ])
        do {
            return try JSONDecoder().decode(Answer.self, from: try await post("/v1/auth/device/token", token: nil, body: body)).access_token
        } catch let e as ServerRefused where e.error == "authorization_pending" || e.error == "slow_down" {
            return nil
        }
    }
}
