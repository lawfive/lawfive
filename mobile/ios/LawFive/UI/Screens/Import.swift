import SwiftUI
import UniformTypeIdentifiers

// Importing matches on the phone (IMP-10): the server reads the file (IMP-2), and every row is
// checked before anything is saved (IMP-5), as on the website.

private struct Picked {
    let name: String
    let type: String
    let data: Data
}

/// How this phone writes dates (7/11/2026 is 7 November in most places, 11 July in the US).
private func dateOrder() -> String {
    let pattern = DateFormatter.dateFormat(fromTemplate: "yMd", options: 0, locale: .current)?.lowercased() ?? ""
    guard let day = pattern.firstIndex(of: "d"), let month = pattern.firstIndex(of: "m") else { return "mdy" }
    return day < month ? "dmy" : "mdy"
}

private func describeDone(_ done: MatchImportFileResult) -> String {
    var parts: [String] = []
    if done.added > 0 { parts.append("added \(done.added) \(done.added == 1 ? "match" : "matches")") }
    if done.updated > 0 { parts.append("updated \(done.updated) \(done.updated == 1 ? "match" : "matches")") }
    return parts.isEmpty ? "Nothing was imported." : "Done: \(parts.joined(separator: " and "))."
}

struct ImportScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var picked: Picked?
    @State private var preview: MatchImportFileResult?
    @State private var done: MatchImportFileResult?
    @State private var busy: String?
    @State private var problem: String?
    @State private var choosing = false

    private let types: [UTType] = [.commaSeparatedText, .tabSeparatedText, .plainText, .json, UTType("org.openxmlformats.spreadsheetml.sheet") ?? .data]

    private func send(_ file: Picked, dryRun: Bool) async throws -> MatchImportFileResult {
        let (answer, _) = try await graph.api.upload(
            "/v1/import/file",
            fields: [("timeZone", TimeZone.current.identifier), ("dateOrder", dateOrder()), ("dryRun", dryRun ? "true" : "false")],
            files: [(field: "file", name: file.name, type: file.type, data: file.data)]
        )
        guard let answer else { throw URLError(.badServerResponse) }
        return try answer.decoded(as: MatchImportFileResult.self)
    }

    private func failure(_ error: Error) -> String {
        (error as? ServerError)?.message ?? "Couldn't reach the server. Importing needs a connection."
    }

    private func startOver() {
        picked = nil
        preview = nil
        done = nil
        problem = nil
    }

    private func read(_ url: URL) {
        startOver()
        busy = "Reading and checking…"
        Task {
            do {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)
                let file = Picked(name: url.lastPathComponent, type: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream", data: data)
                picked = file
                preview = try await send(file, dryRun: true)
            } catch let error as CocoaError {
                _ = error
                problem = "That file couldn't be opened."
            } catch {
                picked = nil
                problem = failure(error)
            }
            busy = nil
        }
    }

    private func website(_ path: String) {
        if let url = websiteURL(server: graph.session.server, path: path) { openURL(url) }
    }

    var body: some View {
        Page("Import matches", large: false) {
            if let busy {
                LfCard {
                    VStack {
                        LoadingPitch()
                        Text(busy).font(.lfBodyMedium).foregroundStyle(LF.muted).padding(.bottom, 16)
                    }
                    .frame(maxWidth: .infinity)
                }
            } else if let done {
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(describeDone(done)).font(.lfTitleMedium).foregroundStyle(LF.text)
                        if done.skipped > 0 {
                            Text("\(done.skipped) \(done.skipped == 1 ? "row was" : "rows were") skipped.").font(.lfBodyMedium).foregroundStyle(LF.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                if done.skipped > 0 { ImportRows(result: done, onlyProblems: true) }
                HStack(spacing: 8) {
                    SecondaryButton("Import another file") { startOver() }
                    PrimaryButton("Done") { dismiss() }
                }
            } else if let preview {
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(picked?.name ?? "").font(.lfTitleMedium).foregroundStyle(LF.text)
                        HStack(spacing: 6) {
                            if preview.added > 0 { Chip("\(preview.added) new", tone: .brand) }
                            if preview.updated > 0 { Chip("\(preview.updated) \(preview.updated == 1 ? "update" : "updates")", tone: .blue) }
                            if preview.skipped > 0 { Chip("\(preview.skipped) with problems", tone: .red) }
                        }
                        let adds = [("venues", preview.created.venues), ("competitions", preview.created.competitions), ("referees", preview.created.referees)].filter { !$0.1.isEmpty }
                        if !adds.isEmpty {
                            Text("Also adds " + adds.map { "\($0.0): \($0.1.joined(separator: ", "))" }.joined(separator: "; ") + ". They're matched by name, so check the spelling.")
                                .font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                        }
                        if !preview.ignoredColumns.isEmpty {
                            Text("Columns it doesn't know, and skips: \(preview.ignoredColumns.joined(separator: ", ")).")
                                .font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                ImportRows(result: preview, onlyProblems: false)
                if let problem { Text(problem).font(.lfBodyMedium).foregroundStyle(LF.redText) }
                let count = preview.added + preview.updated
                HStack(spacing: 8) {
                    SecondaryButton("Choose another") { startOver() }
                    if count > 0 {
                        PrimaryButton("Import \(count) \(count == 1 ? "match" : "matches")", icon: .upload) {
                            guard let file = picked else { return }
                            busy = "Importing…"
                            problem = nil
                            Task {
                                do {
                                    done = try await send(file, dryRun: false)
                                    graph.requestSync(delay: 0)
                                } catch {
                                    problem = failure(error)
                                }
                                busy = nil
                            }
                        }
                    }
                }
            } else {
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Add matches from a spreadsheet or a JSON file, one match a row. A row with the match number of a match you already have updates it. Nothing is saved until you've checked every row.")
                            .font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                        PrimaryButton("Choose a file", icon: .upload, wide: true) { choosing = true }
                        Text("CSV, Excel (.xlsx) or JSON, up to 1000 matches").font(.lfBodySmall).foregroundStyle(LF.muted)
                        if let problem { Text(problem).font(.lfBodyMedium).foregroundStyle(LF.redText) }
                    }
                }
                SectionTitle("Start from an example")
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            SecondaryButton("CSV", icon: .download) { website("/examples/lawfive-matches.csv") }
                            SecondaryButton("Excel", icon: .download) { website("/examples/lawfive-matches.xlsx") }
                            SecondaryButton("JSON", icon: .download) { website("/examples/lawfive-matches.json") }
                        }
                        SecondaryButton("What each column means", icon: .info) { website("/matches/import/columns") }
                    }
                }
            }
        }
        .fileImporter(isPresented: $choosing, allowedContentTypes: types) { result in
            switch result {
            case .success(let url): read(url)
            case .failure: problem = "That file couldn't be opened."
            }
        }
    }
}

/// Every row: where it is in the file, the match, what happens to it, and any problems.
private struct ImportRows: View {
    let result: MatchImportFileResult
    let onlyProblems: Bool

    var body: some View {
        let rows = onlyProblems ? result.rows.filter { $0.action == "skip" } : result.rows
        let word = result.file.kind == "json" ? "Item" : "Row"
        LfCard {
            ForEach(Array(rows.enumerated()), id: \.element.row) { i, row in
                if i > 0 { Divider().overlay(LF.border) }
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(word) \(row.row <= result.file.lines.count ? result.file.lines[row.row - 1] : row.row)").font(.lfLabelSmall).foregroundStyle(LF.muted)
                        Text(row.title ?? "No teams").font(.lfBodyLarge).foregroundStyle(LF.text)
                        if let at = instantOf(row.kickoff) {
                            Text("\(formatShortDay(at, zone: .current)), \(formatTime(at, zone: .current))").font(.lfBodySmall).foregroundStyle(LF.muted)
                        }
                        ForEach(row.problems, id: \.self) { Text($0).font(.lfBodySmall).foregroundStyle(LF.redText).fixedSize(horizontal: false, vertical: true) }
                    }
                    Spacer(minLength: 0)
                    switch row.action {
                    case "add": Chip("New", tone: .brand)
                    case "update": Chip("Update", tone: .blue)
                    default: Chip("Skipped", tone: .red)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
    }
}
