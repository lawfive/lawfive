import Foundation

// Files on matches, venues and competitions (FILE-6 to FILE-13), in the website's words
// (web/src/files.ts) and Android's (data/Files.kt, data/KeptFiles.kt): what each is, its line in the
// list, the first lines of a CSV or text file, what the server said when it refused one, and the
// files kept on the phone for a ground without signal.

/// The server's own most for a file (FILE-9); a plan may allow less, which the server says.
let maxFileBytes = 20 * 1024 * 1024

/// How many lines of a CSV or text file are shown (FILE-12).
let previewLines = 200

enum FileKind: String {
    case pdf, xlsx, csv, docx, txt, photo

    var label: String {
        switch self {
        case .pdf: "PDF"
        case .xlsx: "Spreadsheet"
        case .csv: "CSV"
        case .docx: "Word"
        case .txt: "Text"
        case .photo: "Photo"
        }
    }

    var icon: Ph {
        switch self {
        case .pdf: .pdf
        case .xlsx: .xlsx
        case .csv: .csv
        case .docx: .docx
        case .txt: .txt
        case .photo: .fileImage
        }
    }
}

/// What a file is, for its icon, its line and how it opens.
func fileKind(_ contentType: String) -> FileKind {
    switch contentType {
    case "application/pdf": .pdf
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": .xlsx
    case "text/csv": .csv
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": .docx
    case "image/jpeg", "image/png", "image/webp": .photo
    default: .txt
    }
}

/// "317 bytes", "12 KB", "1.2 MB": a file's size as the list says it.
func fileSize(_ bytes: Int) -> String {
    let kb = Double(bytes) / 1024
    if kb < 1 { return "\(bytes) bytes" }
    if kb < 1000 { return "\(max(1, Int(kb.rounded()))) KB" }
    return storageSize(Double(bytes))
}

/// "PDF · 1.2 MB": its kind and size, as the list shows them.
func describeFile(_ file: Attachment) -> String { "\(fileKind(file.contentType).label) · \(fileSize(file.size))" }

extension Attachment {
    /// A file's name; the server always gives one, and "File" stands in otherwise (FILE-10).
    var fileName: String { name ?? "File" }
}

/// Whether it's shown by LawFive itself (FILE-12, FILE-13): a PDF in PDFKit, a photo large, CSV and text as text; others in Quick Look.
func opensInApp(_ file: Attachment) -> Bool { ![.xlsx, .docx].contains(fileKind(file.contentType)) }

/// The part of a name before its ending, and the ending, which a file keeps when renamed (FILE-10).
func splitName(_ name: String) -> (String, String) {
    guard let dot = name.lastIndex(of: "."), dot > name.startIndex else { return (name, "") }
    return (String(name[..<dot]), String(name[dot...]))
}

/// "It stays a PDF file": what Rename keeps.
func keepsEnding(_ ending: String) -> String { ending.isEmpty ? "It stays the same kind" : "It stays a \(ending.dropFirst().uppercased()) file" }

struct TextPreview: Equatable {
    let lines: [String]
    /// Whether there's more than is shown.
    let more: Bool
}

/// The first lines of a CSV or text file, never as a page (FILE-12): in UTF-8, or the older Windows
/// encoding when it isn't UTF-8 (the two the server takes, FILE-9).
func textPreview(_ data: Data) -> TextPreview {
    var text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .windowsCP1252) ?? ""
    if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
    var lines = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n")
    if lines.last == "" { lines.removeLast() }
    return TextPreview(lines: Array(lines.prefix(previewLines)), more: lines.count > previewLines)
}

/// One file that wasn't added, and why, in the server's words.
struct Refused: Equatable {
    let name: String
    var why: String
}

/// FILE-7: the server ends each refusal with what it takes ("LawFive keeps PDF, …"), which is said once, after them all.
func takenLine(_ refused: [Refused]) -> String? {
    refused.lazy.compactMap { r in r.why.range(of: "LawFive keeps ").map { String(r.why[$0.lowerBound...]) } }.first
}

func withoutTaken(_ refused: [Refused]) -> [Refused] {
    guard let taken = takenLine(refused) else { return refused }
    return refused.map { Refused(name: $0.name, why: $0.why.replacingOccurrences(of: " \(taken)", with: "").replacingOccurrences(of: taken, with: "")) }
}

/// The bold start of a refusal's notice for one or several files.
func refusedTitle(_ refused: [Refused]) -> String { refused.count == 1 ? "\(refused[0].name) wasn't added." : "\(refused.count) files weren't added." }

/// The words when a file is bigger than the server ever takes, before it's sent.
func tooBig(_ name: String) -> String { "\(name) is too big: at most \(storageSize(Double(maxFileBytes)))." }

// MARK: Kept on the phone (FILE-13)

/// At most this much is kept.
let keepBudget = 200 * 1024 * 1024
/// How far ahead matches' files are kept: 3 days.
let keepAhead: TimeInterval = 3 * 86_400
/// A match is over, and its files no longer kept for it, this long after kickoff: the match, its breaks and time to leave.
let matchOverAfter: TimeInterval = 3 * 3600

/// Whether a match's files are kept now: it's on (scheduled or postponed), kicking off in the next 3 days, and not over.
func keepsFilesFor(_ m: Match, now: Date) -> Bool {
    guard let kickoff = instantOf(m.kickoff) else { return false }
    return (m.status == "scheduled" || m.status == "postponed") && kickoff > now.addingTimeInterval(-matchOverAfter) && kickoff <= now.addingTimeInterval(keepAhead)
}

/// A file wanted for a match, and when that match kicks off.
struct WantedFile {
    let file: Attachment
    let kickoff: Date
}

/// What to keep, in at most `budget` bytes: the files kept with Keep on this phone first, then the
/// matches', latest match first, so that when there isn't room the oldest match's go first. A file
/// wanted for several matches counts for the latest.
func planKeeping(pinned: [Attachment], wanted: [WantedFile], budget: Int = keepBudget) -> [Attachment] {
    var chosen: [Attachment] = []
    var used = 0
    func take(_ a: Attachment) {
        guard !chosen.contains(where: { $0.id == a.id }), used + a.size <= budget else { return }
        chosen.append(a)
        used += a.size
    }
    pinned.forEach(take)
    var latest: [String: WantedFile] = [:]
    var order: [String] = []
    for w in wanted {
        if let had = latest[w.file.id] {
            if w.kickoff > had.kickoff { latest[w.file.id] = w }
        } else {
            latest[w.file.id] = w
            order.append(w.file.id)
        }
    }
    // Stable: ties keep the order they were wanted in.
    let sorted = order.enumerated().sorted { a, b in
        let ka = latest[a.element]!.kickoff, kb = latest[b.element]!.kickoff
        return ka != kb ? ka > kb : a.offset < b.offset
    }
    for (_, id) in sorted { take(latest[id]!.file) }
    return chosen
}

/// The key of a record's list: "venue:<id>".
func recordKey(_ recordType: String, _ recordId: String) -> String { "\(recordType):\(recordId)" }

struct KeptFile: Codable {
    let file: Attachment
    /// Where it is, under the kept files' folder.
    let path: String
}

struct KeptIndex: Codable {
    var kept: [KeptFile] = []
    /// Kept until turned off (Keep on this phone), whether or not it's been fetched yet.
    var pinned: [Attachment] = []
    /// Each record's files at the last look, by recordKey.
    var lists: [String: [Attachment]] = [:]
}

/// The files kept on the phone (FILE-13): the files of every match in the next 3 days (its own, its
/// venue's and its competition's), fetched when there's signal and kept until the match is over, and
/// any kept with Keep on this phone until it's turned off; at most 200 MB, the oldest match's going
/// first. In Application Support's kept-files, left out of the phone's backups, and gone on signing
/// out. Each record's list of files at the last look is kept too, so its Files card shows them without signal.
@MainActor
@Observable
final class KeptFiles {
    private(set) var index: KeptIndex
    @ObservationIgnored private let api: Api
    @ObservationIgnored private let folder: URL
    @ObservationIgnored private let opened: URL
    @ObservationIgnored private var running = false

    init(api: Api, folder: URL, opened: URL = FileManager.default.temporaryDirectory.appending(path: "files")) {
        self.api = api
        self.folder = folder
        self.opened = opened
        index = (try? Data(contentsOf: folder.appending(path: "index.json"))).flatMap { try? jsonDecoder.decode(KeptIndex.self, from: $0) } ?? KeptIndex()
    }

    var keptIds: Set<String> { Set(index.kept.map(\.file.id)) }
    var pinnedIds: Set<String> { Set(index.pinned.map(\.id)) }
    var bytes: Int { index.kept.reduce(0) { $0 + $1.file.size } }
    var count: Int { index.kept.count }

    private func save(_ next: KeptIndex) {
        index = next
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Left out of iCloud and computer backups (FILE-13).
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var dir = folder
        try? dir.setResourceValues(values)
        if let data = try? jsonEncoder.encode(next) { try? data.write(to: folder.appending(path: "index.json"), options: .atomic) }
    }

    /// A record's files at the last look, for its card without signal.
    func list(_ recordType: String, _ recordId: String) -> [Attachment]? { index.lists[recordKey(recordType, recordId)] }

    /// A record's files as just fetched.
    func remember(_ recordType: String, _ recordId: String, _ files: [Attachment]) {
        var next = index
        next.lists[recordKey(recordType, recordId)] = files
        save(next)
    }

    /// The kept copy of this version of the file, if there is one.
    func keptCopy(_ a: Attachment) -> URL? {
        guard let k = index.kept.first(where: { $0.file.id == a.id && $0.file.url == a.url }) else { return nil }
        let url = folder.appending(path: k.path)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// A record's files from the server (FILE-6): files only, so a server from before files, which gives its photos, gives none.
    func fetchList(_ recordType: String, _ recordId: String) async throws -> [Attachment] {
        let answer = try await api.call("GET", "/v1/attachments?recordType=\(recordType)&recordId=\(recordId)&kind=file")
        return try (answer?["attachments"]?.decoded(as: [Attachment].self) ?? []).filter { $0.kind == "file" }
    }

    /// The file on the phone to open or share: its kept copy, or fetched now. Throws without signal.
    func fileFor(_ a: Attachment) async throws -> URL {
        if let kept = keptCopy(a) { return kept }
        let dir = opened.appending(path: "\(a.id)-\(a.url.filter { $0.isLetter || $0.isNumber })")
        let file = dir.appending(path: safeName(a.fileName))
        if FileManager.default.fileExists(atPath: file.path) { return file }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try await api.bytes(a.url).write(to: file, options: .atomic)
        return file
    }

    /// Keep on this phone, or stop: true when it's now kept (false when there's no room or no signal; a pinned one is fetched at the next look).
    func keep(_ a: Attachment, _ on: Bool, matches: [Match]) async -> Bool {
        var next = index
        next.pinned.removeAll { $0.id == a.id }
        if on { next.pinned.append(a) }
        save(next)
        await refresh(matches: matches, fetchLists: false)
        return keptIds.contains(a.id)
    }

    /// A file deleted: its kept copy goes.
    func forget(_ id: String) {
        for k in index.kept where k.file.id == id { try? FileManager.default.removeItem(at: folder.appending(path: k.path).deletingLastPathComponent()) }
        var next = index
        next.kept.removeAll { $0.file.id == id }
        next.pinned.removeAll { $0.id == id }
        next.lists = next.lists.mapValues { $0.filter { $0.id != id } }
        save(next)
    }

    /// When there's signal (after a sync): each wanted record's files fetched again, then the files of
    /// the next 3 days' matches and those kept until turned off fetched, and the rest let go. Without
    /// signal it stops, keeping what it has. With `fetchLists` false, only the lists already known are used.
    func refresh(matches: [Match], fetchLists: Bool = true) async {
        // One at a time; a second asking while one runs waits for it.
        while running { try? await Task.sleep(for: .milliseconds(100)) }
        running = true
        defer { running = false }
        let now = AppClock.now
        let soon = matches.filter { keepsFilesFor($0, now: now) }
        func records(_ m: Match) -> [(String, String)] {
            [("match", m.id)] + (m.venueId.map { [("venue", $0)] } ?? []) + (m.competitionId.map { [("competition", $0)] } ?? [])
        }
        var seen = Set<String>()
        let wantedRecords = (soon.flatMap(records) + index.pinned.map { ($0.recordType, $0.recordId) }).filter { seen.insert(recordKey($0.0, $0.1)).inserted }
        var lists = index.lists
        if fetchLists {
            for (type, id) in wantedRecords {
                do {
                    lists[recordKey(type, id)] = try await fetchList(type, id)
                } catch let e as ServerError {
                    // Gone (deleted) or not taken on this server: nothing to keep for it.
                    if e.status == 404 || e.status == 400 { lists[recordKey(type, id)] = [] }
                } catch {
                    return
                }
            }
        }
        // Pinned files as the server has them now; one gone from its record's list was deleted.
        let pinned = index.pinned.compactMap { p in lists[recordKey(p.recordType, p.recordId)]?.first { $0.id == p.id } ?? (fetchLists ? nil : p) }
        let wanted = soon.flatMap { m in records(m).flatMap { lists[recordKey($0.0, $0.1)] ?? [] }.map { WantedFile(file: $0, kickoff: instantOf(m.kickoff)!) } }
        let plan = planKeeping(pinned: pinned, wanted: wanted)
        let planned = Dictionary(plan.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        // Let go first, so what's fetched fits.
        var kept: [KeptFile] = []
        for k in index.kept {
            if planned[k.file.id]?.url == k.file.url, FileManager.default.fileExists(atPath: folder.appending(path: k.path).path) {
                kept.append(k)
            } else {
                try? FileManager.default.removeItem(at: folder.appending(path: k.path).deletingLastPathComponent())
            }
        }
        var next = index
        next.kept = kept
        next.pinned = pinned
        next.lists = lists
        save(next)
        for a in plan where !kept.contains(where: { $0.file.id == a.id }) {
            let path = "\(a.id)/\(safeName(a.fileName))"
            let file = folder.appending(path: path)
            do {
                try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                try await api.bytes(a.url).write(to: file, options: .atomic)
            } catch {
                try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
                break
            }
            kept.append(KeptFile(file: a, path: path))
            next = index
            next.kept = kept
            save(next)
        }
    }

    /// Remove kept files (Settings): every kept file goes, and Keep on this phone is off for each; the next 3 days' come back at the next look.
    func removeAll() {
        for k in index.kept { try? FileManager.default.removeItem(at: folder.appending(path: k.path).deletingLastPathComponent()) }
        try? FileManager.default.removeItem(at: opened)
        var next = index
        next.kept = []
        next.pinned = []
        save(next)
    }

    /// Signing out: everything goes, the lists too.
    func clear() {
        try? FileManager.default.removeItem(at: folder)
        try? FileManager.default.removeItem(at: opened)
        index = KeptIndex()
    }

    /// The name a file is saved under, so another app shows it: the server's, made safe for a file system.
    private func safeName(_ name: String) -> String {
        let cleaned = String(name.map { "/\\:*?\"<>|".contains($0) || $0.asciiValue.map { $0 < 32 } == true ? "_" : $0 }).drop { $0 == "." }
        return cleaned.isEmpty ? "File" : String(cleaned)
    }
}
