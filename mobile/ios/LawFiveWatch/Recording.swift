import CoreLocation
import Foundation
import HealthKit

// WCH-7: the match as an Apple Watch workout, soccer and outdoors. The workout session keeps the app
// running with the screen off for the whole match (WCH-5), with no hour's limit as the extended runtime
// session had (R-16), and gives the heart rate and the distance; the location comes from Core Location.
// Paused between periods (ACT-2), saved to Apple Health at full time unless that's switched off (ACT-4),
// and dropped with a canceled match. ACT-5: from the match's setup it's prepared, and Core Location started,
// so the heart rate and the position are there at the first kickoff.

/// ACT-5: a position within this, Garmin's "usable" (as Mark pitch's, TRK-13), says GPS ready.
let gpsUsableMeters = 25.0

@MainActor
final class Workout: NSObject {
    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var route: HKWorkoutRouteBuilder?
    private let locations = CLLocationManager()
    /// The latest reading, while a period is played.
    private(set) var heartRate: Int?
    private(set) var location: CLLocation?
    /// ACT-5: between warmUp and the first kickoff, or a cancel; when the location's began, as a fix from
    /// before then may be from somewhere else; and asking watchOS for a session left from before.
    private var warming = false
    private var warmedSince: Date?
    private var recovering = false

    /// What it asks Apple Health for: to save the workout, its route and what was measured, and to read
    /// the heart rate and distance as the match goes.
    private let shared: Set<HKSampleType> = [.workoutType(), HKSeriesType.workoutRoute(), HKQuantityType(.heartRate),
                                             HKQuantityType(.activeEnergyBurned), HKQuantityType(.distanceWalkingRunning)]
    private let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned), HKQuantityType(.distanceWalkingRunning)]

    /// Apple Health said no to workouts, so nothing keeps the match running with the screen off.
    var refused: Bool { HKHealthStore.isHealthDataAvailable() && store.authorizationStatus(for: .workoutType()) == .sharingDenied }

    /// The location is allowed but only approximately, a few kilometers out, which no track can use.
    var approximate: Bool {
        locations.authorizationStatus == .authorizedWhenInUse && locations.accuracyAuthorization == .reducedAccuracy
    }

    /// ACT-5: the location allowed, precisely, so a track gets positions.
    var locationPrecise: Bool {
        [.authorizedWhenInUse, .authorizedAlways].contains(locations.authorizationStatus) && locations.accuracyAuthorization == .fullAccuracy
    }

    /// ACT-5: since the warm-up began (or just before, as the first fix can be), a position accurate enough to use,
    /// and the latest still is. watchOS sends nothing new while the watch stands still, so the last fix stands until
    /// another comes.
    var gpsReady: Bool {
        guard let location, let warmedSince, location.timestamp >= warmedSince.addingTimeInterval(-10) else { return false }
        return location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= gpsUsableMeters
    }

    /// The location hasn't been asked about yet, or the answer hasn't come.
    var locationUndecided: Bool { locations.authorizationStatus == .notDetermined }
    /// No location for LawFive: no track. The kickoff direction's compass reads the magnetic heading, which needs none.
    var locationRefused: Bool { [.denied, .restricted].contains(locations.authorizationStatus) }

    /// At first launch, after LawFive's own screen says why (AppState.askPermissions): Apple Health's
    /// question, then the location's once it's answered, so they don't pile up and neither comes
    /// between Start match and the kickoff. Later calls ask nothing.
    func ask() async {
        if HKHealthStore.isHealthDataAvailable() { try? await store.requestAuthorization(toShare: shared, read: read) }
        if locations.authorizationStatus == .notDetermined { locations.requestWhenInUseAuthorization() }
    }

    /// ACT-5: a match set up, before its first kickoff. The workout session is prepared, so watchOS warms up its
    /// sensors, and with `track`, Core Location starts. A
    /// session left by an app that went away mid-setup is ended and a fresh one prepared, as watchOS discards the
    /// builder of a session recovered before it started. Called again as the setup changes, it does nothing more.
    func warmUp(track: Bool) {
        warming = true
        if track, warmedSince == nil {
            warmedSince = Date()
            startLocations()
        }
        guard session == nil, !recovering, HKHealthStore.isHealthDataAvailable(), !refused else { return }
        recovering = true
        store.recoverActiveWorkoutSession { recovered, _ in
            Task { @MainActor in
                self.recovering = false
                recovered?.end()
                // Unless kickoff or a cancel came first.
                guard self.session == nil, self.warming else { return }
                self.makeSession()?.prepare()
            }
        }
    }

    /// A period is being played: the workout starts (from its warm-up, ACT-5), or carries on after a break.
    func run() {
        warming = false
        startLocations()
        if session?.state == .ended { drop() }
        if session == nil, HKHealthStore.isHealthDataAvailable() { makeSession() }
        guard let session, let builder else { return }
        switch session.state {
        case .notStarted, .prepared:
            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { _, _ in }
        case .paused:
            session.resume()
        default:
            break
        }
    }

    /// A new soccer workout, outdoors, not started.
    @discardableResult
    private func makeSession() -> HKWorkoutSession? {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .soccer
        configuration.locationType = .outdoor
        guard let new = try? HKWorkoutSession(healthStore: store, configuration: configuration) else { return nil }
        let builder = new.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
        attach(new, builder)
        return new
    }

    /// The app started again mid-match (R-5): the workout watchOS kept going is picked up again, and kept paused
    /// when the match is between periods or suspended (ACT-2, TMR-13).
    func recover(paused: Bool) {
        startLocations()
        guard session == nil, HKHealthStore.isHealthDataAvailable() else { return }
        store.recoverActiveWorkoutSession { recovered, _ in
            Task { @MainActor in
                guard let recovered, self.session == nil else { return }
                self.attach(recovered, recovered.associatedWorkoutBuilder())
                if paused { self.pause() }
            }
        }
    }

    /// Between periods (ACT-2): the workout stays open, so the app keeps running for the break's alerts.
    func pause() {
        if session?.state == .running { session?.pause() }
        heartRate = nil
    }

    /// SYNC-7: how far the referee has run, in meters, from the watch's own measure.
    var distance: Double? {
        builder?.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .meter())
    }

    /// Full time saves the workout to Apple Health, with its route, unless `save` is off; a canceled
    /// match drops it, and one canceled before its kickoff ends its warm-up (ACT-5).
    func finish(save: Bool) {
        locations.stopUpdatingLocation()
        location = nil
        heartRate = nil
        warmedSince = nil
        warming = false
        guard let session, let builder else { return }
        let route = self.route
        drop()
        session.end()
        // Only prepared: nothing was collected.
        guard session.startDate != nil else { return }
        builder.endCollection(withEnd: Date()) { _, _ in
            if !save {
                builder.discardWorkout()
                return
            }
            builder.finishWorkout { workout, _ in
                if let workout, let route { route.finishRoute(with: workout, metadata: nil) { _, _ in } }
            }
        }
    }

    private func drop() {
        session = nil
        builder = nil
        route = nil
    }

    private func attach(_ session: HKWorkoutSession, _ builder: HKLiveWorkoutBuilder) {
        session.delegate = self
        builder.delegate = self
        self.session = session
        self.builder = builder
        route = HKWorkoutRouteBuilder(healthStore: store, device: nil)
    }

    private func startLocations() {
        locations.delegate = self
        locations.desiredAccuracy = kCLLocationAccuracyBest
        locations.activityType = .fitness
        locations.startUpdatingLocation()
    }

    private func received(_ fixes: [CLLocation]) {
        guard let last = fixes.last else { return }
        location = last
        // Fitness draws the route from the fixes taken while playing.
        let good = fixes.filter { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= 50 }
        if session?.state == .running, !good.isEmpty { route?.insertRouteData(good) { _, _ in } }
    }

    private func measured(_ heartRate: Int) {
        if session?.state == .running { self.heartRate = heartRate }
    }
}

extension Workout: HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate, CLLocationManagerDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let type = HKQuantityType(.heartRate)
        guard collectedTypes.contains(type),
              let quantity = workoutBuilder.statistics(for: type)?.mostRecentQuantity() else { return }
        let bpm = Int(quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())).rounded())
        Task { @MainActor in self.measured(bpm) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in self.received(locations) }
    }
}

/// TRK-7: the referee's GPS and heart rate about once a second during the periods, packed as the Garmin
/// watch packs them (TrackPacking.swift) and kept as files, a chunk each, until the server has them. The
/// chunk being filled is saved every 30 samples, so a restarted app loses at most that.
@MainActor
final class TrackLog {
    private struct Current: Codable {
        var created: Int64
        var start: Int64
        var chunks = 0
        var chunk = TrackChunk()
    }

    private let folder = URL.documentsDirectory.appending(path: "tracks")
    private var current: Current?
    private var lastFix: Date?

    private var stateFile: URL { folder.appending(path: "current.json") }

    private func chunkFile(_ created: Int64, _ index: Int) -> URL { folder.appending(path: "\(created)-\(index).txt") }

    /// Starts the track at the match's kickoff, or picks it up after the app started again.
    func begin(_ created: Int64, now: Int64) {
        if resume(created) { return }
        current = Current(created: created, start: now / 1000)
        save()
    }

    @discardableResult
    private func resume(_ created: Int64) -> Bool {
        if current?.created == created { return true }
        guard let data = try? Data(contentsOf: stateFile), let saved = try? JSONDecoder().decode(Current.self, from: data), saved.created == created else { return false }
        current = saved
        return true
    }

    /// Once a second while a period is played. Whether it had a GPS fix, for the match's diagnostics
    /// (DIAG-1); nil when it took no sample.
    func sample(_ created: Int64, now: Int64, location: CLLocation?, heartRate: Int?) -> Bool? {
        guard resume(created), var track = current else { return nil }
        var lat: Int?, lon: Int?, speed: Int?
        if let location, location.horizontalAccuracy >= 0, location.horizontalAccuracy <= 65, location.timestamp != lastFix {
            lat = Int((location.coordinate.latitude * 1_000_000).rounded())
            lon = Int((location.coordinate.longitude * 1_000_000).rounded())
            speed = location.speed >= 0 ? Int((location.speed * 100).rounded()) : nil
            lastFix = location.timestamp
        }
        let tDs = Int((now - track.start * 1000) / 100)
        guard track.chunk.add(tDs: tDs, lat: lat, lon: lon, speed: speed, hr: heartRate) else { return lat != nil }
        current = track
        if track.chunk.isFull {
            writeChunk()
        } else if track.chunk.count % 30 == 0 {
            save()
        }
        return lat != nil
    }

    /// Full time: the last chunk is written, and the track is what's to send.
    func finish(_ created: Int64) -> TrackUpload? {
        guard resume(created) else { return nil }
        writeChunk()
        guard let track = current else { return nil }
        current = nil
        try? FileManager.default.removeItem(at: stateFile)
        return track.chunks > 0 ? TrackUpload(created: created, start: track.start, count: track.chunks) : nil
    }

    /// A canceled match: its track goes too.
    func discard(_ created: Int64) {
        guard resume(created), let track = current else { return }
        delete(created, from: 0, to: track.chunks)
        current = nil
        try? FileManager.default.removeItem(at: stateFile)
    }

    func chunk(_ created: Int64, _ index: Int) -> String? { try? String(contentsOf: chunkFile(created, index), encoding: .utf8) }

    func delete(_ created: Int64, from: Int, to: Int) {
        for index in from..<max(from, to) { try? FileManager.default.removeItem(at: chunkFile(created, index)) }
    }

    /// DATA-8: every track on the watch.
    func eraseAll() {
        current = nil
        try? FileManager.default.removeItem(at: folder)
    }

    private func writeChunk() {
        guard var track = current, track.chunk.count > 0 else { return }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        guard (try? track.chunk.text.write(to: chunkFile(track.created, track.chunks), atomically: true, encoding: .utf8)) != nil else { return }
        track.chunks += 1
        track.chunk = TrackChunk()
        current = track
        save()
    }

    private func save() {
        guard let current, let data = try? JSONEncoder().encode(current) else { return }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? data.write(to: stateFile, options: .atomic)
    }
}
