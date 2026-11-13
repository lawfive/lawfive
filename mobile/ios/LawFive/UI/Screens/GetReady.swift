import SwiftUI

// WEB-32: Get ready on Matches, as the website's GetReady.tsx at a phone's width and Android's
// GetReady.kt, with Turn on reminders in place of Get the phone app. A slab on the grass tagged "N of
// 5 done" over tile rows: the step's number on a board tile, which turns pitch green with a check once
// it's done; the next row to do has the primary button, the buttons under the words sharing the
// width where they fit, else one under the other.

/// What Get ready needs, as Matches works it out: whether it shows (once what it needs is known), and what's done.
struct GetReadyState {
    var settled: Bool
    var show: Bool
    var done: GetReady.Done
    var watches: [String]
    var settings: UserSettings
    var matches: Int
    var connected: Bool
    var feeds: Bool
}

/// Get ready's own fetches: whether this server has assignor calendars, and how many the account has.
@MainActor
@Observable
final class GetReadyFeeds {
    /// nil until known.
    private(set) var feeds: Bool?
    private(set) var calendars: Int?

    func load(_ graph: AppGraph, hidden: Bool) async {
        let has = await graph.meta()?.capabilities.contains("assignor-calendars")
        feeds = has ?? false
        if has == true, !hidden {
            calendars = (try? await graph.api.call("GET", "/v1/assignor-calendars")?["calendars"]?.array?.count) ?? 0
        } else {
            calendars = 0
        }
    }
}

extension GetReadyState {
    /// Known either way: hidden, or what it needs has come in (the watches from the last sync with signal).
    @MainActor
    static func of(_ graph: AppGraph, feeds: GetReadyFeeds) -> GetReadyState {
        let zone = TimeZone.current.identifier
        let guess = SettingsDefaults.settings(timeZone: nil)
        let s = graph.records.effectiveSettings
        let hidden = s.getReady?.hidden == true
        let watches = graph.onWatch.saved.watches?.map(OnWatchStore.watchName) ?? []
        let matches = graph.records.matches?.count
        let done = GetReady.done(watches: watches.count, remindersOn: graph.reminders.settings.enabled, settings: s, guess: guess, phoneZone: zone, matches: matches ?? 0, calendars: feeds.calendars ?? 0)
        let loaded = matches != nil && graph.onWatch.saved.watches != nil && feeds.calendars != nil
        return GetReadyState(settled: hidden || loaded, show: loaded && GetReady.shows(s, done), done: done, watches: watches, settings: s,
                             matches: matches ?? 0, connected: (feeds.calendars ?? 0) > 0, feeds: feeds.feeds == true)
    }
}

struct GetReadyList: View {
    let ready: GetReadyState
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.openURL) private var openURL
    @State private var denied = false

    private struct Step {
        let key: String
        let title: String
        let done: Bool
        let line: Text
        let actions: [StepAction]
    }

    private struct StepAction {
        let text: String
        let icon: Ph
        /// The step's own button, which leads when it's the next to do; the rest are outlines.
        var own = true
        let run: () -> Void
    }

    private func keep(_ change: @escaping (inout UserSettingsGetReady) -> Void) {
        Task { await graph.records.saveSettings { s in
            var g = s.getReady ?? UserSettingsGetReady()
            change(&g)
            s.getReady = g
        } }
    }

    private func turnOnReminders() {
        Task {
            if await graph.reminders.askToNotify() {
                var next = graph.reminders.settings
                next.enabled = true
                graph.reminders.update(next, matches: graph.records.matches ?? [], venues: graph.records.venues ?? [])
            } else {
                denied = true
            }
        }
    }

    var body: some View {
        let d = ready.done
        let r = graph.reminders.settings
        let zone = TimeZone.current.identifier
        let n = ready.matches
        let count = "\(n) \(n == 1 ? "match" : "matches")"
        let steps = [
            Step(key: "watch", title: "Link your watch", done: d.watch,
                 line: ready.watches.isEmpty
                    ? Text("Your next matches go to it, and each one you referee comes back here with every goal and card. Not on your watch yet? ")
                        + Text((try? AttributedString(markdown: "[How to get it](\(watchesURL.absoluteString))")) ?? AttributedString("How to get it")).bold().underline()
                    : Text("Linked: \(ready.watches.joined(separator: ", "))"),
                 actions: [StepAction(text: "Link a watch", icon: .watch) { nav.push(.link) }]),
            Step(key: "reminders", title: "Turn on reminders", done: d.reminders,
                 line: Text(denied ? "Notifications are off for LawFive in the phone's settings."
                            : r.enabled ? remindersOnText(ReminderTimes(graph.records.effectiveSettings))
                            : "A notification on this phone before each kickoff, with the venue and directions."),
                 actions: denied
                    ? [StepAction(text: "Open Settings", icon: .settings) { if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) } }]
                    : [StepAction(text: "Turn on", icon: .bell) { turnOnReminders() }]),
            Step(key: "units", title: "Your units and time zone", done: d.units,
                 line: Text(d.units ? GetReady.unitsLine(ready.settings, phoneZone: zone) : "\(GetReady.unitsLine(ready.settings, phoneZone: zone)), guessed from this phone."),
                 actions: [
                    StepAction(text: "Change", icon: .edit, own: false) { nav.push(.settingsAt("units")) },
                    StepAction(text: "They're right", icon: .check) { keep { $0.unitsConfirmed = true } },
                 ]),
            Step(key: "games", title: "Bring in your games", done: d.games,
                 line: Text(ready.connected ? "Your assignor's calendar is connected" + (n > 0 ? ": \(count)" : "")
                            : n > 0 ? "\(count) so far"
                            : ready.feeds ? "Connect your assignor's calendar and your games come in by themselves, kept up to date. Or add one yourself."
                            : "Add your next game, or import a season's schedule from a spreadsheet."),
                 actions: [
                    // The phone doesn't keep assignor calendars itself: they're added on the website.
                    ready.feeds
                        ? StepAction(text: "Connect a calendar", icon: .calendar, own: false) { if let url = websiteURL(server: graph.session.server, path: "/settings#assignor-calendars") { openURL(url) } }
                        : StepAction(text: "Import", icon: .upload, own: false) { nav.push(.importMatches) },
                    StepAction(text: "Add a match", icon: .plus) { nav.sheet = .match(nil) },
                 ]),
            Step(key: "screen", title: "Choose your match screen", done: d.screen,
                 line: Text(ready.settings.watchScreen != nil ? "Chosen. Change it any time in Settings." : "What your watch shows while a match runs: which clocks, the time of day and the team names."),
                 actions: [StepAction(text: "Choose", icon: .watch) { nav.push(.matchScreen) }]),
        ]
        let lead = steps.first { !$0.done }?.key
        Slab(title: "Get ready", tag: "\(d.count) of \(steps.count) done", ground: .grass) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(steps.enumerated()), id: \.element.key) { i, s in row(i + 1, s, lead: s.key == lead) }
                Flow(spacing: 6) {
                    LinkButton("Hide this list", color: LF.text) { keep { $0.hidden = true } }
                    Text("Everything here is in Settings and More too.").font(.lfBodyMedium).foregroundStyle(LF.muted)
                }
                .padding(.top, 4)
            }
        }
    }

    /// A row: the step's number on a board tile (pitch green with a check once done), then a panel with its name, what it's for or what's done, and its buttons.
    private func row(_ number: Int, _ s: Step, lead: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 4)
        return HStack(spacing: 0) {
            ZStack {
                if s.done {
                    Rectangle().fill(LF.brand).ground(.panel)
                    PhIcon(.check, size: 26, tint: LF.onBrand).ground(.panel)
                } else {
                    Rectangle().fill(LF.board)
                    Text("\(number)").font(.display(28, relativeTo: .title2)).foregroundStyle(LF.onBoard)
                }
            }
            .frame(width: 52)
            .frame(maxHeight: .infinity)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(s.title).font(.barlow(17, .bold, relativeTo: .headline)).foregroundStyle(s.done ? LF.muted : LF.text)
                    s.line.font(.barlow(14, relativeTo: .subheadline)).foregroundStyle(LF.muted).tint(LF.brandStrong).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityValue(s.done ? "Done" : "To do")
                if !s.done {
                    // Sharing the width where there's room for both, else one under the other, so a button's words are never cut.
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) { buttons(s, lead: lead) }
                        VStack(spacing: 8) { buttons(s, lead: lead) }
                    }
                }
            }
            .padding(.leading, 14).padding(.trailing, 12).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LF.surface)
            .ground(.panel)
        }
        .frame(minHeight: 72)
        .fixedSize(horizontal: false, vertical: true)
        .clipShape(shape)
        .overlay(shape.stroke(LF.panelEdge, lineWidth: 1))
        .hardDrop(LF.panelShadow, shape)
    }

    @ViewBuilder
    private func buttons(_ s: Step, lead: Bool) -> some View {
        ForEach(Array(s.actions.enumerated()), id: \.offset) { _, a in
            if lead && a.own {
                PrimaryButton(a.text, icon: a.icon, wide: true, action: a.run)
            } else {
                SecondaryButton(a.text, icon: a.icon, wide: true, action: a.run)
            }
        }
    }
}
