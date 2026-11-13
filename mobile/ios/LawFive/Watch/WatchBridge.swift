import ConnectIQ
import Foundation
import Observation
import UIKit

// The Garmin watch through the phone (IOS-9), Connect IQ's side: Garmin's companion SDK talks to the
// watch over Bluetooth directly, once Garmin Connect has told it which watches the person chose to
// share, and hands over the LawFive watch app's messages; WatchRelay answers them, and the answers go
// back the same way. Unlike Android, iOS can't start the app for a message unless iOS itself wakes
// it for Bluetooth, so the watch goes straight to the server when the phone doesn't answer, as always.

/// A watch shared with this phone, for Link a watch; `hasLawFive` is nil until it says.
struct PhoneWatch: Identifiable, Equatable {
    let id: UUID
    let name: String
    var connected: Bool
    let partNumber: String?
    var hasLawFive: Bool?
}

/// The watch app's id (watch-garmin/manifest.xml).
private let watchAppId = UUID(uuidString: "96dae5fe-5bf3-4b69-97ef-bd34ec61f984")!
/// The URL scheme Garmin Connect returns to with the watches chosen (in Info.plist).
let garminReturnScheme = "lawfive-ciq"

/// Requests with the watch's token and device header, as the watch would make them itself.
private struct HttpTransport: WatchTransport {
    func send(server: String, method: String, path: String, body: JSONValue?, token: String, device: String) async -> (Int, JSONValue?)? {
        var base = server
        while base.hasSuffix("/") { base.removeLast() }
        guard var parts = URLComponents(string: base + path) else { return (404, nil) }
        if method == "GET", case .object(let query)? = body {
            parts.queryItems = query.map { key, value in
                URLQueryItem(name: key, value: value.string ?? value.intValue.map(String.init) ?? value.text)
            }
        }
        guard let url = parts.url else { return (404, nil) }
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(device, forHTTPHeaderField: "X-LawFive-Device")
        if method != "GET" {
            request.httpBody = try? jsonEncoder.encode(body ?? .object([:]))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        guard let (data, response) = try? await URLSession.shared.data(for: request), let http = response as? HTTPURLResponse else { return nil }
        // APP-23: a proxy's answer is no answer, so what the watch sent is kept for later.
        if !(200..<300).contains(http.statusCode) && !ServerError.isLawFive(http, data) { return nil }
        return (http.statusCode, data.isEmpty ? nil : try? jsonDecoder.decode(JSONValue.self, from: data))
    }
}

@MainActor
@Observable
final class WatchBridge: NSObject {
    let relay: WatchRelay
    let linker: WatchLinker
    private(set) var watches: [PhoneWatch] = []
    /// The person hasn't got Garmin Connect, which is how watches are shared with this app.
    var needsGarminConnect = false
    /// Garmin's SDK is running (see `start()`).
    private(set) var sdkStarted = false

    @ObservationIgnored private var devices: [UUID: IQDevice] = [:]
    @ObservationIgnored private var inbox: Task<Void, Never>?
    /// Messages answered in the last few seconds, as the watch tries again.
    @ObservationIgnored private var recent: [String: Date] = [:]
    static let savedKey = "garminWatches"
    private static let duplicateSeconds: TimeInterval = 5

    init(api: Api, account: @escaping () -> (server: String, name: String)?) {
        let dir = URL.applicationSupportDirectory
        relay = WatchRelay(file: dir.appending(path: "watch-relay.json"), transport: HttpTransport(), phoneServer: { account()?.server })
        var sendTo: (UUID, JSONValue) -> Void = { _, _ in }
        var openOn: (UUID) -> Void = { _ in }
        linker = WatchLinker(api: api, account: account, send: { sendTo($0, $1) }, open: { openOn($0) })
        super.init()
        sendTo = { [weak self] id, message in self?.reply(id, message) }
        openOn = { [weak self] id in self?.openOnWatch(id) }
    }

    /// At launch, only for someone who has shared a watch: Garmin's SDK uses Bluetooth, which can
    /// ask for permission, and that shouldn't reach anyone without a Garmin.
    func start() {
        let saved = savedDevices()
        guard !saved.isEmpty else { return }
        startSDK()
        use(saved)
    }

    private func startSDK() {
        guard !sdkStarted else { return }
        sdkStarted = true
        // With a restoration identifier, iOS can wake the app for Bluetooth activity from the watch.
        ConnectIQ.sharedInstance().initialize(withUrlScheme: garminReturnScheme, uiOverrideDelegate: self, stateRestorationIdentifier: "app.lawfive.garmin")
    }

    /// Opens Garmin Connect to choose which watches to share; it comes back through `handle(url:)`.
    func chooseWatches() {
        startSDK()
        ConnectIQ.sharedInstance().showDeviceSelection()
    }

    /// Garmin Connect coming back with the watches chosen. False when the address isn't its.
    func handle(url: URL) -> Bool {
        guard url.scheme == garminReturnScheme else { return false }
        startSDK()
        let chosen = ConnectIQ.sharedInstance().parseDeviceSelectionResponse(from: url) as? [IQDevice] ?? []
        // Always only the latest list the person allowed.
        ConnectIQ.sharedInstance().unregister(forAllDeviceEvents: self)
        ConnectIQ.sharedInstance().unregister(forAllAppMessages: self)
        save(chosen)
        use(chosen)
        return true
    }

    /// Only what's shared with this app: the SDK can't list them again without opening Garmin Connect.
    private func save(_ list: [IQDevice]) {
        let data = try? NSKeyedArchiver.archivedData(withRootObject: list, requiringSecureCoding: true)
        UserDefaults.standard.set(data, forKey: WatchBridge.savedKey)
    }

    private func savedDevices() -> [IQDevice] {
        guard let data = UserDefaults.standard.data(forKey: WatchBridge.savedKey) else { return [] }
        return (try? NSKeyedUnarchiver.unarchivedObject(ofClasses: [NSArray.self, IQDevice.self, NSUUID.self, NSString.self], from: data)) as? [IQDevice] ?? []
    }

    private func use(_ list: [IQDevice]) {
        devices = Dictionary(list.compactMap { d in d.uuid.map { ($0, d) } }, uniquingKeysWith: { _, b in b })
        let iq = ConnectIQ.sharedInstance()
        watches = list.map { device in
            iq?.register(forDeviceEvents: device, delegate: self)
            iq?.register(forAppMessages: app(device), delegate: self)
            return PhoneWatch(id: device.uuid!, name: device.friendlyName ?? device.modelName ?? "Garmin watch", connected: iq?.getDeviceStatus(device) == .connected, partNumber: device.partNumber, hasLawFive: nil)
        }
        refreshApps()
    }

    private func app(_ device: IQDevice) -> IQApp {
        IQApp(uuid: watchAppId, store: watchAppId, device: device)
    }

    /// Asks each connected watch whether LawFive is on it.
    func refreshApps() {
        for device in devices.values where ConnectIQ.sharedInstance().getDeviceStatus(device) == .connected {
            let id = device.uuid!
            ConnectIQ.sharedInstance().getAppStatus(app(device)) { [weak self] status in
                let installed = status?.isInstalled
                Task { @MainActor in self?.setHasLawFive(id, installed) }
            }
        }
    }

    private func setHasLawFive(_ id: UUID, _ yes: Bool?) {
        guard let i = watches.firstIndex(where: { $0.id == id }) else { return }
        watches[i].hasLawFive = yes
    }

    private func setConnected(_ id: UUID, _ yes: Bool) {
        guard let i = watches.firstIndex(where: { $0.id == id }) else { return }
        watches[i].connected = yes
    }

    private func answer(_ device: IQDevice, _ message: JSONValue) async {
        let key = "\(device.uuid!):\(message["id"]?.intValue ?? -1):\(message["kind"]?.string ?? "")"
        let now = Date()
        recent = recent.filter { now.timeIntervalSince($0.value) < WatchBridge.duplicateSeconds }
        guard recent[key] == nil else { return }
        recent[key] = now
        // APP-12: the watch answering this phone's offer to link it.
        if linker.onMessage(watch: device.uuid!, body: message) { return }
        guard let reply = await relay.handle(message) else { return }
        self.reply(device.uuid!, reply)
    }

    private func reply(_ id: UUID, _ message: JSONValue) {
        guard let device = devices[id] else { return }
        ConnectIQ.sharedInstance().sendMessage(jsonToWatchValue(message), to: app(device), progress: nil) { result in
            if result != .success { print("LawFiveWatch: the watch didn't get the answer: \(NSStringFromSendMessageResult(result) ?? "")") }
        }
    }

    /// APP-12: asks the watch to open LawFive (it asks its wearer), so it hears the offer.
    private func openOnWatch(_ id: UUID) {
        guard let device = devices[id] else { return }
        ConnectIQ.sharedInstance().openAppRequest(app(device)) { result in
            print("LawFiveWatch: open LawFive on the watch: \(NSStringFromSendMessageResult(result) ?? "")")
        }
    }
}

extension WatchBridge: IQUIOverrideDelegate {
    nonisolated func needsToInstallConnectMobile() {
        Task { @MainActor in self.needsGarminConnect = true }
    }
}

extension WatchBridge: IQDeviceEventDelegate {
    nonisolated func deviceStatusChanged(_ device: IQDevice!, status: IQDeviceStatus) {
        let id = device.uuid!
        let on = status == .connected
        Task { @MainActor in self.setConnected(id, on) }
    }

    /// Only now can the app talk to the watch.
    nonisolated func deviceCharacteristicsDiscovered(_ device: IQDevice!) {
        Task { @MainActor in self.refreshApps() }
    }
}

extension WatchBridge: IQAppMessageDelegate {
    nonisolated func receivedMessage(_ message: Any!, from app: IQApp!) {
        let json = watchValueToJson(message)
        guard let device = app.device else { return }
        nonisolated(unsafe) let from = device
        // One at a time, in the order they came, so a match goes before its pitch.
        Task { @MainActor in
            let before = self.inbox
            self.inbox = Task { @MainActor in
                await before?.value
                await self.answer(from, json)
            }
        }
    }
}
