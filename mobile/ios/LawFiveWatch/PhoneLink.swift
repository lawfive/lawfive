import Foundation
import Observation
import SwiftUI
import WatchConnectivity

// Decision 4c: the paired iPhone links this watch (its side of AppleWatchLink.swift in the iPhone
// app) over WatchConnectivity, by the rules in PhoneLinkRules.swift: "Link to {server}?", then the
// token kept as linking with a code keeps it (WCH-4, SYNC-1). Messages go as JSON text under "lawfive".

@MainActor
@Observable
final class PhoneLink: NSObject {
    private(set) var rules = PhoneLinkRules()
    @ObservationIgnored private weak var state: AppState?
    @ObservationIgnored private let session: WCSession? = WCSession.isSupported() ? .default : nil
    @ObservationIgnored private var ticking: Task<Void, Never>?

    var step: PhoneLinkStep? { rules.step }
    var offer: PhoneOffer? { rules.offer }

    func start(_ state: AppState) {
        self.state = state
        guard let session, session.delegate == nil else { return }
        session.delegate = self
        session.activate()
    }

    /// Under the question: the account it links as, or the server it takes the place of.
    var detail: String? {
        guard let offer, let state else { return nil }
        if state.linked, state.serverUrl != offer.server { return "Instead of \(PhoneLinkRules.host(state.serverUrl))" }
        return offer.account.map { "As \($0)" }
    }

    func answer(_ yes: Bool) {
        act(rules.answer(yes: yes, now: Date().timeIntervalSince1970))
        guard yes else { return }
        ticking?.cancel()
        ticking = Task { [weak self] in
            while let self, self.rules.step == .linking, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                self.rules.tick(now: Date().timeIntervalSince1970)
            }
        }
    }

    /// The screen put away: while it asks, that's a no, so the phone isn't left waiting.
    func dismiss() {
        if rules.step == .asking { answer(false) } else { rules.dismiss() }
    }

    private func received(_ message: [String: Any]) {
        guard let text = message["lawfive"] as? String, let data = text.data(using: .utf8),
              let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        act(rules.receive(body, now: Date().timeIntervalSince1970, inMatch: state?.match != nil))
    }

    private func act(_ actions: [PhoneLinkAction]) {
        for action in actions {
            switch action {
            case .keep(let server, let token):
                guard let state else { continue }
                // A watch linked elsewhere leaves that link; what waits to upload stays (SYNC-6).
                if state.linked { state.unlink() }
                state.setServer(server)
                state.linkWith(token)
            case .reply(let kind, let id):
                reply(kind, id)
            }
        }
    }

    private func reply(_ kind: String, _ id: Int) {
        guard let session, session.activationState == .activated else { return }
        let body: [String: Any] = ["lawfive": 1, "kind": kind, "id": id, "device": Server.deviceHeader]
        guard let data = try? JSONSerialization.data(withJSONObject: body), let text = String(data: data, encoding: .utf8) else { return }
        let message = ["lawfive": text]
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in session.transferUserInfo(message) }
        } else {
            session.transferUserInfo(message)
        }
    }
}

extension PhoneLink: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // An offer that waited while LawFive was closed.
        let waiting = session.receivedApplicationContext.compactMapValues { $0 as? String }
        Task { @MainActor in self.received(waiting) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let copy = message.compactMapValues { $0 as? String }
        Task { @MainActor in self.received(copy) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let copy = applicationContext.compactMapValues { $0 as? String }
        Task { @MainActor in self.received(copy) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        let copy = userInfo.compactMapValues { $0 as? String }
        Task { @MainActor in self.received(copy) }
    }
}

/// "Link to {server}?" from the phone, then Linking… and Linked, or what went wrong.
struct PhoneLinkScreen: View {
    let link: PhoneLink
    @Environment(\.dismiss) private var close

    var body: some View {
        Group {
            switch link.step {
            case .asking:
                // The server's name whole, over as many lines as it needs (a self-hosted one can be long).
                ScrollView {
                    VStack(spacing: 6) {
                        Text("Link to \(PhoneLinkRules.host(link.offer?.server ?? ""))?").font(.barlow(18, .semibold)).multilineTextAlignment(.center).foregroundStyle(C.text)
                            .fixedSize(horizontal: false, vertical: true)
                        if let detail = link.detail { Text(detail).font(.barlow(13, .regular)).foregroundStyle(C.dim).multilineTextAlignment(.center) }
                        PillButton(label: "Link", color: C.start) { link.answer(true) }.padding(.top, 6)
                        PillButton(label: "No", color: C.row) { link.answer(false) }
                    }
                }
            case .linking:
                VStack(spacing: 6) {
                    ProgressView()
                    Text("Linking…").font(.barlow(17, .semibold)).foregroundStyle(C.text)
                    Text("Your iPhone is linking this watch").font(.barlow(13)).foregroundStyle(C.dim).multilineTextAlignment(.center)
                }
            case .linked:
                VStack(spacing: 6) {
                    Text("Linked").font(.barlow(20, .semibold)).foregroundStyle(C.brand)
                    Text("Your next matches are on their way").font(.barlow(13)).foregroundStyle(C.dim).multilineTextAlignment(.center)
                    PillButton(label: "Done") { link.dismiss() }.padding(.top, 6)
                }
            case .problem(let words):
                VStack(spacing: 6) {
                    Text(words).font(.barlow(16, .semibold)).foregroundStyle(C.red).multilineTextAlignment(.center)
                    Text("Try again from the phone, or link with a code in Settings → Account").font(.barlow(12)).foregroundStyle(C.dim).multilineTextAlignment(.center)
                    PillButton(label: "Done") { link.dismiss() }.padding(.top, 6)
                }
            case nil:
                Color.clear.onAppear { close() }
            }
        }
        .padding(.horizontal, 6)
    }
}
