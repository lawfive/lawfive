import Foundation
import Observation

// Sync (IOS-3, as Android's APP-3): the outbox goes up first, oldest first, then everything changed
// on the server since the last time comes down (GET /v1/changes). A record changed on the server
// meanwhile gets the phone's changed fields put on top of its newer copy and is sent again; a change
// the server refuses is dropped, and said so.

@MainActor
@Observable
final class SyncEngine {
    private(set) var running = false
    /// Why the last sync didn't finish, in words, or nil.
    private(set) var problem: String?
    /// Changes the server refused, dropped from the outbox (shown once).
    private(set) var refused: [String] = []

    @ObservationIgnored private let api: Api
    @ObservationIgnored private let db: Db
    @ObservationIgnored private let session: SessionStore
    @ObservationIgnored private let onSignedOut: () async -> Void

    /// What the sync screen shows (APP-16).
    let activity: SyncActivity

    init(api: Api, db: Db, session: SessionStore, activity: SyncActivity? = nil, onSignedOut: @escaping () async -> Void) {
        self.activity = activity ?? SyncActivity()
        self.api = api
        self.db = db
        self.session = session
        self.onSignedOut = onSignedOut
    }

    /// Runs a sync unless one is running; true when it all worked.
    func sync() async -> Bool {
        guard session.signedIn, !running else { return false }
        running = true
        problem = nil
        defer { running = false }
        activity.syncStarted()
        do {
            try await push()
            try await pull()
            activity.syncFinished(problem: nil)
            return true
        } catch let e as ServerError {
            if e.status == 401 {
                await onSignedOut()
            } else if e.status == 403, e.message.contains("approval") {
                session.setStatus("pending")
            }
            problem = e.message
            activity.syncFinished(problem: e.message)
        } catch {
            problem = "No connection to the server"
            activity.syncFinished(problem: "No connection to the server")
        }
        return false
    }

    func clearRefused() {
        refused = []
    }

    private func push() async throws {
        let waiting = await db.outbox()
        for (i, row) in waiting.enumerated() {
            let name = row.json.flatMap { try? JSONValue(text: $0) }.map { SyncEngine.describe(row.collection, $0) } ?? String(row.collection.dropLast())
            activity.pushing(done: i, total: waiting.count, name: name)
            if row.op == "delete" {
                let version = await db.get(row.collection, row.id)?.version ?? 0
                do {
                    try await api.call("DELETE", "/v1/\(row.collection)/\(row.id)" + (version > 0 ? "?version=\(version)" : ""))
                } catch let e as ServerError {
                    switch e.status {
                    case 404: break
                    // Changed elsewhere meanwhile: it was deleted on the phone, so it goes anyway.
                    case 409:
                        if let newer = e.body?["current"]?["version"]?.int {
                            try await api.call("DELETE", "/v1/\(row.collection)/\(row.id)?version=\(newer)")
                        }
                    default: throw e
                    }
                }
                await db.removeOutbox(row.seq)
                await db.remove(row.collection, row.id)
                continue
            }
            let local = try JSONValue(text: row.json ?? "{}")
            let known = await db.get(row.collection, row.id)?.version ?? 0
            var saved: JSONValue?
            do {
                saved = try await put(row.collection, row.id, local, version: known)
            } catch let e as ServerError {
                if e.status == 409, let current = e.body?["current"], current.object != nil {
                    // Changed elsewhere: the phone's changes on top of the newer copy.
                    let base = row.base.flatMap { try? JSONValue(text: $0) } ?? .object([:])
                    saved = try await put(row.collection, row.id, SyncEngine.merge(base: base, local: local, current: current), version: current["version"]?.int ?? 0)
                } else if e.status == 400 || e.status == 409 || e.status == 404 {
                    // The server won't take it: dropped, and said so.
                    refused.append("\(SyncEngine.describe(row.collection, local)): \(e.message)")
                    await db.remove(row.collection, row.id)
                } else {
                    throw e
                }
            }
            await db.removeOutbox(row.seq)
            if let saved, let stored = SyncEngine.rowOf(row.collection, saved) {
                await db.upsert([stored])
            }
        }
    }

    private func put(_ collection: String, _ id: String, _ record: JSONValue, version: Int) async throws -> JSONValue {
        var body = (record.object ?? [:]).filter { !["updatedAt", "deletedAt", "version"].contains($0.key) }
        if version > 0 { body["version"] = .int(version) }
        guard let answer = try await api.call("PUT", "/v1/\(collection)/\(id)", body: .object(body)) else { throw URLError(.badServerResponse) }
        return answer
    }

    private func pull() async throws {
        var cursor = session.cursor
        // APP-16, APP-26: the first sync after signing in, from the session's own flag.
        let first = session.firstSync
        while true {
            guard let page = try await api.call("GET", "/v1/changes?since=\(cursor)&limit=500") else { throw URLError(.badServerResponse) }
            // A record still waiting in the outbox keeps the phone's copy; the next push merges it.
            let pending = await db.pendingKeys()
            var rows: [RecordRow] = []
            var counts: [String: Int] = [:]
            var lastName: [String: String] = [:]
            let changes = page["changes"]?.array ?? []
            // APP-26: which match reports the phone already had, before this page is stored.
            let known = await SyncEngine.knownReports(changes, db: db)
            for change in changes {
                if let collection = change["collection"]?.string, let record = change["record"] {
                    counts[collection, default: 0] += 1
                    lastName[collection] = SyncEngine.describe(collection, record)
                }
                guard let collection = change["collection"]?.string, let record = change["record"], let id = record["id"]?.string else { continue }
                if !pending.contains("\(collection)/\(id)"), let row = SyncEngine.rowOf(collection, record) {
                    rows.append(row)
                }
            }
            await db.upsert(rows)
            session.cameFromWatch(SyncEngine.fromWatch(changes, first: first, known: known))
            activity.pulled(counts: counts, lastName: lastName, first: first)
            cursor = page["cursor"]?.int ?? cursor
            session.synced(cursor: cursor, at: Date())
            if page["more"]?.bool != true { break }
        }
        session.firstSyncDone()
    }

    /// APP-26: the match reports in a page of changes that the phone already has.
    static func knownReports(_ changes: [JSONValue], db: Db) async -> Set<String> {
        var known: Set<String> = []
        for change in changes where change["collection"]?.string == Collections.matchRecords {
            if let id = change["record"]?["id"]?.string, await db.get(Collections.matchRecords, id) != nil { known.insert(id) }
        }
        return known
    }

    /// APP-26: the match reports in a page of changes that came in from a watch: new to the phone
    /// (not in `known`), not deleted, and with the watch that recorded them (`device`). Never on the
    /// first sync, which is the account's history. A result entered or corrected on the website or a
    /// phone has no device or is already here, as is a watch sending a match again (RES-4).
    nonisolated static func fromWatch(_ changes: [JSONValue], first: Bool, known: Set<String>) -> [String] {
        guard !first else { return [] }
        return changes.compactMap { change in
            guard change["collection"]?.string == Collections.matchRecords, let record = change["record"],
                  let id = record["id"]?.string, !known.contains(id),
                  record["deletedAt"] == nil || record["deletedAt"] == .null,
                  record["device"]?.string?.isEmpty == false else { return nil }
            return id
        }
    }

    nonisolated static func rowOf(_ collection: String, _ record: JSONValue) -> RecordRow? {
        guard let id = record["id"]?.string else { return nil }
        let deleted: Bool
        if let at = record["deletedAt"], at != .null { deleted = true } else { deleted = false }
        return RecordRow(collection: collection, id: id, json: record.text, version: record["version"]?.int ?? 0, deleted: deleted)
    }

    /// The phone's changes on top of a newer copy: each top-level field the phone changed (from
    /// `base`, the record before it changed it) takes the phone's value; everything else is the newer copy's.
    nonisolated static func merge(base: JSONValue, local: JSONValue, current: JSONValue) -> JSONValue {
        var result = current.object ?? [:]
        let was = base.object ?? [:]
        let now = local.object ?? [:]
        for key in Set(was.keys).union(now.keys) where !["version", "updatedAt", "deletedAt", "id"].contains(key) {
            if now[key] != was[key] {
                result[key] = now[key]
            }
        }
        return .object(result)
    }

    /// A record in a few words, for saying what wasn't saved.
    nonisolated static func describe(_ collection: String, _ record: JSONValue) -> String {
        if let name = record["name"]?.string { return name }
        let teams = [record["home"]?["name"]?.string, record["away"]?["name"]?.string].compactMap { $0 }
        if !teams.isEmpty { return teams.joined(separator: " v ") }
        return collection.hasSuffix("s") ? String(collection.dropLast()) : collection
    }
}
