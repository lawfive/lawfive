import Foundation

// Finding duplicates and merging them (DUP-11, DUP-12): the server works it all out (the groups,
// the likeliest, the preview of a merge from the choices so far) and the phone only shows it, so
// the website and both phones always agree. It needs a connection; only the last groups are kept,
// for the run, so the hints show at once.

/// What can be merged, by its collection in the API.
enum MergeKind: String, Hashable {
    case venues, referees
}

@MainActor
final class Merging {
    private let api: Api
    /// The last groups for each, so the hints on the lists and pages show at once (DUP-13).
    private(set) var kept: [MergeKind: DuplicateGroups] = [:]

    init(api: Api) {
        self.api = api
    }

    private func ask<T: Decodable>(_ method: String, _ path: String, body: JSONValue? = nil) async throws -> T {
        guard let answer = try await api.call(method, path, body: body) else { throw URLError(.badServerResponse) }
        return try answer.decoded(as: T.self)
    }

    /// Groups of likely duplicates across all of them (Find duplicates).
    func duplicates(_ kind: MergeKind) async throws -> DuplicateGroups {
        let groups: DuplicateGroups = try await ask("GET", "/v1/duplicates/\(kind.rawValue)")
        kept[kind] = groups
        return groups
    }

    /// The likeliest few for one (Merge with…).
    func likely(_ kind: MergeKind, id: String) async throws -> [DuplicateMember] {
        let found: LikelyDuplicates = try await ask("GET", "/v1/\(kind.rawValue)/\(id)/duplicates")
        return found.likely
    }

    func preview(_ id: String, _ draft: VenueMergeDraft) async throws -> VenueMergePreview {
        try await ask("POST", "/v1/venues/\(id)/merge/preview", body: JSONValue(encoding: draft))
    }

    func preview(_ id: String, _ draft: RefereeMergeDraft) async throws -> RefereeMergePreview {
        try await ask("POST", "/v1/referees/\(id)/merge/preview", body: JSONValue(encoding: draft))
    }

    /// Merges exactly what a preview showed: its merge, sent back.
    func merge(_ id: String, _ merge: VenueMerge) async throws {
        _ = try await api.call("POST", "/v1/venues/\(id)/merge", body: JSONValue(encoding: merge))
    }

    func merge(_ id: String, _ merge: RefereeMerge) async throws {
        _ = try await api.call("POST", "/v1/referees/\(id)/merge", body: JSONValue(encoding: merge))
    }

    /// Not the same (DUP-5): each remembers the others, so they aren't suggested together again.
    func notTheSame(_ kind: MergeKind, ids: [String]) async throws {
        _ = try await api.call("POST", "/v1/\(kind.rawValue)/\(ids[0])/not-the-same", body: JSONValue(encoding: NotTheSame(others: Array(ids.dropFirst()))))
    }
}
