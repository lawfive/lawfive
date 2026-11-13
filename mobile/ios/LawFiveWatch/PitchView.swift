import CoreLocation
import SwiftUI
import WatchKit

// TRK-13: walk to each corner and tap; a few seconds of GPS there are averaged into it. Two to four
// corners, in any order: after the second, leaving saves them, and the fourth saves them straight away.
// They go to LawFive at the next sync (SYNC-12), as on Garmin (Pitch.mc).

/// How long each corner's position is averaged over, as on Garmin, and the fixes used: within 25 m
/// (Garmin's "usable"), and within 10 m it says good.
private let averageSeconds = 5.0
private let usableMeters = 25.0
private let goodMeters = 10.0

@MainActor @Observable
final class PitchLocator: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private(set) var accuracy: Double?
    private(set) var allowed = true
    private var sum = (0.0, 0.0)
    /// When the page opened: a fix from before then may be from somewhere else.
    private var since = Date()
    private var count = 0
    var sampling = false

    func start() {
        since = Date()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        allowed = manager.authorizationStatus != .denied && manager.authorizationStatus != .restricted
        manager.startUpdatingLocation()
    }

    func stop() { manager.stopUpdatingLocation() }

    func beginSample() {
        sum = (0, 0)
        count = 0
        sampling = true
    }

    /// The position is also read once a second while averaging, as watchOS sends nothing new while
    /// standing still on a corner (Garmin does the same): the last fix is where the referee stopped.
    func poll() {
        if let fix = manager.location, fix.timestamp >= since { received(fix) }
    }

    /// The averaged position, [latitude, longitude], or nil without a usable fix.
    func endSample() -> [Double]? {
        sampling = false
        return count > 0 ? [sum.0 / Double(count), sum.1 / Double(count)] : nil
    }

    private func received(_ fix: CLLocation) {
        guard fix.horizontalAccuracy >= 0 else { return }
        accuracy = fix.horizontalAccuracy
        if sampling, fix.horizontalAccuracy <= usableMeters {
            sum.0 += fix.coordinate.latitude
            sum.1 += fix.coordinate.longitude
            count += 1
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        Task { @MainActor in self.received(last) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in self.allowed = status != .denied && status != .restricted }
    }
}

struct PitchView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let matchId: String?
    let created: Int64?
    @State private var locator = PitchLocator()
    @State private var corners: [[Double]] = []
    @State private var message: String?
    @State private var saved = false

    private func save() {
        guard !saved else { return }
        saved = true
        state.queuePitch(matchId: matchId, created: created, corners: corners)
    }

    private func mark() {
        guard !locator.sampling, corners.count < 4 else { return }
        guard locator.allowed else { return }
        guard let accuracy = locator.accuracy, accuracy <= usableMeters else {
            message = "Waiting for GPS"
            return
        }
        message = nil
        locator.beginSample()
        Task {
            for _ in 0..<Int(averageSeconds) {
                locator.poll()
                try? await Task.sleep(for: .seconds(1))
            }
            guard let corner = locator.endSample() else {
                message = "No GPS fix: try again"
                return
            }
            corners.append(corner)
            WKInterfaceDevice.current().play(.click)
            if corners.count >= 4 {
                save()
                dismiss()
            }
        }
    }

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let w = size.width
            let done = corners.count
            let accuracy = locator.accuracy
            ZStack {
                Text(done >= 4 ? "Pitch marked" : "Corner \(done + 1)").font(.barlow(w * 0.09, .semibold)).foregroundStyle(C.text).at(0.5, 0.08, size)
                // A small pitch with its corners: the marked ones filled in green.
                Canvas { context, area in
                    let rect = CGRect(origin: .zero, size: area).insetBy(dx: 7, dy: 7)
                    context.stroke(Path(rect), with: .color(C.dim), lineWidth: 2)
                    context.stroke(Path { p in p.move(to: CGPoint(x: rect.midX, y: rect.minY)); p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY)) }, with: .color(C.dim), lineWidth: 2)
                    let spots = [CGPoint(x: rect.minX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY)]
                    for (i, spot) in spots.enumerated() {
                        let r: CGFloat = i < done ? 7 : 5
                        let color = i < done ? C.start : i == done && locator.sampling ? Color.white : C.rule
                        context.fill(Path(ellipseIn: CGRect(x: spot.x - r, y: spot.y - r, width: r * 2, height: r * 2)), with: .color(color))
                    }
                }
                .frame(width: w * 0.42, height: w * 0.42 * 0.62 + 14).at(0.5, 0.39, size)
                Text(message ?? (!locator.allowed ? "Allow location for LawFive in Settings" : locator.sampling ? "Hold still…" : "Stand on a corner, then tap"))
                    .font(.barlow(w * 0.065)).foregroundStyle(C.text).multilineTextAlignment(.center).frame(width: w * 0.86).at(0.5, 0.65, size)
                Text(accuracy == nil ? "Finding GPS…" : accuracy! <= goodMeters ? "GPS good" : accuracy! <= usableMeters ? "GPS usable" : "GPS poor")
                    .font(.barlow(w * 0.065)).foregroundStyle(accuracy.map { $0 <= goodMeters ? C.start : $0 <= usableMeters ? C.yellow : C.dim } ?? C.dim).at(0.5, 0.78, size)
                Text(done >= 2 ? "Back saves \(done) corners" : "Back to leave").font(.barlow(w * 0.06)).foregroundStyle(C.dim).at(0.5, 0.9, size)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { mark() }
        .onAppear { locator.start() }
        // However it's left, two or more corners are kept.
        .onDisappear {
            locator.stop()
            save()
        }
    }
}
