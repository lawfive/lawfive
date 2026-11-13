import SwiftUI

// Finding duplicates and merging them on the phone (DUP-12), as on the website and Android: Find
// duplicates on the Venues and Referees lists, and Merge with… on a venue's or referee's edit form.
// A merge takes two steps: pick the ones that are the same, then review what the merged one will be
// (for venues, every pitch) with Merge at the bottom. The server works all of it out (DUP-11) and
// the phone only shows it, so it needs a connection; the preview is asked for again as choices change.

/// The words that differ between venues and referees.
struct MergeWords {
    let one: String, many: String, who: String, same: String, notSame: String, notSameMany: String
    let picture: EmptyPicture
}

extension MergeKind {
    var words: MergeWords {
        switch self {
        case .venues: return MergeWords(one: "venue", many: "venues", who: "that", same: "the same place", notSame: "Not the same venue", notSameMany: "Not the same venues", picture: .venue)
        case .referees: return MergeWords(one: "referee", many: "referees", who: "who", same: "the same person", notSame: "Not the same person", notSameMany: "Not the same people", picture: .crew)
        }
    }
}

/// The line under a name: its matches first (APP-19), then other names and details.
private func memberLine(_ m: DuplicateMember) -> String {
    [
        describeCount(m.matches),
        m.aliases.isEmpty ? nil : "Also \(m.aliases.joined(separator: ", "))",
        m.address, m.pitches.flatMap { $0 > 0 ? "\($0) \($0 == 1 ? "pitch" : "pitches")" : nil },
        m.email, m.phone,
    ].compactMap { $0 }.joined(separator: " · ")
}

private func failure(_ error: Error) -> String {
    if let e = error as? ServerError, e.status != 0 { return e.message }
    return "LawFive's server finds duplicates and merges them, so this needs a connection."
}

/// Offline, or the server didn't answer: nothing is worked out on the phone.
private struct NeedsConnection: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        LfCard {
            EmptyState(title: "Merging needs a connection", text: message) { SecondaryButton("Try again", icon: .sync, action: retry) }
        }
    }
}

/// A referee's picture or a venue's icon.
private struct MemberAvatar: View {
    let kind: MergeKind
    let id: String
    let name: String
    @Environment(AppGraph.self) private var graph

    var body: some View {
        if kind == .venues {
            Avatar(icon: .venues)
        } else if let r = graph.records.referees?.first(where: { $0.id == id }) {
            RefereeAvatar(r: r)
        } else {
            Avatar(text: initials(name))
        }
    }
}

/// Reasons, as blue chips that wrap.
private struct Reasons: View {
    let reasons: [String]

    var body: some View {
        Flow(spacing: 6) { ForEach(reasons, id: \.self) { Chip($0, tone: .blue) } }
    }
}

/// The Merge button's bar, fixed at the bottom over the page: a strip of the board, as a form's Save bar (WEB-24).
private struct BottomBar<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(LF.boardRule).frame(height: 1)
            VStack(alignment: .leading, spacing: 8, content: content).padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(LF.board.ignoresSafeArea(edges: .bottom))
        .ground(.board)
    }
}

/// Find duplicates: groups that are probably one, with why; merge a group, or say they aren't the same (DUP-1, DUP-5, DUP-7).
struct DuplicatesScreen: View {
    let kind: MergeKind
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var groups: DuplicateGroups?
    @State private var failed: String?
    @State private var busy = false

    var body: some View {
        let w = kind.words
        Page("Duplicate \(w.many)", sub: kind == .venues
            ? "Probably the same place under different names, at the same address, or within 150 m. Merging keeps their matches together."
            : "Probably the same person under different names (Doe, John and John Doe), or with the same email or phone. Merging keeps their matches together.") {
            if let failed, groups == nil {
                NeedsConnection(message: failed) { Task { await load() } }
            } else if let groups {
                if groups.groups.isEmpty {
                    LfCard {
                        EmptyState(picture: w.picture, title: "No likely duplicates", text: "None of your \(groups.of) \(w.many) look like \(w.same). To merge two anyway, open one, choose Edit, then Merge with…") { EmptyView() }
                    }
                }
                VStack(spacing: 12) {
                    ForEach(groups.groups, id: \.self) { group in
                        LfCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Probably \(w.same)").font(.lfTitleMedium).foregroundStyle(LF.text)
                                Reasons(reasons: group.reasons)
                            }
                            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 6)
                            ForEach(group.members, id: \.id) { m in
                                ListRow(title: m.name, sub: memberLine(m), action: { nav.push(kind == .venues ? .venue(m.id) : .referee(m.id)) },
                                        leading: { MemberAvatar(kind: kind, id: m.id, name: m.name) }, trailing: { EmptyView() })
                            }
                            Hairline()
                            ButtonPair(halves: false) {
                                SecondaryButton(group.members.count == 2 ? w.notSame : w.notSameMany, enabled: !busy, wide: true) {
                                    Task {
                                        busy = true
                                        do {
                                            try await graph.merging.notTheSame(kind, ids: group.members.map(\.id))
                                            graph.requestSync()
                                            await load()
                                        } catch {
                                            failed = failure(error)
                                        }
                                        busy = false
                                    }
                                }
                                PrimaryButton("Merge…", icon: .merge, wide: true) {
                                    nav.push(.mergePick(kind, keptId: group.members[0].id, with: group.members.dropFirst().map(\.id)))
                                }
                            }
                            .padding(12)
                        }
                    }
                }
                if let failed { Text(failed).font(.lfBodySmall).foregroundStyle(LF.redText).padding(.top, 12) }
            } else {
                LfCard { LoadingPitch() }
            }
        }
        // Again after each sync, as after a merge, so a group merged has gone.
        .task(id: graph.session.lastSync) { await load() }
    }

    private func load() async {
        failed = nil
        do {
            groups = try await graph.merging.duplicates(kind)
        } catch {
            failed = failure(error)
        }
    }
}

/// The server's likely duplicates (DUP-13); none offline, or from a server without merging.
@MainActor
private func duplicateGroups(_ graph: AppGraph, _ kind: MergeKind) async -> DuplicateGroups? {
    guard await graph.mergingOffered() else { return nil }
    return try? await graph.merging.duplicates(kind)
}

/// Over the Venues or Referees list: "2 venues look like duplicates", opening Find duplicates (DUP-13).
struct DuplicatesNotice: View {
    let kind: MergeKind
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var groups: DuplicateGroups?

    var body: some View {
        let count = (groups ?? graph.merging.kept[kind])?.groups.reduce(0) { $0 + $1.members.count } ?? 0
        VStack(spacing: 0) {
            if count > 0 {
                Button { nav.push(.duplicates(kind)) } label: {
                    HStack(spacing: 10) {
                        PhIcon(.merge, size: 18)
                        Text("\(count) \(kind.words.many) look like duplicates").font(.lfBodyMedium).foregroundStyle(LF.text)
                        Spacer(minLength: 0)
                        Text("Review").font(.lfLabelLarge).foregroundStyle(LF.text)
                        PhIcon(.next, size: 16, tint: LF.muted)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    .background(LF.blueSoft, in: RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(PressStyle())
                .padding(.bottom, 12)
            }
            // Asked again after each sync, as after a merge.
            Color.clear.frame(height: 0).task(id: graph.session.lastSync) { groups = await duplicateGroups(graph, kind) }
        }
    }
}

/// Not the same and Merge… side by side, or one above the other at full width when their words don't
/// fit side by side (the larger text sizes), rather than cut short. `halves` gives each half the row;
/// otherwise they keep their own widths at its end. Its buttons are `wide`, to fill what they're given.
private struct ButtonPair: Layout {
    var halves: Bool
    private let gap: CGFloat = 10

    private func wants(_ subviews: Subviews) -> [CGFloat] { subviews.map { $0.sizeThatFits(.unspecified).width } }
    private func sideBySide(_ width: CGFloat, _ wants: [CGFloat]) -> Bool {
        halves ? wants.allSatisfy { $0 <= (width - gap) / 2 } : wants.reduce(0, +) + gap * CGFloat(wants.count - 1) <= width
    }
    private func widths(_ width: CGFloat, _ wants: [CGFloat]) -> [CGFloat] {
        sideBySide(width, wants) ? (halves ? wants.map { _ in (width - gap) / 2 } : wants) : wants.map { _ in width }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let wants = wants(subviews)
        guard let width = proposal.width, width.isFinite else {
            return CGSize(width: wants.reduce(0, +) + gap * CGFloat(wants.count - 1), height: subviews.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0)
        }
        let heights = zip(subviews, widths(width, wants)).map { $0.sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }
        let height = sideBySide(width, wants) ? (heights.max() ?? 0) : heights.reduce(0, +) + gap * CGFloat(heights.count - 1)
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let wants = wants(subviews)
        let widths = widths(bounds.width, wants)
        if sideBySide(bounds.width, wants) {
            var x = bounds.maxX - widths.reduce(0, +) - gap * CGFloat(widths.count - 1)
            for (view, width) in zip(subviews, widths) {
                view.place(at: CGPoint(x: x, y: bounds.midY), anchor: .leading, proposal: ProposedViewSize(width: width, height: nil))
                x += width + gap
            }
        } else {
            var y = bounds.minY
            for view in subviews {
                let size = view.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
                view.place(at: CGPoint(x: bounds.minX, y: y), proposal: ProposedViewSize(width: bounds.width, height: nil))
                y += size.height + gap
            }
        }
    }
}

/// On a venue's or referee's page: the ones it's probably the same as, with why, Not the same and Merge… (DUP-13).
struct DuplicateCard: View {
    let kind: MergeKind
    let id: String
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var groups: DuplicateGroups?
    @State private var done = false
    @State private var busy = false

    var body: some View {
        let group = (groups ?? graph.merging.kept[kind])?.groups.first { g in g.members.contains { $0.id == id } }
        VStack(spacing: 0) {
            if let group, !done {
                let others = group.members.filter { $0.id != id }
                let w = kind.words
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            PhIcon(.merge, size: 18, tint: LF.brand)
                            Text("Probably the same as \(others.map(\.name).joined(separator: " and "))").font(.lfTitleMedium).foregroundStyle(LF.text)
                        }
                        Reasons(reasons: group.reasons)
                        // Half each, so neither looks like the lesser choice.
                        ButtonPair(halves: true) {
                            SecondaryButton(others.count == 1 ? w.notSame : w.notSameMany, enabled: !busy, wide: true) {
                                Task {
                                    busy = true
                                    if (try? await graph.merging.notTheSame(kind, ids: group.members.map(\.id))) != nil {
                                        done = true
                                        graph.requestSync()
                                    }
                                    busy = false
                                }
                            }
                            PrimaryButton("Merge…", icon: .merge, wide: true) { nav.push(.mergePick(kind, keptId: id, with: others.map(\.id))) }
                        }
                    }
                }
                .padding(.bottom, 12)
            }
            Color.clear.frame(height: 0).task(id: graph.session.lastSync) { groups = await duplicateGroups(graph, kind) }
        }
    }
}

/// Step 1 of a merge: the likeliest first, with why, and a search through the rest; Next when one is picked.
struct MergePickScreen: View {
    let kind: MergeKind
    let keptId: String
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var selected: [String]
    @State private var likely: [DuplicateMember]?
    @State private var failed: String?

    init(kind: MergeKind, keptId: String, with: [String]) {
        self.kind = kind
        self.keptId = keptId
        _selected = State(initialValue: with)
    }

    /// The phone's own list, for the search and for those picked from it.
    private var options: [(option: SearchOption, detail: String)] {
        kind == .venues
            ? (graph.records.venues ?? []).map { (SearchOption(id: $0.id, name: $0.name, otherNames: $0.aliases ?? []), $0.address ?? "") }
            : (graph.records.referees ?? []).map { (SearchOption(id: $0.id, name: $0.name, otherNames: $0.aliases ?? []), $0.email ?? $0.phone ?? "") }
    }

    var body: some View {
        let w = kind.words
        let keptName = options.first { $0.option.id == keptId }?.option.name ?? ""
        Page("Merge with \(keptName)", large: false) {
            Text("Pick the \(w.many) \(w.who) are \(w.same) as \(keptName). Their matches move to one \(w.one), and their names are kept as other names, so imports and searches still find them.")
                .font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 8)
            if let failed, likely == nil {
                NeedsConnection(message: failed) { Task { await load() } }.padding(.top, 16)
            } else if let likely {
                SectionTitle(likely.isEmpty ? "No likely matches; search below" : "Most likely \(w.same)")
                // Those found by search, after the likeliest.
                let picked = selected.filter { id in !likely.contains { $0.id == id } }.compactMap { id in options.first { $0.option.id == id } }
                if !likely.isEmpty || !picked.isEmpty {
                    LfCard {
                        ForEach(Array(likely.enumerated()), id: \.element.id) { i, m in
                            PickRow(kind: kind, id: m.id, name: m.name, line: memberLine(m), reasons: m.reasons ?? [], on: selected.contains(m.id), divider: i > 0) { toggle(m.id) }
                        }
                        ForEach(Array(picked.enumerated()), id: \.element.option.id) { i, p in
                            PickRow(kind: kind, id: p.option.id, name: p.option.name, line: p.detail, reasons: [], on: true, divider: i > 0 || !likely.isEmpty) { toggle(p.option.id) }
                        }
                    }
                }
                SearchChoice(label: "Another \(w.one)", value: nil, options: options.map(\.option).filter { $0.id != keptId && !selected.contains($0.id) }.sorted { $0.name.lowercased() < $1.name.lowercased() },
                             empty: "Search all \(w.many)…", allowNone: false) { id in if let id { toggle(id) } }
                    .padding(.top, 12)
            } else {
                LfCard { LoadingPitch() }.padding(.top, 16)
            }
        }
        .backTitle("Pick \(w.many)")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomBar {
                Text(selected.isEmpty ? "Pick at least one" : "\(selected.count + 1) \(w.many) to merge into one").font(.lfBodySmall).foregroundStyle(LF.muted)
                PrimaryButton("Next", icon: .next, enabled: !selected.isEmpty, wide: true) { nav.push(.mergeReview(kind, keptId: keptId, from: selected)) }
            }
        }
        .task { if likely == nil { await load() } }
    }

    private func toggle(_ id: String) {
        if let i = selected.firstIndex(of: id) { selected.remove(at: i) } else { selected.append(id) }
    }

    private func load() async {
        failed = nil
        do {
            likely = try await graph.merging.likely(kind, id: keptId)
        } catch {
            failed = failure(error)
        }
    }
}

/// One to pick: a box to tick, who or what it is, and why it's likely.
private struct PickRow: View {
    let kind: MergeKind
    let id: String
    let name: String
    let line: String
    let reasons: [String]
    let on: Bool
    let divider: Bool
    let toggle: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            if divider { Hairline() }
            Button(action: toggle) {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 5).fill(on ? LF.brand : Color.clear)
                        RoundedRectangle(cornerRadius: 5).stroke(on ? LF.brand : LF.muted, lineWidth: 1.5)
                        if on { PhIcon(.check, size: 14, tint: LF.onBrand) }
                    }
                    .frame(width: 22, height: 22)
                    MemberAvatar(kind: kind, id: id, name: name)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(name).font(.lfTitleMedium).foregroundStyle(LF.text)
                        if !line.isEmpty { Text(line).font(.lfBodySmall).foregroundStyle(LF.muted).multilineTextAlignment(.leading) }
                        if !reasons.isEmpty { Reasons(reasons: reasons) }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(RowStyle())
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }
}

/// One of the merged one's details to choose, where they differ: a pill each, the chosen one marked.
private struct Options: View {
    let label: String
    let options: [(value: String, text: String)]
    let chosen: String?
    var hint: String?
    let onChoose: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.lfLabelLarge).foregroundStyle(LF.muted)
            // Long ones (addresses) one under another, as a row of them wouldn't fit.
            if options.contains(where: { $0.text.count > 24 }) {
                VStack(alignment: .leading, spacing: 8) { pills }
            } else {
                Flow(spacing: 8) { pills }
            }
            if let hint { Text(hint).font(.lfBodySmall).foregroundStyle(LF.muted) }
        }
    }

    private var pills: some View {
        ForEach(options, id: \.value) { option in
            let on = option.value == chosen
            Button { onChoose(option.value) } label: {
                HStack(spacing: 8) {
                    Circle().strokeBorder(on ? LF.brand : LF.muted, lineWidth: on ? 5 : 1.5).frame(width: 16, height: 16)
                    Text(option.text).font(.lfBodyMedium).foregroundStyle(LF.text).multilineTextAlignment(.leading)
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(on ? LF.brandSoft : LF.surface, in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(on ? LF.brand : LF.border, lineWidth: 1))
            }
            .buttonStyle(PressStyle())
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }
}

/// How many matches together (in bold, as on the website), and that it's for good.
private struct Together: View {
    let count: String
    let rest: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            PhIcon(.merge, size: 18, tint: LF.brandStrong)
            (Text(count).bold() + Text(" \(rest)")).font(.lfBodyMedium).foregroundStyle(LF.text)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LF.brandSoft, in: RoundedRectangle(cornerRadius: 6))
    }
}

/// Step 2: what the merged one will be, then Merge.
struct MergeReviewScreen: View {
    let kind: MergeKind
    let keptId: String
    let from: [String]

    var body: some View {
        if kind == .venues { VenueReview(keptId: keptId, from: from) } else { RefereeReview(keptId: keptId, from: from) }
    }
}

/// After a merge: back past both steps, to the page it started from (Find duplicates, or the kept one's).
@MainActor
private func leaveMerge(_ nav: Nav) {
    nav.paths[nav.tab] = Array((nav.paths[nav.tab] ?? []).dropLast(2))
}

private let keep = "keep"

private struct VenueReview: View {
    let keptId: String
    let from: [String]
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var name: String?
    @State private var addressFrom: String?
    @State private var choices: [String: VenueMergePreviewPitchesItemChoice] = [:]
    @State private var answer: (draft: VenueMergeDraft, preview: VenueMergePreview)?
    @State private var failed: String?
    @State private var merging = false
    @State private var error: String?

    private var draft: VenueMergeDraft {
        VenueMergeDraft(from: from, name: name, addressFrom: addressFrom,
                        pitches: choices.isEmpty ? nil : choices.sorted { $0.key < $1.key }.map { VenueMergeDraftPitchesItem(id: $0.key, into: $0.value.into, name: $0.value.name) })
    }

    var body: some View {
        let p = answer?.preview
        let finalName = p.map { preview in name.flatMap { preview.names.contains($0) ? $0 : nil } ?? preview.name } ?? ""
        Page("Merge \(from.count + 1) venues", large: false) {
            if let p {
                SectionTitle("The merged venue")
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 16) {
                        Options(label: "Name", options: p.names.map { ($0, $0) }, chosen: finalName, hint: p.names.count > 1 ? "The rest are kept as an alias, so searches and imports still find them." : nil) { name = $0 }
                        if p.places.count > 1 {
                            let chosen = addressFrom.flatMap { a in p.places.contains { $0.venueId == a } ? a : nil } ?? p.addressFrom
                            Options(label: "Address and parking", options: p.places.map { ($0.venueId, "\($0.address ?? "No address")\($0.onMap ? "" : " · parking not on the map")") }, chosen: chosen) { addressFrom = $0 }
                        }
                    }
                }
                if !p.pitches.isEmpty {
                    SectionTitle("Pitches")
                    Text("Each pitch from \(p.venues.count == 2 ? p.venues[1].name : "the other venues"): the same as one of \(p.venues[0].name)'s, or kept as a pitch of its own. The ones to check are first.")
                        .font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true).padding(.bottom, 10)
                    let firstFine = p.pitches.firstIndex { !$0.check }
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(p.pitches.enumerated()), id: \.element.id) { i, pitch in
                            if i == firstFine, i > 0 { SectionTitle("Likely fine") }
                            PitchCard(pitch: pitch, choice: choices[pitch.id] ?? pitch.choice) { choices[pitch.id] = $0 }
                        }
                    }
                    ForEach(p.notes, id: \.self) { Text("\($0).").font(.lfBodySmall).foregroundStyle(LF.muted).padding(.top, 8) }
                }
                Together(count: describeCount(p.together), rest: "together, at one venue. Tags are combined and notes joined. This can't be undone.").padding(.top, 16)
            } else if let failed {
                NeedsConnection(message: failed) { Task { await fetch(draft, wait: false) } }.padding(.top, 16)
            } else {
                LfCard { LoadingPitch() }.padding(.top, 16)
            }
            if let error { Text(error).font(.lfBodySmall).foregroundStyle(LF.redText).padding(.top, 12) }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomBar {
                if let problems = p?.problems, problems > 0 {
                    Text(problems == 1 ? "1 pitch needs a look first" : "\(problems) pitches need a look first").font(.lfBodySmall).foregroundStyle(LF.amberText)
                }
                PrimaryButton(merging ? "Merging…" : "Merge \(from.count + 1) into \(finalName)", icon: .merge, enabled: answer?.draft == draft && p?.merge != nil && !merging, wide: true) {
                    guard let merge = p?.merge else { return }
                    Task {
                        merging = true
                        error = nil
                        do {
                            try await graph.merging.merge(keptId, merge)
                            _ = await graph.syncNow()
                            leaveMerge(nav)
                        } catch {
                            self.error = failure(error)
                            merging = false
                        }
                    }
                }
            }
        }
        .keyboardDone()
        // Again whenever the choices change: the first at once, later ones once typing pauses.
        .task(id: draft) { await fetch(draft, wait: answer != nil) }
    }

    private func fetch(_ draft: VenueMergeDraft, wait: Bool) async {
        if wait { try? await Task.sleep(for: .milliseconds(300)) }
        guard !Task.isCancelled else { return }
        failed = nil
        do {
            let preview = try await graph.merging.preview(keptId, draft)
            if !Task.isCancelled { answer = (draft, preview) }
        } catch {
            if !Task.isCancelled { failed = failure(error) }
        }
    }
}

/// A pitch of a venue merged away: what it is, why it's flagged, and what happens to it.
private struct PitchCard: View {
    let pitch: VenueMergePreviewPitchesItem
    let choice: VenueMergePreviewPitchesItemChoice
    let onChange: (VenueMergePreviewPitchesItemChoice) -> Void

    var body: some View {
        LfCard(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pitch.name).font(.lfTitleMedium).foregroundStyle(LF.text)
                    Text([
                        pitch.venue, pitch.matches == 0 ? "No matches" : "\(pitch.matches) \(pitch.matches == 1 ? "match" : "matches")",
                        pitch.corners > 0 ? "corners walked \(pitch.corners == 1 ? "once" : "\(pitch.corners) times")" : nil, pitch.onMap ? nil : "not on the map",
                    ].compactMap { $0 }.joined(separator: " · ")).font(.lfBodySmall).foregroundStyle(LF.muted)
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if pitch.check { Chip("Check", tone: .amber) }
                    Text(pitch.why).font(.lfBodySmall).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                }
                Choice("What happens to it", value: choice.into ?? keep, options: [keep] + pitch.targets.map(\.id), text: { id in
                    guard let id, id != keep else { return "Keep as a pitch of its own" }
                    return "Same as \(pitch.targets.first { $0.id == id }?.name ?? "a pitch that isn't kept")"
                }) { id in
                    onChange(id == nil || id == keep ? VenueMergePreviewPitchesItemChoice(name: pitch.name) : VenueMergePreviewPitchesItemChoice(into: id))
                }
                if choice.into == nil {
                    Field("Name", text: Binding(get: { choice.name ?? pitch.name }, set: { onChange(VenueMergePreviewPitchesItemChoice(name: String($0.prefix(60)))) }))
                }
                if let problem = pitch.problem { Text(problem).font(.lfBodySmall).foregroundStyle(LF.redText) }
            }
        }
    }
}

private struct RefereeReview: View {
    let keptId: String
    let from: [String]
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var name: String?
    @State private var email: String?
    @State private var phone: String?
    @State private var answer: (draft: RefereeMergeDraft, preview: RefereeMergePreview)?
    @State private var failed: String?
    @State private var merging = false
    @State private var error: String?

    private var draft: RefereeMergeDraft { RefereeMergeDraft(from: from, name: name, email: email, phone: phone) }

    /// A choice from a referee since unticked falls back to the server's.
    private func pick(_ values: [String], _ chosen: String?, _ fallback: String?) -> String? {
        chosen.flatMap { values.contains($0) ? $0 : nil } ?? fallback
    }

    var body: some View {
        let p = answer?.preview
        let finalName = p.flatMap { pick($0.names, name, $0.name) } ?? ""
        Page("Merge \(from.count + 1) referees", large: false) {
            if let p {
                SectionTitle("The merged referee")
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 16) {
                        Options(label: "Name", options: p.names.map { ($0, $0) }, chosen: finalName, hint: p.names.count > 1 ? "The rest are kept as an alias, so searches and imports still find them." : nil) { name = $0 }
                        if p.emails.count > 1 { Options(label: "Email", options: p.emails.map { ($0, $0) }, chosen: pick(p.emails, email, p.email)) { email = $0 } }
                        if p.phones.count > 1 { Options(label: "Phone", options: p.phones.map { ($0, $0) }, chosen: pick(p.phones, phone, p.phone)) { phone = $0 } }
                    }
                }
                Together(count: describeCount(p.together), rest: "together, as one referee. Tags are combined and notes joined. This can't be undone.").padding(.top, 16)
            } else if let failed {
                NeedsConnection(message: failed) { Task { await fetch(draft, wait: false) } }.padding(.top, 16)
            } else {
                LfCard { LoadingPitch() }.padding(.top, 16)
            }
            if let error { Text(error).font(.lfBodySmall).foregroundStyle(LF.redText).padding(.top, 12) }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomBar {
                PrimaryButton(merging ? "Merging…" : "Merge \(from.count + 1) into \(finalName)", icon: .merge, enabled: answer?.draft == draft && !merging, wide: true) {
                    guard let merge = p?.merge else { return }
                    Task {
                        merging = true
                        error = nil
                        do {
                            try await graph.merging.merge(keptId, merge)
                            _ = await graph.syncNow()
                            leaveMerge(nav)
                        } catch {
                            self.error = failure(error)
                            merging = false
                        }
                    }
                }
            }
        }
        .task(id: draft) { await fetch(draft, wait: answer != nil) }
    }

    private func fetch(_ draft: RefereeMergeDraft, wait: Bool) async {
        if wait { try? await Task.sleep(for: .milliseconds(300)) }
        guard !Task.isCancelled else { return }
        failed = nil
        do {
            let preview = try await graph.merging.preview(keptId, draft)
            if !Task.isCancelled { answer = (draft, preview) }
        } catch {
            if !Task.isCancelled { failed = failure(error) }
        }
    }
}
