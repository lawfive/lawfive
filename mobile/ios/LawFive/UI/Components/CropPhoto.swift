import SwiftUI

// Cropping and turning a photo (FILE-8), as on the website and Android: the whole photo with a frame
// to drag and its corners to pull, darker outside it, and a quarter turn. On a referee's first photo
// a faint circle in the frame shows what their picture will be. Saving sends the cropped photo in
// place of the old one; it can't be uncropped afterward.

/// A part of the photo, as fractions of its width and height once turned.
private struct Frame: Equatable {
    var x: CGFloat = 0, y: CGFloat = 0, w: CGFloat = 1, h: CGFloat = 1
}

private enum Grab { case move, nw, ne, sw, se }

private let least: CGFloat = 0.08

private func dragged(_ start: Frame, _ grab: Grab, dx: CGFloat, dy: CGFloat) -> Frame {
    if grab == .move {
        return Frame(x: min(max(start.x + dx, 0), 1 - start.w), y: min(max(start.y + dy, 0), 1 - start.h), w: start.w, h: start.h)
    }
    var f = start
    if grab == .nw || grab == .sw {
        let nx = min(max(f.x + dx, 0), f.x + f.w - least)
        f.w += f.x - nx
        f.x = nx
    } else {
        f.w = min(max(f.w + dx, least), 1 - f.x)
    }
    if grab == .nw || grab == .ne {
        let ny = min(max(f.y + dy, 0), f.y + f.h - least)
        f.h += f.y - ny
        f.y = ny
    } else {
        f.h = min(max(f.h + dy, least), 1 - f.y)
    }
    return f
}

/// The photo turned a number of quarter turns clockwise, drawn upright.
private func turned(_ image: UIImage, _ quarters: Int) -> UIImage {
    guard quarters % 4 != 0 else { return image }
    let sideways = quarters % 2 == 1
    let size = sideways ? CGSize(width: image.size.height, height: image.size.width) : image.size
    let format = UIGraphicsImageRendererFormat()
    format.scale = image.scale
    return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
        ctx.cgContext.translateBy(x: size.width / 2, y: size.height / 2)
        ctx.cgContext.rotate(by: CGFloat(quarters) * .pi / 2)
        image.draw(in: CGRect(x: -image.size.width / 2, y: -image.size.height / 2, width: image.size.width, height: image.size.height))
    }
}

struct CropPhoto: View {
    let photo: Attachment
    let circle: Bool
    let done: (Bool) -> Void
    @Environment(AppGraph.self) private var graph
    @State private var original: UIImage?
    @State private var quarters = 0
    @State private var frame = Frame()
    @State private var start: (Grab, Frame)?
    @State private var saving = false
    @State private var problem: String?

    private var shown: UIImage? { original.map { turned($0, quarters) } }
    private var unchanged: Bool { quarters == 0 && frame == Frame() }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                GeometryReader { room in
                    ZStack {
                        Color(uiColor: UIColor(hex: 0x0D100F))
                        if let image = shown {
                            let scale = min(room.size.width / image.size.width, room.size.height / image.size.height)
                            let fit = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                            ZStack(alignment: .topLeading) {
                                Image(uiImage: image).resizable().frame(width: fit.width, height: fit.height)
                                overlay(fit)
                            }
                            .frame(width: fit.width, height: fit.height)
                            .contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 1).onChanged { drag in
                                if start == nil { start = (grabAt(drag.startLocation, fit), frame) }
                                if let (grab, from) = start {
                                    frame = dragged(from, grab, dx: drag.translation.width / fit.width, dy: drag.translation.height / fit.height)
                                }
                            }.onEnded { _ in start = nil })
                            .accessibilityElement()
                            .accessibilityLabel("The part to keep: drag it, or pull its corners")
                        } else {
                            Text(problem == nil ? "Opening…" : "").foregroundStyle(.white)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 6))
                if circle {
                    Text("The circle is their picture: the middle of the photo, round.").font(.lfBodySmall).foregroundStyle(LF.muted).frame(maxWidth: .infinity, alignment: .leading)
                }
                if let problem { Text(problem).font(.lfBodyMedium).foregroundStyle(LF.redText) }
                HStack(spacing: 8) {
                    SecondaryButton("Turn", icon: .turn, enabled: shown != nil && !saving) {
                        // The frame turns with the photo.
                        frame = Frame(x: 1 - frame.y - frame.h, y: frame.x, w: frame.h, h: frame.w)
                        quarters = (quarters + 1) % 4
                    }
                    SecondaryButton("Reset", enabled: !unchanged && !saving) {
                        frame = Frame()
                        quarters = 0
                    }
                    Spacer()
                }
            }
            .padding(16)
            // On the board's near black, as Android's (IOS-13).
            .background(LF.board.ignoresSafeArea())
            .ground(.board)
            .navigationTitle("Crop photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(false) }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") { Task { await save() } }.font(.barlow(16, .bold)).disabled(unchanged || saving || shown == nil)
                }
            }
            .task {
                if let data = try? await graph.api.bytes(photo.url), let image = UIImage(data: data) {
                    original = image
                } else {
                    problem = "The photo couldn't be opened."
                }
            }
        }
    }

    private func grabAt(_ point: CGPoint, _ fit: CGSize) -> Grab {
        let corners: [(Grab, CGPoint)] = [
            (.nw, CGPoint(x: frame.x * fit.width, y: frame.y * fit.height)), (.ne, CGPoint(x: (frame.x + frame.w) * fit.width, y: frame.y * fit.height)),
            (.sw, CGPoint(x: frame.x * fit.width, y: (frame.y + frame.h) * fit.height)), (.se, CGPoint(x: (frame.x + frame.w) * fit.width, y: (frame.y + frame.h) * fit.height)),
        ]
        let nearest = corners.min { hypot($0.1.x - point.x, $0.1.y - point.y) < hypot($1.1.x - point.x, $1.1.y - point.y) }
        guard let nearest, hypot(nearest.1.x - point.x, nearest.1.y - point.y) < 30 else { return .move }
        return nearest.0
    }

    /// Darker outside the frame, the frame with its corners, and their picture's circle.
    private func overlay(_ fit: CGSize) -> some View {
        let rect = CGRect(x: frame.x * fit.width, y: frame.y * fit.height, width: frame.w * fit.width, height: frame.h * fit.height)
        return Canvas { ctx, size in
            var outside = Path(CGRect(origin: .zero, size: size))
            outside.addRect(rect)
            ctx.fill(outside, with: .color(.black.opacity(0.55)), style: FillStyle(eoFill: true))
            ctx.stroke(Path(rect), with: .color(.white), lineWidth: 2)
            let arm: CGFloat = 18
            for (cx, cy, sx, sy) in [(rect.minX, rect.minY, 1.0, 1.0), (rect.maxX, rect.minY, -1.0, 1.0), (rect.minX, rect.maxY, 1.0, -1.0), (rect.maxX, rect.maxY, -1.0, -1.0)] {
                var corner = Path()
                corner.move(to: CGPoint(x: cx + sx * arm, y: cy))
                corner.addLine(to: CGPoint(x: cx, y: cy))
                corner.addLine(to: CGPoint(x: cx, y: cy + sy * arm))
                ctx.stroke(corner, with: .color(.white), lineWidth: 4)
            }
            if circle {
                // White dashes on a soft dark edge, so it reads on a light photo or a dark one.
                let d = min(rect.width, rect.height)
                let ring = Path(ellipseIn: CGRect(x: rect.midX - d / 2, y: rect.midY - d / 2, width: d, height: d))
                ctx.stroke(ring, with: .color(.black.opacity(0.3)), lineWidth: 3)
                ctx.stroke(ring, with: .color(.white.opacity(0.9)), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
            }
        }
        .allowsHitTesting(false)
        .frame(width: fit.width, height: fit.height)
    }

    private func save() async {
        guard let whole = shown else { return }
        saving = true
        problem = nil
        let part = frame
        let made = await Task.detached { () -> (full: (data: Data, width: Int, height: Int)?, thumb: (data: Data, width: Int, height: Int)?) in
            let px = CGSize(width: whole.size.width * whole.scale, height: whole.size.height * whole.scale)
            let crop = CGRect(x: part.x * px.width, y: part.y * px.height, width: part.w * px.width, height: part.h * px.height).integral
            guard let cg = whole.cgImage?.cropping(to: crop) else { return (nil, nil) }
            let cropped = UIImage(cgImage: cg)
            return (shrink(cropped, edge: 2000, quality: 0.85), shrink(cropped, edge: 480, quality: 0.8))
        }.value
        guard let full = made.full, let thumb = made.thumb else {
            problem = "The photo couldn't be cropped."
            saving = false
            return
        }
        do {
            _ = try await graph.api.upload("/v1/attachments/\(photo.id)/file", method: "PUT", fields: [("width", "\(full.width)"), ("height", "\(full.height)")],
                                           files: [("file", "photo.jpg", "image/jpeg", full.data), ("thumb", "thumb.jpg", "image/jpeg", thumb.data)])
            done(true)
        } catch {
            problem = error.localizedDescription
            saving = false
        }
    }
}
