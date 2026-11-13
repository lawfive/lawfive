import SwiftUI

// Adding and editing a match (IOS-4), on the phone and offline: teams, kickoff, where, the
// competition and format, your role and the crew, the fee, and notes. Saved on the phone and sent
// when there's signal. A new match starts from the usual role and format (SET-17), with the format
// beside the kickoff, and a venue made here is looked up and placed (WEB-12), as on the website and Android.

/// The watch's team colors (SET-14).
let teamColors: [(String, String)] = [("#000000", "Black"), ("#FFFFFF", "White"), ("#D71920", "Red"), ("#FF7A00", "Orange"), ("#FFD100", "Yellow"), ("#00A651", "Green"), ("#0057B8", "Blue"), ("#6A2C91", "Purple")]

private let statuses: [(String, String)] = [("scheduled", "Scheduled"), ("played", "Played"), ("abandoned", "Abandoned"), ("cancelled", "Canceled"), ("postponed", "Postponed")]

struct MatchEditScreen: View {
    let id: String?
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var m = Match(id: newId(), version: 0, updatedAt: nowString(), status: "scheduled", timeZone: TimeZone.current.identifier, format: defaultFormat, home: Team(), away: Team(), crew: [])
    /// APP-22: one just made, which the list may not have yet.
    @State private var created: [String: Competition] = [:]
    @State private var feeText = ""
    @State private var tagsText = ""
    @State private var deleting = false
    /// RES-8: whether its report has a track, for Delete match?: nil until the server says (or offline).
    @State private var hasTrack: Bool?
    /// Whether the match, as opened, had a team name or a kickoff: a blank one saved before stays editable.
    @State private var openedWithSomething = false
    @State private var blank = false
    /// WEB-12: a new venue's name, while its address is asked for.
    @State private var newVenueName: String?

    /// RES-8: deleting the match takes its report and track, so Delete match? says so, as the website does.
    private var report: MatchRecord? { id.flatMap { id in graph.records.matchRecords.first { $0.matchId == id } } }

    private var zone: TimeZone { zoneOf(m) }
    private var assignors: [String] {
        Array(Set((graph.records.matches ?? []).compactMap(\.assignor))).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
    private var currency: String { m.fee?.currency ?? graph.records.effectiveSettings.currency }

    /// The kickoff for the pickers: the match's, else the next 9:00 in its zone.
    private var kickoffBinding: Binding<Date> {
        Binding(get: { instantOf(m.kickoff) ?? AppClock.now }, set: { m.kickoff = isoString($0, zone: zone) })
    }

    /// WEB-30: a match needs a team name or a kickoff, so Save never makes an empty "Home v Away" with no date.
    private var hasSomething: Bool { m.home.name?.orNil != nil || m.away.name?.orNil != nil || m.kickoff != nil }

    private func save() {
        if !hasSomething, id == nil || openedWithSomething {
            blank = true
            return
        }
        var out = m
        out.fee = Double(feeText).map { Fee(amount: $0, currency: currency, paid: m.fee?.paid ?? false) }
        out.tags = tagsText.commaList
        out.home.name = m.home.name?.orNil
        out.home.alias = m.home.alias?.orNil?.uppercased()
        out.away.name = m.away.name?.orNil
        out.away.alias = m.away.alias?.orNil?.uppercased()
        out.crew = m.crew.filter { $0.refereeId != nil || $0.name?.orNil != nil }
        out.assignor = m.assignor?.orNil
        let usual = graph.records.settings?.usualFormat
        let templates = graph.records.templates ?? []
        Task {
            await graph.records.save(Collections.matches, id: out.id, out)
            // SET-17: a new match saved from the form makes its format the usual one, when that changes anything.
            let next = usualFormatFrom(out.format, choice: formatChoiceOf(out.format, templateId: out.templateId, usual: usual, templates: templates), now: nowString())
            if id == nil, usualChanged(usual, next) { await graph.records.saveSettings { $0.usualFormat = next } }
            dismiss()
            if id == nil { nav.push(.match(out.id)) }
        }
    }

    private func newCompetition(_ name: String) async -> String {
        let c = Competition(id: newId(), version: 0, updatedAt: nowString(), name: name, type: CompetitionType.league)
        await graph.records.save(Collections.competitions, id: c.id, c)
        created[c.id] = c
        return c.id
    }

    private func newReferee(_ name: String) async -> String {
        let r = Referee(id: newId(), version: 0, updatedAt: nowString(), name: name)
        await graph.records.save(Collections.referees, id: r.id, r)
        return r.id
    }

    var body: some View {
        let records = graph.records
        let venues = (records.venues ?? []).sorted { $0.name < $1.name }
        let competitions = (records.competitions ?? []).sorted { $0.name < $1.name }
        let templates = (records.templates ?? []).sorted { $0.name < $1.name }
        let referees = (records.referees ?? []).sorted { $0.name < $1.name }
        let venue = records.venue(m.venueId)
        FormPage(title: id == nil ? "New match" : "Edit match", loaded: loaded, snapshot: "\(m)|\(feeText)|\(tagsText)", delete: id == nil ? nil : ("Delete match", { deleting = true }),
                 problem: blank && !hasSomething ? "Add a team name or a kickoff time to save this match." : nil, save: save) {
            SectionTitle("Teams")
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    TeamFields(label: "Home", team: $m.home, other: m.away)
                    Hairline()
                    TeamFields(label: "Away", team: $m.away, other: m.home)
                    // WEB-24: the kits as the match's boards will show them, following what's typed.
                    Board(shadow: false) {
                        KitPanels(home: m.home, away: m.away, size: .small, lines: 1)
                    }
                    .padding(.top, 4)
                    .accessibilityHidden(true)
                }
            }
            SectionTitle("When and where")
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        FieldLabel(text: "Kickoff")
                        if m.kickoff == nil {
                            SecondaryButton("Set the kickoff", icon: .calendar, wide: true) {
                                var c = Calendar(identifier: .gregorian)
                                c.timeZone = zone
                                let nine = c.date(bySettingHour: 9, minute: 0, second: 0, of: AppClock.now) ?? AppClock.now
                                m.kickoff = isoString(nine, zone: zone)
                            }
                        } else {
                            HStack {
                                DatePicker("Kickoff", selection: kickoffBinding).labelsHidden().environment(\.timeZone, zone).tint(LF.brand)
                                Spacer()
                                LinkButton("Clear", color: LF.muted) { m.kickoff = nil }
                            }
                        }
                    }
                    // SET-17: the format beside the kickoff: the usual one, the starters and the templates; the details are under Format below.
                    FormatPicker(m: m, usual: records.settings?.usualFormat, templates: records.templates ?? []) { format, template in
                        m.format = format
                        m.templateId = template?.id
                        if feeText.isEmpty, let fee = template?.defaults.fee { feeText = amountText(fee.amount) }
                    }
                    Choice("Status", value: m.status, options: statuses.map(\.0), text: { s in statuses.first { $0.0 == s }?.1 ?? "" }) { m.status = $0 ?? "scheduled" }
                    // WEB-12: a new venue asks for its address, looked up and placed, so the match has its forecast and directions.
                    SearchChoice(label: "Venue", value: venue?.id, options: venues.map { SearchOption(id: $0.id, name: $0.name, otherNames: $0.aliases ?? []) }, createLabel: "New venue", onCreateAsk: { newVenueName = $0 }) {
                        m.venueId = $0
                        m.pitchId = nil
                    }
                    if let venue, !venue.pitches.isEmpty {
                        Choice("Pitch", value: venue.pitches.first { $0.id == m.pitchId }?.id, options: venue.pitches.map(\.id), allowNone: "None", text: { id in venue.pitches.first { $0.id == id }?.name ?? "None" }) { m.pitchId = $0 }
                    }
                    SearchChoice(label: "Competition", value: records.competition(m.competitionId)?.id, options: competitions.map { SearchOption(id: $0.id, name: $0.name) }, createLabel: "New competition", onCreate: newCompetition) { chosen in
                        // A competition's template fills the format, as on the website.
                        let c = (graph.records.competitions ?? []).first { $0.id == chosen } ?? created[chosen ?? ""]
                        let template = records.template(c?.templateId)
                        m.competitionId = c?.id
                        m.ageGroup = m.ageGroup ?? c?.ageGroup
                        m.templateId = template?.id ?? m.templateId
                        m.format = template?.format ?? m.format
                    }
                    HStack(alignment: .top, spacing: 10) {
                        // SET-17: the age group suggests its starter, under Format above.
                        Field("Age group", text: optional(\.ageGroup), placeholder: "U12")
                        Choice("Gender", value: m.gender, options: genderOrder, allowNone: "—", text: { genderNames[$0 ?? ""] ?? "—" }) { m.gender = $0 }
                    }
                }
            }
            // WEB-21: what the match is called and filed under.
            SectionTitle("Details")
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    Field("Match name", text: optional(\.name), placeholder: "Semi-final", capitalization: .words)
                    Field("Match number", text: Binding(get: { m.external?.id ?? "" }, set: { n in
                        m.external = n.isEmpty ? nil : ExternalRef(source: m.external?.source ?? "manual", id: n)
                    }), capitalization: .never)
                    // SET-15: the ones on other matches offered as it's typed.
                    Field("Assignor", text: optional(\.assignor), capitalization: .words, suggestions: assignors)
                    Field("Tags", text: $tagsText, supporting: "Separated by commas")
                }
            }
            SectionTitle("Officials")
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    Choice("Your role", value: m.role, options: roleOrder, allowNone: "Not set", text: { roleNamesInFull[$0 ?? ""] ?? "Not set" }) { m.role = $0 }
                    ForEach(m.crew.indices, id: \.self) { i in
                        HStack(alignment: .bottom, spacing: 8) {
                            Choice("Role", value: m.crew[i].role, options: roleOrder, text: { roleNamesInFull[$0 ?? ""] ?? "" }) { if let r = $0 { m.crew[i].role = r } }
                                // Room for its longest, "4th official"; the referee takes the rest.
                                .frame(width: 124)
                            SearchChoice(label: "Referee", value: m.crew[i].refereeId, options: referees.map { SearchOption(id: $0.id, name: $0.name, otherNames: $0.aliases ?? []) }, empty: m.crew[i].name ?? "Choose", allowNone: false, createLabel: "New referee", onCreate: newReferee, textLabel: "Just this match:", onUseText: { typed in
                                m.crew[i].refereeId = nil
                                m.crew[i].name = typed
                            }) {
                                m.crew[i].refereeId = $0
                                if $0 != nil { m.crew[i].name = nil }
                            }
                            Button {
                                _ = withAnimation { m.crew.remove(at: i) }
                            } label: { PhIcon(.close, tint: LF.muted, label: "Remove").frame(width: 34, height: 44) }
                            .buttonStyle(.plain)
                        }
                    }
                    HStack {
                        SecondaryButton("Add an official", icon: .plus) {
                            let taken = m.crew.map(\.role) + (m.role.map { [$0] } ?? [])
                            withAnimation { m.crew.append(CrewMember(role: roleOrder.first { !taken.contains($0) } ?? "ar1")) }
                        }
                        Spacer()
                    }
                }
            }
            // The format in full, chosen beside the kickoff (SET-17), saying where it came from, as the website's.
            SectionTitle("Format")
            VStack(alignment: .leading, spacing: 10) {
                let choice = formatChoiceOf(m.format, templateId: m.templateId, usual: records.settings?.usualFormat, templates: templates)
                let template = choice.template.flatMap { $0.id == m.templateId ? $0 : nil }
                let competition = template.flatMap { t in competitions.first { $0.id == m.competitionId && $0.templateId == t.id } }
                Text(template.map { t in "From \(competition.map { "\($0.name) (\(t.name))" } ?? "the template \(t.name)"). Changes here apply to this match only." }
                     ?? (choice.id == "none" ? "Your own, for this match." : "\(choice.name). Changes here apply to this match only."))
                    .font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                FormatFields(format: $m.format)
            }
            SectionTitle("Fee and notes")
            LfCard {
                VStack(spacing: 10) {
                    Field("Fee (\(currency))", text: Binding(get: { feeText }, set: { feeText = $0.filter { $0.isNumber || $0 == "." } }), keyboard: .decimalPad)
                    Field("What to expect", text: optional(\.outlook), placeholder: "Top of the table meets second.", minLines: 2,
                          supporting: "How competitive it'll be, the teams' strengths, history between them.")
                    Field("Notes", text: optional(\.notes), minLines: 3)
                }
                .padding(16)
                if let amount = Double(feeText) {
                    ToggleRow("Paid", isOn: Binding(get: { m.fee?.paid == true }, set: { m.fee = Fee(amount: amount, currency: currency, paid: $0) }))
                }
            }
        }
        .task {
            guard !loaded else { return }
            loaded = true
            guard let saved = records.match(id ?? "") else {
                // SET-17: the usual role (Referee until chosen) and the usual format (2×45 until one's saved).
                if id == nil {
                    let start = startingFormat(records.settings?.usualFormat, templates: records.templates ?? [])
                    m.format = start.format
                    m.templateId = start.templateId
                    m.role = records.effectiveSettings.usualRole ?? "referee"
                }
                return
            }
            m = saved
            openedWithSomething = hasSomething
            feeText = saved.fee.map { amountText($0.amount) } ?? ""
            tagsText = (saved.tags ?? []).joined(separator: ", ")
        }
        .sheet(isPresented: Binding(get: { newVenueName != nil }, set: { if !$0 { newVenueName = nil } })) {
            NewVenueSheet(typed: newVenueName ?? "") { venue in
                newVenueName = nil
                m.venueId = venue.id
                m.pitchId = nil
            }
            .environment(graph)
            .tint(LF.brand)
        }
        .confirm("Delete match?", isPresented: $deleting, message: deleteMatchMessage(report: report != nil, track: hasTrack), action: "Delete") {
            Task {
                await records.delete(Collections.matches, id: m.id)
                dismiss()
                nav.popToRoot()
            }
        }
        .task(id: report?.id) {
            guard let r = report else { return }
            do {
                hasTrack = try await graph.api.call("GET", "/v1/match-records/\(r.id)/track") != nil
            } catch let e as ServerError where e.status == 404 {
                hasTrack = false
            } catch {
                // Offline: "and any track".
            }
        }
    }

    private func amountText(_ amount: Double) -> String { amount.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(amount))" : "\(amount)" }

    private func optional(_ key: WritableKeyPath<Match, String?>) -> Binding<String> {
        Binding(get: { m[keyPath: key] ?? "" }, set: { m[keyPath: key] = $0.isEmpty ? nil : $0 })
    }
}

/// SET-17: the format beside the kickoff, as the website's: Your usual (when it's none of the named
/// ones), the starter formats, then the templates; the field naming which the match's format is. The
/// line under it keeps its place: the format in words, or the starter the age group suggests, with Use it.
private struct FormatPicker: View {
    let m: Match
    let usual: UsualFormat?
    let templates: [MatchTemplate]
    let onChange: (MatchFormat, MatchTemplate?) -> Void

    var body: some View {
        let choice = formatChoiceOf(m.format, templateId: m.templateId, usual: usual, templates: templates)
        let usualLast = usual.map { usualFormatChoice($0, templates: templates).id == "last" } ?? false
        let own = templates.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        let options = (usualLast ? ["last"] : []) + starterFormats.map { "starter:\($0.id)" }
        VStack(alignment: .leading, spacing: 2) {
            Choice("Format", value: choice.id, options: options, groups: [(heading: "Your templates", options: own.map { "template:\($0.id)" })], text: { id in
                if id == "last" { return "Your usual" }
                if let s = starterFormats.first(where: { "starter:\($0.id)" == id }) { return s.name }
                if let t = own.first(where: { "template:\($0.id)" == id }) { return t.name }
                return choice.name
            }) { id in
                guard let id, id != choice.id else { return }
                if id == "last", let usual { onChange(usual.format, nil) }
                if let s = starterFormats.first(where: { "starter:\($0.id)" == id }) { onChange(s.format, nil) }
                if let t = own.first(where: { "template:\($0.id)" == id }) { onChange(t.format, t) }
            }
            HStack(spacing: 8) {
                if let suggestion = suggestedStarter(m.ageGroup, format: m.format) {
                    Text("For \(m.ageGroup?.trimmingCharacters(in: .whitespaces) ?? ""): \(suggestion.name)").font(.lfBodySmall).foregroundStyle(LF.muted).lineLimit(2)
                    LinkButton("Use it") { onChange(suggestion.format, nil) }
                } else {
                    Text(describeFormat(m.format)).font(.lfBodySmall).foregroundStyle(LF.muted).lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 36)
            .padding(.leading, 4)
        }
    }
}

/// WEB-12: a venue made from the match form, as the website's and Android's: its name and address, the
/// address looked up and the venue placed on the map (Find on map, or when Create is pressed), so the
/// match gets its forecast and directions from the start. With several places Create waits for a choice;
/// with none, it can still be made, and placed from Venues.
private struct NewVenueSheet: View {
    let typed: String
    let onCreated: (Venue) -> Void
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var address = ""
    @State private var placed: Place?
    /// The address last looked up, so Create doesn't look the same one up twice.
    @State private var searched: String?
    @State private var saving = false
    /// Create pressed while the search had several places: choosing one creates the venue.
    @State private var creating = false
    @State private var search = AddressLookUp()
    @State private var height: CGFloat = 480

    private func create(_ place: Place?) {
        guard !saving else { return }
        saving = true
        Task {
            var v = Venue(id: newId(), version: 0, updatedAt: nowString(), name: name.trimmingCharacters(in: .whitespaces), pitches: [])
            v.address = address.orNil
            v.position = place.map { Position(lat: $0.lat, lon: $0.lon) }
            await graph.records.save(Collections.venues, id: v.id, v)
            onCreated(v)
            dismiss()
        }
    }

    var body: some View {
        let trimmed = address.trimmingCharacters(in: .whitespaces)
        let unplaced = !trimmed.isEmpty && placed == nil && searched == trimmed && !search.looking
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("NEW VENUE").font(.display(26, relativeTo: .title2)).foregroundStyle(LF.text)
                Field("Name", text: $name, capitalization: .words)
                Field("Address", text: Binding(get: { address }, set: {
                    address = $0
                    placed = nil
                    creating = false
                    search.clear()
                }), capitalization: .words, contentType: .fullStreetAddress,
                      supporting: "Usually where you park. It's looked up and the venue placed on the map, for the match's forecast and directions. Place the pitches themselves from Venues.")
                if search.available {
                    HStack {
                        SecondaryButton(search.looking ? "Looking…" : "Find on map", icon: .search, enabled: !trimmed.isEmpty && !search.looking) {
                            searched = trimmed
                            Task { await search.lookUp(trimmed, graph: graph) }
                        }
                        Spacer()
                    }
                }
                if let placed {
                    HStack(alignment: .top, spacing: 8) {
                        PhIcon(.check, size: 18, tint: LF.brand)
                        Text("On the map at \(placed.name)").font(.lfBodyMedium).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                    }
                }
                FoundPlaces(search: search, instead: "Create it anyway, and place it from Venues.")
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    SecondaryButton("Cancel", enabled: !saving) { dismiss() }
                    PrimaryButton(search.looking ? "Looking…" : saving ? "Saving…" : unplaced ? "Create without the map" : "Create", enabled: name.orNil != nil && !search.looking && !saving) {
                        if search.available, !trimmed.isEmpty, placed == nil, searched != trimmed {
                            // Looked up first, as Find on map would be: one place is used straight away; with several,
                            // choosing one creates it; with none, Create again makes it unplaced.
                            searched = trimmed
                            Task {
                                if let one = await search.lookUp(trimmed, graph: graph) { create(one) } else { creating = true }
                            }
                        } else {
                            create(placed)
                        }
                    }
                }
                .padding(.top, 4)
            }
            .padding(20)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        }
        .background(LF.surface)
        .ground(.panel)
        .keyboardDone()
        .interactiveDismissDisabled(saving || name != typed || !address.isEmpty)
        .fittedDetents(height)
        .onAppear { name = typed }
        .task {
            search.onChoose = { p in
                placed = p
                if creating { create(p) }
            }
            await search.load(graph)
        }
    }
}

private struct TeamFields: View {
    let label: String
    @Binding var team: Team
    let other: Team

    var body: some View {
        VStack(spacing: 8) {
            Field(label, text: Binding(get: { team.name ?? "" }, set: { team.name = $0.isEmpty ? nil : $0 }), capitalization: .words)
            HStack(alignment: .top, spacing: 10) {
                Field("Short name", text: Binding(get: { team.alias ?? "" }, set: { team.alias = $0.isEmpty ? nil : String($0.prefix(4)) }), placeholder: teamAlias(Team(name: team.name), other: other, home: label == "Home"), capitalization: .characters)
                ColorChoice(hex: team.colour) { team.colour = $0 }
            }
        }
    }
}

/// A native menu draws only images, so a swatch for one is drawn as an image, with a border that keeps black and white visible.
private func colorSwatchImage(_ hex: String) -> UIImage {
    let rgb = parseColor(hex)
    let color = UIColor(red: rgb?.r ?? 0, green: rgb?.g ?? 0, blue: rgb?.b ?? 0, alpha: 1)
    let rect = CGRect(x: 0, y: 0, width: 18, height: 18)
    let image = UIGraphicsImageRenderer(size: rect.size).image { _ in
        let path = UIBezierPath(roundedRect: rect.insetBy(dx: 0.5, dy: 0.5), cornerRadius: 4)
        color.setFill()
        path.fill()
        UIColor.systemGray3.setStroke()
        path.stroke()
    }
    return image.withRenderingMode(.alwaysOriginal)
}

/// A team's color: the watch's eight in a native menu, with a swatch, then Custom (WEB-19), which
/// opens Apple's color picker.
private struct ColorChoice: View {
    let hex: String?
    let onChange: (String?) -> Void
    @State private var picking = false

    private var custom: String? {
        guard let hex, !teamColors.contains(where: { $0.0.caseInsensitiveCompare(hex) == .orderedSame }) else { return nil }
        return hex.uppercased()
    }

    private var name: String {
        guard let hex else { return "None" }
        return teamColors.first { $0.0.caseInsensitiveCompare(hex) == .orderedSame }?.1 ?? "Custom"
    }

    @Environment(\.ground) private var ground
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            FieldLabel(text: "Color")
            Menu {
                Button("None") { onChange(nil) }
                ForEach(teamColors, id: \.0) { color in
                    Button { onChange(color.0) } label: {
                        Label { Text(color.1) } icon: { Image(uiImage: colorSwatchImage(color.0)) }
                    }
                }
                Divider()
                Button { picking = true } label: {
                    if let custom {
                        Label { Text("Custom \(custom)") } icon: { Image(uiImage: colorSwatchImage(custom)) }
                    } else {
                        Label("Custom…", image: "ph_palette")
                    }
                }
            } label: {
                FieldBox {
                    if let c = parseColor(hex) {
                        RoundedRectangle(cornerRadius: 4).fill(c.color).frame(width: 18, height: 18)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(LF.border, lineWidth: 1))
                    }
                    Text(name).font(.lfBodyLarge).foregroundStyle(ink(\.text, ground, scheme)).lineLimit(1)
                    Spacer(minLength: 0)
                    PhIcon(.chevron, size: 16, tint: ink(\.muted, ground, scheme))
                }
            }
            .accessibilityLabel("Color")
            .accessibilityValue(custom.map { "Custom, \($0)" } ?? name)
        }
        .frame(maxWidth: .infinity)
        .sheet(isPresented: $picking) {
            CustomColorPicker(hex: hex, onChange: { onChange($0) }, onDone: { picking = false })
                .presentationDetents([.medium, .large])
                .ignoresSafeArea()
        }
    }
}

/// WEB-19: Apple's color picker for a team's custom color, applied as it's chosen; its close button
/// closes the sheet.
private struct CustomColorPicker: UIViewControllerRepresentable {
    let hex: String?
    let onChange: (String) -> Void
    let onDone: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onChange: onChange, onDone: onDone) }

    func makeUIViewController(context: Context) -> UIColorPickerViewController {
        let picker = UIColorPickerViewController()
        picker.title = "Team color"
        picker.supportsAlpha = false
        if let c = parseColor(hex) { picker.selectedColor = UIColor(red: c.r, green: c.g, blue: c.b, alpha: 1) }
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIColorPickerViewController, context: Context) {}

    final class Coordinator: NSObject, UIColorPickerViewControllerDelegate {
        let onChange: (String) -> Void
        let onDone: () -> Void

        init(onChange: @escaping (String) -> Void, onDone: @escaping () -> Void) {
            self.onChange = onChange
            self.onDone = onDone
        }

        func colorPickerViewController(_ picker: UIColorPickerViewController, didSelect color: UIColor, continuously: Bool) {
            if let hex = hexString(color.cgColor) { onChange(hex) }
        }

        func colorPickerViewControllerDidFinish(_ picker: UIColorPickerViewController) { onDone() }
    }
}
