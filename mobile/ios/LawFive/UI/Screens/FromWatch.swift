import SwiftUI

// What came in from the watch (APP-26, as Android's): after a sync brings played matches the phone
// hadn't had, recorded on a watch, a summary of each over everything, in the sync screen's layout once
// it's done (APP-16). It takes over from the sync screen when that's showing, and otherwise opens by
// itself when the app is next in front. The matches wait in the session until it closes.

/// A match report from a watch, with its match.
struct FromWatchMatch: Identifiable, Equatable {
    let record: MatchRecord
    let match: Match
    var id: String { record.id }

    /// When it was played: the kickoff, else the first period's start.
    var when: Date? { instantOf(match.kickoff) ?? instantOf(record.periods.first?.startedAt) }
}

/// The waiting reports the phone has, with their matches, newest first. One whose match hasn't come
/// down yet waits for it.
func fromWatchMatches(_ ids: [String], records: [MatchRecord], matches: [Match]) -> [FromWatchMatch] {
    ids.compactMap { id in
        guard let r = records.first(where: { $0.id == id }), let m = r.matchId.flatMap({ mid in matches.first { $0.id == mid } }) else { return nil }
        return FromWatchMatch(record: r, match: m)
    }
    .sorted { ($0.when ?? .distantPast) > ($1.when ?? .distantPast) }
}

/// "4 goals · 2 cautions · 1 sin bin · 1 send-off", or "No goals or cards". A second caution counts as a
/// caution and a send-off, and a second sin bin as a sin bin and a send-off, as Stats count them (STAT-13, EVT-12).
func describeCards(_ r: MatchRecord) -> String {
    let goals = r.score.home + r.score.away
    let second = r.events.filter { if case .secondCaution = $0 { return true } else { return false } }.count
    let secondSinBins = r.events.filter { if case .secondSinBin = $0 { return true } else { return false } }.count
    let cautions = second + r.events.filter { if case .caution = $0 { return true } else { return false } }.count
    let sinBins = secondSinBins + r.events.filter { if case .sinBin = $0 { return true } else { return false } }.count
    let sendOffs = second + secondSinBins + r.events.filter { if case .sendOff = $0 { return true } else { return false } }.count
    let parts = [
        goals > 0 ? "\(goals) \(goals == 1 ? "goal" : "goals")" : nil,
        cautions > 0 ? "\(cautions) \(cautions == 1 ? "caution" : "cautions")" : nil,
        sinBins > 0 ? "\(sinBins) \(sinBins == 1 ? "sin bin" : "sin bins")" : nil,
        sendOffs > 0 ? "\(sendOffs) \(sendOffs == 1 ? "send-off" : "send-offs")" : nil,
    ].compactMap { $0 }
    return parts.isEmpty ? "No goals or cards" : parts.joined(separator: " · ")
}

/// The periods' time played, in whole minutes; nil when none was recorded.
func minutesPlayed(_ r: MatchRecord) -> Int? {
    let sec = r.periods.reduce(0) { $0 + $1.playedSec }
    return sec > 0 ? Int((Double(sec) / 60).rounded()) : nil
}

struct FromWatchScreen: View {
    let matches: [FromWatchMatch]
    let open: (FromWatchMatch) -> Void
    let done: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // As the sync screen once it's done, so taking over from it moves nothing.
            Avatar(icon: .check, size: 56).frame(height: 112)
            Text(matches.count == 1 ? "Match from your watch" : "\(matches.count) matches from your watch")
                .font(.lfHeadlineLarge).foregroundStyle(LF.text).multilineTextAlignment(.center).textCase(.uppercase)
            Text("Synced to your account").font(.lfBodyMedium).foregroundStyle(LF.muted).multilineTextAlignment(.center).padding(.top, 6)
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(matches) { item in
                        FromWatchCard(item: item) { open(item) }
                    }
                }
                .padding(.top, 20)
            }
            PrimaryButton("Done", wide: true, action: done).padding(.top, 16)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { PitchStripes() }
    }
}

/// One match: the team-sheet row's kits, teams and score, then a muted line for each thing it has.
private struct FromWatchCard: View {
    let item: FromWatchMatch
    let open: () -> Void
    @Environment(AppGraph.self) private var graph

    private enum TrackState: Equatable {
        case missing
        case kept(TrackSummary?)
    }

    /// Whether the server has its track, and its figures; nil until it answers (or offline).
    @State private var track: TrackState?

    var body: some View {
        let r = item.record
        let m = item.match
        Button(action: open) {
            HStack(alignment: .top, spacing: 0) {
                KitStripe(m: m)
                VStack(alignment: .leading, spacing: 4) {
                    side(home: true)
                    side(home: false)
                    if let p = r.penalties { Text("\(p.home)–\(p.away) on penalties").font(.lfBodySmall).foregroundStyle(LF.muted) }
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(lines(r, m), id: \.self) { line in
                            Text(line).font(.lfBodySmall).foregroundStyle(LF.muted).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 12).padding(.vertical, 12)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LF.surface)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(LF.panelEdge, lineWidth: 1))
            .hardDrop(LF.panelShadow, RoundedRectangle(cornerRadius: 6))
            .ground(.panel)
        }
        .buttonStyle(PressStyle())
        .task(id: r.id) {
            do {
                let body = try await graph.api.call("GET", "/v1/match-records/\(r.id)/track")
                track = .kept(try? body?["summary"]?.decoded(as: TrackSummary.self))
            } catch let e as ServerError where e.status == 404 {
                track = .missing
            } catch {
                // Offline: neither said.
            }
        }
    }

    private func side(home: Bool) -> some View {
        let team = home ? item.match.home : item.match.away
        let score = item.record.score
        let (mine, theirs) = home ? (score.home, score.away) : (score.away, score.home)
        return HStack(spacing: 10) {
            TeamBadge(team: team, other: home ? item.match.away : item.match.home, home: home)
            Text(teamName(team, home: home)).font(.lfTitleMedium).foregroundStyle(LF.text).lineLimit(1)
            Spacer(minLength: 8)
            Text("\(mine)").font(.display(22)).foregroundStyle(theirs > mine ? LF.muted : LF.text)
        }
    }

    private func lines(_ r: MatchRecord, _ m: Match) -> [String] {
        let records = graph.records
        let zone = zoneOf(m)
        let when = item.when.map { formatShortDay($0, zone: zone) }
        let about = [when, records.competition(m.competitionId)?.name, m.role.map { roleNames[$0] ?? $0 }]
        let trackWords: String? = switch track {
        case .kept: "Track in"
        case .missing: "No track"
        case nil: nil
        }
        let movement = [r.distanceM.map { formatDistance($0, unit: records.units.distance) }, minutesPlayed(r).map { "\($0) min" }, trackWords]
        var heart: String?
        if case .kept(let summary) = track {
            let parts = [summary?.total.avgBpm.map { "\($0) avg" }, summary?.total.maxBpm.map { "\($0) max" }].compactMap { $0 }
            if !parts.isEmpty { heart = "Heart rate " + parts.joined(separator: " · ") }
        }
        let fee = m.fee.map { "\(money($0.amount, $0.currency)) · \($0.paid ? "Paid" : "Not paid")" }
        let crew = crewInOrder(m.crew, you: nil).compactMap { o -> String? in
            guard case .member(_, let member) = o else { return nil }
            return records.referee(member.refereeId)?.name ?? member.name?.orNil
        }
        return [
            joined(about),
            describeCards(r),
            joined(movement),
            heart,
            fee,
            crew.isEmpty ? nil : "Crew: " + crew.joined(separator: ", "),
        ].compactMap { $0 }
    }

    private func joined(_ parts: [String?]) -> String? {
        let present = parts.compactMap { $0 }
        return present.isEmpty ? nil : present.joined(separator: " · ")
    }
}
