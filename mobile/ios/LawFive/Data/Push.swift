import FirebaseCore
import FirebaseMessaging
import Foundation
import UIKit

// Notifications from the server (PUSH-4, PUSH-5, NOTE-4), as Android's Push.kt. The phone gets a
// Firebase token (from its APNs token), swaps it at the push relay for a handle only the relay can
// read, and gives that to its server while weather risks or matches from integrations are turned on,
// saying which of them it wants (NOTE-5). A push says only which match or notice; the notification
// service extension (LawFiveNotifications/) asks the server for the rest and writes it. Firebase
// starts only once one of them is on, so a phone that never turns them on never talks to Google.

/// What was last registered: a new token, another server or an old handle means registering again.
func needsRegistering(token: String, server: String, registeredToken: String?, registeredServer: String?, registeredAt: Date?, now: Date) -> Bool {
    token != registeredToken || server != registeredServer || registeredAt.map { now.timeIntervalSince($0) > Push.renewAfter } ?? true
}

/// What `Push.refresh` does: get a handle from the relay and give it to the server, only tell the server what's wanted, or nothing.
enum PushStep: Equatable { case register, tell, nothing }

/// What the server is told this phone wants: matches from integrations (NOTE-5) and weather risks
/// (PUSH-5), so it sends each only where it will show, as an iPhone can't drop one it's sent.
struct PushWants: Codable, Equatable {
    var notices: Bool
    var risks: Bool
}

/// NOTE-5: the server keeps what this phone wants, so it's told again when that changes, with the
/// handle it has. Registering again is only for a new token or server, an old handle, or none kept.
func pushStep(needsRegistering: Bool, handle: String?, wants: PushWants, told: PushWants?) -> PushStep {
    if needsRegistering { return .register }
    if told == wants { return .nothing }
    return handle == nil ? .register : .tell
}

/// Firebase 13 marks the registration token deprecated for its newer registration by installation
/// ID, which the relay doesn't send to; tokens still work, and they're what Android sends.
private protocol RegistrationToken {
    func token() async throws -> String
}

extension Messaging: RegistrationToken {}

/// The app delegate's word on APNs (LawFiveApp.swift), for the Push that asked.
@MainActor enum RemoteNotifications {
    static var onToken: ((Data?) -> Void)?
}

@MainActor
final class Push: NSObject, MessagingDelegate {
    nonisolated static let renewAfter: TimeInterval = 30 * 86_400

    /// What was registered, kept between runs.
    private struct Registered: Codable {
        var token: String
        var server: String
        var at: Date
        var handle: String
        var told: PushWants?
    }

    private unowned let graph: AppGraph
    private let defaults: UserDefaults
    /// This build has Firebase's settings (GoogleService-Info.plist, tools/firebase-settings.sh) to get tokens with.
    let available: Bool
    private let relay: String
    /// Not the API's client: that one adds the session's sign-in, which the relay has no business seeing.
    private let relayClient = URLSession(configuration: .ephemeral)
    private var apnsToken: Data?
    private var waiting: [CheckedContinuation<Data?, Never>] = []

    init(graph: AppGraph, defaults: UserDefaults, available: Bool? = nil) {
        self.graph = graph
        self.defaults = defaults
        self.available = available ?? (Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil)
        relay = (Bundle.main.object(forInfoDictionaryKey: "LFPushRelay") as? String)?.orNil ?? "https://push.lawfive.app"
    }

    /// The app's own, at launch: APNs' answers come here, and Firebase starts if either is already on (for its token's renewals).
    func start() {
        RemoteNotifications.onToken = { [weak self] token in self?.apns(token) }
        if wanted { startFirebase() }
    }

    private var wanted: Bool { graph.reminders.settings.weatherRisks || graph.reminders.settings.integrations }

    private func startFirebase() {
        guard available, FirebaseApp.app() == nil else { return }
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
    }

    /// This build and the server can do it (Settings, where it's asked, is only there signed in).
    func offered() async -> Bool {
        guard available else { return false }
        return await graph.offers("push")
    }

    /// NOTE-4: and the server tells phones what integrations do.
    func noticesOffered() async -> Bool {
        guard await offered() else { return false }
        return await graph.offers("notices")
    }

    private var registered: Registered? {
        get { defaults.data(forKey: "push").flatMap { try? jsonDecoder.decode(Registered.self, from: $0) } }
        set { defaults.set(newValue.flatMap { try? jsonEncoder.encode($0) }, forKey: "push") }
    }

    /// Brings the server up to date with what's wanted. Throws if it can't be reached, to be tried again at the next sync.
    func refresh() async throws {
        let session = graph.session
        guard available, session.signedIn else { return }
        let settings = graph.reminders.settings
        let wants = PushWants(notices: settings.integrations, risks: settings.weatherRisks)
        guard wants.notices || wants.risks, await graph.reminders.canNotify() else {
            if registered != nil {
                try await graph.api.call("PUT", "/v1/devices/current/push", body: .object(["handle": .null]))
                forget()
            }
            return
        }
        guard await offered() else { return }
        startFirebase()
        guard let token = await firebaseToken() else { return }
        let saved = registered
        let registering = needsRegistering(token: token, server: session.server, registeredToken: saved?.token, registeredServer: saved?.server, registeredAt: saved?.at, now: Date())
        let step = pushStep(needsRegistering: registering, handle: saved?.handle, wants: wants, told: saved?.told)
        guard step != .nothing else { return }
        let handle = step == .register ? try await register(token, server: session.server) : saved!.handle
        // NOTE-5, PUSH-5: with what this phone wants, so the server sends each only where it'll show.
        try await graph.api.call("PUT", "/v1/devices/current/push", body: .object(["handle": .string(handle), "notices": .bool(wants.notices), "risks": .bool(wants.risks)]))
        registered = step == .register ? Registered(token: token, server: session.server, at: Date(), handle: handle, told: wants) : saved.map { var r = $0; r.told = wants; return r }
    }

    /// Signed out: the session and its handle have gone from the server.
    func forget() {
        registered = nil
    }

    /// Firebase's token for this phone, once APNs has given it one.
    private func firebaseToken() async -> String? {
        guard let apns = await apnsToken() else { return nil }
        Messaging.messaging().apnsToken = apns
        return try? await (Messaging.messaging() as RegistrationToken).token()
    }

    /// Asks iOS for this phone's APNs token, and waits for it a while (none on a build without the Push Notifications capability).
    private func apnsToken() async -> Data? {
        if let apnsToken { return apnsToken }
        UIApplication.shared.registerForRemoteNotifications()
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(20))
            self?.apns(nil, timedOut: true)
        }
        return await withCheckedContinuation { waiting.append($0) }
    }

    private func apns(_ token: Data?, timedOut: Bool = false) {
        if let token { apnsToken = token } else if timedOut, apnsToken != nil { return }
        let all = waiting
        waiting = []
        for w in all { w.resume(returning: token ?? apnsToken) }
    }

    private func register(_ token: String, server: String) async throws -> String {
        var relay = relay
        while relay.hasSuffix("/") { relay.removeLast() }
        guard let url = URL(string: relay + "/v1/register") else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try jsonEncoder.encode(JSONValue.object(["token": .string(token), "server": .string(server), "platform": .string("ios")]))
        let (data, response) = try await relayClient.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ServerError(status: (response as? HTTPURLResponse)?.statusCode ?? 0, message: "The push relay answered \((response as? HTTPURLResponse)?.statusCode ?? 0)", body: nil)
        }
        guard let handle = (try? jsonDecoder.decode(JSONValue.self, from: data))?["handle"]?.string else {
            throw ServerError(status: 0, message: "The push relay sent no handle", body: nil)
        }
        return handle
    }

    /// Firebase's word that the token changed.
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor in try? await self.refresh() }
    }
}
