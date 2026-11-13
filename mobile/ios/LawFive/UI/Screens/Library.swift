import SwiftUI

// Venues, referees, competitions and templates (IOS-4): each listed, searchable, and added, changed
// or deleted on the phone (synced when there's signal).

func newId() -> String { UUID().uuidString.lowercased() }

struct VenuesScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var mergingOffered = false
    @State private var query = ""
    @State private var chosenTags: [SearchTag] = []

    var body: some View {
        let venues = graph.records.venues ?? []
        let counts = matchCounts(graph.records.matches ?? []) { m in [m.venueId].compactMap { $0 } }
        let shown = venues.filter { item in chosenTags.allSatisfy { (item.tags ?? []).contains($0.name) } }.filter { v in
            query.isEmpty || ([v.name, v.address, v.notes].compactMap { $0 } + (v.aliases ?? []) + v.pitches.flatMap { [$0.name] + ($0.aliases ?? []) } + (v.tags ?? [])).joined(separator: " ").localizedCaseInsensitiveContains(query)
        }.sorted { a, b in
            let (x, y) = (counts[a.id]?.played ?? 0, counts[b.id]?.played ?? 0)
            return x != y ? x > y : a.name.lowercased() < b.name.lowercased()
        }
        let pins = shown.compactMap { v in venuePosition(v).map { MapPin(id: v.id, lat: $0.lat, lon: $0.lon, kind: .venue) } }
        Page("Venues", status: true, add: ("Add a venue", { nav.sheet = .venue(nil) })) {
            SearchField(text: $query, tags: Array(Set((graph.records.venues ?? []).flatMap { $0.tags ?? [] })).sorted(), chosen: $chosenTags, prompt: "Names, addresses, pitches, tags")
                .padding(.bottom, 14)
            DuplicatesNotice(kind: .venues)
            if !pins.isEmpty {
                VenueMap(pins: pins, height: 240, onPinClick: { nav.push(.venue($0)) }).padding(.bottom, 12)
            }
            LfCard {
                if graph.records.venues == nil {
                    LoadingPitch()
                } else if venues.isEmpty {
                    EmptyState(picture: .venue, title: "No venues yet", text: "Save a ground once to keep its address, parking and pitches at hand.") { PrimaryButton("Add a venue", icon: .plus) { nav.sheet = .venue(nil) } }
                } else if shown.isEmpty {
                    NoResults("No venues match \"\(query.isEmpty ? (chosenTags.first?.name ?? "") : query)\"")
                }
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, v in
                    // APP-19: the count first, as a long address is what should run out of room.
                    ListRow(title: v.name, sub: [describeCount(counts[v.id]), v.address].compactMap { $0 }.joined(separator: " · "), divider: i > 0, action: { nav.push(.venue(v.id)) },
                            leading: { Avatar(icon: .venues) },
                            trailing: {
                                if venuePosition(v) == nil { Chip("Not on the map", tone: .amber) }
                            })
                }
            }
            // DUP-7, DUP-12: on servers that work out duplicates.
            if mergingOffered && venues.count > 1 {
                SecondaryButton("Find duplicates", icon: .merge, wide: true) { nav.push(.duplicates(.venues)) }.padding(.top, 12)
            }
        }
        .task { mergingOffered = await graph.mergingOffered() }
        .refreshable { await graph.pullToSync() }
    }
}

private let parking = "parking"

/// A pin's mark in a circle, in the map pin's color.
struct MiniPin: View {
    let mark: String
    var parking = false
    var size: CGFloat = 22

    var body: some View {
        ZStack {
            Circle().fill(parking ? LF.parkingBlue : LF.brand)
            Text(mark).font(.barlow(11, .bold, relativeTo: .caption2)).foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }
}

struct VenueEditScreen: View {
    let id: String?
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var recordId = newId()
    @State private var name = ""
    @State private var address = ""
    @State private var notes = ""
    @State private var tags = ""
    @State private var pitches: [Pitch] = []
    @State private var position: Position?
    @State private var placing = parking
    /// Find on map (shared with a venue made from the match form, WEB-12): one place found is used straight away.
    @State private var search = AddressLookUp()
    @State private var fitKey = 0
    @State private var deleting = false
    @State private var forgetting: String?
    @State private var mergingOffered = false

    private var saved: Venue? { id.flatMap { graph.records.venue($0) } }

    private func place(_ target: String, _ lat: Double, _ lon: Double) {
        if target == parking {
            position = Position(lat: lat, lon: lon)
        } else if let i = pitches.firstIndex(where: { $0.id == target }) {
            pitches[i].position = Position(lat: lat, lon: lon)
        }
    }

    private func choose(_ p: Place) {
        position = Position(lat: p.lat, lon: p.lon)
        fitKey += 1
    }

    private func save() {
        var v = saved ?? Venue(id: recordId, version: 0, updatedAt: nowString(), name: "", pitches: [])
        v.name = name.trimmingCharacters(in: .whitespaces)
        v.address = address.orNil
        v.position = position
        v.notes = notes.orNil
        v.pitches = pitches.map { p in
            var p = p
            p.name = p.name.orNil ?? "Field"
            return p
        }
        v.tags = tags.commaList
        Task {
            await graph.records.save(Collections.venues, id: recordId, v)
            dismiss()
        }
    }

    var body: some View {
        let pins = (position.map { [MapPin(id: parking, lat: $0.lat, lon: $0.lon, kind: .parking, mark: "P")] } ?? []) +
            pitches.enumerated().compactMap { i, p in p.position.map { MapPin(id: p.id, lat: $0.lat, lon: $0.lon, kind: .pitch, mark: "\(i + 1)") } }
        FormPage(title: id == nil ? "New venue" : "Edit venue", canSave: name.orNil != nil, loaded: loaded, snapshot: "\(name)|\(address)|\(notes)|\(tags)|\(pitches)|\(String(describing: position))", delete: id == nil ? nil : ("Delete venue", { deleting = true }), save: save) {
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    Field("Name", text: $name, capitalization: .words)
                    Field("Address", text: $address, capitalization: .words, contentType: .fullStreetAddress, supporting: "Usually where you park. The pitches can be some way off, so each one gets its own spot on the map.")
                    if search.available {
                        HStack {
                            SecondaryButton(search.looking ? "Looking…" : "Find on map", icon: .search, enabled: address.orNil != nil && !search.looking) { Task { await search.lookUp(address, graph: graph) } }
                            Spacer()
                        }
                    }
                    FoundPlaces(search: search, instead: "Place the pin on the map instead.")
                    Field("Tags", text: $tags, supporting: "Separated by commas")
                    Field("Notes", text: $notes, placeholder: "Parking, toilets, lightning policy…", minLines: 3)
                }
            }
            SectionTitle("Map")
            LfCard(padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Choose what to place, then tap the map.").font(.lfBodySmall).foregroundStyle(LF.muted)
                    Flow(spacing: 8) {
                        PlaceTarget(mark: "P", name: "Parking", parking: true, placed: position != nil, on: placing == parking) { placing = parking }
                        ForEach(Array(pitches.enumerated()), id: \.element.id) { i, p in
                            PlaceTarget(mark: "\(i + 1)", name: p.name, parking: false, placed: p.position != nil, on: placing == p.id) { placing = p.id }
                        }
                    }
                    VenueMap(pins: pins, height: 320, activeId: placing, fitKey: fitKey, onPick: { place(placing, $0, $1) })
                }
            }
            SectionTitle("Pitches")
            LfCard {
                ForEach(Array(pitches.enumerated()), id: \.element.id) { i, p in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .bottom, spacing: 10) {
                            MiniPin(mark: "\(i + 1)").padding(.bottom, 11)
                            Field("Name", text: Binding(get: { pitches.first { $0.id == p.id }?.name ?? "" }, set: { n in
                                if let at = pitches.firstIndex(where: { $0.id == p.id }) { pitches[at].name = n }
                            }))
                        }
                        HStack {
                            Text(p.position.map { String(format: "%.5f, %.5f", $0.lat, $0.lon) } ?? "Not on the map yet").font(.lfBodySmall).foregroundStyle(LF.muted)
                            Spacer()
                            LinkButton("Place") { placing = p.id }
                            LinkButton("Remove", color: LF.redText) {
                                pitches.removeAll { $0.id == p.id }
                                if placing == p.id { placing = parking }
                            }
                        }
                        // TRK-13: corners walked on the watch, used for this pitch's matches from then on.
                        if let last = p.markings?.last {
                            HStack {
                                Text("Corners walked \(instantOf(last.at).map { formatShortDay($0, zone: .current) } ?? "")").font(.lfBodySmall).foregroundStyle(LF.muted)
                                Spacer()
                                LinkButton("Forget") { forgetting = p.id }
                            }
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 8)
                }
                HStack {
                    SecondaryButton("Add a pitch", icon: .plus) {
                        let pitch = Pitch(id: newId(), name: "Field \(pitches.count + 1)")
                        withAnimation { pitches.append(pitch) }
                        placing = pitch.id
                    }
                    Spacer()
                }
                .padding(16)
            }
            if id != nil {
                PhotosSection(recordType: "venue", recordId: recordId)
                // DUP-12: on servers that work out duplicates; the form closes and the merge opens on the page under it.
                if mergingOffered {
                    SecondaryButton("Merge with…", icon: .merge, wide: true) {
                        nav.sheet = nil
                        nav.push(.mergePick(.venues, keptId: recordId, with: []))
                    }
                    .padding(.top, 22)
                }
            }
        }
        .task { mergingOffered = await graph.mergingOffered() }
        .task {
            guard !loaded else { return }
            loaded = true
            if let v = saved {
                recordId = v.id
                name = v.name
                address = v.address ?? ""
                notes = v.notes ?? ""
                tags = (v.tags ?? []).joined(separator: ", ")
                pitches = v.pitches
                position = v.position
            }
            search.onChoose = { choose($0) }
            await search.load(graph)
        }
        .confirm("Forget the corners?", isPresented: Binding(get: { forgetting != nil }, set: { if !$0 { forgetting = nil } }), message: "Its later matches go back to the pitch found from each track.", action: "Forget") {
            if let at = pitches.firstIndex(where: { $0.id == forgetting }) { pitches[at].markings = nil }
            forgetting = nil
        }
        .confirm("Delete venue?", isPresented: $deleting, message: "\(saved?.name ?? "It") goes from LawFive, on every device. Matches there keep their details.", action: "Delete") {
            Task {
                await graph.records.delete(Collections.venues, id: recordId)
                dismiss()
                // Past its own page, which has gone too.
                nav.popToRoot()
            }
        }
    }
}

/// One of the things to place on the venue's map.
private struct PlaceTarget: View {
    let mark: String
    let name: String
    let parking: Bool
    let placed: Bool
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                MiniPin(mark: mark, parking: parking)
                Text(name).font(.lfLabelLarge).foregroundStyle(LF.text).lineLimit(1)
                if !placed { Text("not placed").font(.lfBodySmall).foregroundStyle(LF.muted) }
            }
            .padding(.leading, 4).padding(.trailing, 12).padding(.vertical, 4)
            .background(on ? LF.brandSoft : LF.surface2, in: Capsule())
            .overlay(Capsule().stroke(on ? LF.brand : LF.border, lineWidth: 1))
        }
        .buttonStyle(PressStyle())
    }
}

struct RefereesScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var mergingOffered = false
    @State private var query = ""
    @State private var chosenTags: [SearchTag] = []

    var body: some View {
        let referees = graph.records.referees ?? []
        let counts = matchCounts(graph.records.matches ?? []) { m in m.crew.compactMap(\.refereeId) }
        let shown = referees.filter { item in chosenTags.allSatisfy { (item.tags ?? []).contains($0.name) } }.filter { r in
            query.isEmpty || ([r.name, r.email, r.phone, r.notes].compactMap { $0 } + (r.aliases ?? []) + (r.tags ?? [])).joined(separator: " ").localizedCaseInsensitiveContains(query)
        }.sorted { a, b in
            let (x, y) = (counts[a.id]?.played ?? 0, counts[b.id]?.played ?? 0)
            return x != y ? x > y : a.name.lowercased() < b.name.lowercased()
        }
        Page("Referees", sub: "The officials you work with.", status: true, add: ("Add a referee", { nav.sheet = .referee(nil) })) {
            SearchField(text: $query, tags: Array(Set((graph.records.referees ?? []).flatMap { $0.tags ?? [] })).sorted(), chosen: $chosenTags, prompt: "Names, email, phone, tags")
                .padding(.bottom, 14)
            DuplicatesNotice(kind: .referees)
            LfCard {
                if graph.records.referees == nil {
                    LoadingPitch()
                } else if referees.isEmpty {
                    EmptyState(picture: .crew, title: "No referees yet", text: "Save the people you work with, so you can add them to a match and get in touch.") { PrimaryButton("Add a referee", icon: .plus) { nav.sheet = .referee(nil) } }
                } else if shown.isEmpty {
                    NoResults("No referees match \"\(query.isEmpty ? (chosenTags.first?.name ?? "") : query)\"")
                }
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, r in
                    // WEB-23: Call, Text and Email rather than the number and address.
                    ListRow(title: r.name, sub: [describeCount(counts[r.id]), r.notes ?? r.aliases.map { "Also \($0.joined(separator: ", "))" }].compactMap { $0 }.joined(separator: " · "), divider: i > 0, action: { nav.push(.referee(r.id)) },
                            leading: { RefereeAvatar(r: r) }, trailing: { ContactButtons(phone: r.phone, email: r.email, name: r.name) })
                }
            }
            // DUP-1, DUP-12: on servers that work out duplicates.
            if mergingOffered && referees.count > 1 {
                SecondaryButton("Find duplicates", icon: .merge, wide: true) { nav.push(.duplicates(.referees)) }.padding(.top, 12)
            }
        }
        .task { mergingOffered = await graph.mergingOffered() }
        .refreshable { await graph.pullToSync() }
        .task { await graph.loadRefereePictures() }
    }
}

struct RefereeEditScreen: View {
    let id: String?
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var recordId = newId()
    @State private var name = ""
    @State private var shortName = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var aliases = ""
    @State private var tags = ""
    @State private var notes = ""
    @State private var deleting = false
    @State private var mergingOffered = false

    private var saved: Referee? { graph.records.referee(id) }

    var body: some View {
        FormPage(title: id == nil ? "Add referee" : "Edit referee", canSave: name.orNil != nil, loaded: loaded, snapshot: "\(name)|\(shortName)|\(email)|\(phone)|\(aliases)|\(tags)|\(notes)", delete: id == nil ? nil : ("Delete referee", { deleting = true }), save: {
            var r = saved ?? Referee(id: recordId, version: 0, updatedAt: nowString(), name: "")
            r.name = name.trimmingCharacters(in: .whitespaces)
            r.shortName = shortName.orNil
            r.email = email.orNil
            r.phone = phone.orNil
            r.notes = notes.orNil
            r.aliases = aliases.commaList
            r.tags = tags.commaList
            Task {
                await graph.records.save(Collections.referees, id: recordId, r)
                dismiss()
            }
        }) {
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    Field("Name", text: $name, capitalization: .words, contentType: .name)
                    // WEB-20: what the officials line calls them; until one is typed, the hint says what it guesses.
                    Field("Shown as", text: $shortName, placeholder: surname(name), capitalization: .words,
                          supporting: shortName.orNil == nil && !surname(name).isEmpty ? "Match cards show \u{201C}\(surname(name))\u{201D}, from the name" : "What match cards call them")
                    Field("Email", text: $email, keyboard: .emailAddress, capitalization: .never, contentType: .emailAddress)
                    Field("Phone", text: $phone, keyboard: .phonePad, contentType: .telephoneNumber)
                    Field("Other names", text: $aliases, supporting: "How their name is written elsewhere (Doe, John), separated by commas")
                    Field("Tags", text: $tags, supporting: "Separated by commas")
                    Field("Notes", text: $notes, minLines: 3)
                }
            }
            if id != nil {
                PhotosSection(recordType: "referee", recordId: recordId)
                // DUP-12: on servers that work out duplicates; the form closes and the merge opens on the page under it.
                if mergingOffered {
                    SecondaryButton("Merge with…", icon: .merge, wide: true) {
                        nav.sheet = nil
                        nav.push(.mergePick(.referees, keptId: recordId, with: []))
                    }
                    .padding(.top, 22)
                }
            }
        }
        .task { mergingOffered = await graph.mergingOffered() }
        .task {
            guard !loaded else { return }
            loaded = true
            guard let r = saved else { return }
            recordId = r.id
            name = r.name
            shortName = r.shortName ?? ""
            email = r.email ?? ""
            phone = r.phone ?? ""
            aliases = (r.aliases ?? []).joined(separator: ", ")
            tags = (r.tags ?? []).joined(separator: ", ")
            notes = r.notes ?? ""
        }
        .confirm("Delete referee?", isPresented: $deleting, message: "\(saved?.name ?? "They") goes from LawFive, on every device. Matches keep their crew.", action: "Delete") {
            Task {
                await graph.records.delete(Collections.referees, id: recordId)
                dismiss()
                // Past their own page, which has gone too.
                nav.popToRoot()
            }
        }
    }
}

struct CompetitionsScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav

    var body: some View {
        let competitions = graph.records.competitions ?? []
        Page("Competitions", sub: "Leagues, cups and tournaments.", large: false) {
            LfCard {
                if graph.records.competitions == nil {
                    LoadingPitch()
                } else if competitions.isEmpty {
                    EmptyState(picture: .bracket, title: "No competitions yet", text: "Keep each league or cup together, and let it set the format of its matches.") { PrimaryButton("Add a competition", icon: .plus) { nav.sheet = .competition(nil) } }
                }
                ForEach(Array(competitions.sorted { $0.name.lowercased() < $1.name.lowercased() }.enumerated()), id: \.element.id) { i, c in
                    ListRow(title: c.name, sub: [c.type.prefix(1).uppercased() + c.type.dropFirst(), c.season, c.organiser].compactMap { $0 }.joined(separator: " · "), divider: i > 0, action: { nav.sheet = .competition(c.id) },
                            leading: { Avatar(icon: .competitions) }, trailing: { EmptyView() })
                }
            }
        }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { BarIcon(icon: .plus, label: "Add a competition") { nav.sheet = .competition(nil) } } }
        // IOS-3: pull to refresh on every page of synced data.
        .refreshable { await graph.pullToSync() }
    }
}

struct CompetitionEditScreen: View {
    let id: String?
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var recordId = newId()
    @State private var name = ""
    @State private var type = CompetitionType.league
    @State private var season = ""
    @State private var organizer = ""
    @State private var ageGroup = ""
    @State private var templateId: String?
    @State private var notes = ""
    @State private var deleting = false

    private var saved: Competition? { graph.records.competition(id) }

    var body: some View {
        let templates = (graph.records.templates ?? []).sorted { $0.name < $1.name }
        FormPage(title: id == nil ? "New competition" : (saved?.name ?? "Competition"), canSave: name.orNil != nil, loaded: loaded, snapshot: "\(name)|\(type)|\(season)|\(organizer)|\(ageGroup)|\(String(describing: templateId))|\(notes)", delete: id == nil ? nil : ("Delete competition", { deleting = true }), save: {
            var c = saved ?? Competition(id: recordId, version: 0, updatedAt: nowString(), name: "", type: CompetitionType.league)
            c.name = name.trimmingCharacters(in: .whitespaces)
            c.type = type
            c.season = season.orNil
            c.organiser = organizer.orNil
            c.ageGroup = ageGroup.orNil
            c.templateId = templateId
            c.notes = notes.orNil
            Task {
                await graph.records.save(Collections.competitions, id: recordId, c)
                dismiss()
            }
        }) {
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    Field("Name", text: $name, capitalization: .words)
                    Choice("Type", value: type, options: CompetitionType.all, text: { ($0 ?? "").prefix(1).uppercased() + ($0 ?? "").dropFirst() }) { type = $0 ?? CompetitionType.league }
                    Field("Season", text: $season, placeholder: "2026–27")
                    Field("Organizer", text: $organizer, capitalization: .words)
                    Field("Age group", text: $ageGroup, placeholder: "U12, Adult, O35")
                    Choice("Template", value: templates.first { $0.id == templateId }?.id, options: templates.map(\.id), allowNone: "None", text: { id in templates.first { $0.id == id }?.name ?? "None" }) { templateId = $0 }
                    Field("Notes", text: $notes, minLines: 3)
                }
            }
        }
        .task {
            guard !loaded else { return }
            loaded = true
            guard let c = saved else { return }
            recordId = c.id
            name = c.name
            type = c.type
            season = c.season ?? ""
            organizer = c.organiser ?? ""
            ageGroup = c.ageGroup ?? ""
            templateId = c.templateId
            notes = c.notes ?? ""
        }
        .confirm("Delete competition?", isPresented: $deleting, message: "\(saved?.name ?? "It") goes from LawFive, on every device.", action: "Delete") {
            Task {
                await graph.records.delete(Collections.competitions, id: recordId)
                dismiss()
            }
        }
    }
}

struct TemplatesScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav

    var body: some View {
        let templates = graph.records.templates ?? []
        Page("Templates", sub: "Formats you use often.", large: false) {
            LfCard {
                if graph.records.templates == nil {
                    LoadingPitch()
                } else if templates.isEmpty {
                    EmptyState(picture: .format, title: "No templates yet", text: "Save a match format once and reuse it for every game played that way.") { PrimaryButton("Add a template", icon: .plus) { nav.sheet = .template(nil) } }
                }
                ForEach(Array(templates.sorted { $0.name.lowercased() < $1.name.lowercased() }.enumerated()), id: \.element.id) { i, t in
                    ListRow(title: t.name, sub: describeFormat(t.format), divider: i > 0, action: { nav.sheet = .template(t.id) },
                            leading: { Avatar(icon: .templates) }, trailing: { EmptyView() })
                }
            }
        }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { BarIcon(icon: .plus, label: "Add a template") { nav.sheet = .template(nil) } } }
        // IOS-3: pull to refresh on every page of synced data.
        .refreshable { await graph.pullToSync() }
    }
}

struct TemplateEditScreen: View {
    let id: String?
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var recordId = newId()
    @State private var name = ""
    @State private var format = defaultFormat
    @State private var deleting = false

    private var saved: MatchTemplate? { graph.records.template(id) }

    var body: some View {
        FormPage(title: id == nil ? "New template" : (saved?.name ?? "Template"), canSave: name.orNil != nil, loaded: loaded, snapshot: "\(name)|\(format)", delete: id == nil ? nil : ("Delete template", { deleting = true }), save: {
            var t = saved ?? MatchTemplate(id: recordId, version: 0, updatedAt: nowString(), name: "", format: defaultFormat, defaults: MatchTemplateDefaults())
            t.name = name.trimmingCharacters(in: .whitespaces)
            t.format = format
            Task {
                await graph.records.save(Collections.templates, id: recordId, t)
                dismiss()
            }
        }) {
            LfCard(padding: 16) { Field("Name", text: $name, placeholder: "U12 league: 2 × 30") }
            SectionTitle("Format")
            FormatFields(format: $format)
        }
        .task {
            guard !loaded else { return }
            loaded = true
            guard let t = saved else { return }
            recordId = t.id
            name = t.name
            format = t.format
        }
        .confirm("Delete template?", isPresented: $deleting, message: "\(saved?.name ?? "It") goes from LawFive. Matches made from it keep their format.", action: "Delete") {
            Task {
                await graph.records.delete(Collections.templates, id: recordId)
                dismiss()
            }
        }
    }
}

/// A match's format, in the web's groups and with its choices and ranges (APP-20, WEB-15). What only
/// matters with a switch on opens under that switch.
struct FormatFields: View {
    @Binding var format: MatchFormat

    var body: some View {
        VStack(spacing: 10) {
            LfCard(padding: 16) {
                VStack(spacing: 10) {
                    HStack(alignment: .top, spacing: 10) {
                        Choice("Periods", value: format.periods, options: [1, 2, 3, 4], text: { "\($0 ?? 2)" }) { format.periods = $0 ?? 2 }
                        NumberField("Team size", value: format.teamSize) { if let v = $0 { format.teamSize = min(max(v, 1), 11) } }
                    }
                    HStack(alignment: .top, spacing: 10) {
                        MinutesField("Period (min)", sec: format.periodSec, min: 1, max: 60) { format.periodSec = $0 }
                        MinutesField(format.periods == 2 ? "Half-time (min)" : format.periods == 1 ? "Before ET (min)" : "Break (min)", sec: format.breakSec, min: 0, max: 30) { format.breakSec = $0 }
                    }
                }
            }
            LfCard {
                ToggleRow("Halfway break", sub: "A break halfway through each period", divider: false, isOn: animated($format.halfwayBreak))
                if format.halfwayBreak {
                    MinutesField("Break length (min)", sec: format.halfwayBreakSec, min: 0, max: 15) { format.halfwayBreakSec = $0 }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                    // TMR-12: it only applies with a stoppage clock to add the break to; a clock that stops always stops for it (TMR-15).
                    if format.trackStoppage && format.stoppingClock != true {
                        ToggleRow("Add the break to stoppage", sub: "The break's time is added on", isOn: Binding(get: { format.breakStoppage ?? true }, set: { format.breakStoppage = $0 }))
                    }
                }
            }
            // EVT-12: Sin bin in the watch's team menu, counted down with the match clock.
            LfCard {
                ToggleRow("Sin bins", sub: "Temporary dismissals, timed on the watch", divider: false, isOn: animated(Binding(get: { format.sinBins ?? false }, set: {
                    format.sinBins = $0
                    format.sinBinSec = format.sinBinSec ?? 10 * 60
                })))
                if format.sinBins == true {
                    // Whole minutes, as the watch's two-digit entry.
                    NumberField("Sin bin length (min)", value: (format.sinBinSec ?? 10 * 60) / 60) { if let v = $0 { format.sinBinSec = min(max(v, 1), 20) * 60 } }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                }
            }
            LfCard {
                ToggleRow("Extra time", sub: "If the score is level at full time", divider: false, isOn: animated($format.extraTime))
                if format.extraTime {
                    HStack(alignment: .top, spacing: 10) {
                        Choice("Periods", value: format.extraTimePeriods, options: [1, 2], text: { "\($0 ?? 2)" }) { format.extraTimePeriods = $0 ?? 2 }
                        MinutesField("Length (min)", sec: format.extraTimePeriodSec, min: 1, max: 30) { format.extraTimePeriodSec = $0 }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    // ET-6.
                    ToggleRow("Golden goal", sub: "The first goal in extra time wins", isOn: Binding(get: { format.goldenGoal ?? false }, set: { format.goldenGoal = $0 }))
                }
                ToggleRow("Penalty shoot-out", sub: "If still level", isOn: $format.penalties)
            }
            LfCard {
                // TMR-15: the clock that stops needs stoppage tracked, so it turns it on, and Track stoppage stays on with it.
                let stops = format.stoppingClock == true
                VStack(alignment: .leading, spacing: 6) {
                    Choice("Clock", value: stops, options: [false, true], text: { $0 == true ? "Stops when play stops" : "Runs on" }) { v in
                        withAnimation(.easeOut(duration: 0.2)) {
                            format.stoppingClock = v == true
                            if v == true { format.trackStoppage = true }
                        }
                    }
                    Text(stops ? "US high school (NFHS) and college (NCAA): the watch stops the clock for stoppages, with no added time."
                         : "The Laws of the Game: stoppages are added on at the end.")
                        .font(.lfBodySmall).foregroundStyle(LF.muted)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                if stops {
                    ToggleRow("Goals and cards stop it", sub: "Start/Stop starts it again at the restart; an injury always stops it",
                              isOn: Binding(get: { format.stopForGoalsCards ?? true }, set: { format.stopForGoalsCards = $0 }))
                }
                ToggleRow("Track stoppage", sub: stops ? "On with a clock that stops" : "A clock on the watch for time to add on",
                          isOn: animated(Binding(get: { format.trackStoppage || stops }, set: { format.trackStoppage = $0 })))
                    .disabled(stops)
                ToggleRow("Record goal scorers", sub: "The watch asks for the number", isOn: Binding(get: { format.goalScorers ?? true }, set: { format.goalScorers = $0 }))
                ToggleRow("Record goal types", sub: "Penalty, own goal, direct free kick", isOn: $format.goalTypes)
            }
        }
    }

    private func animated(_ binding: Binding<Bool>) -> Binding<Bool> { binding.animation(.easeOut(duration: 0.2)) }
}
