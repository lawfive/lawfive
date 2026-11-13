import Foundation

// Decision 4c: linking from the paired iPhone, the watch's side, as the Garmin's PhoneLink.mc. The
// phone offers its server and account (again every few seconds until it hears back), the watch asks
// "Link to {server}?", and on yes answers with which watch it is; the phone gets it a token of its own
// and sends the server and the token, which the watch keeps only for the server and the offer it said
// yes to (SEC-5), then says "linked". Nothing here needs watchOS, so the engine tests run it on the Mac.
//
//   phone -> watch  {"lawfive": 1, "kind": "offer", "id", "server", "account", "until"}
//   watch -> phone  {"lawfive": 1, "kind": "accept" | "decline" | "busy", "id", "device"}
//   phone -> watch  {"lawfive": 1, "kind": "link", "id", "server", "token"} or {"kind": "failed", "id", "message"}
//   watch -> phone  {"lawfive": 1, "kind": "linked", "id", "device"}

struct PhoneOffer: Equatable {
    let id: Int
    let server: String
    let account: String?
}

/// What the watch shows of a link from the phone.
enum PhoneLinkStep: Equatable {
    /// "Link to {server}?"
    case asking
    /// Said yes: waiting for the token.
    case linking
    case linked
    case problem(String)
}

/// What the rules want done: a reply to the phone, or the server and token to keep.
enum PhoneLinkAction: Equatable {
    case reply(kind: String, id: Int)
    case keep(server: String, token: String)
}

struct PhoneLinkRules {
    private(set) var offer: PhoneOffer?
    private(set) var step: PhoneLinkStep?
    private var accepted = false
    /// When the question was put, and when the token stops being waited for (seconds since 1970).
    private var askedAt: Double = 0
    private var waitUntil: Double = 0

    /// How long the question waits on screen before a new offer asks again.
    static let askSeconds: Double = 30
    /// How long the token is waited for once the wearer says yes.
    static let waitSeconds: Double = 40

    /// A message from the phone. `inMatch`: a match is on, which linking mustn't interrupt.
    mutating func receive(_ m: [String: Any], now: Double, inMatch: Bool) -> [PhoneLinkAction] {
        guard m["lawfive"] != nil, let kind = m["kind"] as? String, let id = Self.number(m["id"]) else { return [] }
        switch kind {
        case "offer":
            guard let server = m["server"] as? String, !server.isEmpty else { return [] }
            // An offer found later in the application context, after it lapsed.
            if let until = Self.double(m["until"]), until < now { return [] }
            if inMatch { return [.reply(kind: "busy", id: id)] }
            if let current = offer {
                // The same offer again (the phone sends it until it hears back).
                if current.id == id { return [] }
                // A new offer while linking for the last: that finishes first.
                if accepted { return [] }
                // A new offer while the question is on screen: the answer goes to the new one.
                if now - askedAt < Self.askSeconds {
                    offer = PhoneOffer(id: id, server: server, account: m["account"] as? String)
                    return []
                }
            }
            offer = PhoneOffer(id: id, server: server, account: m["account"] as? String)
            accepted = false
            askedAt = now
            step = .asking
            return []
        case "link":
            guard let o = offer, accepted, let server = m["server"] as? String, let token = m["token"] as? String, !token.isEmpty else { return [] }
            // SEC-5: only the server the wearer said yes to, for the offer they answered.
            guard server == o.server, id == o.id else { return [] }
            offer = nil
            accepted = false
            step = .linked
            return [.keep(server: server, token: token), .reply(kind: "linked", id: id)]
        case "failed":
            guard let o = offer, o.id == id else { return [] }
            offer = nil
            accepted = false
            step = .problem((m["message"] as? String) ?? "Couldn't link")
            return []
        default:
            return []
        }
    }

    /// The answer to "Link to …?": yes waits for the token, no tells the phone.
    mutating func answer(yes: Bool, now: Double) -> [PhoneLinkAction] {
        guard let o = offer, !accepted else { return [] }
        if !yes {
            offer = nil
            step = nil
            return [.reply(kind: "decline", id: o.id)]
        }
        accepted = true
        waitUntil = now + Self.waitSeconds
        step = .linking
        return [.reply(kind: "accept", id: o.id)]
    }

    /// Every so often while linking: no token in time.
    mutating func tick(now: Double) {
        if offer != nil, accepted, now > waitUntil {
            offer = nil
            accepted = false
            step = .problem("The phone didn't answer")
        }
    }

    /// The screen closed (Done, or the question put away).
    mutating func dismiss() {
        if step != .linking { step = nil }
        if !accepted { offer = nil }
    }

    /// "lawfive.example.com" from "https://lawfive.example.com".
    static func host(_ server: String) -> String {
        server.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    private static func number(_ v: Any?) -> Int? {
        if let i = v as? Int { return i }
        if let d = v as? Double { return Int(d) }
        return nil
    }

    private static func double(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        return nil
    }
}
