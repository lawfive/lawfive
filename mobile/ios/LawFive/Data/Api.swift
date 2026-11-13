import Foundation
import UIKit

// Talking to a LawFive server (schema/generated/API.md): JSON in and out, the session's token as a
// bearer, and the X-LawFive-Device header that names this phone in the website's devices list.

/// A request that got an answer other than 2xx from LawFive: its status and the server's words.
struct ServerError: LocalizedError {
    let status: Int
    let message: String
    let body: JSONValue?
    var errorDescription: String? { message }

    /// APP-23: whether an answer is the LawFive server's own, which says so in a LawFive-Version header
    /// (a server from before it is known by its JSON). Anything else, such as a proxy's 404 or 502 while
    /// the server restarts, counts as not reaching the server, so nothing is dropped or signed out over it.
    static func isLawFive(_ http: HTTPURLResponse, _ data: Data) -> Bool {
        http.value(forHTTPHeaderField: "LawFive-Version") != nil || (try? JSONSerialization.jsonObject(with: data)) is [String: Any]
    }
}

enum AppInfo {
    static let version = Bundle.main.object(forInfoDictionaryKey: "LFVersion") as? String ?? "dev"
    static let commit = Bundle.main.object(forInfoDictionaryKey: "LFCommit") as? String ?? "unknown"
    static let defaultServer = Bundle.main.object(forInfoDictionaryKey: "LFServer") as? String ?? "https://api.lawfive.app"
    #if DEBUG
    static let isDebug = true
    #else
    static let isDebug = false
    #endif

    /// "ios; model=iPhone; os=17.0; app=2026.10.30" (IOS-2, VER-3): the server names the device from it.
    @MainActor static let deviceHeader = "ios; model=\(UIDevice.current.model.replacingOccurrences(of: ";", with: " ")); os=\(UIDevice.current.systemVersion); app=\(version)"
}

let jsonDecoder = JSONDecoder()
let jsonEncoder: JSONEncoder = {
    let e = JSONEncoder()
    e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return e
}()

extension JSONValue {
    /// A Codable value as plain JSON.
    init<T: Encodable>(encoding value: T) throws {
        self = try jsonDecoder.decode(JSONValue.self, from: jsonEncoder.encode(value))
    }

    func decoded<T: Decodable>(as type: T.Type = T.self) throws -> T {
        try jsonDecoder.decode(T.self, from: jsonEncoder.encode(self))
    }

    var text: String { (try? String(data: jsonEncoder.encode(self), encoding: .utf8)) ?? "null" }

    init(text: String) throws {
        self = try jsonDecoder.decode(JSONValue.self, from: Data(text.utf8))
    }
}

@MainActor
final class Api {
    private let session: SessionStore
    private let client: URLSession

    /// `protocols` answer requests before the network does: none in the app; the snapshot tests' fixtures.
    init(session: SessionStore, protocols: [AnyClass] = []) {
        self.session = session
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 90
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        if !protocols.isEmpty { config.protocolClasses = protocols + (config.protocolClasses ?? []) }
        client = URLSession(configuration: config)
    }

    /// The server's address without a trailing slash.
    func base(_ server: String? = nil) -> String {
        var s = server ?? session.server
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    private func request(_ method: String, _ path: String, server: String?) throws -> URLRequest {
        guard let url = URL(string: base(server) + path) else { throw ServerError(status: 0, message: "That isn't a server's address", body: nil) }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.setValue(AppInfo.deviceHeader, forHTTPHeaderField: "X-LawFive-Device")
        if let token = session.token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return r
    }

    /// IOS-9: a POST in a watch's name (its device header), for linking it. Any status comes back.
    func callAs(device: String, _ path: String, body: JSONValue) async throws -> (status: Int, answer: JSONValue?) {
        var r = try request("POST", path, server: nil)
        r.httpBody = try jsonEncoder.encode(body)
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue(device, forHTTPHeaderField: "X-LawFive-Device")
        let (data, response) = try await client.data(for: r)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if !(200..<300).contains(http.statusCode) && !ServerError.isLawFive(http, data) { throw URLError(.badServerResponse) }
        return (http.statusCode, data.isEmpty ? nil : try? jsonDecoder.decode(JSONValue.self, from: data))
    }

    /// A request to the API; the answer's JSON, or nil for an empty one. Throws ServerError or URLError.
    @discardableResult
    func call(_ method: String, _ path: String, body: JSONValue? = nil, server: String? = nil) async throws -> JSONValue? {
        try await callRaw(method, path, body: body, server: server).0
    }

    /// The same, with the response's headers, for signing in.
    func callRaw(_ method: String, _ path: String, body: JSONValue? = nil, server: String? = nil) async throws -> (JSONValue?, HTTPURLResponse) {
        var r = try request(method, path, server: server)
        if let body {
            r.httpBody = try jsonEncoder.encode(body)
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        } else if method == "POST" || method == "PUT" {
            r.httpBody = Data()
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await send(r)
    }

    /// A multipart form (photos, an import file).
    @discardableResult
    func upload(_ path: String, method: String = "POST", fields: [(String, String)], files: [(field: String, name: String, type: String, data: Data)]) async throws -> (JSONValue?, HTTPURLResponse) {
        var r = try request(method, path, server: nil)
        let boundary = "LawFive-\(UUID().uuidString)"
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var data = Data()
        for (name, value) in fields {
            data.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        for f in files {
            data.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(f.field)\"; filename=\"\(f.name)\"\r\nContent-Type: \(f.type)\r\n\r\n".utf8))
            data.append(f.data)
            data.append(Data("\r\n".utf8))
        }
        data.append(Data("--\(boundary)--\r\n".utf8))
        r.httpBody = data
        r.timeoutInterval = 120
        return try await send(r)
    }

    /// A file from the API (the account's export), kept in a temporary place under this name.
    func download(_ path: String, name: String) async throws -> URL {
        let (file, response) = try await client.download(for: try request("GET", path, server: nil))
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let status = http.statusCode
        guard (200..<300).contains(status) else {
            guard ServerError.isLawFive(http, (try? Data(contentsOf: file)) ?? Data()) else { throw URLError(.badServerResponse) }
            throw ServerError(status: status, message: "The server answered \(status)", body: nil)
        }
        let kept = FileManager.default.temporaryDirectory.appending(path: name)
        try? FileManager.default.removeItem(at: kept)
        try FileManager.default.moveItem(at: file, to: kept)
        return kept
    }

    /// Bytes from the API (photos), with the session's sign-in.
    func bytes(_ path: String) async throws -> Data {
        let (data, response) = try await client.data(for: try request("GET", path, server: nil))
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let status = http.statusCode
        guard (200..<300).contains(status) else {
            guard ServerError.isLawFive(http, data) else { throw URLError(.badServerResponse) }
            throw ServerError(status: status, message: "The server answered \(status)", body: nil)
        }
        return data
    }

    private func send(_ r: URLRequest) async throws -> (JSONValue?, HTTPURLResponse) {
        let (data, response) = try await client.data(for: r)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let isJSON = (http.value(forHTTPHeaderField: "Content-Type") ?? "").contains("json")
        let parsed = isJSON && !data.isEmpty ? try? jsonDecoder.decode(JSONValue.self, from: data) : nil
        guard (200..<300).contains(http.statusCode) else {
            guard ServerError.isLawFive(http, data) else { throw URLError(.badServerResponse) }
            // Sign-in and linking errors (Better Auth's) give a code in error and the words in error_description.
            let words = ["error_description", "error", "message"].lazy.compactMap { parsed?[$0]?.string }.first
            throw ServerError(status: http.statusCode, message: words ?? "The server answered \(http.statusCode)", body: parsed)
        }
        return (parsed, http)
    }
}
