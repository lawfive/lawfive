import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.Timer;
import Toybox.WatchUi;

// The menus before and after a match (UI-15 to UI-18): a start menu of four rows that never change
// (Matches, New match, History, Settings), each opening its own menu in the start menu's place, so
// the view stack stays flat and Back always returns to the row it came from. What changes (how many
// matches, when they synced, the last result) is in the rows' sub-labels, which update in place.

const HOME_MATCHES = 0;
const HOME_NEW = 1;
const HOME_HISTORY = 2;
const HOME_SETTINGS = 3;

//! The menu icons' circle: LawFive's green (the web's dark-mode brand green).
const COLOR_ICON_CIRCLE = 0x2FAE7A;

//! A menu row with a Phosphor icon on its left (UI-18).
function iconItem(label as String, sub as String?, id as Object, icon as ResourceId) as WatchUi.IconMenuItem {
    return new WatchUi.IconMenuItem(label, sub, id, new MenuIcon(icon), {:alignment => WatchUi.MenuItem.MENU_ITEM_LABEL_ALIGN_LEFT});
}

//! An icon for a menu row (UI-18): the black icon on a LawFive green circle, which reads on the
//! black menus of button watches and the white ones of the Venu. The menu draws it in an area of its
//! own from (0, 0), and doesn't take a bitmap there directly (the app crashes), so it's a drawable
//! that centres itself in that area.
class MenuIcon extends WatchUi.Drawable {
    private var _bitmap as Graphics.BitmapType;

    function initialize(icon as ResourceId) {
        Drawable.initialize({});
        _bitmap = WatchUi.loadResource(icon) as Graphics.BitmapType;
    }

    function draw(dc as Graphics.Dc) as Void {
        var cx = dc.getWidth() / 2;
        var cy = dc.getHeight() / 2;
        dc.setAntiAlias(true);
        dc.setColor(COLOR_ICON_CIRCLE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, (_bitmap.getWidth() * 0.85).toNumber());
        dc.drawBitmap(cx - _bitmap.getWidth() / 2, cy - _bitmap.getHeight() / 2, _bitmap);
    }
}

// ---- Start menu (UI-15) ----

class StartMenu extends WatchUi.Menu2 {
    static var current as StartMenu? = null;
    var onScreen as Boolean = false;

    function initialize(focus as Number) {
        Menu2.initialize({:title => new TimedTitle("LawFive"), :focus => focus});
        addItem(iconItem("Matches", null, HOME_MATCHES, Rez.Drawables.IconMatches));
        addItem(iconItem("New match", null, HOME_NEW, Rez.Drawables.IconNew));
        addItem(iconItem("History", null, HOME_HISTORY, Rez.Drawables.IconHistory));
        addItem(iconItem("Settings", null, HOME_SETTINGS, Rez.Drawables.IconSettings));
        refresh();
        current = self;
    }

    //! The sub-labels, in place: the rows never move, so neither does the highlight.
    function refresh() as Void {
        setSub(HOME_MATCHES, matchesSummary());
        setSub(HOME_NEW, "Quick · " + Settings.timingSummary());
        var last = History.all();
        setSub(HOME_HISTORY, last.size() > 0 ? "Last: " + History.title(last[0]) : "None yet");
        setSub(HOME_SETTINGS, Sync.isLinked() ? "Linked · " + Sync.serverHost() : "Not linked");
    }

    private function setSub(index as Number, text as String) as Void {
        var item = getItem(index);
        if (item != null) {
            item.setSubLabel(text);
        }
    }

    function onShow() as Void {
        refresh();
        Menu2.onShow();
        onScreen = true;
    }

    function onHide() as Void {
        Menu2.onHide();
        onScreen = false;
    }
}

//! "3 coming up · synced 8:42", or how to get matches when not linked.
function matchesSummary() as String {
    if (!Sync.isLinked()) {
        return "Link to get your matches";
    }
    var count = Sync.matches().size();
    var coming = count == 0 ? "None coming up" : count == 1 ? "1 coming up" : count + " coming up";
    return coming + " · " + Sync.shortStatus();
}

function startMenu() as [WatchUi.Views, WatchUi.InputDelegates] {
    return startMenuAt(HOME_MATCHES);
}

function startMenuAt(focus as Number) as [WatchUi.Views, WatchUi.InputDelegates] {
    return [new StartMenu(focus), new StartMenuDelegate()];
}

//! Back to the start menu from one of its sections, on that section's row.
function showStartMenu(focus as Number) as Void {
    var start = startMenuAt(focus);
    WatchUi.switchToView(start[0], start[1], WatchUi.SLIDE_RIGHT);
}

//! After a sync: the start menu's sub-labels, in place.
function refreshStartMenu(ok as Boolean) as Void {
    var menu = StartMenu.current;
    if (menu != null && menu.onScreen) {
        menu.refresh();
        WatchUi.requestUpdate();
    }
}

class StartMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == HOME_MATCHES) {
            if (Sync.isLinked()) {
                var menu = new MatchesMenu(null);
                WatchUi.switchToView(menu, new MatchesMenuDelegate(menu), WatchUi.SLIDE_LEFT);
            } else {
                // SYNC-1, SYNC-9: linking is how matches arrive.
                WatchUi.pushView(new LinkMenu(), new LinkMenuDelegate(), WatchUi.SLIDE_LEFT);
            }
        } else if (id == HOME_NEW) {
            WatchUi.switchToView(newMatchMenu(), new NewMatchDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == HOME_HISTORY) {
            var menu = new HistoryMenu();
            WatchUi.switchToView(menu, new HistoryMenuDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == HOME_SETTINGS) {
            var menu = new SettingsMenu();
            WatchUi.switchToView(menu, new SettingsMenuDelegate(), WatchUi.SLIDE_LEFT);
        }
    }
}

// ---- Matches (UI-16, SYNC-3, SYNC-5) ----

//! Sync now, then the downloaded matches, soonest first. A sync updates the rows in place and
//! never moves the highlight; while it runs, Sync now's sub-label shows each step.
class MatchesMenu extends WatchUi.Menu2 {
    private var _rows as Number = 0;
    private var _timer as Timer.Timer? = null;

    //! `row` is the match to highlight (coming back from its screen), or null for the soonest.
    function initialize(row as Number?) {
        var count = Sync.matches().size();
        // The soonest match is highlighted (Sync now above it), except where focusing a lower row would hide those above it.
        Menu2.initialize({:title => new TimedTitle("Matches"), :focus => listFocus(row != null && row < count ? row + 1 : count > 0 ? 1 : 0)});
        addItem(new WatchUi.MenuItem("Sync now", Sync.status(), :sync, null));
        refreshMatches();
    }

    //! The match rows from the downloaded matches, changed in place.
    function refreshMatches() as Void {
        var synced = Sync.matches();
        var rows = synced.size() > 0 ? synced.size() : 1;
        for (var i = 0; i < rows; i++) {
            var text = synced.size() > 0 ? Sync.describe(synced[i]) : ["No matches coming up", "Add them on the website"] as [String, String];
            var id = synced.size() > 0 ? i : :none;
            var item = i < _rows ? getItem(i + 1) : null;
            if (item != null) {
                item.setLabel(text[0]);
                item.setSubLabel(text[1]);
            } else {
                addItem(new WatchUi.MenuItem(text[0], text[1], id, null));
            }
        }
        for (var i = _rows; i > rows; i--) {
            deleteItem(i);
        }
        _rows = rows;
    }

    //! Sync now's sub-label: the step while it runs, then how it went.
    function showSync() as Void {
        var item = getItem(0);
        if (item != null) {
            item.setSubLabel(Sync.isRunning() ? Sync.progressText() : Sync.status());
        }
        WatchUi.requestUpdate();
    }

    function startSync() as Void {
        Sync.run(method(:onSynced));
        var timer = new Timer.Timer();
        timer.start(method(:showSync), 400, true);
        _timer = timer;
        showSync();
    }

    function onSynced(ok as Boolean) as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
            _timer = null;
        }
        refreshMatches();
        showSync();
    }

    function onHide() as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
            _timer = null;
        }
        Menu2.onHide();
    }
}

class MatchesMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _menu as MatchesMenu;

    function initialize(menu as MatchesMenu) {
        Menu2InputDelegate.initialize();
        _menu = menu;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :sync) {
            if (!Sync.isRunning()) {
                _menu.startSync();
            }
        } else if (id instanceof Number) {
            var synced = Sync.matches();
            if (id < synced.size()) {
                // UI-19: its own screen, in this menu's place, so the view stack stays flat.
                var menu = new PlannedMatchMenu(synced[id], id);
                WatchUi.switchToView(menu, new PlannedMatchDelegate(menu), WatchUi.SLIDE_LEFT);
            }
        }
    }

    function onBack() as Void {
        showStartMenu(HOME_MATCHES);
    }
}

// ---- A downloaded match (UI-19, SYNC-11) ----

//! A downloaded match's own screen: Start match, the fee with a Paid toggle, then its details.
class PlannedMatchMenu extends WatchUi.Menu2 {
    var synced as Dictionary;
    var row as Number;

    function initialize(match as Dictionary, index as Number) {
        synced = match;
        row = index;
        var text = Sync.describe(match);
        Menu2.initialize({:title => new TimedTitle(text[0])});
        addItem(iconItem("Start match", text[1].length() > 0 ? text[1] : null, :start, Rez.Drawables.IconStart));
        var fee = match["fee"];
        if (fee instanceof Dictionary) {
            addItem(new WatchUi.ToggleMenuItem("Fee " + (fee["text"] as String), {:enabled => "Paid", :disabled => "Not paid"}, :fee, (fee["paid"] as Boolean?) == true, null));
        }
        addDetail("Match", match["name"] as String?);
        addDetail("Your role", match["role"] as String?);
        addDetail("Venue", match["where"] as String?);
        var crew = match["crew"];
        if (crew instanceof Array) {
            for (var i = 0; i < crew.size(); i++) {
                var official = crew[i] as Array<String>;
                addDetail(official[0], official[1]);
            }
        }
        addDetail("Forecast", match["weather"] as String?);
        var notes = match["notes"];
        if (notes instanceof String) {
            addItem(new WatchUi.MenuItem("Notes", notes, :notes, null));
        }
        addItem(new WatchUi.MenuItem("Mark pitch", pitchSub({"matchId" => match["id"]}), :pitch, null));
    }

    function onShow() as Void {
        // TRK-13: after marking, its row says so.
        var item = getItem(findItemById(:pitch));
        if (item != null) {
            item.setSubLabel(pitchSub({"matchId" => synced["id"]}));
        }
        Menu2.onShow();
    }

    private function addDetail(label as String, value as String?) as Void {
        if (value != null && value.length() > 0) {
            addItem(new WatchUi.MenuItem(label, value, :detail, null));
        }
    }
}

class PlannedMatchDelegate extends WatchUi.Menu2InputDelegate {
    private var _menu as PlannedMatchMenu;

    function initialize(menu as PlannedMatchMenu) {
        Menu2InputDelegate.initialize();
        _menu = menu;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :start) {
            beginMatch(Sync.setupFor(_menu.synced));
        } else if (id == :fee) {
            // The menu has already flipped the toggle.
            Sync.setFeePaid(_menu.synced["id"] as String, (item as WatchUi.ToggleMenuItem).isEnabled());
            // Sent now if the phone is in reach; otherwise it waits for the next sync.
            Sync.run(null);
        } else if (id == :notes) {
            WatchUi.pushView(new NotesView(_menu.synced["notes"] as String), new WatchUi.BehaviorDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :pitch) {
            markPitch({"matchId" => _menu.synced["id"]});
        }
    }

    function onBack() as Void {
        var menu = new MatchesMenu(_menu.row);
        WatchUi.switchToView(menu, new MatchesMenuDelegate(menu), WatchUi.SLIDE_RIGHT);
    }
}

//! TRK-13: Mark pitch's sub-label: corners waiting to go, or what to do.
function pitchSub(target as Dictionary) as String {
    var queued = Sync.pitchQueued(target);
    return queued > 0 ? queued + " corners marked, to send" : "Walk 2 to 4 corners";
}

function markPitch(target as Dictionary) as Void {
    var view = new PitchMarkView(target);
    WatchUi.pushView(view, new PitchMarkDelegate(view), WatchUi.SLIDE_LEFT);
}

//! A match's notes in full, as large as they fit.
class NotesView extends WatchUi.View {
    private var _text as String;

    function initialize(text as String) {
        View.initialize();
        _text = text;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        drawTimeOfDay(dc, Graphics.COLOR_LT_GRAY); // UI-25
        var area = new WatchUi.TextArea({
            :text => _text,
            :color => Graphics.COLOR_WHITE,
            :font => [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY],
            :justification => Graphics.TEXT_JUSTIFY_CENTER,
            :locX => WatchUi.LAYOUT_HALIGN_CENTER,
            :locY => WatchUi.LAYOUT_VALIGN_CENTER,
            // Inside the round screen's corners.
            :width => (dc.getWidth() * 0.74).toNumber(),
            :height => (dc.getHeight() * 0.74).toNumber()
        });
        area.draw(dc);
    }
}

// ---- New match (UI-16, SET-1, SET-9, SET-13) ----

function newMatchMenu() as WatchUi.Menu2 {
    var menu = systemMenu("New match");
    var planned = Settings.plannedTeams();
    if (planned != null) {
        // The periods only: "Planned · 2x45'" fits under it where the half-time didn't.
        menu.addItem(iconItem(Settings.plannedTitle(planned), "Planned · " + Settings.periodsSummary(), :planned, Rez.Drawables.IconMatches));
    }
    menu.addItem(iconItem("Quick match", Settings.timingSummary(), :quick, Rez.Drawables.IconQuick));
    var last = Settings.lastFormat();
    // SET-13: not when it's Quick match over again, as two rows the same make people wonder what differs.
    if (last != null && !Settings.sameFormat(last, Settings.matchSetup(false))) {
        menu.addItem(iconItem("Same as last", Format.summary(last["numPeriods"] as Number, last["periodSec"] as Number, last["halftimeSec"] as Number),
            :same, Rez.Drawables.IconSame));
    }
    menu.addItem(iconItem("Custom", "Choose the format", :custom, Rez.Drawables.IconCustom));
    return menu;
}

class NewMatchDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :planned) {
            beginMatch(Settings.matchSetup(true));
        } else if (id == :quick) {
            beginMatch(Settings.matchSetup(false));
        } else if (id == :same) {
            var setup = newSetup();
            setup.remove("sameAsLast");
            beginMatch(setup);
        } else if (id == :custom) {
            showSetupMenu(newSetup(), "start", WatchUi.SLIDE_LEFT);
        }
    }

    function onBack() as Void {
        showStartMenu(HOME_NEW);
    }
}

// ---- Settings (UI-17) ----

class SettingsMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("Settings")});
        addItem(iconItem("Account", null, :account, Rez.Drawables.IconAccount));
        addItem(iconItem("Alerts", null, :alerts, Rez.Drawables.IconAlerts));
        // UI-17: how the match is run by hand, apart from what it vibrates for.
        addItem(iconItem("Controls", null, :controls, Rez.Drawables.IconControls));
        // TRK-7: a recording switch, not an account matter, so it's here rather than in Account. Garmin
        // draws no icon on a toggle row (only on watches with a second screen), so it has none.
        addItem(new WatchUi.ToggleMenuItem("Record track", {:enabled => "GPS and heart rate", :disabled => "Off"}, :recordTrack,
            Settings.getBoolean("recordTrack", true), null));
        addItem(iconItem("Match screen", null, :screen, Rez.Drawables.IconScreen));
        addItem(iconItem("Timer names", null, :names, Rez.Drawables.IconNames));
        addItem(iconItem("Quick match", null, :quick, Rez.Drawables.IconQuick));
        addItem(iconItem("About", "LawFive for Garmin", :about, Rez.Drawables.IconAbout));
        refresh();
    }

    function refresh() as Void {
        setSub(0, Sync.isLinked() ? "Linked · " + Sync.shortStatus() : "Not linked");
        setSub(1, alertsSummary());
        setSub(2, controlsSummary());
        setSub(4, screenSummary());
        setSub(5, Format.capitalize(Settings.timerName("stoppageLabel", "stoppage")) + " · " + Settings.timerName("breakLabel", "break"));
        setSub(6, Settings.timingSummary());
    }

    private function setSub(index as Number, text as String) as Void {
        var item = getItem(index);
        if (item != null) {
            item.setSubLabel(text);
        }
    }

    function onShow() as Void {
        refresh();
        Menu2.onShow();
    }
}

function alertsSummary() as String {
    var on = 0;
    var keys = ["vibeFullTime", "vibeBreak", "vibeStoppage"] as Array<String>;
    for (var i = 0; i < keys.size(); i++) {
        if (Settings.getBoolean(keys[i], true)) {
            on += 1;
        }
    }
    return on == 3 ? "All on" : on == 0 ? "All off" : on + " of 3 on";
}

//! UI-17: Controls in a line, for Settings: "Touch lock" when it's on (INP-12), "Tap for stoppage"
//! when a tap starts and ends it, else "Buttons only" (short, for the narrowest round screens).
function controlsSummary() as String {
    if (Settings.touchLock()) {
        return "Touch lock";
    }
    return Settings.getBoolean("tapStoppage", false) ? "Tap for " + Settings.timerName("stoppageLabel", "stoppage") : "Buttons only";
}

class SettingsMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :recordTrack) {
            Application.Properties.setValue("recordTrack", (item as WatchUi.ToggleMenuItem).isEnabled());
        } else if (id == :controls) {
            var menu = new ControlsMenu();
            WatchUi.pushView(menu, new ControlsMenuDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :account) {
            var menu = new AccountMenu();
            WatchUi.pushView(menu, new AccountMenuDelegate(menu), WatchUi.SLIDE_LEFT);
        } else if (id == :alerts) {
            var menu = new AlertsMenu();
            WatchUi.pushView(menu, new AlertsMenuDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :screen) {
            var menu = new MatchScreenMenu();
            WatchUi.pushView(menu, new MatchScreenDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :names) {
            var menu = new TimerNamesMenu();
            WatchUi.pushView(menu, new TimerNamesDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :quick) {
            // The Create match list, saving the format for Quick match instead of starting one.
            var setup = Settings.matchSetup(false);
            setup["mode"] = "quick";
            showSetupMenu(setup, "start", WatchUi.SLIDE_LEFT);
        } else if (id == :about) {
            // VER-2: this app's version and the server's; DATA-8: Reset LawFive, last.
            var menu = systemMenu("About");
            menu.addItem(new WatchUi.MenuItem("LawFive for Garmin", "Version " + Sync.APP_VERSION, :none, null));
            menu.addItem(new WatchUi.MenuItem("Server", Sync.serverHost(), :none, null));
            var serverVersion = Sync.serverVersion();
            if (serverVersion != null) {
                menu.addItem(new WatchUi.MenuItem("Server version", serverVersion, :none, null));
            }
            menu.addItem(new WatchUi.MenuItem("History", History.all().size() + " of " + History.MAX_MATCHES + " matches kept", :none, null));
            menu.addItem(new WatchUi.MenuItem("Open source", "lawfive.dev", :none, null));
            menu.addItem(new WatchUi.MenuItem("Reset LawFive", "Erase everything here", :reset, null));
            WatchUi.pushView(menu, new AboutMenuDelegate(), WatchUi.SLIDE_LEFT);
        }
    }

    function onBack() as Void {
        showStartMenu(HOME_SETTINGS);
    }
}

class AboutMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        if (item.getId() == :reset) {
            var view = new ConfirmView("Reset LawFive?", "Erases matches, history and the link. Settings stay.", true);
            WatchUi.pushView(view, new ConfirmDelegate(view, :reset), WatchUi.SLIDE_IMMEDIATE);
        }
    }
}

function showSettingsMenu() as Void {
    var menu = new SettingsMenu();
    WatchUi.switchToView(menu, new SettingsMenuDelegate(), WatchUi.SLIDE_RIGHT);
}

// ---- Account (SYNC-5, SYNC-6, SYNC-9, TRK-7) ----

class AccountMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("Account")});
        fill();
    }

    //! Rebuilt when shown: linking or unlinking changes which rows there are.
    function fill() as Void {
        while (getItem(0) != null) {
            deleteItem(0);
        }
        if (Sync.isLinked()) {
            addItem(new WatchUi.MenuItem("Last sync", Sync.status(), :none, null));
            var waiting = Sync.outbox().size();
            var tracks = TrackLog.outbox().size();
            if (waiting > 0 || tracks > 0) {
                var parts = [] as Array<String>;
                if (waiting > 0) {
                    parts.add(waiting == 1 ? "1 match" : waiting + " matches");
                }
                if (tracks > 0) {
                    parts.add(tracks == 1 ? "1 track" : tracks + " tracks");
                }
                addItem(new WatchUi.MenuItem("Waiting to upload", parts.size() == 2 ? parts[0] + ", " + parts[1] : parts[0], :none, null));
            }
            addItem(new WatchUi.MenuItem("Server", Sync.serverHost(), :none, null));
        } else {
            addItem(new WatchUi.MenuItem("Link account", "Sync with LawFive", :link, null));
        }
        // UI-16: the quiet sync when the app opens; Sync now in Matches always works.
        addItem(new WatchUi.ToggleMenuItem("Sync on opening", {:enabled => "When the app opens", :disabled => "Only with Sync now"}, :syncOnOpen,
            Settings.getBoolean("syncOnOpen", true), null));
        if (Sync.isLinked()) {
            addItem(new WatchUi.MenuItem("Unlink", Sync.serverUrl(), :unlink, null));
        }
    }

    function onShow() as Void {
        fill();
        Menu2.onShow();
    }
}

class AccountMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _menu as AccountMenu;

    function initialize(menu as AccountMenu) {
        Menu2InputDelegate.initialize();
        _menu = menu;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :link) {
            WatchUi.pushView(new LinkMenu(), new LinkMenuDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :syncOnOpen) {
            Application.Properties.setValue("syncOnOpen", (item as WatchUi.ToggleMenuItem).isEnabled());
        } else if (id == :unlink) {
            var view = new ConfirmView("Unlink this watch?", "Matches stay on the watch", true);
            WatchUi.pushView(view, new ConfirmDelegate(view, :unlink), WatchUi.SLIDE_IMMEDIATE);
        }
    }
}

// ---- Alerts (UI-17, VIB-1 to VIB-7) ----

class AlertsMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("Alerts")});
        addItem(new WatchUi.ToggleMenuItem("Full time", {:enabled => "End of each period", :disabled => "Off"}, "vibeFullTime",
            Settings.getBoolean("vibeFullTime", true), null));
        addItem(new WatchUi.ToggleMenuItem("Added time", {:enabled => "Vibrate when it's used up", :disabled => "Off"}, "vibeAdded",
            Settings.getBoolean("vibeAdded", true), null));
        // EVT-12: the sin bin's end, with sin bins in the format.
        addItem(new WatchUi.ToggleMenuItem("Sin bin over", {:enabled => "Vibrate when it ends", :disabled => "Off"}, "vibeSinBin",
            Settings.getBoolean("vibeSinBin", true), null));
        addItem(new WatchUi.ToggleMenuItem("Breaks", {:enabled => "Vibrate when due and over", :disabled => "Off"}, "vibeBreak",
            Settings.getBoolean("vibeBreak", true), null));
        addItem(new WatchUi.ToggleMenuItem("Stoppage", {:enabled => "Remind while it runs", :disabled => "Off"}, "vibeStoppage",
            Settings.getBoolean("vibeStoppage", true), null));
        addItem(new WatchUi.MenuItem("Remind every", null, "stoppageReminderSec", null));
        addItem(new WatchUi.MenuItem("Repeat alerts every", null, "alertRepeatSec", null));
        refresh();
    }

    function refresh() as Void {
        var remind = Settings.getNumber("stoppageReminderSec", 10);
        var item = getItem(5);
        if (item != null) {
            item.setSubLabel(remind == 0 ? "Off" : remind + " s");
        }
        item = getItem(6);
        if (item != null) {
            item.setSubLabel(Settings.getNumber("alertRepeatSec", 10) + " s");
        }
    }

    function onShow() as Void {
        refresh();
        Menu2.onShow();
    }
}

class AlertsMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var key = item.getId() as String;
        if (item instanceof WatchUi.ToggleMenuItem) {
            Application.Properties.setValue(key, item.isEnabled());
        } else if (key.equals("stoppageReminderSec")) {
            showSecondsChoice(key, "Remind every", [0, 10, 20, 30, 60] as Array<Number>);
        } else if (key.equals("alertRepeatSec")) {
            showSecondsChoice(key, "Repeat every", [5, 10, 15, 20, 30] as Array<Number>);
        }
    }
}

// ---- Controls (UI-17, INP-4) ----

//! How the match is run by hand. Team swipes are the account's (INP-10), not the watch's, so only
//! Tap for stoppage, Card reasons (EVT-14) and, on a watch with Up and Down, Touch lock (INP-12) are here.
class ControlsMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("Controls")});
        addItem(new WatchUi.ToggleMenuItem("Tap for " + Settings.timerName("stoppageLabel", "stoppage"), {:enabled => "Tap starts and ends it", :disabled => "Off"}, "tapStoppage",
            Settings.getBoolean("tapStoppage", false), null));
        addItem(new WatchUi.ToggleMenuItem("Card reasons", {:enabled => "Ask after the number", :disabled => "Off"}, "cardReasons",
            Settings.getBoolean("cardReasons", false), null));
        // INP-12: not on the Venu, whose teams are swipes (INP-5).
        if (Settings.hasTeamButtons()) {
            addItem(new WatchUi.ToggleMenuItem("Touch lock", {:enabled => "Buttons only in play", :disabled => "Off"}, "touchLock",
                Settings.getBoolean("touchLock", false), null));
        }
    }
}

class ControlsMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        if (item instanceof WatchUi.ToggleMenuItem) {
            Application.Properties.setValue(item.getId() as String, item.isEnabled());
        }
    }
}

//! A list of seconds to choose from for a setting; choosing sets it and goes back.
function showSecondsChoice(key as String, title as String, values as Array<Number>) as Void {
    var labels = [] as Array<String>;
    for (var i = 0; i < values.size(); i++) {
        labels.add(values[i] == 0 ? "Off" : values[i] + " s");
    }
    showSettingChoice(key, title, values, labels, Settings.getNumber(key, 10));
}

//! A list of labelled values to choose from for a setting; choosing sets it and goes back.
function showSettingChoice(key as String, title as String, values as Array<Number>, labels as Array<String>, current as Number) as Void {
    var menu = systemMenu(title);
    var focus = 0;
    for (var i = 0; i < values.size(); i++) {
        menu.addItem(new WatchUi.MenuItem(labels[i], null, values[i], null));
        if (values[i] == current) {
            focus = i;
        }
    }
    menu.setFocus(listFocus(focus));
    WatchUi.pushView(menu, new SecondsChoiceDelegate(key), WatchUi.SLIDE_LEFT);
}

// ---- Match screen (UI-17, UI-21 to UI-23, TMR-4, TMR-11) ----

const CLOCKS_NAMES = ["One clock", "Two, stacked", "Two, side by side"] as Array<String>;
const BREAK_CLOCK_NAMES = ["Time left", "Time taken"] as Array<String>;
const EDGE_NAMES = ["Neither", "Ring", "Time of day"] as Array<String>;

//! The match screen in a line, for Settings: "One clock · Match time · Ring".
function screenSummary() as String {
    var text = CLOCKS_NAMES[Screen.clocks()] + " · " + CLOCK_STYLE_NAMES[Screen.mainClock()];
    var edge = Screen.edge();
    return edge == EDGE_NONE ? text : text + " · " + EDGE_NAMES[edge];
}

class MatchScreenMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("Match screen")});
        addItem(new WatchUi.MenuItem("Clocks", null, "screenClocks", null));
        addItem(new WatchUi.MenuItem("Match clock", null, "mainClock", null));
        addItem(new WatchUi.MenuItem("Second clock", null, "secondClock", null));
        addItem(new WatchUi.MenuItem("Break clock", null, "breakClock", null));
        addItem(new WatchUi.MenuItem("Ring or time", null, "screenEdge", null));
        addItem(new WatchUi.ToggleMenuItem("Team names", {:enabled => "Over the clock", :disabled => "Scores only"}, "screenNames",
            Screen.names(), null));
        refresh();
    }

    function refresh() as Void {
        var subs = [
            CLOCKS_NAMES[Screen.clocks()],
            CLOCK_STYLE_NAMES[Screen.mainClock()],
            Screen.clocks() == CLOCKS_ONE ? "With two clocks" : CLOCK_STYLE_NAMES[Screen.secondClock()],
            BREAK_CLOCK_NAMES[Screen.breakClock()],
            // UI-23: a square watch shows the time where the ring would be.
            Screen.shownEdge(Screen.edge()) != Screen.edge() ? "Ring · time on this watch" : EDGE_NAMES[Screen.edge()]
        ] as Array<String>;
        for (var i = 0; i < subs.size(); i++) {
            var item = getItem(i);
            if (item != null) {
                item.setSubLabel(subs[i]);
            }
        }
    }

    function onShow() as Void {
        refresh();
        Menu2.onShow();
    }
}

class MatchScreenDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var key = item.getId() as String;
        if (item instanceof WatchUi.ToggleMenuItem) {
            Application.Properties.setValue(key, item.isEnabled());
            Sync.screenChanged();
        } else if (key.equals("screenClocks")) {
            showSettingChoice(key, "Clocks", [CLOCKS_ONE, CLOCKS_STACKED, CLOCKS_SIDE_BY_SIDE] as Array<Number>, CLOCKS_NAMES, Screen.clocks());
        } else if (key.equals("mainClock")) {
            showClockChoice(key, "Match clock", [CLOCK_UP, CLOCK_UP_EACH, CLOCK_DOWN] as Array<Number>, Screen.mainClock());
        } else if (key.equals("secondClock")) {
            // UI-22: the two styles the match clock isn't.
            var values = [] as Array<Number>;
            for (var style = 0; style < 3; style++) {
                if (style != Screen.mainClock()) {
                    values.add(style);
                }
            }
            showClockChoice(key, "Second clock", values, Screen.secondClock());
        } else if (key.equals("breakClock")) {
            showSettingChoice(key, "Break clock", [BREAK_DOWN, BREAK_UP] as Array<Number>, BREAK_CLOCK_NAMES, Screen.breakClock());
        } else if (key.equals("screenEdge")) {
            showSettingChoice(key, "Ring or time", [EDGE_RING, EDGE_TIME, EDGE_NONE] as Array<Number>,
                [EDGE_NAMES[EDGE_RING], EDGE_NAMES[EDGE_TIME], EDGE_NAMES[EDGE_NONE]] as Array<String>, Screen.edge());
        }
    }
}

//! TMR-11: a choice of clock styles, each with its example for a 2 × 45 match.
function showClockChoice(key as String, title as String, values as Array<Number>, current as Number) as Void {
    var menu = systemMenu(title);
    var focus = 0;
    for (var i = 0; i < values.size(); i++) {
        menu.addItem(new WatchUi.MenuItem(CLOCK_STYLE_NAMES[values[i]], CLOCK_STYLE_HINTS[values[i]], values[i], null));
        if (values[i] == current) {
            focus = i;
        }
    }
    menu.setFocus(listFocus(focus));
    WatchUi.pushView(menu, new SecondsChoiceDelegate(key), WatchUi.SLIDE_LEFT);
}

//! UI-24: the settings that make up the match screen, sent to the account when changed here.
const SCREEN_KEYS = ["screenClocks", "mainClock", "secondClock", "breakClock", "screenEdge", "screenNames"] as Array<String>;

class SecondsChoiceDelegate extends WatchUi.Menu2InputDelegate {
    private var _key as String;

    function initialize(key as String) {
        Menu2InputDelegate.initialize();
        _key = key;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        Application.Properties.setValue(_key, item.getId() as Number);
        if (SCREEN_KEYS.indexOf(_key) >= 0) {
            Sync.screenChanged();
        }
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}

// ---- Timer names (UI-17, SET-8) ----

class TimerNamesMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("Timer names")});
        addItem(new WatchUi.MenuItem("Stoppage timer", null, "stoppageLabel", null));
        addItem(new WatchUi.MenuItem("Break timer", null, "breakLabel", null));
        refresh();
    }

    function refresh() as Void {
        var item = getItem(0);
        if (item != null) {
            item.setSubLabel(Settings.timerName("stoppageLabel", "stoppage"));
        }
        item = getItem(1);
        if (item != null) {
            item.setSubLabel(Settings.timerName("breakLabel", "break"));
        }
    }

    function onShow() as Void {
        refresh();
        Menu2.onShow();
    }
}

class TimerNamesDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var key = item.getId() as String;
        var current = Settings.timerName(key, key.equals("stoppageLabel") ? "stoppage" : "break");
        WatchUi.pushView(new WatchUi.TextPicker(current), new TimerNameDelegate(key), WatchUi.SLIDE_LEFT);
    }
}

class TimerNameDelegate extends WatchUi.TextPickerDelegate {
    private var _key as String;

    function initialize(key as String) {
        TextPickerDelegate.initialize();
        _key = key;
    }

    //! Blank goes back to the default name; up to 12 characters fit the menus.
    function onTextEntered(text as String, changed as Boolean) as Boolean {
        var name = text.length() > 12 ? text.substring(0, 12) as String : text;
        Application.Properties.setValue(_key, name.toLower());
        return true;
    }

    function onCancel() as Boolean {
        return true;
    }
}

// ---- History (UI-17, DATA-3) ----

//! The finished matches on the watch, newest first, each with whether it has reached LawFive.
class HistoryMenu extends WatchUi.Menu2 {
    function initialize() {
        Menu2.initialize({:title => new TimedTitle("History")});
        fill();
    }

    //! Rebuilt when shown, as a match may have been removed or sent.
    function fill() as Void {
        while (getItem(0) != null) {
            deleteItem(0);
        }
        var matches = History.all();
        for (var i = 0; i < matches.size(); i++) {
            var entry = matches[i];
            addItem(new WatchUi.MenuItem(History.title(entry), History.when(entry) + " · " + History.stateShort(entry), entry["created"] as Number, null));
        }
        if (matches.size() == 0) {
            addItem(new WatchUi.MenuItem("No matches yet", "Finished matches show here", :none, null));
        }
    }

    function onShow() as Void {
        fill();
        Menu2.onShow();
    }
}

class HistoryMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id instanceof Number && History.find(id) != null) {
            var menu = new HistoryMatchMenu(id);
            WatchUi.pushView(menu, new HistoryMatchDelegate(menu), WatchUi.SLIDE_LEFT);
        }
    }

    function onBack() as Void {
        showStartMenu(HOME_HISTORY);
    }
}

//! One finished match: whether it's on LawFive (and sending it), its summary, its events, and
//! removing it from the watch.
class HistoryMatchMenu extends WatchUi.Menu2 {
    var created as Number;
    private var _timer as Timer.Timer? = null;

    function initialize(id as Number) {
        created = id;
        var entry = History.find(id) as Dictionary;
        Menu2.initialize({:title => new TimedTitle(History.title(entry))});
        addItem(new WatchUi.MenuItem("", null, :status, null));
        addItem(new WatchUi.MenuItem("Summary", History.when(entry), :summary, null));
        addItem(new WatchUi.MenuItem("Events", null, :events, null));
        var details = entry["details"];
        var fee = details instanceof Dictionary ? details["fee"] : null;
        if (fee instanceof Dictionary) {
            addItem(new WatchUi.ToggleMenuItem("Fee " + (fee["text"] as String), {:enabled => "Paid", :disabled => "Not paid"}, :fee, (fee["paid"] as Boolean?) == true, null));
        }
        addItem(new WatchUi.MenuItem("Mark pitch", pitchSub(pitchTarget()), :pitch, null));
        addItem(new WatchUi.MenuItem("Remove from watch", null, :remove, null));
        showStatus();
    }

    //! The match corners are marked for: the planned match it was started from, else this one.
    function pitchTarget() as Dictionary {
        var entry = History.find(created);
        var details = entry != null ? entry["details"] : null;
        var id = details instanceof Dictionary ? details["id"] : null;
        return id != null ? {"matchId" => id} : {"created" => created};
    }

    function showStatus() as Void {
        var entry = History.find(created);
        var item = getItem(0);
        if (entry == null || item == null) {
            return;
        }
        var state = History.state(entry);
        item.setLabel(state[0]);
        item.setSubLabel(Sync.isRunning() ? Sync.progressText() : state[1]);
        WatchUi.requestUpdate();
    }

    //! Sends this match (and anything else waiting), showing the steps in the status row.
    function send() as Void {
        var entry = History.find(created);
        if (entry == null || Sync.isRunning()) {
            return;
        }
        if (!Sync.isQueued(created) && !History.isSent(entry)) {
            var upload = History.uploadOf(entry);
            if (upload == null) {
                return;
            }
            Sync.queue(upload);
        }
        Sync.run(method(:onSent));
        var timer = new Timer.Timer();
        timer.start(method(:showStatus), 400, true);
        _timer = timer;
        showStatus();
    }

    function onSent(ok as Boolean) as Void {
        stopTimer();
        showStatus();
    }

    private function stopTimer() as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
            _timer = null;
        }
    }

    function onShow() as Void {
        showStatus();
        var item = getItem(findItemById(:pitch));
        if (item != null) {
            item.setSubLabel(pitchSub(pitchTarget()));
        }
        Menu2.onShow();
    }

    function onHide() as Void {
        stopTimer();
        Menu2.onHide();
    }
}

class HistoryMatchDelegate extends WatchUi.Menu2InputDelegate {
    private var _menu as HistoryMatchMenu;

    function initialize(menu as HistoryMatchMenu) {
        Menu2InputDelegate.initialize();
        _menu = menu;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var entry = History.find(_menu.created);
        if (entry == null) {
            return;
        }
        var id = item.getId();
        if (id == :status) {
            if (History.isSent(entry) && !TrackLog.isQueued(_menu.created) && !Sync.isQueued(_menu.created)) {
                return;
            } else if (!Sync.isLinked()) {
                WatchUi.pushView(new LinkMenu(), new LinkMenuDelegate(), WatchUi.SLIDE_LEFT);
            } else {
                _menu.send();
            }
        } else if (id == :fee) {
            // UI-20: a fee paid after the game; the menu has already flipped the toggle.
            Sync.setFeePaid((entry["details"] as Dictionary)["id"] as String, (item as WatchUi.ToggleMenuItem).isEnabled());
            Sync.run(null);
        } else if (id == :pitch) {
            markPitch(_menu.pitchTarget());
        } else if (id == :summary) {
            WatchUi.pushView(summaryMenu(entry), new WatchUi.Menu2InputDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :events) {
            WatchUi.pushView(eventsMenu("Events", entry["events"] as Array<Array>, entry["home"] as String,
                entry["away"] as String, entry["numPeriods"] as Number, stringOr(entry["stoppageLabel"] as String?, "stoppage"),
                entry["periodStarts"] as Array<Number>?), new WatchUi.Menu2InputDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :remove) {
            // Removing a match that hasn't reached LawFive loses it for good, so it says so.
            History.pendingRemoval = _menu.created;
            var sent = History.isSent(entry);
            var view = new ConfirmView(sent ? "Remove from watch?" : "Not sent to LawFive",
                sent ? "It stays on LawFive" : "Remove it anyway? It will be lost", true);
            WatchUi.pushView(view, new ConfirmDelegate(view, :removeHistory), WatchUi.SLIDE_IMMEDIATE);
        }
    }
}

//! A finished match at a glance: the score, each period's time with what was added, the cards and
//! the distance.
function summaryMenu(entry as Dictionary) as WatchUi.Menu2 {
    var menu = systemMenu("Summary");
    var score = entry["score"] as Array<Number>;
    var scoreText = (entry["home"] as String) + " " + score[0] + "-" + score[1] + " " + (entry["away"] as String);
    var pens = entry["pens"];
    if (pens instanceof Array) {
        scoreText += " · " + (pens[0] as Number).format("%d") + "-" + (pens[1] as Number).format("%d") + " pens";
    }
    menu.addItem(new WatchUi.MenuItem("Score", scoreText, :none, null));
    var numPeriods = entry["numPeriods"] as Number;
    var periodSec = entry["periodSec"];
    var etPeriodSec = entry["etPeriodSec"];
    var events = entry["events"] as Array<Array>;
    var yellow = 0;
    var red = 0;
    var sinBins = 0;
    for (var i = 0; i < events.size(); i++) {
        var type = events[i][EV_TYPE] as String;
        var seconds = events[i][EV_SECONDS] as Number;
        if (type.equals(EVENT_PERIOD_END) && seconds >= 0) {
            var p = events[i][EV_PERIOD] as Number;
            var length = p < numPeriods ? periodSec : etPeriodSec;
            var sub = "Played " + Format.seconds(seconds);
            if (length instanceof Number && seconds > length) {
                sub += " · +" + Format.seconds(seconds - length);
            }
            menu.addItem(new WatchUi.MenuItem(Format.capitalize(Format.periodName(p, numPeriods)), sub, :none, null));
        } else if (type.equals(EVENT_YELLOW) || type.equals(EVENT_OFFICIAL_YELLOW)) {
            // Team officials' cards count, as in the website's Stats (EVT-15).
            yellow += 1;
        } else if (type.equals(EVENT_SECOND_YELLOW)) {
            // As in the website's Stats: a second caution is one of each.
            yellow += 1;
            red += 1;
        } else if (type.equals(EVENT_RED) || type.equals(EVENT_OFFICIAL_RED)) {
            red += 1;
        } else if (type.equals(EVENT_SIN_BIN)) {
            sinBins += 1;
        } else if (type.equals(EVENT_SECOND_SIN_BIN)) {
            // EVT-12: as in the website's Stats, a second sin bin is a send-off, and a sin bin too.
            sinBins += 1;
            red += 1;
        }
    }
    menu.addItem(new WatchUi.MenuItem("Cards", (yellow == 1 ? "1 caution" : yellow + " cautions") + " · " + (red == 1 ? "1 send-off" : red + " send-offs"), :none, null));
    if (sinBins > 0) {
        menu.addItem(new WatchUi.MenuItem("Sin bins", sinBins.format("%d"), :none, null));
    }
    var distance = entry["distanceM"];
    if (distance instanceof Number && distance > 0) {
        var miles = System.getDeviceSettings().distanceUnits == System.UNIT_STATUTE;
        var text = miles ? (distance / 1609.344).format("%.1f") + " mi" : (distance / 1000.0).format("%.1f") + " km";
        menu.addItem(new WatchUi.MenuItem("Distance", text, :none, null));
    }
    return menu;
}
