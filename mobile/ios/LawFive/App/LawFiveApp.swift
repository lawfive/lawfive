import SwiftUI

// LawFive for iPhone (IOS-1): the phone app, as Android's: offline at the ground, in LawFive's look
// on native controls. Requirements are IOS-1 onward in docs/requirements/iphone.md.

/// PUSH-5: iOS's answer to registering for notifications from the server, for Push.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        RemoteNotifications.onToken?(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        RemoteNotifications.onToken?(nil)
    }
}

@main
struct LawFiveApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var graph = AppGraph(shared: SharedState.defaults)
    @Environment(\.scenePhase) private var phase

    init() {
        styleSystemBars()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(graph)
                .tint(LF.brand)
                .task {
                    // APP-6: where a tapped reminder goes; PUSH-5, NOTE-3: a notification from the server too.
                    let graph = graph
                    graph.push.start()
                    graph.reminders.router.openDirections = { graph.openDirections(lat: $0, lon: $1) }
                    graph.reminders.router.serverNotified = { graph.requestSync(delay: 0) }
                    graph.reminders.router.openMatch = { id in
                        if let id { graph.pendingMatch = id } else { graph.pendingMatchList = true }
                    }
                }
                .onOpenURL { url in
                    // IOS-9: Garmin Connect coming back with the watches chosen.
                    if graph.watch?.handle(url: url) == true { return }
                    // APP-13, APP-14: the web app's Open in the app buttons.
                    if let link = AppLink.parse(url.absoluteString, allowHttp: AppInfo.isDebug) { graph.pendingLink = link }
                }
        }
        .onChange(of: phase) { _, now in
            switch now {
            case .active:
                guard graph.session.signedIn else { return }
                Task { await graph.refreshAccount() }
                graph.requestSync(delay: 0)
            case .background:
                graph.scheduleBackgroundSync()
            default:
                break
            }
        }
        .backgroundTask(.appRefresh(AppGraph.backgroundTask)) {
            await graph.syncNow()
            await graph.scheduleBackgroundSync()
        }
    }
}
