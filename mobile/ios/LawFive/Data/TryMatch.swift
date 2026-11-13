import Foundation

// DEMO-9: Try a match from an address. lawfive.app's Try a match needs no sign-in and takes the watch and
// the match screen in its address, under the API's names, so the phone opens it in its own browser view with
// the account's choices (SYNC-15's Try a match, Settings → Match screen's). The same as the website's
// (`tryMatchUrl`, `tryWatchFor` and `tryMatchSite` in schema/src/screen.ts) and Android's, tested with the
// same cases. The same address for every server, self-hosted too, as nothing about the account goes.

enum TryMatch {
    /// The watches Try a match draws: a five-button Garmin, a Venu, Wear OS or Apple Watch.
    static let watches = ["garmin", "venu", "wearos", "apple"]

    /// lawfive.app's Try a match, which needs no sign-in.
    static let site = "https://lawfive.app/try"

    /// Which watch Try a match shows for a linked one, from its kind (GET /v1/devices) or the app that linked
    /// it (the code's `client_id`), and its name: a Venu as the Venu.
    static func watch(for kind: String?, name: String? = nil) -> String {
        if kind == "applewatch" || kind == "lawfive-applewatch" { return "apple" }
        if kind == "wearos" || kind == "lawfive-wear" { return "wearos" }
        return (name ?? "").range(of: "venu", options: .caseInsensitive) != nil ? "venu" : "garmin"
    }

    /// Try a match's address with the watch and the match screen in it, in the website's order; nothing else.
    /// UI-22: the second clock is never the match clock.
    static func url(watch: String, screen: ScreenSetup, teamSwipes: String? = nil, base: String = site) -> URL? {
        var parts = URLComponents(string: base)
        var query = [
            ("watch", watch), ("clocks", screen.clocks), ("mainClock", screen.mainClock),
            ("secondClock", WatchPreview.secondStyle(screen.mainClock, screen.secondClock)), ("breakClock", screen.breakClock),
            ("edge", screen.edge), ("names", screen.names ? "true" : "false"),
        ]
        if let teamSwipes { query.append(("teamSwipes", teamSwipes)) }
        parts?.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        return parts?.url
    }
}
