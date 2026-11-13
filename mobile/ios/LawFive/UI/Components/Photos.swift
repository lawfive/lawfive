import PhotosUI
import SwiftUI
import UIKit

// Photos on matches, venues and referees (IOS-7, FILE-1 to FILE-5): from the camera or the phone's
// photos, made smaller on the phone (2000 px, a 480 px thumbnail, as a JPEG with nothing but the
// picture in it), with captions; a referee's first photo is their picture. Photos need signal.

/// How much of its room an account is using (SEC-6), and saying when a photo doesn't fit (FILE-7), as
/// the website does.
struct StorageUse: Equatable {
    let usedBytes: Double
    let limitBytes: Double?

    var full: Bool { limitBytes.map { usedBytes >= $0 } ?? false }
    /// From 80% used, the photos card says how much.
    var nearlyFull: Bool { limitBytes.map { usedBytes >= $0 * 0.8 } ?? false }
    var room: Double? { limitBytes.map { max(0, $0 - usedBytes) } }

    init(usedBytes: Double, limitBytes: Double?) {
        self.usedBytes = usedBytes
        self.limitBytes = limitBytes
    }

    init?(_ json: JSONValue?) {
        guard let used = json?["usedBytes"]?.double else { return nil }
        self.init(usedBytes: used, limitBytes: json?["limitBytes"]?.double)
    }
}

/// Known not to fit before it's sent, once the server has refused another.
struct NoRoomForPhoto: Error {}

/// "5.9 MB", "120 MB", "1.5 GB"; whole under 10 MB when it is, so a limit reads "6 MB".
func storageSize(_ bytes: Double) -> String {
    if bytes >= 1_073_741_824 { return String(format: "%.1f GB", bytes / 1_073_741_824) }
    let mb = bytes / 1_048_576
    return mb >= 10 || mb == mb.rounded(.down) ? "\(Int(mb.rounded(.up))) MB" : String(format: "%.1f MB", mb)
}

func storageUsedLine(_ storage: StorageUse) -> String {
    "\(storageSize(storage.usedBytes)) of \(storageSize(storage.limitBytes ?? 0)) used"
}

/// The bold start of the notice: `noRoom` photos didn't fit, or none was tried.
func noRoomTitle(_ noRoom: Int) -> String {
    noRoom == 0 ? "Your storage is full." : noRoom == 1 ? "This photo didn't fit." : "\(noRoom) photos didn't fit."
}

/// The rest of it; an admin also gets a way to change the limit.
func noRoomText(_ storage: StorageUse, admin: Bool) -> String {
    "You've used \(storageSize(storage.usedBytes)) of \(storageSize(storage.limitBytes ?? 0)). Delete some photos or tracks to make room" + (admin ? "." : ", or ask an admin of this server for more.")
}

/// A referee's picture, or their initials; round, or with `tile` a square board tile (WEB-28, on the
/// Working together slab).
struct RefereeAvatar: View {
    let r: Referee
    var size: CGFloat = 38
    var tile = false
    @Environment(AppGraph.self) private var graph

    var body: some View {
        let shape = tile ? AnyShape(RoundedRectangle(cornerRadius: 4)) : AnyShape(Circle())
        if let picture = graph.refereePictures[r.id] {
            AuthImage(path: picture.thumbUrl).frame(width: size, height: size).clipShape(shape)
        } else if tile {
            Text(initials(r.name).uppercased()).lfWord(size * 0.36).foregroundStyle(LF.onBoardStrong).lineLimit(1)
                .frame(width: size, height: size)
                .background(LF.kitBlank, in: shape)
                .accessibilityHidden(true)
        } else {
            Avatar(text: initials(r.name), size: size)
        }
    }
}

/// A JPEG of the photo at most `edge` pixels on its longest side, drawn upright.
func shrink(_ image: UIImage, edge: CGFloat, quality: CGFloat) -> (data: Data, width: Int, height: Int)? {
    let scale = min(1, edge / max(image.size.width * image.scale, image.size.height * image.scale))
    let size = CGSize(width: (image.size.width * image.scale * scale).rounded(), height: (image.size.height * image.scale * scale).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let drawn = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    return drawn.jpegData(compressionQuality: quality).map { ($0, Int(size.width), Int(size.height)) }
}

@MainActor
func uploadPhoto(_ graph: AppGraph, recordType: String, recordId: String, image: UIImage, room: Double? = nil) async throws {
    let made = await Task.detached { (shrink(image, edge: 2000, quality: 0.85), shrink(image, edge: 480, quality: 0.8)) }.value
    guard let full = made.0, let thumb = made.1 else { throw ServerError(status: 0, message: "That photo couldn't be read", body: nil) }
    if let room, Double(full.data.count) > room { throw NoRoomForPhoto() }
    try await graph.api.upload("/v1/attachments", fields: [("recordType", recordType), ("recordId", recordId), ("width", "\(full.width)"), ("height", "\(full.height)")],
                               files: [("file", "photo.jpg", "image/jpeg", full.data), ("thumb", "thumb.jpg", "image/jpeg", thumb.data)])
}

/// The photos card: thumbnails ending in Add photos (camera or the phone's photos); a tap opens one large.
struct PhotosSection: View {
    let recordType: String
    let recordId: String
    @Environment(AppGraph.self) private var graph
    @State private var photos: [Attachment]?
    @State private var problem: String?
    @State private var uploading = 0
    @State private var open: ViewerStart?
    @State private var picking = false
    @State private var picked: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var storage: StorageUse?
    @State private var admin = false
    /// FILE-7: how many didn't fit, once they've been tried; nil when there's nothing to say.
    @State private var noRoom: Int?
    @Environment(\.openURL) private var openURL
    @Environment(\.ground) private var ground
    @Environment(\.colorScheme) private var scheme

    struct ViewerStart: Identifiable {
        let index: Int
        var id: Int { index }
    }

    private func reload() async {
        do {
            let answer = try await graph.api.call("GET", "/v1/attachments?recordType=\(recordType)&recordId=\(recordId)")
            photos = try answer?["attachments"]?.decoded(as: [Attachment].self) ?? []
            problem = nil
        } catch let e as ServerError {
            problem = e.status == 404 ? "Photos are switched off on this server." : e.message
        } catch {
            problem = "Photos show when there's signal."
        }
        if recordType == "referee" { await graph.loadRefereePictures() }
        if let answer = try? await graph.api.call("GET", "/v1/account/storage"), let sizes = StorageUse(answer) { storage = sizes }
        if storage?.limitBytes != nil, let account = try? await graph.api.call("GET", "/v1/account") { admin = account["admin"] == .bool(true) }
    }

    private func add(_ images: [UIImage]) async {
        noRoom = nil
        if storage?.full == true {
            noRoom = images.count
            return
        }
        uploading += images.count
        var refused = 0
        // Once one hasn't fitted, only those small enough for what's left are sent.
        var room: Double?
        for image in images {
            do {
                try await uploadPhoto(graph, recordType: recordType, recordId: recordId, image: image, room: room)
                room = nil
            } catch is NoRoomForPhoto {
                refused += 1
            } catch let e as ServerError {
                if let sizes = StorageUse(e.body?["storage"]) {
                    refused += 1
                    room = sizes.room
                } else {
                    problem = e.message
                }
            } catch {
                problem = "No connection: the photo wasn't added."
            }
            uploading -= 1
        }
        await reload()
        if refused > 0 { noRoom = refused }
    }

    /// FILE-7: says what's used and what to do about it.
    private func notice(_ noRoom: Int, _ storage: StorageUse) -> some View {
        HStack(alignment: .top, spacing: 10) {
            PhIcon(.info, size: 18, tint: LF.amberText)
            VStack(alignment: .leading, spacing: 6) {
                Text(noRoomTitle(noRoom)).font(.lfTitleSmall).foregroundStyle(LF.text)
                Text(noRoomText(storage, admin: admin)).font(.lfBodySmall).foregroundStyle(LF.text)
                if admin {
                    Button("Change the limit") {
                        if let url = websiteURL(server: graph.session.server, path: "/settings/server/plans") { openURL(url) }
                    }
                    .font(.lfLabelLarge).foregroundStyle(LF.brandStrong).buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
            Button { self.noRoom = nil } label: { PhIcon(.close, size: 18, tint: LF.muted, label: "Dismiss") }.buttonStyle(.plain)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LF.amberSoft, in: RoundedRectangle(cornerRadius: 6))
        .padding(.top, 10)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionTitle("Photos")
            LfCard(padding: 12) {
                if let storage, storage.nearlyFull {
                    Text(storageUsedLine(storage)).font(.lfBodySmall).foregroundStyle(LF.muted).padding(.bottom, 10)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(Array((photos ?? []).enumerated()), id: \.element.id) { i, a in
                        Button { open = ViewerStart(index: i) } label: {
                            Color.clear.aspectRatio(1, contentMode: .fit)
                                .overlay { AuthImage(path: a.thumbUrl) }
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(LF.border, lineWidth: 1))
                                .overlay(alignment: .bottomLeading) {
                                    if recordType == "referee" && i == 0 { Chip("Picture").padding(6) }
                                }
                        }
                        .buttonStyle(PressStyle())
                        .accessibilityLabel(a.caption ?? "Photo \(i + 1)")
                    }
                    ForEach(0..<uploading, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 6).fill(LF.surface2).aspectRatio(1, contentMode: .fit)
                            .overlay { Text("Uploading…").font(.lfBodySmall).foregroundStyle(LF.muted) }
                    }
                    if storage?.full == true { fullTile } else { addTile }
                }
                if let problem {
                    Text(problem).font(.lfBodySmall).foregroundStyle(photos == nil ? LF.muted : LF.redText).padding(.top, 10)
                }
                if let noRoom, let storage, storage.limitBytes != nil { notice(noRoom, storage) }
            }
        }
        .task(id: recordId) { await reload() }
        .photosPicker(isPresented: $picking, selection: $picked, maxSelectionCount: 10, matching: .images)
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            picked = []
            Task {
                var images: [UIImage] = []
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { images.append(image) }
                }
                await add(images)
            }
        }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { image in Task { await add([image]) } }.ignoresSafeArea()
        }
        .fullScreenCover(item: $open) { start in
            PhotoViewer(photos: photos ?? [], start: start.index, recordType: recordType) { await reload() }
                .environment(graph)
        }
    }

    /// FILE-7: in place of Add photos when there's no room at all; a tap says why.
    private var fullTile: some View {
        Button { noRoom = 0 } label: {
            RoundedRectangle(cornerRadius: 6).fill(LF.surface2)
                .aspectRatio(1, contentMode: .fit)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(LF.muted.opacity(0.55), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
                .overlay {
                    VStack(spacing: 6) {
                        PhIcon(.info, size: 24, tint: LF.muted)
                        Text("Storage full").font(.lfLabelMedium).foregroundStyle(LF.muted)
                    }
                }
        }
        .buttonStyle(PressStyle())
    }

    /// The dashed Add photos tile (as the web's), offering the camera or the phone's photos.
    private var addTile: some View {
        Menu {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button { camera = true } label: { Label { Text("Take a photo") } icon: { Ph.camera.image } }
            }
            Button { picking = true } label: { Label { Text("From your photos") } icon: { Ph.photos.image } }
        } label: {
            // The ground's colors fixed: iOS 17 draws a menu's label outside the ground's trait.
            RoundedRectangle(cornerRadius: 6).fill(ink(\.surface2, ground, scheme))
                .aspectRatio(1, contentMode: .fit)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(ink(\.muted, ground, scheme).opacity(0.55), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
                .overlay {
                    VStack(spacing: 6) {
                        PhIcon(.camera, size: 24, tint: ink(\.muted, ground, scheme))
                        Text("Add photos").font(.lfLabelMedium).foregroundStyle(ink(\.muted, ground, scheme))
                    }
                }
        }
    }
}

/// The native camera.
private struct CameraPicker: UIViewControllerRepresentable {
    let done: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.done(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// One photo large: swipe between them, pinch to look closer, with its caption and what can be done with it.
private struct PhotoViewer: View {
    let photos: [Attachment]
    let start: Int
    let recordType: String
    let changed: () async -> Void
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var caption = ""
    @State private var deleting = false
    @State private var zoom: CGFloat = 1
    /// FILE-8: the photo being cropped, taken when Crop is tapped (the pages can move under the
    /// cover), with their picture's circle on a referee's first photo.
    @State private var cropping: CropTarget?

    private var photo: Attachment? { photos.indices.contains(index) ? photos[index] : nil }

    private func change(_ body: JSONValue) async {
        guard let photo else { return }
        // Left as it was if it fails; the next look shows what the server has.
        _ = try? await graph.api.call("PUT", "/v1/attachments/\(photo.id)", body: body)
        await changed()
    }

    private func saveCaption() async {
        let text = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let photo, text != (photo.caption ?? "") else { return }
        await change(.object(["caption": text.isEmpty ? .null : .string(text)]))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                TabView(selection: $index) {
                    ForEach(Array(photos.enumerated()), id: \.element.id) { i, a in
                        AuthImage(path: a.url, fit: true)
                            .scaleEffect(i == index ? zoom : 1)
                            .gesture(MagnifyGesture().onChanged { zoom = max(1, $0.magnification) }.onEnded { _ in withAnimation { zoom = 1 } })
                            .tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .always : .never))
                .background(Color(uiColor: UIColor(hex: 0x0D100F)), in: RoundedRectangle(cornerRadius: 6))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                Field("Caption", text: $caption, placeholder: "Add a caption")
                HStack(spacing: 8) {
                    if index > 0 {
                        SecondaryButton(recordType == "referee" ? "Make their picture" : "Move to first", icon: recordType == "referee" ? .portrait : .photos) {
                            Task {
                                await change(.object(["position": .int(0)]))
                                dismiss()
                            }
                        }
                    }
                    SecondaryButton("Crop", icon: .crop) {
                        if let photo { cropping = CropTarget(photo: photo, circle: recordType == "referee" && index == 0) }
                    }
                    Spacer()
                    SecondaryButton("Delete", icon: .trash, danger: true) { deleting = true }
                }
            }
            .padding(16)
            // On the board's near black, as Android's (IOS-13).
            .background(LF.board.ignoresSafeArea())
            .ground(.board)
            .navigationTitle("Photo \(index + 1) of \(photos.count)")
            .navigationBarTitleDisplayMode(.inline)
            .keyboardDone()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        Task {
                            await saveCaption()
                            dismiss()
                        }
                    } label: { PhIcon(.close, tint: LF.text, label: "Close") }
                }
            }
            .onAppear {
                index = start
                caption = photo?.caption ?? ""
            }
            .onChange(of: index) { old, new in
                let leaving = photos.indices.contains(old) ? photos[old] : nil
                let text = caption.trimmingCharacters(in: .whitespacesAndNewlines)
                if let leaving, text != (leaving.caption ?? "") {
                    Task {
                        _ = try? await graph.api.call("PUT", "/v1/attachments/\(leaving.id)", body: .object(["caption": text.isEmpty ? .null : .string(text)]))
                        await changed()
                    }
                }
                caption = photos.indices.contains(new) ? photos[new].caption ?? "" : ""
            }
            .fullScreenCover(item: $cropping) { target in
                CropPhoto(photo: target.photo, circle: target.circle) { changedIt in
                    cropping = nil
                    // The list here is the one it opened with, so it closes to show the new one.
                    if changedIt { Task { await changed(); dismiss() } }
                }
            }
            .confirm("Delete this photo?", isPresented: $deleting, message: "It can't be got back.", action: "Delete") {
                guard let photo else { return }
                Task {
                    _ = try? await graph.api.call("DELETE", "/v1/attachments/\(photo.id)")
                    await changed()
                    dismiss()
                }
            }
        }
    }
}

/// FILE-8: what the crop cover opens with.
private struct CropTarget: Identifiable {
    let photo: Attachment
    let circle: Bool
    var id: String { photo.id }
}
