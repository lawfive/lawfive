import PDFKit
import QuickLook
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// Files on a match, venue or competition (FILE-6 to FILE-13), as the website's Files card and
// Android's: a list under Photos (a competition's only attachments), each file with its icon or
// thumbnail, name, kind and size, Share, and in its menu Keep on this phone, Rename and Delete. Add
// files takes several from the phone's files, or a photo from the camera, each uploading at once,
// faded until it's in, with a thumbnail made here for a photo or a PDF's first page (PDFKit). A tap
// opens it: a PDF page by page in PDFKit, a photo large, CSV and text as text, others in Quick Look.
// A match also shows its competition's files, read-only. What couldn't be added is said once,
// under the list (FILE-7).

/// What the phone's file picker offers: the kinds the server takes.
let fileTypes: [UTType] = [
    .pdf, UTType("org.openxmlformats.spreadsheetml.sheet") ?? .spreadsheet, .commaSeparatedText,
    UTType("org.openxmlformats.wordprocessingml.document") ?? .data, .plainText, .jpeg, .png, .webP,
]

/// What the last try couldn't add (FILE-7).
private struct Trouble {
    /// To try again: those that didn't fit, or went without signal.
    var retry: [Picked] = []
    var noRoom = 0
    var refused: [Refused] = []
}

/// A file picked from the phone, as it's sent: its name, type and bytes.
private struct Picked: Sendable {
    let name: String
    let type: String
    let data: Data
}

/// A file to show, fetched: in LawFive's own viewer or Quick Look.
private struct Showing: Identifiable {
    let file: Attachment
    let local: URL
    var id: String { file.id }
}

struct FilesSection: View {
    let recordType: String
    let recordId: String
    /// On a match, its competition, whose files show under the match's own, read-only.
    var competition: Competition?
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.openURL) private var openURL
    @Environment(\.colorScheme) private var scheme
    @State private var offered: Bool?
    @State private var files: [Attachment]?
    @State private var theirs: [Attachment]?
    @State private var problem: String?
    @State private var pending: [String] = []
    @State private var trouble: Trouble?
    @State private var storage: StorageUse?
    @State private var admin = false
    @State private var choosing = false
    @State private var camera = false
    @State private var showing: Showing?
    @State private var looking: URL?
    @State private var sharing: ShareItem?
    @State private var renaming: Attachment?
    @State private var newName = ""
    @State private var deleting: Attachment?
    /// A row's own line for a moment: "Opening…", or why it didn't open.
    @State private var notes: [String: String] = [:]

    private func reload() async {
        if offered == nil { offered = await graph.meta()?.capabilities.contains("files") ?? true }
        guard offered == true else { return }
        if files == nil { files = graph.keptFiles.list(recordType, recordId) }
        if let c = competition, theirs == nil { theirs = graph.keptFiles.list("competition", c.id) }
        do {
            let list = try await graph.keptFiles.fetchList(recordType, recordId)
            files = list
            graph.keptFiles.remember(recordType, recordId, list)
            problem = nil
        } catch let e as ServerError {
            problem = e.status == 404 ? "Files are switched off on this server." : e.message
        } catch {
            problem = files == nil ? "Files show when there's signal." : nil
        }
        if let c = competition, let list = try? await graph.keptFiles.fetchList("competition", c.id) {
            theirs = list
            graph.keptFiles.remember("competition", c.id, list)
        }
        if let answer = try? await graph.api.call("GET", "/v1/account/storage"), let sizes = StorageUse(answer) { storage = sizes }
        if storage?.limitBytes != nil, let account = try? await graph.api.call("GET", "/v1/account") { admin = account["admin"] == .bool(true) }
    }

    private func add(_ chosen: [Picked]) async {
        guard !chosen.isEmpty else { return }
        trouble = nil
        if storage?.full == true {
            trouble = Trouble(retry: chosen, noRoom: chosen.count)
            return
        }
        pending += chosen.map(\.name)
        var left = Trouble()
        // One at a time, in the order chosen, so they keep that order. Once one hasn't fitted, only
        // those small enough for what's left are sent.
        var room: Double?
        for p in chosen {
            do {
                if p.data.count > maxFileBytes { throw TooBig() }
                if let room, Double(p.data.count) > room { throw NoRoomForFile() }
                try await uploadFile(p)
                room = nil
            } catch is TooBig {
                left.refused.append(Refused(name: p.name, why: tooBig(p.name)))
            } catch is NoRoomForFile {
                left.retry.append(p)
                left.noRoom += 1
            } catch let e as ServerError {
                if let sizes = StorageUse(e.body?["storage"]) {
                    room = sizes.room
                    left.retry.append(p)
                    left.noRoom += 1
                } else {
                    left.refused.append(Refused(name: p.name, why: e.message))
                }
            } catch {
                left.retry.append(p)
                left.refused.append(Refused(name: p.name, why: "There's no connection: try again with signal."))
            }
            if let i = pending.firstIndex(of: p.name) { pending.remove(at: i) }
        }
        await reload()
        trouble = left.noRoom > 0 || !left.refused.isEmpty ? left : nil
    }

    /// Sent as it is (FILE-9), with a thumbnail when it's a photo or a PDF (FILE-12).
    private func uploadFile(_ p: Picked) async throws {
        let thumb = await Task.detached { () -> Data? in
            if p.type.hasPrefix("image/") { return UIImage(data: p.data).flatMap { shrink($0, edge: 480, quality: 0.8)?.data } }
            if p.type == "application/pdf" { return pdfThumbnail(p.data) }
            return nil
        }.value
        var parts: [(field: String, name: String, type: String, data: Data)] = [("file", p.name, p.type, p.data)]
        if let thumb { parts.append(("thumb", "thumb.jpg", "image/jpeg", thumb)) }
        try await graph.api.upload("/v1/attachments", fields: [("recordType", recordType), ("recordId", recordId), ("kind", "file"), ("name", p.name)], files: parts)
    }

    private func read(_ urls: [URL]) {
        var chosen: [Picked] = []
        var refused: [Refused] = []
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let name = url.lastPathComponent
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            if size > maxFileBytes {
                refused.append(Refused(name: name, why: tooBig(name)))
                continue
            }
            guard let data = try? Data(contentsOf: url) else {
                refused.append(Refused(name: name, why: "That file couldn't be read."))
                continue
            }
            let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            chosen.append(Picked(name: name, type: type, data: data))
        }
        Task {
            await add(chosen)
            if !refused.isEmpty {
                var t = trouble ?? Trouble()
                t.refused = refused + t.refused
                trouble = t
            }
        }
    }

    private func open(_ a: Attachment) {
        guard notes[a.id] != "Opening…" else { return }
        notes[a.id] = "Opening…"
        Task {
            do {
                let local = try await graph.keptFiles.fileFor(a)
                notes[a.id] = nil
                if opensInApp(a) { showing = Showing(file: a, local: local) } else { looking = local }
            } catch let e as ServerError {
                notes[a.id] = e.status == 404 ? "It's gone: it was deleted." : "It didn't open: \(e.message)"
                if e.status == 404 { await reload() }
            } catch {
                // FILE-13: only what's kept opens without signal.
                notes[a.id] = "Opens when there's signal."
            }
        }
    }

    private func share(_ a: Attachment) {
        Task {
            do { sharing = ShareItem(url: try await graph.keptFiles.fileFor(a)) } catch { notes[a.id] = "Shares when there's signal." }
        }
    }

    private func keep(_ a: Attachment, _ on: Bool) {
        Task {
            let now = await graph.keptFiles.keep(a, on, matches: graph.records.matches ?? [])
            if on && !now { notes[a.id] = problem != nil ? "Kept once there's signal." : "There's no room to keep it: kept files are at most 200 MB." }
        }
    }

    private func rename(_ a: Attachment, to name: String) {
        Task {
            do {
                try await graph.api.call("PUT", "/v1/attachments/\(a.id)", body: .object(["name": .string(name)]))
            } catch let e as ServerError {
                notes[a.id] = e.message
            } catch {
                notes[a.id] = "Renames when there's signal."
            }
            await reload()
        }
    }

    private func delete(_ a: Attachment) {
        Task {
            do {
                try await graph.api.call("DELETE", "/v1/attachments/\(a.id)")
                graph.keptFiles.forget(a.id)
            } catch let e as ServerError {
                notes[a.id] = e.message
            } catch {
                notes[a.id] = "Deletes when there's signal."
            }
            await reload()
        }
    }

    private func row(_ a: Attachment, readOnly: Bool) -> some View {
        FileRow(file: a, kept: graph.keptFiles.keptIds.contains(a.id), pinned: graph.keptFiles.pinnedIds.contains(a.id), note: notes[a.id], readOnly: readOnly,
                onOpen: { open(a) }, onShare: { share(a) }, onKeep: { keep(a, $0) },
                onRename: { newName = splitName(a.fileName).0; renaming = a }, onDelete: { deleting = a })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if offered != false {
                SectionTitle("Files")
                LfCard(padding: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let storage, storage.nearlyFull {
                            Text(storageUsedLine(storage)).font(.lfBodySmall).foregroundStyle(LF.muted)
                        }
                        if files == nil && problem == nil {
                            LoadingPitch(inline: true)
                        } else {
                            ForEach(files ?? [], id: \.id) { a in row(a, readOnly: false) }
                            ForEach(Array(pending.enumerated()), id: \.offset) { _, name in PendingFileRow(name: name) }
                            if storage?.full == true {
                                Button { trouble = Trouble() } label: { AddFileLabel(icon: .info, title: "Storage full", sub: "Tap to see why") }.buttonStyle(PressStyle())
                            } else {
                                Menu {
                                    Button { choosing = true } label: { Label { Text("From your files") } icon: { Ph.addFiles.image } }
                                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                                        Button { camera = true } label: { Label { Text("Take a photo") } icon: { Ph.camera.image } }
                                    }
                                } label: {
                                    AddFileLabel(icon: .addFiles, title: "Add files", sub: "PDF, spreadsheets, Word, text or photos, up to 20 MB each", fixed: (.panel, scheme))
                                }
                            }
                        }
                        if let problem {
                            Text(problem).font(.lfBodySmall).foregroundStyle(files == nil ? LF.muted : LF.redText)
                        }
                        if let trouble { notice(trouble) }
                        if let competition, let theirs, !theirs.isEmpty {
                            // FILE-6: the competition's files, read-only here; they're changed on its page.
                            Button { nav.push(.competition(competition.id)) } label: {
                                (Text("FROM THE COMPETITION · ").foregroundStyle(LF.muted) + Text(competition.name.uppercased()).foregroundStyle(LF.brandStrong))
                                    .font(.mono(11, bold: true, relativeTo: .caption)).tracking(11 * 0.12).multilineTextAlignment(.leading)
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 10)
                            .accessibilityHint("Opens the competition")
                            ForEach(theirs, id: \.id) { a in row(a, readOnly: true) }
                        }
                    }
                }
            }
        }
        .task(id: "\(recordId)|\(competition?.id ?? "")") { await reload() }
        .fileImporter(isPresented: $choosing, allowedContentTypes: fileTypes, allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { read(urls) }
        }
        .fullScreenCover(isPresented: $camera) {
            // A photo taken for Files is made smaller first, as photos are, so where it was taken doesn't go with it (FILE-2).
            CameraPicker { image in
                guard let made = shrink(image, edge: 2000, quality: 0.85) else { return }
                Task { await add([Picked(name: photoName(), type: "image/jpeg", data: made.data)]) }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $showing) { s in
            FileViewer(file: s.file, local: s.local).environment(graph)
        }
        .quickLookPreview($looking)
        .sheet(item: $sharing) { item in ActivitySheet(items: [item.url]).presentationDetents([.medium, .large]) }
        .alert("Rename", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } }), presenting: renaming) { a in
            TextField("Name", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Rename") {
                let (base, ending) = splitName(a.fileName)
                let name = String(newName.trimmingCharacters(in: .whitespaces).prefix(120))
                if !name.isEmpty && name != base { rename(a, to: name + ending) }
            }
        } message: { a in
            Text(keepsEnding(splitName(a.fileName).1) + ".")
        }
        .confirm("Delete \(deleting?.fileName ?? "it")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), message: "It can't be got back.", action: "Delete") {
            if let a = deleting { delete(a) }
        }
    }

    /// FILE-7: what couldn't be added, said once under the list, each file with why, and what's taken said once.
    private func notice(_ t: Trouble) -> some View {
        let taken = takenLine(t.refused)
        let refused = withoutTaken(t.refused)
        return HStack(alignment: .top, spacing: 10) {
            PhIcon(.info, size: 18, tint: LF.amberText)
            VStack(alignment: .leading, spacing: 6) {
                if (t.noRoom > 0 || refused.isEmpty), let storage, storage.limitBytes != nil {
                    Text(noRoomTitle(t.noRoom, what: "file")).font(.lfTitleSmall).foregroundStyle(LF.text)
                    Text(noRoomText(storage, admin: admin)).font(.lfBodySmall).foregroundStyle(LF.text)
                    if admin {
                        Button("Change the limit") {
                            if let url = websiteURL(server: graph.session.server, path: "/settings/server/plans") { openURL(url) }
                        }
                        .font(.lfLabelLarge).foregroundStyle(LF.brandStrong).buttonStyle(.plain)
                    }
                }
                if !refused.isEmpty {
                    Text(refusedTitle(refused)).font(.lfTitleSmall).foregroundStyle(LF.text)
                    if refused.count == 1 {
                        Text(refused[0].why).font(.lfBodySmall).foregroundStyle(LF.text)
                    } else {
                        ForEach(Array(refused.enumerated()), id: \.offset) { _, r in Text("\(r.name): \(r.why)").font(.lfBodySmall).foregroundStyle(LF.text) }
                    }
                }
                if let taken { Text(taken).font(.lfBodySmall).foregroundStyle(LF.text) }
                if !t.retry.isEmpty {
                    SecondaryButton("Try again") { Task { await add(t.retry) } }
                }
            }
            Spacer(minLength: 0)
            Button { trouble = nil } label: { PhIcon(.close, size: 18, tint: LF.muted, label: "Dismiss") }.buttonStyle(.plain)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LF.amberSoft, in: RoundedRectangle(cornerRadius: 6))
        .padding(.top, 4)
    }
}

private struct TooBig: Error {}

/// A photo taken for Files: "Photo 2026-11-09 08.00.jpg".
private func photoName() -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd HH.mm"
    return "Photo \(f.string(from: AppClock.now)).jpg"
}

/// FILE-12: a PDF's first page as a 480-pixel JPEG thumbnail, by PDFKit; nil when it can't be drawn.
func pdfThumbnail(_ data: Data) -> Data? {
    guard let page = PDFDocument(data: data)?.page(at: 0) else { return nil }
    let bounds = page.bounds(for: .mediaBox)
    guard bounds.width > 0, bounds.height > 0 else { return nil }
    let scale = 480 / max(bounds.width, bounds.height)
    let image = page.thumbnail(of: CGSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
    return shrink(image, edge: 480, quality: 0.8)?.data
}

/// One file: its picture, name and line, Share, and a menu to keep it, and (unless read-only here) rename or delete it.
private struct FileRow: View {
    let file: Attachment
    let kept: Bool
    let pinned: Bool
    let note: String?
    let readOnly: Bool
    let onOpen: () -> Void
    let onShare: () -> Void
    let onKeep: (Bool) -> Void
    let onRename: () -> Void
    let onDelete: () -> Void
    @Environment(\.ground) private var ground
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let kind = fileKind(file.contentType)
        let line = note ?? (describeFile(file) + (kept ? " · On this phone" : pinned ? " · Kept when there's signal" : ""))
        // Share beside the menu at the usual text sizes; at larger ones it's first in the menu, so the name has the width.
        let roomy = typeSize <= .large
        HStack(spacing: 10) {
            Button(action: onOpen) {
                HStack(spacing: 10) {
                    // FILE-12: its kind's icon, under a thumbnail when one was made (a photo, or a PDF added on a phone).
                    ZStack {
                        LF.surface2
                        PhIcon(kind.icon, size: 22, tint: LF.brandStrong)
                        if file.hasThumb ?? (kind == .photo) { ThumbImage(path: file.thumbUrl) }
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(file.fileName).font(.barlow(16, .bold, relativeTo: .headline)).foregroundStyle(LF.text).lineLimit(2).truncationMode(.middle).multilineTextAlignment(.leading)
                        Text(line).font(.lfBodySmall).foregroundStyle(note != nil && note != "Opening…" ? LF.amberText : LF.muted).multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel("\(file.fileName), \(line)")
            .accessibilityHint("Opens it")
            if roomy {
                Button(action: onShare) { PhIcon(.share, size: 18, tint: LF.text, label: "Share \(file.fileName)").frame(width: 44, height: 44) }.buttonStyle(.plain)
            }
            Menu {
                if !roomy { Button(action: onShare) { Label { Text("Share") } icon: { Ph.share.image } } }
                if pinned {
                    Button { onKeep(false) } label: { Label { Text("Stop keeping it") } icon: { Ph.keepOff.image } }
                } else {
                    Button { onKeep(true) } label: { Label { Text("Keep on this phone") } icon: { Ph.keep.image } }
                }
                if !readOnly {
                    Button(action: onRename) { Label { Text("Rename") } icon: { Ph.edit.image } }
                    Button(role: .destructive, action: onDelete) { Label { Text("Delete") } icon: { Ph.trash.image } }
                }
            } label: {
                // The ground's colors fixed: iOS 17 draws a menu's label outside the ground's trait.
                PhIcon(.more, size: 18, tint: ink(\.text, ground, scheme), label: "More for \(file.fileName)").frame(width: 44, height: 44)
            }
        }
        .padding(.leading, 8)
        .frame(minHeight: 60)
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(LF.border, lineWidth: 1))
    }
}

/// A thumbnail that leaves the icon under it showing until it's in.
private struct ThumbImage: View {
    let path: String
    @Environment(AppGraph.self) private var graph
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image { Image(uiImage: image).resizable().aspectRatio(contentMode: .fill) }
        }
        .task(id: path) { image = await ImageLoader.shared.load(path, api: graph.api) }
    }
}

private struct PendingFileRow: View {
    let name: String

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                LF.surface2
                PhIcon(.upload, size: 22, tint: LF.muted)
            }
            .frame(width: 44, height: 44)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(.barlow(16, .bold, relativeTo: .headline)).foregroundStyle(LF.text).lineLimit(1)
                Text("Uploading…").font(.lfBodySmall).foregroundStyle(LF.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(8)
        .frame(minHeight: 60)
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(LF.border, lineWidth: 1))
        .opacity(0.55)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Uploading \(name)")
    }
}

/// A dashed row, as the website's Add files; `fixed` gives a menu's label the ground's colors (iOS 17 draws it outside the trait).
private struct AddFileLabel: View {
    let icon: Ph
    let title: String
    let sub: String
    var fixed: (Ground, ColorScheme)?

    var body: some View {
        let muted = fixed.map { ink(\.muted, $0.0, $0.1) } ?? LF.muted
        let text = fixed.map { ink(\.text, $0.0, $0.1) } ?? LF.text
        let surface = fixed.map { ink(\.surface2, $0.0, $0.1) } ?? LF.surface2
        HStack(spacing: 12) {
            PhIcon(icon, size: 20, tint: muted)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.lfLabelLarge).foregroundStyle(text)
                Text(sub).font(.lfBodySmall).foregroundStyle(muted).multilineTextAlignment(.leading)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(minHeight: 60)
        .background(surface, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(muted.opacity(0.55), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
    }
}

/// A PDF page by page with zoom (PDFKit), a photo large, or a CSV or text file's first lines in the
/// monospaced font (FILE-12, FILE-13), on the board, with Share.
private struct FileViewer: View {
    let file: Attachment
    let local: URL
    @Environment(\.dismiss) private var dismiss
    @State private var text: TextPreview?
    @State private var sharing = false
    @State private var zoom: CGFloat = 1

    var body: some View {
        let kind = fileKind(file.contentType)
        NavigationStack {
            VStack(spacing: 12) {
                ZStack {
                    Color(uiColor: UIColor(hex: 0x0D100F))
                    switch kind {
                    case .pdf: PDFKitView(url: local)
                    case .photo:
                        if let image = UIImage(contentsOfFile: local.path) {
                            Image(uiImage: image).resizable().scaledToFit()
                                .scaleEffect(zoom)
                                .gesture(MagnifyGesture().onChanged { zoom = max(1, $0.magnification) }.onEnded { _ in withAnimation { zoom = 1 } })
                                .accessibilityLabel(file.fileName)
                        }
                    default: textLines(wrap: kind == .txt)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 6))
                HStack {
                    Text(text?.more == true ? "The first \(previewLines) lines · \(describeFile(file))" : describeFile(file)).font(.lfBodySmall).foregroundStyle(LF.muted)
                    Spacer()
                    SecondaryButton("Share", icon: .share) { sharing = true }
                }
            }
            .padding(16)
            .background(LF.board.ignoresSafeArea())
            .ground(.board)
            .navigationTitle(file.fileName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { PhIcon(.close, tint: LF.text, label: "Close") }
                }
            }
            .sheet(isPresented: $sharing) { ActivitySheet(items: [local]).presentationDetents([.medium, .large]) }
            .task {
                if kind == .csv || kind == .txt, let data = try? Data(contentsOf: local) { text = textPreview(data) }
            }
        }
    }

    /// CSV scrolls both ways, text wraps; never laid out as a page.
    @ViewBuilder private func textLines(wrap: Bool) -> some View {
        if let text {
            if text.lines.isEmpty {
                Text("This file is empty.").font(.lfBodySmall).foregroundStyle(LF.muted)
            } else {
                ScrollView(wrap ? .vertical : [.vertical, .horizontal]) {
                    Text(text.lines.joined(separator: "\n"))
                        .font(.mono(13, relativeTo: .footnote)).foregroundStyle(LF.text)
                        .fixedSize(horizontal: !wrap, vertical: true)
                        .frame(maxWidth: wrap ? .infinity : nil, alignment: .leading)
                        .padding(12)
                        .textSelection(.enabled)
                }
                .background(LF.surface2)
                .accessibilityLabel("The first lines of \(file.fileName)")
            }
        } else {
            LoadingPitch(inline: true)
        }
    }
}

/// PDFKit's view: the pages one under another, pinch to zoom.
private struct PDFKitView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.document = PDFDocument(url: url)
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = UIColor(hex: 0x0D100F)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {}
}
