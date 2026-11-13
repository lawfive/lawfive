import SwiftUI

// Did you know (TIP-1): now and then, one tip on the Matches page.

/// TIP-2: rolled once each time the app is opened, and kept, so a tip doesn't come and go as pages change.
@MainActor
private enum ThisOpening {
    static var rolled = false
    static var tip: Tip?
}

struct DidYouKnow: View {
    let played: Int
    @Environment(AppGraph.self) private var graph
    @State private var open = false

    private var tip: Tip? {
        if !ThisOpening.rolled {
            ThisOpening.rolled = true
            ThisOpening.tip = chooseTip(done: graph.session.tipsDone, played: played)
        }
        return ThisOpening.tip.flatMap { graph.session.tipsDone.contains($0.id) ? nil : $0 }
    }

    var body: some View {
        if let tip {
            LfCard(padding: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    TipHead(tip: tip)
                    Text(tip.body).font(.lfBodyMedium).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Spacer()
                        SecondaryButton("Got it") { withAnimation { graph.session.tipDone(tip.id) } }
                        SecondaryButton("Show me") { open = true }
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.bottom, 14)
            .sheet(isPresented: $open) {
                VStack(alignment: .leading, spacing: 14) {
                    TipHead(tip: tip)
                    ForEach(Array(tip.steps.enumerated()), id: \.offset) { i, step in
                        HStack(alignment: .top, spacing: 12) {
                            ZStack {
                                Circle().fill(LF.brandSoft)
                                Text("\(i + 1)").font(.display(16)).foregroundStyle(LF.brandStrong)
                            }
                            .frame(width: 28, height: 28)
                            Text(step).font(.lfBodyMedium).foregroundStyle(LF.text).padding(.top, 3).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if let note = tip.note { Text(note).font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true) }
                    PrimaryButton("Got it", wide: true) {
                        open = false
                        graph.session.tipDone(tip.id)
                    }
                }
                .padding(.horizontal, 20).padding(.top, 28).padding(.bottom, 12)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(LF.surface)
            }
        }
    }
}

private struct TipHead: View {
    let tip: Tip

    var body: some View {
        HStack(spacing: 14) {
            TipPicture(art: tip.art, size: 56)
            VStack(alignment: .leading, spacing: 1) {
                Text("DID YOU KNOW").font(.barlow(12, .bold, relativeTo: .caption)).tracking(1.2).foregroundStyle(LF.brandStrong)
                Text(tip.title).font(.barlow(16, .bold, relativeTo: .headline)).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// A tip's picture: pitch markings, the watch's coin or two cards where it has its own, else a Phosphor icon.
private struct TipPicture: View {
    let art: TipArt
    let size: CGFloat

    private var icon: Ph? {
        switch art {
        case .undo: return .undo
        case .money: return .money
        case .report: return .report
        case .calendar: return .calendar
        case .play: return .play
        case .bellOff: return .bellOff
        default: return nil
        }
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6).fill(LF.brandSoft)
            if let icon {
                PhIcon(icon, size: size * 0.5, tint: LF.brandStrong)
            } else {
                Canvas { c, canvas in
                    let u = canvas.width / 64
                    let strong = GraphicsContext.Shading.color(LF.brandStrong)
                    let faint = GraphicsContext.Shading.color(LF.brandStrong.opacity(0.55))
                    func dot(_ x: Double, _ y: Double, _ r: Double) -> Path { Path(ellipseIn: CGRect(x: (x - r) * u, y: (y - r) * u, width: 2 * r * u, height: 2 * r * u)) }
                    func pitch(_ x: Double, _ width: Double) {
                        c.stroke(Path(roundedRect: CGRect(x: x * u, y: 15 * u, width: width * u, height: 34 * u), cornerRadius: 1.5 * u), with: faint, lineWidth: 1.5 * u)
                    }
                    func line(_ a: CGPoint, _ b: CGPoint, _ shading: GraphicsContext.Shading, _ width: Double) {
                        c.stroke(Path { $0.move(to: CGPoint(x: a.x * u, y: a.y * u)); $0.addLine(to: CGPoint(x: b.x * u, y: b.y * u)) }, with: shading, style: StrokeStyle(lineWidth: width * u, lineCap: .round))
                    }
                    switch art {
                    case .corners:
                        pitch(11, 42)
                        line(CGPoint(x: 32, y: 15), CGPoint(x: 32, y: 49), faint, 1.5)
                        c.stroke(dot(32, 32, 6), with: faint, lineWidth: 1.5 * u)
                        for (x, y) in [(11.0, 15.0), (53, 15), (53, 49)] { c.fill(dot(x, y, 4.5), with: strong) }
                        c.stroke(dot(11, 49, 4.5), with: strong, style: StrokeStyle(lineWidth: 2 * u, dash: [2.5 * u, 2 * u]))
                    case .direction:
                        pitch(9, 46)
                        line(CGPoint(x: 32, y: 15), CGPoint(x: 32, y: 49), faint, 1.5)
                        c.fill(dot(32, 32, 2.6), with: strong)
                        line(CGPoint(x: 32, y: 32), CGPoint(x: 49, y: 32), strong, 3)
                        line(CGPoint(x: 43.5, y: 26.5), CGPoint(x: 49.5, y: 32), strong, 3)
                        line(CGPoint(x: 43.5, y: 37.5), CGPoint(x: 49.5, y: 32), strong, 3)
                    case .cards:
                        for (x, y, angle) in [(19.0, 17.0, -12.0), (27, 19, 8)] {
                            var turned = c
                            let center = CGPoint(x: (x + 10) * u, y: (y + 14) * u)
                            turned.translateBy(x: center.x, y: center.y)
                            turned.rotate(by: .degrees(angle))
                            turned.fill(Path(roundedRect: CGRect(x: -10 * u, y: -14 * u, width: 20 * u, height: 28 * u), cornerRadius: 2.5 * u), with: .color(LF.yellow))
                        }
                    default:
                        c.fill(dot(32, 32, 20), with: .color(LF.coin))
                        c.stroke(dot(32, 32, 16), with: .color(LF.coinEdge), lineWidth: 1.2 * u)
                    }
                }
                if art == .coin {
                    Text("H").font(.display(size * 0.39)).foregroundStyle(LF.coinInk)
                }
            }
        }
        .frame(width: size, height: size)
    }
}
