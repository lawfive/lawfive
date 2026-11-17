import Foundation

/// WCH-13: what counts as the app opening, for Sync on opening (UI-16). These watches keep an app in the background
/// and close it on their own, so opening is starting, or coming back to the front after five minutes or more away;
/// a glance at the watch isn't. Never with a match in progress (SYNC-3): full time sends the match itself.
enum Opening {
    static let awaySec: TimeInterval = 5 * 60

    /// Whether to sync now the app is at the front: `first` when it has just started, else how long it was away.
    static func syncs(first: Bool, away: TimeInterval?, syncOnOpening: Bool, matchInProgress: Bool) -> Bool {
        guard syncOnOpening, !matchInProgress else { return false }
        return first || (away ?? 0) >= awaySec
    }
}
