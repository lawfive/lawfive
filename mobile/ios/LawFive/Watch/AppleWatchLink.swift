import Foundation
import Observation
import WatchConnectivity

// Decision 4c (IOS, WCH): the paired Apple Watch, linked from this phone over WatchConnectivity, as
// a Garmin is linked from the phone (IOS-9, WatchLinker.swift), so nobody types a code on the watch.
// When an Apple Watch is paired and LawFive is on it, Link a watch offers Link your Apple Watch: the
// same offer, accept, link and linked messages as the Garmin's, carried as JSON text under "lawfive"
// in WatchConnectivity's messages. The watch asks "Link to {server}?" (LawFive/Watch's PhoneLink.swift),
// and on yes the phone gets the watch a token of its own the way it does for a Garmin (a device code
// asked for in the watch's name, approved with this phone's session, collected) under the Apple
// Watch's client id, and sends the server and the token; the watch keeps them as linking with a code
// does. Linking with a code stays for when this doesn't reach the watch.

@MainActor
@Observable
final class AppleWatchLink: NSObject {
    /// An Apple Watch is paired with this phone.
    private(set) var paired = false
    /// LawFive is on it.
    private(set) var installed = false
    /// The watch's LawFive can be messaged now (it's open, or can be woken).
    private(set) var reachable = false
    /// The paired Apple Watch, as WatchLinker knows it (it links one watch at a time, by id).
    static let watchId = UUID(uuidString: "A991E000-0000-4000-8000-00000000A991")!
    @ObservationIgnored private(set) var linker: WatchLinker!
    @ObservationIgnored private let session: WCSession? = WCSession.isSupported() ? .default : nil

    /// Whether to offer Link your Apple Watch.
    var offered: Bool { paired && installed }

    init(api: Api, account: @escaping () -> (server: String, name: String)?) {
        super.init()
        linker = WatchLinker(api: api, clientId: "lawfive-applewatch", account: account, send: { [weak self] _, message in
            self?.send(message)
        }, open: { _ in
            // The phone can't open an app on the watch; Link a watch asks its wearer to.
        })
    }

    func start() {
        guard let session, session.delegate == nil else { return }
        session.delegate = self
        session.activate()
    }

    /// A message to the watch: straight to it while it can be reached; an offer otherwise also waits in
    /// the application context, for LawFive to find when it next opens on the watch, until it lapses.
    private func send(_ message: JSONValue) {
        guard let session, session.activationState == .activated else { return }
        let wrapped = AppleWatchLink.wrap(message, now: Date())
        if session.isReachable {
            session.sendMessage(wrapped, replyHandler: nil, errorHandler: nil)
        }
        if message["kind"]?.string == "offer" {
            try? session.updateApplicationContext(wrapped)
        } else if !session.isReachable {
            session.transferUserInfo(wrapped)
        }
    }

    /// Offering stopped (linked, declined, canceled): the watch no longer finds the offer waiting.
    func withdraw() {
        linker.dismiss()
        guard let session, session.activationState == .activated else { return }
        try? session.updateApplicationContext([:])
    }

    /// How long an offer stands on the watch, as WatchLinker's offer does on the phone.
    nonisolated static let offerSeconds: TimeInterval = 60

    /// A message as WatchConnectivity carries it: the JSON text under "lawfive", an offer with when it
    /// lapses ("until", seconds since 1970), so one found later in the application context is let go.
    nonisolated static func wrap(_ message: JSONValue, now: Date) -> [String: Any] {
        var fields = message.object ?? [:]
        if fields["kind"]?.string == "offer" { fields["until"] = .double((now.timeIntervalSince1970 + offerSeconds).rounded()) }
        return ["lawfive": JSONValue.object(fields).text]
    }

    /// A message from the watch, or nil when it isn't LawFive's.
    nonisolated static func unwrap(_ message: [String: Any]) -> JSONValue? {
        guard let text = message["lawfive"] as? String, let value = try? JSONValue(text: text), value["lawfive"] != nil else { return nil }
        return value
    }

    private func update(_ s: WCSession) {
        paired = s.isPaired
        installed = s.isWatchAppInstalled
        reachable = s.isReachable
    }

    private func received(_ message: [String: Any]) {
        guard let body = AppleWatchLink.unwrap(message) else { return }
        if linker.onMessage(watch: AppleWatchLink.watchId, body: body), let step = linker.state?.step, step != .offering, step != .linking {
            // Answered: the offer waiting in the application context goes.
            if let session, session.activationState == .activated { try? session.updateApplicationContext([:]) }
        }
    }
}

extension AppleWatchLink: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.update(session) }
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.update(session) }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in self.update(session) }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    /// Switching to another paired watch: the session starts again for the new one.
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let copy = message.compactMapValues { $0 as? String }
        Task { @MainActor in self.received(copy) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        let copy = userInfo.compactMapValues { $0 as? String }
        Task { @MainActor in self.received(copy) }
    }
}
