import SwiftUI

// Matches (IOS-4, as WEB-2 and WEB-3): the next match, the week's figures, then the list, upcoming
// or past, searchable, each a team-sheet row.

struct MatchesScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var past = false
    @State private var query = ""
    @State private var chosenTags: [SearchTag] = []
    /// WEB-27: the fold as just tapped, shown until the saved setting catches up.
    @State private var fold: Bool?
    /// WEB-32: Get ready's own fetches (assignor calendars).
    @State private var getReadyFeeds = GetReadyFeeds()
    @Environment(\.accessibilityReduceMotion) private var lessMotion

    var body: some View {
        let records = graph.records
        let matches = records.matches ?? []
        let found = matches.filter { m in chosenTags.allSatisfy { (m.tags ?? []).contains($0.name) } && matchesSearch(m) }
        let allTags = Array(Set(matches.flatMap { $0.tags ?? [] })).sorted { $0.lowercased() < $1.lowercased() }
        let shown = found.filter { isUpcoming($0) != past }.sorted { a, b in
            past ? (a.kickoff ?? "9999") > (b.kickoff ?? "9999") : (a.kickoff ?? "9999") < (b.kickoff ?? "9999")
        }
        let now = AppClock.now
        let next = matches.filter { $0.status == "scheduled" && (instantOf($0.kickoff).map { $0 > now } ?? false) }
            .min { ($0.kickoff ?? "") < ($1.kickoff ?? "") }
        let thisWeek = matches.filter { isUpcoming($0) && $0.status == "scheduled" && (instantOf($0.kickoff).map { $0 < now.addingTimeInterval(7 * 86_400) } ?? false) }.count
        let unpaid = matches.filter { $0.fee != nil && $0.fee?.paid == false && $0.status != "cancelled" && !isUpcoming($0) }
        let owed = unpaid.reduce(0) { $0 + ($1.fee?.amount ?? 0) }
        // STAT-16: the one rule for counting games, as Stats counts them.
        let played = matches.filter(isGame).count
        let filtering = !(query.isEmpty && chosenTags.isEmpty)
        // WEB-26: under the upcoming list, the last few played, then the way into all of them.
        let pastAll = matches.filter { !isUpcoming($0) }.sorted { ($0.kickoff ?? "") > ($1.kickoff ?? "") }
        let recent = !past && !filtering ? Array(pastAll.prefix(3)) : []
        let storedFold = nextMatchFolded(records.settings)
        let folded = fold ?? storedFold
        // Whether a watch is linked, for the empty list's words, as of the last sync with signal; not known counts as not.
        let watchLinked = !(graph.onWatch.saved.watches ?? []).isEmpty
        // WEB-32: Get ready, until it's all done or hidden; it took the place of the watch prompt.
        let ready = GetReadyState.of(graph, feeds: getReadyFeeds)

        Page("Matches", hero: true, status: true, add: ("Add a match", { nav.sheet = .match(nil) })) {
            LazyVStack(alignment: .leading, spacing: 0) {
                if let next, !filtering {
                    NextMatch(m: next, folded: folded) { toggleFold(folded) }
                }
                if !filtering && !matches.isEmpty {
                    // WEB-2, WEB-24: the figures as large chalk figures between chalk rules, then the
                    // halfway line before the list.
                    VStack(spacing: 0) {
                        ChalkFigures(figures: [
                            ("\(thisWeek)", "next 7 days"),
                            (money(owed, unpaid.first?.fee?.currency ?? records.effectiveSettings.currency), unpaid.isEmpty ? "fees owed" : "owed · \(unpaid.count)"),
                            ("\(played)", "played"),
                        ])
                    }
                    .padding(.top, next != nil ? 30 : 0)
                }
                // WEB-32: Get ready, under the figures, before the halfway line.
                if !filtering && ready.show {
                    GetReadyList(ready: ready)
                        .padding(.top, matches.isEmpty ? 0 : 30).padding(.bottom, matches.isEmpty ? 26 : 0)
                }
                // With no matches, the empty list's center circle is the halfway line.
                if !filtering && !matches.isEmpty {
                    Halfway().padding(.vertical, 30)
                }
                // Did you know waits while Get ready shows, and until it's known whether it will.
                if records.matches != nil && !filtering && ready.settled && !ready.show {
                    DidYouKnow(played: played)
                }
                // Search and the tabs once there's something to search.
                if records.matches == nil || !matches.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Segmented(options: [(false, "Upcoming"), (true, "Past")], selected: $past)
                        SearchField(text: $query, tags: allTags, chosen: $chosenTags, prompt: "Teams, venues, officials, tags")
                    }
                    .padding(.bottom, 4)
                }
                // A heading on the grass names the list, with how many in small capitals (WEB-24).
                if !shown.isEmpty {
                    ListHead(title: past ? "Past" : "Upcoming", count: "\(shown.count) \(shown.count == 1 ? "match" : "matches")")
                }
                // WEB-17, WEB-24: what's empty sits on the grass, not in a card.
                if records.matches == nil {
                    LoadingPitch()
                } else if shown.isEmpty {
                    let elsewhere = found.count - shown.count
                    if filtering {
                        NoResults(message: "No \(past ? "past" : "upcoming") matches match \"\(query.isEmpty ? (chosenTags.first?.name ?? "") : query)\"") {
                            if elsewhere > 0 {
                                SecondaryButton("\(elsewhere) in \(past ? "upcoming" : "past") matches") { past.toggle() }
                            }
                        }
                    } else {
                        // WEB-17: as the web's.
                        EmptyState(picture: .center, title: past ? "No past matches yet" : "Nothing coming up", text: past ? "Games you've finished, with the score, the cards and how far you ran."
                                   : watchLinked ? "Add a game once and it's on your watch and phone, ready for kickoff." : "Add a game once and it's ready for kickoff. Link your watch to have it there too.") {
                            VStack(spacing: 8) {
                                // WEB-32: none of its own while Get ready above offers the same (Add a match, Import, Link your watch), so a new account sees each once.
                                if !ready.show {
                                    if !past {
                                        PrimaryButton("Add a match", icon: .plus) { nav.sheet = .match(nil) }
                                    }
                                    SecondaryButton("Import matches", icon: .upload) { nav.push(.importMatches) }
                                    if !past && !watchLinked {
                                        SecondaryButton("Link your watch", icon: .watch) { nav.push(.link) }
                                    }
                                }
                                // Recent's own button leads to the past matches, when it's there.
                                if elsewhere > 0 && recent.isEmpty {
                                    SecondaryButton("\(elsewhere) in \(past ? "upcoming" : "past") matches") { past.toggle() }
                                }
                            }
                        }
                    }
                }
                ForEach(shown, id: \.id) { m in
                    MatchRow(m: m).padding(.bottom, 12)
                }
                if !recent.isEmpty {
                    ListHead(title: "Recent", count: recent.count < pastAll.count ? "The last \(recent.count) of \(pastAll.count)" : "\(recent.count) \(recent.count == 1 ? "match" : "matches")")
                    ForEach(recent, id: \.id) { m in
                        MatchRow(m: m).padding(.bottom, 12)
                    }
                    BigOutline(text: pastAll.count == 1 ? "The past match" : "All \(pastAll.count) past matches", icon: .next, trailing: true, hug: true) { past = true }
                        .frame(maxWidth: .infinity).padding(.top, 12).padding(.bottom, 8)
                }
            }
        }
        .refreshable { await graph.pullToSync() }
        // WEB-27: the stored choice takes over again once it's saved, or when another device changes it.
        .onChange(of: storedFold) { fold = nil }
        .task(id: past) { await graph.weather.refresh(past: past) }
        // Recent (WEB-26) shows past matches under Upcoming, so their weather is wanted there too.
        .task { await graph.weather.refresh(past: true) }
        .task(id: graph.records.effectiveSettings.getReady?.hidden == true) {
            await getReadyFeeds.load(graph, hidden: graph.records.effectiveSettings.getReady?.hidden == true)
        }
        // The watches linked, for Get ready and the empty list, fresh once signal allows.
        .task { await graph.onWatch.refresh() }
    }

    /// WEB-27: folds the next match to a strip or opens it, at once (eased, or simply changed for anyone
    /// who asked for less motion), and saves it with the account's settings as Settings does, so it
    /// waits in the outbox offline.
    private func toggleFold(_ folded: Bool) {
        withAnimation(lessMotion ? nil : .snappy(duration: 0.3)) { fold = !folded }
        Task { await graph.records.saveSettings { $0.nextMatchCollapsed = !folded } }
    }

    private func matchesSearch(_ m: Match) -> Bool {
        let words = query.lowercased().split(separator: " ")
        guard !words.isEmpty else { return true }
        let records = graph.records
        let crew = m.crew.compactMap { c in records.referee(c.refereeId)?.name ?? c.name }
        let parts: [String?] = [m.name, m.home.name, m.home.alias, m.away.name, m.away.alias, m.ageGroup, m.notes, m.external?.id, m.assignor, records.venue(m.venueId)?.name, records.competition(m.competitionId)?.name]
        let haystack = (parts.compactMap { $0 } + (m.tags ?? []) + crew).joined(separator: " ").lowercased()
        return words.allSatisfy { haystack.contains($0) }
    }
}

/// The next match (WEB-2, WEB-24): a board in the penalty area (its chalk lines from touchline to
/// touchline above and below): Next match in mint and the competition, the day beside the kickoff time
/// large on the lit dots, the two kits with HOME and AWAY; the venue and officials under it on the
/// grass. Then the countdown as a stadium clock on a board of its own, the forecast and your fee as
/// figures under a chalk rule, the risk badges, and Directions and Open the match as large chalk outlines.
/// A caret at the board's right folds it all to one strip of the board, and opens it again (WEB-27).
private struct NextMatch: View {
    let m: Match
    let folded: Bool
    let onFold: () -> Void
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav

    var body: some View {
        if let kickoff = instantOf(m.kickoff) {
            let zone = zoneOf(m)
            let (time, ampm) = timeParts(kickoff, zone: zone)
            let venue = graph.records.venue(m.venueId)
            let pitch = venue?.pitches.first { $0.id == m.pitchId }
            let position = pitch?.position ?? venue?.position
            let weather = graph.weather.byMatch[m.id]
            let units = graph.records.units
            let today = formatDay(kickoff, zone: zone) == "Today"
            let about = [m.name ?? graph.records.competition(m.competitionId)?.name, describePlayers(m).isEmpty ? nil : describePlayers(m)].compactMap { $0 }.joined(separator: " · ")
            let open = { nav.push(.match(m.id)) }
            if folded {
                NextStrip(m: m, kickoff: kickoff, zone: zone, label: today ? "Today" : "Next match", open: open, onFold: onFold)
                    .transition(.opacity)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    // The penalty area: open to the touchlines on a phone, its lines above and below.
                    ChalkRule().toTouchlines()
                    VStack(alignment: .leading, spacing: 18) {
                        ZStack(alignment: .topTrailing) {
                            Button(action: open) {
                                Board {
                                    // Room at the right of the head for the caret (WEB-27).
                                    BoardHead(today ? "Today" : "Next match", about: about).padding(.trailing, 30)
                                    GeometryReader { geo in
                                        // The time takes what the board has beside the day, so "12:30 PM" fits at every width.
                                        let size = min((geo.size.width - 104) / 2.6, 92)
                                        HStack(alignment: .bottom, spacing: 12) {
                                            VStack(alignment: .leading, spacing: 2) {
                                                ForEach(dayOverDate(kickoff, zone: zone), id: \.self) { line in
                                                    Text(line).font(.display(24)).foregroundStyle(LF.onBoard).lineLimit(1).fixedSize()
                                                }
                                            }
                                            .padding(.bottom, size * 0.12)
                                            // Sized to its room, not grown with the text size, and a step down where
                                            // the day beside it has grown (large text), so "AM" is never cut.
                                            ViewThatFits(in: .horizontal) {
                                                ForEach(steps(from: size, to: size * 0.6), id: \.self) { s in
                                                    HStack(alignment: .lastTextBaseline, spacing: 4) {
                                                        Text(time).font(LfFace.display.font(s)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize()
                                                        if let ampm { Text(ampm).font(LfFace.display.font(s * 0.28)).foregroundStyle(LF.onBoardStrong).fixedSize() }
                                                    }
                                                }
                                            }
                                        }
                                        .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 12)
                                        .frame(width: geo.size.width, height: geo.size.height, alignment: .bottomLeading)
                                    }
                                    .frame(height: 112)
                                    .background(Dots())
                                    KitPanels(home: m.home, away: m.away, size: .large, labels: true)
                                }
                            }
                            .buttonStyle(PressStyle())
                            .accessibilityLabel("Next match, \(formatDay(kickoff, zone: zone)) \(formatTime(kickoff, zone: zone)), \(teamName(m.home, home: true)) v \(teamName(m.away, home: false))")
                            .accessibilityHint("Opens the match")
                            FoldCaret(folded: false, action: onFold)
                        }
                        VStack(alignment: .leading, spacing: 14) {
                            if let venue {
                                NextFact(icon: .venues, label: "Venue") {
                                    (Text(venue.name).underline() + Text(pitch.map { " · \($0.name)" } ?? ""))
                                        .font(.barlow(16, .bold)).foregroundStyle(LF.text)
                                    if let address = venue.address { Text(address).font(.lfBodyMedium).foregroundStyle(LF.muted) }
                                }
                            }
                            if !officialsLine(m, referee: { graph.records.referee($0) }).isEmpty {
                                NextFact(icon: .referees, label: "Officials") { OfficialsLine(m: m, size: 16, strong: true) }
                            }
                        }
                    }
                    .padding(.top, 22).padding(.bottom, 20)
                    ChalkRule().toTouchlines()
                    // The countdown as a stadium clock: each unit a lit cell on the dots, mint colons between them.
                    Countdown(to: kickoff).padding(.top, 28)
                    if weather != nil || m.fee != nil {
                        HStack(alignment: .top, spacing: 0) {
                            if let weather {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 8) {
                                        WeatherIcon(condition: weather.condition, day: weather.isDay, size: 28)
                                        Text(formatTemperature(weather.temperatureC, unit: units.temperature)).font(.display(36)).foregroundStyle(LF.text).lineLimit(1)
                                    }
                                    Text(conditionName(weather.condition, day: weather.isDay)).font(.lfBodyMedium).foregroundStyle(LF.muted)
                                }
                                .padding(.top, 14).padding(.trailing, 12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .overlay(alignment: .top) { ChalkRule() }
                            }
                            if weather != nil && m.fee != nil { Rectangle().fill(LF.chalkLine).frame(width: chalkWidth) }
                            if let fee = m.fee {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(money(fee.amount, fee.currency)).font(.display(36)).foregroundStyle(LF.text).lineLimit(1)
                                    Text("Your fee").font(.lfBodyMedium).foregroundStyle(LF.muted)
                                }
                                .padding(.top, 14).padding(.leading, weather != nil ? 16 : 0)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .overlay(alignment: .top) { ChalkRule() }
                                .accessibilityElement(children: .combine)
                            }
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 18)
                    }
                    if let weather, !weather.final {
                        RiskBadges(w: weather, units: units).padding(.top, 16)
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        if let position {
                            BigOutline(text: "Directions", icon: .directions) { graph.openDirections(lat: position.lat, lon: position.lon) }
                        }
                        BigOutline(text: "Open the match", icon: .next, trailing: true, action: open)
                    }
                    .padding(.top, 18)
                }
                .transition(.opacity)
            }
        }
    }
}

/// WEB-27: the next match folded to one strip of the board, as the website's on a phone: Next match (or
/// Today) in mint across from the countdown, then the day over the date beside the kickoff time across
/// from the teams' badges; the whole strip opens the match, and the caret at its right opens the board.
private struct NextStrip: View {
    let m: Match
    let kickoff: Date
    let zone: TimeZone
    let label: String
    let open: () -> Void
    let onFold: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 20)) { context in
            let left = max(Int(kickoff.timeIntervalSince(AppClock.fixed ?? context.date)), 0)
            Board {
                HStack(spacing: 0) {
                    Button(action: open) {
                        // A strip under 340 pt (a 320 pt phone) steps down a size, as the website's does,
                        // so "12:30 PM" and both badges fit.
                        ViewThatFits(in: .horizontal) {
                            lines(left: left, narrow: false)
                            lines(left: left, narrow: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel("\(label), \(matchTitle(m)), \(formatDay(kickoff, zone: zone)) at \(formatTime(kickoff, zone: zone)). \(kickoffSpoken(left))")
                    .accessibilityHint("Opens the match")
                    FoldCaret(folded: true, action: onFold).padding(.trailing, 4)
                }
            }
        }
    }

    @ViewBuilder
    private func lines(left: Int, narrow: Bool) -> some View {
        let count: CGFloat = narrow ? 19 : 22
        let clock: CGFloat = narrow ? 24 : 30
        let gap: CGFloat = narrow ? 8 : 12
        let day = dayOverDate(kickoff, zone: zone)
        let (time, ampm) = timeParts(kickoff, zone: zone)
        VStack(alignment: .leading, spacing: narrow ? 10 : 12) {
            HStack(spacing: gap) {
                Text(label.uppercased()).lfLabel(11).foregroundStyle(LF.boardAccent).lineLimit(1).fixedSize()
                Spacer(minLength: 0)
                let parts = stripCountdown(left)
                if parts.isEmpty {
                    Text("KICKOFF").font(.display(count)).foregroundStyle(LF.onBoardStrong).fixedSize()
                } else {
                    HStack(alignment: .lastTextBaseline, spacing: narrow ? 4 : 6) {
                        ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                            HStack(alignment: .lastTextBaseline, spacing: 2) {
                                Text(part.0).font(.display(count)).foregroundStyle(LF.onBoardStrong).contentTransition(.numericText())
                                Text(part.1).font(.mono(11, bold: true)).foregroundStyle(LF.onBoardMuted)
                            }
                            .fixedSize()
                        }
                    }
                }
            }
            HStack(spacing: gap) {
                HStack(spacing: gap) {
                    // The day over the date, as on the open board; today, the label says so.
                    if day.count > 1 {
                        VStack(alignment: .leading, spacing: 1) {
                            ForEach(day, id: \.self) { line in
                                Text(line).font(.display(narrow ? 14 : 17)).foregroundStyle(LF.onBoard).lineLimit(1).fixedSize()
                            }
                        }
                    }
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text(time).font(.display(clock)).foregroundStyle(LF.onBoardStrong)
                        if let ampm { Text(ampm).font(.display(clock * 0.45)).foregroundStyle(LF.onBoardStrong) }
                    }
                    .lineLimit(1).fixedSize()
                }
                Spacer(minLength: 0)
                HStack(spacing: narrow ? 4 : 6) {
                    TeamBadge(team: m.home, other: m.away, home: true)
                    TeamBadge(team: m.away, other: m.home, home: false)
                }
                .fixedSize()
            }
        }
        .padding(.leading, narrow ? 14 : 16).padding(.trailing, 4).padding(.vertical, 14)
    }
}

/// WEB-27: the caret that folds the next match to a strip (pointing up, at the top right of the open
/// board, in line with its label) and opens it again (pointing down, at the strip's right): a 44 pt
/// button named as the website's, with whether the board is open as its value.
private struct FoldCaret: View {
    let folded: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            PhIcon(.chevron, size: 18, tint: LF.onBoardMuted)
                .rotationEffect(.degrees(folded ? 0 : 180))
                // On the open board the caret sits level with the head's label, above the button's middle.
                .padding(.top, folded ? 0 : 10)
                .frame(width: 48, height: 48, alignment: folded ? .center : .top)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .ground(.board)
        .accessibilityLabel(folded ? "Show the next match" : "Fold the next match to a strip")
        .accessibilityValue(folded ? "Collapsed" : "Expanded")
    }
}

/// WEB-27: whether the next match is folded to a strip: the account's setting, open when it isn't set.
func nextMatchFolded(_ settings: UserSettings?) -> Bool { settings?.nextMatchCollapsed ?? false }

/// The countdown to kickoff (WEB-24) from the seconds left: days when there are any, hours (after days),
/// then minutes, each with its word and plural.
func kickoffUnits(_ left: Int) -> [(Int, (String, String))] {
    let parts = [(left / 86_400, ("day", "days")), (left % 86_400 / 3600, ("hr", "hrs")), (left % 3600 / 60, ("min", "min"))]
    return Array(parts.drop { $0.0 == 0 && $0.1.0 != "min" })
}

/// The countdown as VoiceOver says it: "Kickoff in 1 day 3 hrs 5 min".
func kickoffSpoken(_ left: Int) -> String {
    "Kickoff in " + kickoffUnits(left).map { "\($0.0) \($0.0 == 1 ? $0.1.0 : $0.1.1)" }.joined(separator: " ")
}

/// WEB-27: the folded strip's countdown, as the website's: each figure with its unit's letter ("1" "D",
/// "03" "H", "08" "M"), two figures after the first; nothing once it's kickoff.
func stripCountdown(_ left: Int) -> [(String, String)] {
    guard left >= 60 else { return [] }
    return kickoffUnits(left).enumerated().map { i, unit in (i > 0 ? String(format: "%02d", unit.0) : "\(unit.0)", String(unit.1.0.prefix(1)).uppercased()) }
}

/// A list's heading on the grass, with how many (or which) in small capitals beside it (WEB-24).
private struct ListHead: View {
    let title: String
    let count: String

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 14) {
            Text(title.uppercased()).font(.display(44, relativeTo: .largeTitle)).foregroundStyle(LF.text)
                .accessibilityAddTraits(.isHeader)
            Text(count.uppercased()).lfLabel(13, spacing: 0.1).foregroundStyle(LF.muted)
        }
        .padding(.top, 26).padding(.bottom, 14)
    }
}

/// A large chalk outline (3 pt), as the next match's Directions and Open the match. A trailing icon
/// sits at the far end, unless `hug` keeps it beside the words (All past matches, under Recent).
private struct BigOutline: View {
    let text: String
    let icon: Ph
    var trailing = false
    var hug = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if !trailing { PhIcon(icon, size: 20, tint: LF.text) }
                Text(text.uppercased()).lfWord(18).foregroundStyle(LF.text)
                if trailing {
                    if !hug { Spacer(minLength: 0) }
                    PhIcon(icon, size: 20, tint: LF.text)
                }
            }
            .padding(.horizontal, 16).frame(height: 48)
            .frame(maxWidth: trailing && !hug ? .infinity : nil)
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(LF.borderInput, lineWidth: chalkWidth))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(text)
    }
}

/// A line under the next match's board: an icon, a small label, then what it says.
private struct NextFact<Content: View>: View {
    let icon: Ph
    let label: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PhIcon(icon, size: 22, tint: LF.text).padding(.top, 1)
            VStack(alignment: .leading, spacing: 3) {
                Text(label.uppercased()).lfLabel(11.5).foregroundStyle(LF.muted)
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

/// WEB-20: the officials on one line, the roles in mono capitals, "you" in brand green (in chalk and
/// underlined on the next match, `strong`); cut with an ellipsis when it doesn't fit. Nothing when
/// there's nobody to show.
struct OfficialsLine: View {
    let m: Match
    var size: CGFloat = 13
    var strong = false
    @Environment(AppGraph.self) private var graph

    var body: some View {
        let officials = officialsLine(m) { graph.records.referee($0) }
        if !officials.isEmpty {
            officials.enumerated().reduce(Text("")) { line, item in
                let (i, o) = item
                let who = o.you
                    ? Text(o.who).foregroundStyle(strong ? LF.text : LF.brandStrong).fontWeight(.bold).underline(strong)
                    : Text(o.who).fontWeight(strong ? .bold : .medium)
                return line + Text(i > 0 ? " · " : "") + Text(o.role.uppercased()).font(.mono(size - 3, bold: true, relativeTo: .caption2)).tracking((size - 3) * 0.08).foregroundStyle(LF.muted) + Text(" ") + who
            }
            .font(.barlow(size, relativeTo: .footnote))
            .foregroundStyle(strong ? LF.text : LF.muted)
            .lineLimit(1)
            .accessibilityLabel(officials.map { "\(roleNamesInFull[$0.key] ?? $0.role) \($0.who)" }.joined(separator: ", "))
        }
    }
}

/// The stadium clock (WEB-24): days (when there are any), hours and minutes, each a lit cell, two
/// figures after the first, refreshed as time passes.
private struct Countdown: View {
    let to: Date

    var body: some View {
        TimelineView(.periodic(from: .now, by: 20)) { context in
            let left = max(Int(to.timeIntervalSince(AppClock.fixed ?? context.date)), 0)
            let units = kickoffUnits(left)
            let spoken = kickoffSpoken(left)
            Board {
                VStack(spacing: 10) {
                    Text(left < 60 ? "KICKOFF" : "STARTS IN").lfLabel(11.5, spacing: 0.16).foregroundStyle(LF.boardAccent)
                    GeometryReader { geo in
                        let size = min(max((geo.size.width - 8) / 5.6, 28), 60)
                        HStack(alignment: .top, spacing: 0) {
                            ForEach(Array(units.enumerated()), id: \.offset) { i, unit in
                                if i > 0 {
                                    Text(":").font(.display(size * 0.62)).foregroundStyle(LF.boardAccent)
                                        .padding(.horizontal, 4).padding(.top, size * 0.22)
                                }
                                VStack(spacing: 8) {
                                    Text(i > 0 ? String(format: "%02d", unit.0) : "\(unit.0)")
                                        .font(.display(size)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize()
                                        .contentTransition(.numericText())
                                        .padding(.leading, 4).padding(.trailing, 8).padding(.top, 6).padding(.bottom, 2)
                                        .frame(minWidth: size * 1.32)
                                        .background(Color.black.opacity(0.18))
                                        .background(Dots())
                                        .background(LF.board)
                                        .clipShape(RoundedRectangle(cornerRadius: 4))
                                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(LF.boardRule, lineWidth: 1))
                                    Text((unit.0 == 1 ? unit.1.0 : unit.1.1).uppercased()).lfLabel(11).foregroundStyle(LF.onBoardMuted)
                                }
                            }
                        }
                        .frame(width: geo.size.width)
                    }
                    .frame(height: 112)
                    .padding(.horizontal, 8)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 14).padding(.bottom, 12)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
            }
        }
    }
}

struct TeamLine: View {
    let m: Match
    let home: Bool

    var body: some View {
        let team = home ? m.home : m.away
        HStack(spacing: 10) {
            TeamBadge(team: team, other: home ? m.away : m.home, home: home)
            Text(teamName(team, home: home)).font(.lfTitleMedium).foregroundStyle(LF.text).lineLimit(1)
        }
    }
}

/// A match row (WEB-3, WEB-24): a stadium board for each match: the kickoff along its top like a
/// fixture board (the day over the date, the time large; a played match's date instead) with the
/// weather; the two kits, the score between them once played (the side that lost dimmed); then a chalk
/// panel with where and what, the officials line, and on the right a figure (the fee before, the
/// distance once played), the cards shown, status chips, risk badges and Fee due.
struct MatchRow: View {
    let m: Match
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav

    var body: some View {
        let records = graph.records
        let report = records.matchRecords.first { $0.matchId == m.id }
        let venue = records.venue(m.venueId)
        let weather = graph.weather.byMatch[m.id]
        let units = records.units
        let zone = zoneOf(m)
        let position = venue?.pitches.first { $0.id == m.pitchId }?.position ?? venue?.position
        let what = m.name ?? records.competition(m.competitionId)?.name
        Button { nav.push(.match(m.id)) } label: {
            Board {
                HStack(spacing: 10) {
                    if let kickoff = instantOf(m.kickoff) {
                        if report != nil || m.status == "played" {
                            let (day, date) = playedDay(kickoff, zone: zone)
                            Text(day).lfLabel(12, spacing: 0.1).foregroundStyle(LF.onBoardMuted)
                            Text(date).font(.display(32)).foregroundStyle(LF.onBoardStrong).lineLimit(1)
                        } else {
                            let day = dayOverDate(kickoff, zone: zone)
                            VStack(alignment: .leading, spacing: 1) {
                                ForEach(day, id: \.self) { Text($0).lfLabel(12, spacing: 0.1).foregroundStyle(day.count == 1 ? LF.boardAccent : LF.onBoardMuted).lineLimit(1) }
                            }
                            let (time, ampm) = timeParts(kickoff, zone: zone)
                            HStack(alignment: .lastTextBaseline, spacing: 2) {
                                Text(time).font(.display(36)).foregroundStyle(LF.onBoardStrong).lineLimit(1)
                                if let ampm { Text(ampm).font(.display(15)).foregroundStyle(LF.onBoardStrong) }
                            }
                        }
                    } else {
                        Text("TIME TBC").lfLabel(12, spacing: 0.1).foregroundStyle(LF.onBoardMuted)
                    }
                    Spacer(minLength: 0)
                    // WX-9: the icon and temperature, as on the web.
                    if let weather { WeatherBrief(w: weather, units: units) }
                }
                .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 8)
                if let report {
                    KitPanels(home: m.home, away: m.away, middleWidth: 104, hasMiddle: true) { RowScore(r: report) }
                } else {
                    KitPanels(home: m.home, away: m.away)
                }
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        if venue != nil || what != nil {
                            ((venue.map { Text($0.name).foregroundStyle(LF.text).fontWeight(.semibold).underline() } ?? Text(""))
                                + Text(venue != nil && what != nil ? " · " : "") + Text(what ?? ""))
                                .font(.barlow(14, relativeTo: .subheadline)).foregroundStyle(LF.muted).lineLimit(2).multilineTextAlignment(.leading)
                        }
                        OfficialsLine(m: m)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .trailing, spacing: 6) {
                        let figure = report != nil ? report?.distanceM.map { formatDistance($0, unit: units.distance) }
                            : m.status == "scheduled" ? m.fee.map { money($0.amount, $0.currency) } : nil
                        if let figure { Text(figure).font(.display(30)).foregroundStyle(LF.text).lineLimit(1) }
                        if let report { CardCounts(r: report) }
                        if report == nil { StatusChip(m: m, role: false) }
                        if let weather, !weather.final, m.status == "scheduled" {
                            ForEach(weather.risks, id: \.kind) { RiskBadge(r: $0, w: weather, units: units) }
                        }
                        if m.fee != nil, m.fee?.paid == false, m.status == "played" { Chip("Fee due", tone: .amber) }
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(LF.surface)
                .ground(.panel)
            }
        }
        .buttonStyle(PressStyle())
        .contextMenu {
            Button { nav.sheet = .match(m.id) } label: { Label { Text("Edit") } icon: { Ph.edit.image } }
            if let position {
                Button {
                    graph.openDirections(lat: position.lat, lon: position.lon)
                } label: { Label { Text("Directions") } icon: { Ph.directions.image } }
            }
        }
    }
}

/// The score on the board between the kits, home first, the side that lost dimmed (on penalties when
/// level), a shoot-out small under it.
private struct RowScore: View {
    let r: MatchRecord

    private func lost(_ home: Bool) -> Bool {
        let (us, them) = home ? (r.score.home, r.score.away) : (r.score.away, r.score.home)
        guard let p = r.penalties else { return us < them }
        return us < them || (us == them && (home ? p.home < p.away : p.away < p.home))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 3) {
                Text("\(r.score.home)").font(.display(46)).foregroundStyle(lost(true) ? LF.onBoardDim : LF.onBoardStrong)
                Text("–").font(.display(28)).foregroundStyle(LF.onBoardDim)
                Text("\(r.score.away)").font(.display(46)).foregroundStyle(lost(false) ? LF.onBoardDim : LF.onBoardStrong)
            }
            .lineLimit(1).fixedSize()
            if let p = r.penalties { Text("\(p.home)–\(p.away) pens").font(.barlow(11, .medium)).foregroundStyle(LF.onBoardMuted) }
        }
        .padding(.horizontal, 8)
    }
}

/// Cards shown (WEB-5): the card shapes with how many, yellow then red.
private struct CardCounts: View {
    let r: MatchRecord

    var body: some View {
        let yellow = r.events.filter { if case .caution = $0 { return true } else { return false } }.count
        let red = r.events.filter {
            switch $0 {
            // EVT-12: a second sin bin is a send-off.
            case .sendOff, .secondCaution, .secondSinBin: return true
            default: return false
            }
        }.count
        if yellow > 0 || red > 0 {
            HStack(spacing: 12) {
                ForEach(Array([(CardKind.yellow, yellow), (CardKind.red, red)].enumerated()), id: \.offset) { _, card in
                    let (kind, n) = card
                    HStack(spacing: 6) {
                        CardShape(kind: kind, width: 13, height: 18)
                        Text("\(n)").lfWord(19).foregroundStyle(LF.text)
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(yellow) \(yellow == 1 ? "caution" : "cautions"), \(red) \(red == 1 ? "send-off" : "send-offs")")
        }
    }
}

struct StatusChip: View {
    let m: Match
    /// The user's role on a match still to play; a row leaves it to its officials line (WEB-20).
    var role = true

    var body: some View {
        switch m.status {
        case "scheduled":
            if role, let role = m.role { Chip(roleNames[role] ?? role, tone: .brand) }
        case "played": Chip("Played")
        case "abandoned": Chip("Abandoned", tone: .red)
        case "cancelled": Chip("Canceled", tone: .red)
        case "postponed": Chip("Postponed", tone: .amber)
        default: Chip(m.status)
        }
    }
}

/// The two kits down the row's left edge, home over away (WEB-3); a match from the watch's too (APP-26).
struct KitStripe: View {
    let home: Team
    let away: Team
    @Environment(\.colorScheme) private var scheme

    init(m: Match) {
        home = m.home
        away = m.away
    }

    init(home: Team, away: Team) {
        self.home = home
        self.away = away
    }

    var body: some View {
        VStack(spacing: 0) {
            half(home.colour)
            half(away.colour)
        }
        .frame(width: 6)
        .frame(maxHeight: .infinity)
    }

    private func half(_ hex: String?) -> some View {
        let c = parseColor(hex)
        return (c?.color ?? LF.surface2)
            .overlay(alignment: .trailing) {
                if let c, kitVanishes(c, dark: scheme == .dark) { LF.border.frame(width: 1) }
            }
    }
}
