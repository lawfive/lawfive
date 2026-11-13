import Foundation
import Observation

// The phone linking a watch (IOS-9, as APP-12, SYNC-13 and Android's WatchLinker.kt), so nobody types a
// server address or a code on it. The watch is offered this phone's server and account (again every
// few seconds until it answers); when it says yes, with which watch it is, the phone links it as the
// website's Link page would: it asks for a code in the watch's name, approves it with its own
// session and collects the watch's own token, then sends the server and the token. The watch's side
// is watch-garmin/source/PhoneLink.mc, which lists the messages. The paired Apple Watch is linked the
// same way, with the same messages over WatchConnectivity (AppleWatchLink.swift; its side is
// LawFiveWatch/PhoneLink.swift), under its own client id.

enum LinkStep: Equatable { case offering, linking, linked, declined, busy, noAnswer, failed }

/// Where linking a watch has got to, for the Link a watch screen.
struct LinkState: Equatable {
    let watch: UUID
    let step: LinkStep
    var message: String?
}

@MainActor
@Observable
final class WatchLinker {
    private(set) var state: LinkState?
    @ObservationIgnored private let api: Api
    @ObservationIgnored private let account: () -> (server: String, name: String)?
    @ObservationIgnored private let send: (UUID, JSONValue) -> Void
    @ObservationIgnored private let open: (UUID) -> Void
    @ObservationIgnored private var job: Task<Void, Never>?
    /// Offers are numbered from the time, so one made after the app restarts never repeats an earlier number.
    @ObservationIgnored private var offerId = Int(Date().timeIntervalSince1970) % 1_000_000

    /// The device-code client the watch's token is asked for under: lawfive-garmin, or lawfive-applewatch.
    @ObservationIgnored private let clientId: String
    /// How long the offer stands (someone may need to open LawFive on the watch first).
    private static let offerSeconds: TimeInterval = 60
    private static let resendSeconds: Double = 4
    /// How often the watch is asked again to open LawFive while the offer stands.
    private static let promptSeconds: TimeInterval = 20
    private static let linkedSeconds: Double = 20
    private static let tokenTries = 6

    init(api: Api, clientId: String = "lawfive-garmin", account: @escaping () -> (server: String, name: String)?, send: @escaping (UUID, JSONValue) -> Void, open: @escaping (UUID) -> Void) {
        self.api = api
        self.clientId = clientId
        self.account = account
        self.send = send
        self.open = open
    }

    func offer(_ watch: UUID) {
        guard let me = account() else { return }
        offerId += 1
        let offer = message("offer", offerId, ["server": trimmed(me.server), "account": me.name])
        job?.cancel()
        state = LinkState(watch: watch, step: .offering)
        open(watch)
        job = Task { [weak self] in
            let start = Date()
            var prompts = 1.0
            while let self, self.state?.step == .offering, Date().timeIntervalSince(start) < WatchLinker.offerSeconds, !Task.isCancelled {
                self.send(watch, offer)
                try? await Task.sleep(for: .seconds(WatchLinker.resendSeconds))
                // The watch asks its wearer to open LawFive again, in case the first ask was missed or not shown.
                if Date().timeIntervalSince(start) > prompts * WatchLinker.promptSeconds {
                    prompts += 1
                    self.open(watch)
                }
            }
            if let self, self.state?.step == .offering, !Task.isCancelled { self.state = LinkState(watch: watch, step: .noAnswer) }
        }
    }

    func dismiss() {
        job?.cancel()
        state = nil
    }

    /// The watch's answers to an offer; false when the message isn't one of them.
    func onMessage(watch: UUID, body: JSONValue) -> Bool {
        guard let kind = body["kind"]?.string, ["accept", "decline", "busy", "linked"].contains(kind) else { return false }
        // Only the answer to the latest offer, from the watch it went to.
        guard let current = state, current.watch == watch, body["id"]?.intValue == offerId else { return true }
        switch kind {
        case "decline": finish(watch, .declined)
        case "busy": finish(watch, .busy)
        case "linked": finish(watch, .linked)
        default:
            if current.step == .offering {
                job?.cancel()
                state = LinkState(watch: watch, step: .linking)
                let id = offerId
                let device = body["device"]?.string ?? "garmin"
                job = Task { [weak self] in await self?.link(watch, id, device) }
            }
        }
        return true
    }

    private func finish(_ watch: UUID, _ step: LinkStep, _ message: String? = nil) {
        job?.cancel()
        state = LinkState(watch: watch, step: step, message: message)
    }

    private func link(_ watch: UUID, _ id: Int, _ device: String) async {
        guard let server = account()?.server else { return finish(watch, .failed, "Signed out") }
        do {
            let token = try await watchToken(device)
            send(watch, message("link", id, ["server": trimmed(server), "token": token]))
            // The watch says "linked" once it has kept the token.
            try await Task.sleep(for: .seconds(WatchLinker.linkedSeconds))
            if state?.step == .linking { finish(watch, .failed, "The watch didn't say it was linked. Check it, and try again if it isn't.") }
        } catch is CancellationError {
            return
        } catch {
            send(watch, message("failed", id, ["message": "Couldn't link"]))
            finish(watch, .failed, (error as? ServerError)?.message ?? "No connection to the server.")
        }
    }

    /// A token for the watch, as SYNC-1 gets one: a code asked for in the watch's name (its device
    /// header, so the server names it), looked up and approved with this phone's session, then collected.
    private func watchToken(_ device: String) async throws -> String {
        let code = try await api.callAs(device: device, "/v1/auth/device/code", body: .object(["client_id": .string(clientId)]))
        guard let userCode = code.answer?["user_code"]?.string, let deviceCode = code.answer?["device_code"]?.string else {
            throw ServerError(status: 0, message: "The server didn't give a code", body: nil)
        }
        var interval = Double(code.answer?["interval"]?.intValue ?? 5)
        // Looked up first, as the Link page does: that ties the code to this account, which approving needs.
        try await api.call("GET", "/v1/auth/device?user_code=\(userCode)")
        try await api.call("POST", "/v1/auth/device/approve", body: .object(["userCode": .string(userCode)]))
        for _ in 0..<WatchLinker.tokenTries {
            // The server wants the interval between asks, from when the code was given.
            try await Task.sleep(for: .seconds(interval + 0.3))
            let (status, answer) = try await api.callAs(device: device, "/v1/auth/device/token", body: .object([
                "grant_type": .string("urn:ietf:params:oauth:grant-type:device_code"),
                "device_code": .string(deviceCode),
                "client_id": .string(clientId),
            ]))
            if status == 200 {
                guard let token = answer?["access_token"]?.string else { throw ServerError(status: 0, message: "The server didn't give the watch a token", body: nil) }
                return token
            }
            switch answer?["error"]?.string {
            case "authorization_pending": break
            case "slow_down": interval += 5
            default: throw ServerError(status: status, message: answer?["error_description"]?.string ?? "The server didn't link the watch", body: nil)
            }
        }
        throw ServerError(status: 0, message: "The server didn't finish linking the watch", body: nil)
    }

    private func trimmed(_ server: String) -> String {
        var s = server
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    private func message(_ kind: String, _ id: Int, _ fields: [String: String]) -> JSONValue {
        var out: [String: JSONValue] = ["lawfive": .int(1), "kind": .string(kind), "id": .int(id)]
        for (k, v) in fields { out[k] = .string(v) }
        return .object(out)
    }
}
