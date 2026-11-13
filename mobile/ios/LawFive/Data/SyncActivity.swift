import Foundation
import Observation

// What's syncing, item by item (APP-16, as Android's), for the screen that shows it. It only comes up
// for a big sync: the first after signing in, or a lot of changes at once. Everyday syncs stay in
// their few words at the top of the page (IOS-3).

struct SyncRow: Identifiable, Equatable {
    let id: String
    var title: String
    var detail: String?
    var done = false
}

@MainActor
@Observable
final class SyncActivity {
    /// How many things at once count as a big sync.
    static let big = 10
    /// A moment on the finished list before it says so.
    static let quiet: TimeInterval = 1
    static let closeAfter: TimeInterval = 4
    /// Most interesting first, and in the same order every time.
    private static let names = [
        ("matches", "Matches"), ("match-records", "Match reports"), ("referees", "Referees"), ("venues", "Venues"),
        ("competitions", "Competitions"), ("match-templates", "Templates"),
    ]

    private(set) var show = false
    private(set) var rows: [SyncRow] = []
    private(set) var finished = false
    /// Why it stopped, in words: it carries on by itself when it can.
    private(set) var problem: String?

    @ObservationIgnored private let clock: () -> Date
    @ObservationIgnored private var syncing = false
    @ObservationIgnored private var hidden = false
    @ObservationIgnored private var lastActive = Date.distantPast
    @ObservationIgnored private var finishedAt = Date.distantPast
    @ObservationIgnored private var pulledSoFar: [String: Int] = [:]
    @ObservationIgnored private var watchMatches: [Int: String] = [:]
    /// A watch sends a piece at a time, so a pause isn't the end until it's longer.
    @ObservationIgnored private var fromWatch = false
    static let watchQuiet: TimeInterval = 8
    /// APP-26: a match from the watch reached the server, so a sync brings it down for the summary.
    @ObservationIgnored var watchSent: () -> Void = {}

    init(clock: @escaping () -> Date = Date.init) {
        self.clock = clock
    }

    private func put(_ row: SyncRow, big: Bool = true) {
        lastActive = clock()
        // Something new after the last one finished is a new sync.
        if finished {
            rows = []
            hidden = false
            show = false
        }
        show = (show || big) && !hidden
        if let i = rows.firstIndex(where: { $0.id == row.id }) { rows[i] = row } else { rows.append(row) }
        finished = false
        problem = nil
    }

    /// A match from the watch (IOS-9); `sent` when the server has it, `kept` when it waits on this phone for signal.
    func watchMatch(created: Int, title: String, sent: Bool, kept: Bool = false) {
        watchMatches[created] = title
        fromWatch = true
        let detail = kept ? "Kept on this phone until there's signal" : sent ? "Match sent" : "Sending the match"
        put(SyncRow(id: "watch:\(created)", title: title, detail: detail, done: sent || kept))
        if sent && !kept { watchSent() }
    }

    /// A chunk of a match's track from the watch.
    func watchTrack(created: Int, index: Int, count: Int, kept: Bool = false) {
        fromWatch = true
        let detail = kept ? "Track kept on this phone until there's signal" : "Track: \(index + 1) of \(count)"
        put(SyncRow(id: "watch:\(created)", title: watchMatches[created] ?? "Match from your watch", detail: detail, done: kept || index + 1 >= count))
    }

    func syncStarted() {
        syncing = true
        lastActive = clock()
        pulledSoFar = [:]
    }

    func pushing(done: Int, total: Int, name: String) {
        guard total >= Self.big else { return }
        put(SyncRow(id: "push", title: "Your changes", detail: done >= total ? "\(total) sent" : "\(done + 1) of \(total) · \(name)", done: done >= total))
    }

    /// A page of changes came down. Big once it's the first sync, or a lot at once.
    func pulled(counts: [String: Int], lastName: [String: String], first: Bool) {
        let big = (first && !counts.isEmpty) || counts.values.reduce(0, +) >= Self.big
        for (collection, count) in counts { pulledSoFar[collection, default: 0] += count }
        for (collection, name) in Self.names where counts[collection] != nil {
            // A report has no name of its own.
            let latest = collection == "match-records" ? nil : lastName[collection]
            let detail = ["\(pulledSoFar[collection] ?? 0)", latest].compactMap { $0 }.joined(separator: " · ")
            put(SyncRow(id: "pull:\(collection)", title: name, detail: detail), big: big)
        }
    }

    func syncFinished(problem: String?) {
        syncing = false
        lastActive = clock()
        if let problem, show {
            finishedAt = clock()
            finished = true
            self.problem = problem
        }
    }

    /// Called every second: done once nothing has moved for a little while, and gone a little after.
    func tick() {
        guard !rows.isEmpty else { return }
        let now = clock()
        if !finished {
            if !syncing, now.timeIntervalSince(lastActive) >= (fromWatch ? Self.watchQuiet : Self.quiet) {
                finishedAt = now
                finished = true
                rows = rows.map { var row = $0; row.done = true; return row }
            }
        } else if problem == nil, now.timeIntervalSince(finishedAt) >= Self.closeAfter {
            close()
        }
    }

    /// Keep using the app: it carries on, out of sight.
    func hide() {
        hidden = true
        show = false
    }

    func close() {
        hidden = false
        fromWatch = false
        show = false
        rows = []
        finished = false
        problem = nil
        pulledSoFar = [:]
    }
}
