import SwiftUI

// Which screen the app is on, and how it moves between pages: five tabs, each with its own native
// navigation stack (so the back gesture and the back button behave as they do everywhere on iOS),
// under the board along the bottom (IOS-13), and the forms in sheets.

enum Route: Hashable {
    case match(String)
    case venue(String)
    case referee(String)
    case competitions
    case templates
    case settings
    /// Settings opened at a group (Get ready's Change for the units, WEB-32).
    case settingsAt(String)
    /// WX-8: Data and licenses, from Settings → About.
    case licenses
    /// UI-27: the match screen setup, from Settings.
    case matchScreen
    case link
    case importMatches
    case quiz
    /// Finding duplicates and merging (DUP-12): Find duplicates, then a merge's two steps.
    case duplicates(MergeKind)
    case mergePick(MergeKind, keptId: String, with: [String])
    case mergeReview(MergeKind, keptId: String, from: [String])
}

/// A form, in a sheet of its own.
enum FormSheet: Identifiable, Hashable {
    case match(String?)
    case venue(String?)
    case referee(String?)
    case competition(String?)
    case template(String?)
    /// RES-1, RES-2: a match's result, by the match's id.
    case result(String)

    var id: Self { self }
}

enum AppTab: Hashable, CaseIterable {
    // STAT-13: Stats has its own tab (the user's choice).
    case matches, venues, referees, stats, more

    var label: String {
        switch self {
        case .matches: return "Matches"
        case .venues: return "Venues"
        case .referees: return "Referees"
        case .stats: return "Stats"
        case .more: return "More"
        }
    }

    var icon: Ph {
        switch self {
        case .matches: return .matches
        case .venues: return .venues
        case .referees: return .referees
        case .stats: return .stats
        case .more: return .more
        }
    }
}

@MainActor
@Observable
final class Nav {
    var tab: AppTab = .matches
    var paths: [AppTab: [Route]] = [:]
    var sheet: FormSheet?

    func push(_ route: Route) { paths[tab, default: []].append(route) }
    func pop() { _ = paths[tab]?.popLast() }
    func popToRoot() { paths[tab] = [] }
}

struct RootView: View {
    @Environment(AppGraph.self) private var graph
    @Environment(\.scenePhase) private var phase

    /// APP-26: the matches from a watch waiting to be shown.
    private var fromWatch: [FromWatchMatch] {
        fromWatchMatches(graph.session.fromWatch, records: graph.records.matchRecords, matches: graph.records.matches ?? [])
    }

    /// APP-26: once open, the summary stays through later syncs, and what they bring is added to it.
    @State private var fromWatchOpen = false

    /// APP-26: it takes over from the sync screen once that's done (not over one that stopped), or
    /// opens by itself with the app in front and no sync moving, even one out of sight.
    private var fromWatchCanOpen: Bool {
        let activity = graph.sync.activity
        let moving = graph.sync.running || (!activity.rows.isEmpty && !activity.finished)
        let takeover = activity.show && activity.finished && activity.problem == nil
        return graph.session.signedIn && phase == .active && !fromWatch.isEmpty && (takeover || (!activity.show && !moving))
    }

    private var showFromWatch: Bool { fromWatchOpen && graph.session.signedIn && !fromWatch.isEmpty }

    var body: some View {
        @Bindable var graph = graph
        ZStack {
            PitchStripes()
            if !graph.session.signedIn {
                SignInScreen()
                    .transition(.opacity)
            } else if graph.session.status == "pending" {
                WaitingScreen()
            } else {
                SignedIn()
                    .transition(.opacity)
                // APP-16: over everything while a big sync runs.
                if graph.sync.activity.show && !showFromWatch {
                    SyncScreen(activity: graph.sync.activity)
                        .transition(.opacity)
                }
                if showFromWatch {
                    FromWatchScreen(matches: fromWatch, open: { item in
                        closeFromWatch()
                        graph.pendingMatch = item.match.id
                    }, done: closeFromWatch)
                    .transition(.opacity)
                }
            }
        }
        .animation(.easeOut(duration: 0.25), value: graph.session.signedIn)
        .animation(.easeOut(duration: 0.25), value: graph.sync.activity.show)
        .animation(.easeOut(duration: 0.25), value: showFromWatch)
        .onChange(of: fromWatchCanOpen, initial: true) { _, can in
            if can { fromWatchOpen = true }
        }
        // Every one waiting deleted meanwhile: nothing left to show.
        .onChange(of: fromWatch.isEmpty) { _, empty in
            if empty { fromWatchOpen = false }
        }
        // A sign-in or invitation link while signed in (APP-13, APP-14): nothing changes without signing out first.
        .alert("You're already signed in", isPresented: Binding(
            get: { graph.session.signedIn && graph.pendingLink != nil },
            set: { if !$0 { graph.pendingLink = nil } }
        )) {
            Button("OK", role: .cancel) { graph.pendingLink = nil }
        } message: {
            Text("You're signed in as \(graph.session.email ?? "someone"). To use this \(linkKind(graph.pendingLink)), sign out first.")
        }
    }

    /// APP-26: shown once; the sync screen it took over from goes with it.
    private func closeFromWatch() {
        fromWatchOpen = false
        graph.session.shownFromWatch()
        if graph.sync.activity.finished { graph.sync.activity.close() }
    }

    private func linkKind(_ link: AppLink?) -> String {
        if case .invite = link { return "invitation" }
        return "code"
    }
}

struct SignedIn: View {
    @Environment(AppGraph.self) private var graph
    @State private var nav: Nav
    /// The tab bar's height above the home indicator, kept clear at the foot of every page.
    @State private var barHeight: CGFloat = 62

    /// `nav` opens it at a tab and page (the snapshot tests); the app starts on Matches.
    init(nav: Nav? = nil) {
        _nav = State(initialValue: nav ?? Nav())
    }

    var body: some View {
        // IOS-13: the system's tabs, each with its own navigation stack, kept as you switch, but with the
        // system's tab bar hidden for the board along the bottom; only the tab in front is in the
        // accessibility tree, as with any tab bar.
        TabView(selection: Binding(get: { nav.tab }, set: { nav.tab = $0 })) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                NavigationStack(path: Binding(get: { nav.paths[tab] ?? [] }, set: { nav.paths[tab] = $0 })) {
                    first(tab)
                        .environment(\.tabRoot, true)
                        .safeAreaPadding(.bottom, barHeight)
                        .toolbar(.hidden, for: .tabBar)
                        .navigationDestination(for: Route.self) { destination($0).safeAreaPadding(.bottom, barHeight).toolbar(.hidden, for: .tabBar) }
                }
                .toolbar(.hidden, for: .tabBar)
                .tag(tab)
            }
        }
        // Over the pages, which keep its height clear at their foot: a safe-area inset here doesn't
        // reach the pages inside the navigation stacks.
        .overlay(alignment: .bottom) {
            BoardTabBar(selected: nav.tab) { new in
                // The tab already open: back to its first page.
                if new == nav.tab { nav.popToRoot() } else { nav.tab = new }
            }
            .background {
                GeometryReader { g in
                    Color.clear.onAppear { barHeight = g.size.height }.onChange(of: g.size.height) { _, h in barHeight = h }
                }
            }
        }
        .environment(nav)
        // A notification tapped (APP-6): its match, unless a form is open, which comes first.
        .onChange(of: graph.pendingMatch, initial: true) { _, id in
            guard let id, nav.sheet == nil else { return }
            graph.pendingMatch = nil
            nav.tab = .matches
            nav.paths[.matches, default: []].append(.match(id))
        }
        .onChange(of: nav.sheet) { _, sheet in
            guard sheet == nil, let id = graph.pendingMatch else { return }
            graph.pendingMatch = nil
            nav.tab = .matches
            nav.paths[.matches, default: []].append(.match(id))
        }
        .sheet(item: $nav.sheet) { sheet in
            NavigationStack { form(sheet) }
                .environment(nav)
                .environment(graph)
                .tint(LF.brand)
                .presentationBackground { PitchStripes() }
        }
        // A change the server wouldn't take: dropped, and said so once.
        .alert("Not saved", isPresented: Binding(get: { !graph.sync.refused.isEmpty }, set: { if !$0 { graph.sync.clearRefused() } })) {
            Button("OK", role: .cancel) { graph.sync.clearRefused() }
        } message: {
            Text(graph.sync.refused.joined(separator: "\n"))
        }
        // WEB-14: Directions iOS wouldn't open, as when Screen Time blocks Maps, said rather than nothing happening.
        .alert("Directions didn't open", isPresented: Binding(get: { graph.directionsRefused != nil }, set: { if !$0 { graph.directionsRefused = nil } })) {
            if let refused = graph.directionsRefused, refused.app == "Apple Maps" {
                Button("Use Google Maps") { graph.openDirections(to: refused.place, app: "google") }
            }
            Button("OK", role: .cancel) {}
        } message: {
            if let refused = graph.directionsRefused {
                Text("\(refused.app) wouldn't open. Screen Time's Content & Privacy Restrictions can block it: allow it there, or choose another app for Directions in Settings.")
            }
        }
        .task {
            await graph.records.reload()
            await graph.syncNow()
        }
    }

    @ViewBuilder
    private func first(_ tab: AppTab) -> some View {
        switch tab {
        case .matches: MatchesScreen()
        case .venues: VenuesScreen()
        case .referees: RefereesScreen()
        case .stats: StatsScreen()
        case .more: MoreScreen()
        }
    }

    @ViewBuilder
    private func destination(_ route: Route) -> some View {
        switch route {
        case .match(let id): MatchScreen(id: id)
        case .venue(let id): VenueScreen(id: id)
        case .referee(let id): RefereeScreen(id: id)
        case .competitions: CompetitionsScreen()
        case .templates: TemplatesScreen()
        case .settings: SettingsScreen()
        case .settingsAt(let group): SettingsScreen(at: group)
        case .licenses: LicensesScreen()
        case .matchScreen: MatchScreenSetupScreen()
        case .link: LinkWatchScreen()
        case .importMatches: ImportScreen()
        case .quiz: QuizScreen()
        case .duplicates(let kind): DuplicatesScreen(kind: kind)
        case .mergePick(let kind, let keptId, let with): MergePickScreen(kind: kind, keptId: keptId, with: with)
        case .mergeReview(let kind, let keptId, let from): MergeReviewScreen(kind: kind, keptId: keptId, from: from)
        }
    }

    @ViewBuilder
    private func form(_ sheet: FormSheet) -> some View {
        switch sheet {
        case .match(let id): MatchEditScreen(id: id)
        case .venue(let id): VenueEditScreen(id: id)
        case .referee(let id): RefereeEditScreen(id: id)
        case .competition(let id): CompetitionEditScreen(id: id)
        case .template(let id): TemplateEditScreen(id: id)
        case .result(let matchId): ResultEditScreen(matchId: matchId)
        }
    }
}

/// WEB-16 on iPhone: how a page is named in the back button's long-press menu ("Match · Strikers U12 v
/// Rovers U12"). The button itself stays the chevron iOS draws, so this sets only the page's back title,
/// on the view controller SwiftUI hosts the page in.
private struct BackTitle: UIViewControllerRepresentable {
    let title: String

    func makeUIViewController(context: Context) -> Holder { Holder(title: title) }

    func updateUIViewController(_ holder: Holder, context: Context) {
        holder.backTitle = title
        holder.apply()
    }

    final class Holder: UIViewController {
        var backTitle: String

        init(title: String) {
            backTitle = title
            super.init(nibName: nil, bundle: nil)
        }

        required init?(coder: NSCoder) { nil }

        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            apply()
        }

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            apply()
        }

        /// The page's own controller: the one the navigation controller holds.
        func apply() {
            var page: UIViewController? = self
            while let p = page, p.parent != nil, !(p.parent is UINavigationController) { page = p.parent }
            guard let page, page.parent is UINavigationController else { return }
            page.navigationItem.backButtonTitle = backTitle
        }
    }
}

extension View {
    /// How this page is named in the back menu of the pages after it (WEB-16).
    func backTitle(_ title: String) -> some View {
        background(BackTitle(title: title).frame(width: 0, height: 0).accessibilityHidden(true))
    }
}

/// The page's scroll, for a page that moves it itself (Stats' In detail links).
private struct PageScrollKey: EnvironmentKey { static let defaultValue: ScrollViewProxy? = nil }

/// Whether a page is its tab's first: its head stands on the grass, with the board behind the status
/// bar only; pages after it have the native navigation bar as a strip of the board, with Back.
private struct TabRootKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    var tabRoot: Bool {
        get { self[TabRootKey.self] }
        set { self[TabRootKey.self] = newValue }
    }

    var pageScroll: ScrollViewProxy? {
        get { self[PageScrollKey.self] }
        set { self[PageScrollKey.self] = newValue }
    }
}

/// The board along the bottom (IOS-13, DESIGN.md "Navigation"): Matches, Venues, Referees, Stats,
/// More, condensed capitals under 22 pt icons, the tab you're on in white with a 3 pt chalk bar along
/// its top edge, the rest muted.
struct BoardTabBar: View {
    let selected: AppTab
    let choose: (AppTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                let on = tab == selected
                Button { choose(tab) } label: {
                    VStack(spacing: 5) {
                        tab.icon.image.resizable().scaledToFit().frame(width: 22, height: 22)
                        Text(tab.label.uppercased()).lfWord(14).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(on ? LF.onBoardStrong : LF.onBoardMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 10).padding(.bottom, 6)
                    .overlay(alignment: .top) {
                        if on {
                            GeometryReader { g in
                                Rectangle().fill(LF.chalk).frame(width: g.size.width * 0.8, height: 3).frame(maxWidth: .infinity)
                            }
                            .frame(height: 3)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.label)
                .accessibilityIdentifier("tab.\(tab.label)")
                .accessibilityAddTraits(on ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, 4)
        .background(LF.board.ignoresSafeArea(edges: .bottom))
        .ground(.board)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .sensoryFeedback(.selection, trigger: selected)
    }
}

/// A page's title (DESIGN.md "Page head"): black italic capitals in chalk with the hard offset under
/// them, dark green by day and mint at night; a core page's (`hero`) larger, a long one a step
/// smaller; the size steps down until its longest word fits, so a word never breaks.
struct PageTitle: View {
    let title: String
    var hero = false
    var width: CGFloat
    @Environment(\.colorScheme) private var scheme

    private var size: CGFloat {
        if hero { return title.count > 8 ? 52 : 64 }
        return title.count > 18 ? 32 : 40
    }

    /// The size the longest word fits at, scaled as Dynamic Type scales the display face.
    private var fitted: CGFloat {
        let words = title.uppercased().split(separator: " ").map(String.init)
        // A little to spare: the italic leans past the letters' advance.
        let room = (width - 8) * 0.95
        var s = size
        func tooWide(_ s: CGFloat) -> Bool {
            let scaled = UIFontMetrics(forTextStyle: .largeTitle).scaledValue(for: s)
            guard let font = UIFont(name: "BarlowCondensed-BlackItalic", size: scaled) else { return false }
            return words.contains { ($0 as NSString).size(withAttributes: [.font: font]).width > room }
        }
        while s > 24 && tooWide(s) { s *= 0.92 }
        return s
    }

    var body: some View {
        let f = fitted
        let dark = scheme == .dark
        // By day 0.035 em, which scales with the type; at night the mint, 3 by 2 (hero) or 2 by 2.
        let offset = dark ? CGSize(width: hero ? 3 : 2, height: 2) : CGSize(width: f * 0.035, height: f * 0.035)
        Text(title.uppercased())
            .font(.display(f, relativeTo: .largeTitle))
            .lineSpacing(-f * 0.12)
            .foregroundStyle(LF.text)
            .shadow(color: LF.heroShadow, radius: 0, x: offset.width, y: offset.height)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.trailing, 4)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The add button: a chalk slab at the bottom right with board-black plus and a hard 3 pt board drop,
/// as a primary button on the grass.
struct AddButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        Button(action: action) {
            PhIcon(.plus, size: 26, tint: LF.board, label: label)
                .frame(width: 56, height: 56)
                .background(LF.chalk, in: shape)
                .hardDrop(LF.board, shape)
        }
        .buttonStyle(PressStyle())
        .padding(.trailing, 18).padding(.bottom, 18)
    }
}

/// Pages' frame (DESIGN.md "Page head"): the striped grass inside the pitch frame, the head (a title
/// in black italic capitals with the hero offset, a muted line, how sync stands at its right, any
/// actions), then the content scrolling, pulled down to sync where the page says; an add button at
/// the bottom right. A tab's first page has the board behind the status bar; a page after it, the
/// navigation bar as a strip of the board with Back and its actions.
struct PageFrame<Content: View, Head: View>: View {
    let title: String
    var sub: String?
    var hero = false
    var status = false
    var add: (String, () -> Void)?
    /// Room kept at the foot for a bar over the page (a form's Save bar).
    var foot: CGFloat = 0
    /// The navigation bar, on a page after a tab's first; a form in a sheet has none.
    var navBar = true
    @ViewBuilder var head: () -> Head
    @ViewBuilder let content: () -> Content
    @Environment(\.tabRoot) private var root

    var body: some View {
        GeometryReader { geo in
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .bottom, spacing: 12) {
                            VStack(alignment: .leading, spacing: 8) {
                                PageTitle(title: title, hero: hero, width: geo.size.width - 2 * pagePad - (status ? 152 : 0))
                                if let sub {
                                    Text(sub).font(.barlow(15, .medium, relativeTo: .subheadline)).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            if status {
                                SyncLine(short: true).frame(maxWidth: 140, alignment: .trailing).padding(.bottom, 6)
                            }
                        }
                        .padding(.top, root ? 22 : 18).padding(.bottom, 18)
                        head()
                        content()
                        // The bottom goal line sits under the last row, with room inside it.
                        Spacer(minLength: 28)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, pagePad)
                    .frame(minHeight: geo.size.height - foot - 12, alignment: .top)
                    .background(PitchMarkings().padding(.top, 6))
                    .padding(.top, 6)
                    .padding(.bottom, foot + 12)
                }
                .scrollDismissesKeyboard(.interactively)
                .environment(\.pageScroll, proxy)
            }
        }
        .background { PitchStripes() }
        .safeAreaInset(edge: .bottom, alignment: .trailing, spacing: 0) {
            if let add { AddButton(label: add.0, action: add.1) }
        }
        // The board behind the status bar on a tab's first page.
        .statusBand(root)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(root || !navBar ? .hidden : .visible, for: .navigationBar)
        .toolbarBackground(LF.board, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            // The title is the page's own, in its head; the bar keeps it for Back's menu and VoiceOver.
            ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1).accessibilityHidden(true) }
        }
    }
}

extension View {
    /// A band of the board behind the status bar, so what scrolls goes under it rather than under the
    /// clock: a tab's first page, the sign-in and waiting pages.
    func statusBand(_ shown: Bool = true) -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            if shown { Color.clear.frame(height: 0).background(LF.board.ignoresSafeArea(edges: .top)) }
        }
    }
}

/// A page: the head and its content on the grass (`PageFrame`).
struct Page<Content: View>: View {
    let title: String
    var sub: String?
    var hero = false
    var status = false
    var add: (String, () -> Void)?
    @ViewBuilder let content: () -> Content

    /// `large` is kept for callers: a tab's first page shows itself as one wherever it's used.
    init(_ title: String, sub: String? = nil, large: Bool = true, hero: Bool = false, status: Bool = false, add: (String, () -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.sub = sub
        self.hero = hero
        self.status = status
        self.add = add
        self.content = content
    }

    var body: some View {
        PageFrame(title: title, sub: sub, hero: hero, status: status, add: add, head: { EmptyView() }, content: content)
    }
}

/// APP-18: asked before a form with changes closes, in LawFive's own card rather than a system alert.
struct LeavePrompt: View {
    let onKeep: () -> Void
    let onLeave: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea().onTapGesture(perform: onKeep)
            LfCard(padding: 20) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Are you sure you want to leave?").font(.lfHeadlineSmall).foregroundStyle(LF.text)
                    Text("You have unsaved changes. If you leave now, they'll be lost.").font(.lfBodyMedium).foregroundStyle(LF.muted)
                    HStack(spacing: 10) {
                        SecondaryButton("Leave", wide: true, danger: true, action: onLeave)
                        PrimaryButton("Keep editing", wide: true, action: onKeep)
                    }
                }
            }
            .padding(24)
        }
        .transition(.opacity)
    }
}

/// A form in a sheet (APP-25, IOS-13): its title on the grass as a page's, and Delete, Cancel and Save
/// on a strip of the board fixed at its foot; it can't be swiped away by accident.
struct FormPage<Content: View>: View {
    let title: String
    var canSave = true
    /// APP-18: the form's values in words, read once `loaded`; a difference later means changes to lose.
    var loaded = true
    var snapshot = ""
    /// Delete's words and what it does, for a record already saved.
    var delete: (String, () -> Void)?
    /// Why Save didn't save, in words, shown over the buttons where it's seen.
    var problem: String?
    let save: () -> Void
    @ViewBuilder let content: () -> Content
    @Environment(\.dismiss) private var dismiss
    @State private var start: String?
    @State private var asking = false
    @State private var typing = false

    var body: some View {
        PageFrame(title: title, foot: typing ? 0 : 64, navBar: false, head: { EmptyView() }, content: content)
            .interactiveDismissDisabled()
            .keyboardDone()
            .onChange(of: loaded, initial: true) { _, now in
                if now, start == nil { start = snapshot }
            }
            .overlay {
                if asking { LeavePrompt(onKeep: { asking = false }, onLeave: { dismiss() }) }
            }
            .animation(.easeOut(duration: 0.18), value: asking)
            // Not while the keyboard is up: it would ride up over the field being typed in.
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in typing = true }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in typing = false }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !typing { bar }
            }
    }

    /// Delete a 44 pt outlined trash in red words, Cancel a chalk outline, Save a chalk slab.
    private var bar: some View {
        VStack(alignment: .leading, spacing: 8) {
        if let problem {
            Text(problem).font(.lfBodyMedium).foregroundStyle(LF.redText).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isStaticText)
        }
        HStack(spacing: 10) {
            if let delete {
                Button(action: delete.1) {
                    HStack(spacing: 6) {
                        PhIcon(.trash, size: 18, tint: LF.redText)
                        Text("DELETE").lfWord().foregroundStyle(LF.redText)
                    }
                    .padding(.horizontal, 12).frame(minHeight: 44)
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(LF.borderInput, lineWidth: 2))
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel(delete.0)
            }
            Spacer(minLength: 0)
            SecondaryButton("Cancel") {
                if let start, start != snapshot { asking = true } else { dismiss() }
            }
            PrimaryButton("Save", enabled: canSave, action: save)
        }
        }
        .animation(.easeOut(duration: 0.18), value: problem)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background {
            VStack(spacing: 0) {
                Rectangle().fill(LF.boardRule).frame(height: 1)
                LF.board
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .ground(.board)
    }
}

/// "Synced 2 min ago", "Syncing…", "3 changes waiting · no connection".
struct SyncLine: View {
    /// For the top right of a tab's first page: "Synced 2 min ago" or "Syncing…", and a second line
    /// only when something waits or went wrong ("3 waiting · Offline").
    var short = false
    @Environment(AppGraph.self) private var graph
    /// APP-3: a check for a moment after a pull to refresh that worked.
    @State private var confirmed = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { _ in
            HStack(spacing: 4) {
                if confirmed {
                    PhIcon(.check, size: 13, tint: LF.brand).transition(.scale(scale: 0.4).combined(with: .opacity))
                }
                Text(short ? shortWords : words).font(.lfBodySmall).foregroundStyle(confirmed ? LF.brandStrong : LF.muted)
                    .multilineTextAlignment(short ? .trailing : .leading).lineLimit(short ? 2 : nil)
            }
            .animation(.snappy(duration: 0.25), value: confirmed)
        }
        .task(id: graph.pulledAt) {
            guard let at = graph.pulledAt, Date().timeIntervalSince(at) < 2 else { return }
            confirmed = true
            try? await Task.sleep(for: .seconds(2))
            confirmed = false
        }
    }

    private var shortWords: String {
        let ago = graph.sync.running ? "Syncing…" : graph.session.lastSync.map { "Synced \(timeAgo($0))" } ?? "Not synced yet"
        var more: [String] = []
        if graph.records.waiting > 0 { more.append("\(graph.records.waiting) waiting") }
        if !graph.sync.running, let problem = graph.sync.problem { more.append(problem.hasPrefix("No connection") ? "Offline" : "Failed") }
        return more.isEmpty ? ago : ago + "\n" + more.joined(separator: " · ")
    }

    private var words: String {
        var parts: [String] = []
        if graph.sync.running {
            parts.append("Syncing…")
        } else if let last = graph.session.lastSync {
            parts.append("Synced \(timeAgo(last))")
        } else {
            parts.append("Not synced yet")
        }
        let waiting = graph.records.waiting
        if waiting > 0 { parts.append("\(waiting) \(waiting == 1 ? "change" : "changes") waiting") }
        if !graph.sync.running, let problem = graph.sync.problem { parts.append(problem.prefix(1).lowercased() + problem.dropFirst()) }
        return parts.joined(separator: " · ")
    }
}
