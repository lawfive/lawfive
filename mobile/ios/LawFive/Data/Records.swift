import Foundation
import Observation

// The account's records on the phone, typed (IOS-3). Reading decodes the stored JSON into the
// generated types; saving puts the typed record's fields over the stored JSON, so fields this
// version of the app doesn't know are kept, then queues it for the server.

enum Collections {
    static let matches = "matches"
    static let matchRecords = "match-records"
    static let venues = "venues"
    static let referees = "referees"
    static let competitions = "competitions"
    static let templates = "match-templates"
    static let settings = "settings"
    static let all = [matches, matchRecords, venues, referees, competitions, templates, settings]
}

@MainActor
@Observable
final class Records {
    // nil until the phone's database first answers: loading, not "no matches".
    private(set) var matches: [Match]?
    private(set) var matchRecords: [MatchRecord] = []
    private(set) var venues: [Venue]?
    private(set) var referees: [Referee]?
    private(set) var competitions: [Competition]?
    private(set) var templates: [MatchTemplate]?
    private(set) var settings: UserSettings?
    /// Changes made on the phone not sent yet.
    private(set) var waiting = 0

    @ObservationIgnored private let db: Db
    @ObservationIgnored var changed: () -> Void = {}

    init(db: Db) {
        self.db = db
    }

    private nonisolated static func decode<T: Decodable & Sendable>(_ rows: [RecordRow], as type: T.Type) -> [T] {
        rows.compactMap { row in
            do {
                return try jsonDecoder.decode(T.self, from: Data(row.json.utf8))
            } catch {
                print("Couldn't read \(row.collection)/\(row.id): \(error)")
                return nil
            }
        }
    }

    private func load<T: Decodable & Sendable>(_ collection: String, as type: T.Type) async -> [T] {
        let rows = await db.all(collection)
        return await Task.detached { Records.decode(rows, as: type) }.value
    }

    /// Reads everything from the database again, after a sync or a change.
    func reload() async {
        let matches = await load(Collections.matches, as: Match.self)
        let matchRecords = await load(Collections.matchRecords, as: MatchRecord.self)
        let venues = await load(Collections.venues, as: Venue.self)
        let referees = await load(Collections.referees, as: Referee.self)
        let competitions = await load(Collections.competitions, as: Competition.self)
        let templates = await load(Collections.templates, as: MatchTemplate.self)
        let settings = await load(Collections.settings, as: UserSettings.self).first
        let waiting = await db.outboxCount()
        // All at once, so a page never shows matches before the units they're shown in.
        self.settings = settings
        self.matchRecords = matchRecords
        self.venues = venues
        self.referees = referees
        self.competitions = competitions
        self.templates = templates
        self.waiting = waiting
        self.matches = matches
    }

    func match(_ id: String) -> Match? { matches?.first { $0.id == id } }
    func venue(_ id: String?) -> Venue? { id.flatMap { id in venues?.first { $0.id == id } } }
    func referee(_ id: String?) -> Referee? { id.flatMap { id in referees?.first { $0.id == id } } }
    func competition(_ id: String?) -> Competition? { id.flatMap { id in competitions?.first { $0.id == id } } }
    func template(_ id: String?) -> MatchTemplate? { id.flatMap { id in templates?.first { $0.id == id } } }

    /// The settings to show and work with: the account's, or until it has a record, the website's
    /// defaults for this phone's region, under an id kept for this run so the first change makes that record.
    var effectiveSettings: UserSettings { settings ?? defaults }
    @ObservationIgnored private lazy var defaults = SettingsDefaults.settings(timeZone: TimeZone.current.identifier)

    /// Signed out: the next account's defaults get an id of their own, as its record will.
    func forgetDefaults() {
        defaults = SettingsDefaults.settings(timeZone: TimeZone.current.identifier)
    }

    var units: Units { Units(temperature: effectiveSettings.temperatureUnit, distance: effectiveSettings.distanceUnit) }

    /// A change to the account's settings. An account without a record gets one on its first change:
    /// the defaults (`effectiveSettings`) with this phone's time zone (PLAN-9), as the website makes one.
    /// Applied here at once, before anything waits, so a second quick change builds on this one.
    func saveSettings(_ change: (inout UserSettings) -> Void) async {
        var s = effectiveSettings
        if settings == nil, s.timeZone == nil { s.timeZone = TimeZone.current.identifier }
        change(&s)
        settings = s
        await save(Collections.settings, id: s.id, s)
    }

    /// Saves a record on the phone and queues it for the server.
    func save<T: Encodable>(_ collection: String, id: String, _ value: T) async {
        let existing = await db.get(collection, id)
        let raw = existing.flatMap { try? JSONValue(text: $0.json) } ?? .object([:])
        guard let updated = try? Records.patched(raw, value) else { return }
        await db.upsert([RecordRow(collection: collection, id: id, json: updated.text, version: existing?.version ?? 0, deleted: false)])
        let pending = await db.pending(collection, id)
        await db.upsertOutbox(OutboxRow(
            seq: pending?.seq ?? 0, collection: collection, id: id, op: "put", json: updated.text,
            // The record as the server last had it, for merging if it changes there meanwhile.
            base: pending != nil ? pending?.base : existing?.json,
            createdAt: pending?.createdAt ?? Date().timeIntervalSince1970
        ))
        await reload()
        changed()
    }

    /// Deletes a record on the phone and queues the deletion; one never sent just goes.
    func delete(_ collection: String, id: String) async {
        guard var existing = await db.get(collection, id) else { return }
        await db.removeOutboxFor(collection, id)
        if existing.version == 0 {
            await db.remove(collection, id)
        } else {
            existing.deleted = true
            await db.upsert([existing])
            await db.upsertOutbox(OutboxRow(collection: collection, id: id, op: "delete", json: nil, base: nil, createdAt: Date().timeIntervalSince1970))
        }
        await reload()
        changed()
    }

    /// The typed record's fields over the stored JSON: fields the type doesn't know are kept, and one cleared on the phone is cleared.
    nonisolated static func patched<T: Encodable>(_ raw: JSONValue, _ value: T) throws -> JSONValue {
        let known = Set(Mirror(reflecting: value).children.compactMap { $0.label })
        var fields = (raw.object ?? [:]).filter { !known.contains($0.key) }
        for (key, field) in try JSONValue(encoding: value).object ?? [:] {
            fields[key] = field
        }
        return .object(fields)
    }
}
