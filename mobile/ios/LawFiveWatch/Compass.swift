import CoreLocation
import Observation
import SwiftUI

// The kickoff direction's compass (PRE-8, WCH-10). Headings are from magnetic north, which needs no
// location permission; the arrows only compare headings from the same watch.

@MainActor
@Observable
final class Compass: NSObject, CLLocationManagerDelegate {
    /// A reading for testing on a simulator, which has no compass.
    nonisolated(unsafe) static var fake: Double?
    private(set) var heading: Double? = Compass.fake
    @ObservationIgnored private let manager = CLLocationManager()

    static var available: Bool { fake != nil || CLLocationManager.headingAvailable() }

    override init() {
        super.init()
        manager.delegate = self
    }

    func start() {
        if Compass.fake == nil && CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
    }

    func stop() {
        manager.stopUpdatingHeading()
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // Negative means no reading yet.
        let degrees = newHeading.magneticHeading
        guard degrees >= 0 else { return }
        Task { @MainActor in heading = degrees * .pi / 180 }
    }

    /// "N 12°", "SW 225°".
    static func describe(_ heading: Double) -> String {
        let degrees = (Int(heading * 180 / .pi) % 360 + 360) % 360
        return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][((degrees + 22) % 360) / 45] + " \(degrees)°"
    }
}

/// An arrow turned `angle` radians clockwise from straight up, in the frame it's given.
struct DirectionArrow: View {
    let angle: Double
    let color: Color

    var body: some View {
        Canvas { c, size in
            let a = min(size.width, size.height) / 2
            let m = CGPoint(x: size.width / 2, y: size.height / 2)
            var path = Path()
            path.addLines([(0, -1), (0.6, -0.1), (0.22, -0.15), (0.22, 1), (-0.22, 1), (-0.22, -0.15), (-0.6, -0.1)].map { CGPoint(x: m.x + $0.0 * a, y: m.y + $0.1 * a) })
            path.closeSubpath()
            c.fill(path, with: .color(color))
        }
        .rotationEffect(.radians(angle))
    }
}

/// PRE-8: what you see when you do this right: the goal ahead, your arm in front of you with the
/// watch on it, and a line from its 12 o'clock to the goal, the same on every watch. In units of a
/// 416-pixel-tall screen.
struct DirectionPicture: View {
    let on: Bool
    let kit: Color?

    var body: some View {
        Canvas { g, size in
            let u = size.height / 416
            let c = size.width / 2
            let goalLine = 154 * u
            let wrist = size.height * 0.565
            let radius = 25 * u
            let ink = on ? Color.white : Color(white: 0.467)
            func polygon(_ points: [(CGFloat, CGFloat)]) -> Path {
                var p = Path()
                p.addLines(points.map { CGPoint(x: c + $0.0 * u, y: $0.1) })
                p.closeSubpath()
                return p
            }
            func line(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat, _ color: Color, _ width: CGFloat) {
                var p = Path()
                p.move(to: CGPoint(x: c + x1 * u, y: y1))
                p.addLine(to: CGPoint(x: c + x2 * u, y: y2))
                g.stroke(p, with: .color(color), lineWidth: width * u)
            }
            // The pitch running away from you, with the goal line and six-yard box.
            g.fill(polygon([(-75, goalLine), (75, goalLine), (300, wrist + 60 * u), (-300, wrist + 60 * u)]), with: .color(Color(red: 0x12 / 255, green: 0x40 / 255, blue: 0x2C / 255)))
            line(-75, goalLine, 75, goalLine, .white, 2)
            line(-48, goalLine, -66, goalLine + 16 * u, .white.opacity(0.7), 2)
            line(-66, goalLine + 16 * u, 66, goalLine + 16 * u, .white.opacity(0.7), 2)
            line(66, goalLine + 16 * u, 48, goalLine, .white.opacity(0.7), 2)
            // The goal, its net in the kit's color.
            let top = goalLine - 26 * u
            let net = kit ?? .white
            for x in [CGFloat(-18), 0, 18] { line(x, top, x, goalLine, net, 1.5) }
            line(-36, goalLine - 13 * u, 36, goalLine - 13 * u, net, 1.5)
            line(-36, goalLine, -36, top, .white, 4)
            line(-36, top, 36, top, .white, 4)
            line(36, top, 36, goalLine, .white, 4)
            // The line from 12 o'clock to the goal.
            var dashed = Path()
            dashed.move(to: CGPoint(x: c, y: wrist - radius - 6 * u))
            dashed.addLine(to: CGPoint(x: c, y: goalLine + 32 * u))
            g.stroke(dashed, with: .color(ink), style: StrokeStyle(lineWidth: 3 * u, dash: [6 * u, 5 * u]))
            let tip = goalLine + 20 * u
            g.fill(polygon([(0, tip), (11, tip + 16 * u), (-11, tip + 16 * u)]), with: .color(ink))
            // The arm, the hand and the strap.
            let skin = Color(red: 0x9A / 255, green: 0xA0 / 255, blue: 0x9C / 255)
            g.fill(polygon([(-240, wrist - 30 * u), (34, wrist - 17 * u), (34, wrist + 17 * u), (-240, wrist + 34 * u)]), with: .color(skin))
            g.fill(Path(roundedRect: CGRect(x: c + 28 * u, y: wrist - 20 * u, width: 50 * u, height: 40 * u), cornerRadius: 17 * u), with: .color(skin))
            g.fill(Path(CGRect(x: c - 15 * u, y: wrist - 24 * u, width: 30 * u, height: 48 * u)), with: .color(Color(white: 0.17)))
            // The watch.
            let face = Path(ellipseIn: CGRect(x: c - radius, y: wrist - radius, width: 2 * radius, height: 2 * radius))
            g.fill(face, with: .color(.black))
            g.stroke(face, with: .color(ink), lineWidth: 3 * u)
            var hand = Path()
            hand.move(to: CGPoint(x: c, y: wrist - radius + 3 * u))
            hand.addLine(to: CGPoint(x: c, y: wrist - radius * 0.35))
            g.stroke(hand, with: .color(ink), lineWidth: 3 * u)
        }
    }
}

/// PRE-8: "Face the goal HOM attacks", with what that looks like, the live reading and Save.
struct DirectionScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let done: () -> Void
    @State private var compass = Compass()

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let w = size.width
            // A dark kit wouldn't show on the black screen.
            let color = match.teamColor(match.firstKickoff)
            let kit = color >= 0 && ((color >> 16) & 0xFF) + ((color >> 8) & 0xFF) + (color & 0xFF) > 120 ? teamColor(color) : nil
            ZStack {
                DirectionPicture(on: compass.heading != nil, kit: kit).frame(width: size.width, height: size.height)
                Text("Face the goal").font(.barlow(w * 0.085, .semibold)).foregroundStyle(C.text).lineLimit(1).minimumScaleFactor(0.8).at(0.5, 0.125, size)
                Text("\(match.teamName(match.firstKickoff)) attacks").font(.barlow(w * 0.085, .bold)).foregroundStyle(kit ?? C.text).lineLimit(1).minimumScaleFactor(0.8).at(0.5, 0.235, size)
                Text(compass.heading.map(Compass.describe) ?? "No compass reading").font(.barlow(w * 0.065)).foregroundStyle(compass.heading != nil ? C.text : C.dim).at(0.5, 0.668, size)
                if let heading = compass.heading {
                    PillButton(label: "Save", width: w * 0.5) {
                        state.changeMatch { $0.setKickoffHeading(heading) }
                        done()
                    }
                    .frame(width: w * 0.5)
                    .at(0.5, 0.9, size)
                } else {
                    Text("Swipe right to skip").font(.barlow(w * 0.06, .regular)).foregroundStyle(C.dim).at(0.5, 0.9, size)
                }
            }
        }
        .onAppear { compass.start() }
        .onDisappear { compass.stop() }
    }
}

/// PRE-8: an arrow towards the goal the next period's kickoff team attacks, turning with the watch.
struct KickoffArrow: View {
    let match: Match
    let target: Double
    let size: CGSize
    @State private var compass = Compass()

    var body: some View {
        let team = match.kickoffFor(match.period + 1)
        // In the kit's color, as on Garmin and Wear OS; white when there's none or it wouldn't show on black.
        let color = match.teamColor(team)
        let arrow = color >= 0 && !needsOutline(color) ? teamColor(color) ?? .white : .white
        ZStack {
            if let heading = compass.heading {
                DirectionArrow(angle: target - heading, color: arrow)
                    .frame(width: size.width * 0.11, height: size.width * 0.11)
                    .at(0.5, 0.84, size)
                Text("\(match.teamName(team)) attacks").font(.barlow(size.width * 0.055, .regular)).foregroundStyle(C.dim).at(0.5, 0.95, size)
            } else {
                Text("No compass reading").font(.barlow(size.width * 0.055, .regular)).foregroundStyle(C.dim).at(0.5, 0.86, size)
            }
        }
        .onAppear { compass.start() }
        .onDisappear { compass.stop() }
    }
}
