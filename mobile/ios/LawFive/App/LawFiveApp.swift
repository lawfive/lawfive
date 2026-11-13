import SwiftUI

// LawFive for iPhone (IOS-1): the phone app, as Android's: offline at the ground, in LawFive's look
// on native controls. Requirements are IOS-1 onward in docs/requirements/iphone.md.

@main
struct LawFiveApp: App {
    @State private var graph = AppGraph()
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
                    // APP-6: where a tapped reminder goes.
                    let graph = graph
                    graph.reminders.router.openDirections = { graph.openDirections(lat: $0, lon: $1) }
                    graph.reminders.router.openMatch = { graph.pendingMatch = $0 }
                }
                .onOpenURL { url in
                    // IOS-9: Garmin Connect coming back with the watches chosen.
                    if graph.watch.handle(url: url) { return }
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
