import Foundation
import SQLite3

// The phone's copy of the account (IOS-3), in SQLite: every record as the server sent it (its JSON
// kept whole, so fields this version of the app doesn't know survive a save), and the outbox of
// changes made on the phone that haven't reached the server yet. As Android's (APP-3).

struct RecordRow: Sendable {
    /// The API's collection: matches, venues, referees…
    var collection: String
    var id: String
    var json: String
    /// The version the server last gave it; 0 for one made on the phone and not sent yet.
    var version: Int
    var deleted: Bool
}

struct OutboxRow: Sendable {
    var seq: Int = 0
    var collection: String
    var id: String
    /// put or delete.
    var op: String
    /// The record as changed on the phone (for put).
    var json: String?
    /// The record as it was before the phone changed it, for merging with a newer copy; nil for a new one.
    var base: String?
    var createdAt: Double
}

actor Db {
    private var db: OpaquePointer?
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    /// nil opens one in memory, for tests.
    init(file: URL? = Db.defaultFile) {
        let path = file?.path ?? ":memory:"
        var handle: OpaquePointer?
        sqlite3_open(path, &handle)
        db = handle
        sqlite3_exec(handle, """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL, PRIMARY KEY (collection, id));
            CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL, id TEXT NOT NULL, op TEXT NOT NULL, json TEXT, base TEXT, createdAt REAL NOT NULL);
            """, nil, nil, nil)
    }

    deinit { sqlite3_close(db) }

    static var defaultFile: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("lawfive.sqlite")
    }

    private func run<T>(_ sql: String, _ binds: [Any?] = [], each: (OpaquePointer) -> T?) -> [T] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else { return [] }
        defer { sqlite3_finalize(statement) }
        for (i, value) in binds.enumerated() {
            let at = Int32(i + 1)
            switch value {
            case let v as String: sqlite3_bind_text(statement, at, v, -1, transient)
            case let v as Int: sqlite3_bind_int64(statement, at, Int64(v))
            case let v as Double: sqlite3_bind_double(statement, at, v)
            case let v as Bool: sqlite3_bind_int(statement, at, v ? 1 : 0)
            default: sqlite3_bind_null(statement, at)
            }
        }
        var rows: [T] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            if let row = each(statement) { rows.append(row) }
        }
        return rows
    }

    private func exec(_ sql: String, _ binds: [Any?] = []) {
        let _: [Int] = run(sql, binds) { _ in nil }
    }

    private func text(_ s: OpaquePointer, _ column: Int32) -> String? {
        sqlite3_column_text(s, column).map { String(cString: $0) }
    }

    private func record(_ s: OpaquePointer) -> RecordRow {
        RecordRow(collection: text(s, 0) ?? "", id: text(s, 1) ?? "", json: text(s, 2) ?? "{}", version: Int(sqlite3_column_int64(s, 3)), deleted: sqlite3_column_int(s, 4) != 0)
    }

    private func outboxRow(_ s: OpaquePointer) -> OutboxRow {
        OutboxRow(seq: Int(sqlite3_column_int64(s, 0)), collection: text(s, 1) ?? "", id: text(s, 2) ?? "", op: text(s, 3) ?? "put", json: text(s, 4), base: text(s, 5), createdAt: sqlite3_column_double(s, 6))
    }

    // Records

    func all(_ collection: String) -> [RecordRow] {
        run("SELECT collection, id, json, version, deleted FROM records WHERE collection = ? AND deleted = 0", [collection]) { record($0) }
    }

    func get(_ collection: String, _ id: String) -> RecordRow? {
        run("SELECT collection, id, json, version, deleted FROM records WHERE collection = ? AND id = ?", [collection, id]) { record($0) }.first
    }

    func upsert(_ rows: [RecordRow]) {
        exec("BEGIN")
        for r in rows {
            exec("INSERT OR REPLACE INTO records (collection, id, json, version, deleted) VALUES (?, ?, ?, ?, ?)", [r.collection, r.id, r.json, r.version, r.deleted])
        }
        exec("COMMIT")
    }

    func remove(_ collection: String, _ id: String) {
        exec("DELETE FROM records WHERE collection = ? AND id = ?", [collection, id])
    }

    // Outbox

    func outbox() -> [OutboxRow] {
        run("SELECT seq, collection, id, op, json, base, createdAt FROM outbox ORDER BY seq") { outboxRow($0) }
    }

    func outboxCount() -> Int {
        run("SELECT COUNT(*) FROM outbox") { Int(sqlite3_column_int64($0, 0)) }.first ?? 0
    }

    func pending(_ collection: String, _ id: String) -> OutboxRow? {
        run("SELECT seq, collection, id, op, json, base, createdAt FROM outbox WHERE collection = ? AND id = ? ORDER BY seq LIMIT 1", [collection, id]) { outboxRow($0) }.first
    }

    func pendingKeys() -> Set<String> {
        Set(run("SELECT collection || '/' || id FROM outbox") { text($0, 0) })
    }

    func upsertOutbox(_ row: OutboxRow) {
        if row.seq > 0 {
            exec("UPDATE outbox SET op = ?, json = ?, base = ?, createdAt = ? WHERE seq = ?", [row.op, row.json, row.base, row.createdAt, row.seq])
        } else {
            exec("INSERT INTO outbox (collection, id, op, json, base, createdAt) VALUES (?, ?, ?, ?, ?, ?)", [row.collection, row.id, row.op, row.json, row.base, row.createdAt])
        }
    }

    func removeOutbox(_ seq: Int) {
        exec("DELETE FROM outbox WHERE seq = ?", [seq])
    }

    func removeOutboxFor(_ collection: String, _ id: String) {
        exec("DELETE FROM outbox WHERE collection = ? AND id = ?", [collection, id])
    }

    func clear() {
        exec("DELETE FROM records")
        exec("DELETE FROM outbox")
    }
}
