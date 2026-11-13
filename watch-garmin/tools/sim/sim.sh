# Helpers for driving the Connect IQ simulator from a shell. Source it from bash (not zsh, which
# breaks the repo path): `bash -c 'source tools/sim/sim.sh; ...'`.
# Needs Screen Recording and Accessibility permission for the terminal/VS Code (macOS Privacy settings).
# Taps, drags and key presses bring the simulator to the front and move the real mouse briefly.

SIM_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SIM_SDK="$(cat "$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg")"
SIM_KEY="${SIM_KEY:-$HOME/.lawfive/garmin/developer_key}"
SIM_BIN="$SIM_REPO/bin/tools"

# Compile the Swift helpers into bin/tools (once per machine, or after editing them).
sim_build_tools() {
    mkdir -p "$SIM_BIN"
    for t in winlist hidtap hiddrag; do
        swiftc -O "$SIM_REPO/tools/sim/$t.swift" -o "$SIM_BIN/$t" || return 1
    done
}

# Window id of the simulator (changes whenever the simulator restarts).
sim_window() { "$SIM_BIN/winlist" | awk 'NR == 1 { print $1 }'; }

# Window origin and size in screen points: "x y width height".
sim_bounds() { "$SIM_BIN/winlist" | awk 'NR == 1 { print $2, $3, $4, $5 }'; }

# Screenshot just the simulator window (works behind other windows), shrunk to 520 px tall for reading.
# The full-size capture is 2x the window's point size.
sim_shot() { screencapture -x -o -l "$(sim_window)" "$1" && sips -Z 520 "$1" >/dev/null; }

# Key press: 36 Enter (Start/Stop), 53 Esc (Back), 126/125 Up/Down, 56 Shift (no-op, to wake focus).
# The first key after loading an app is often dropped: send 56 first and wait ~1.5 s after screen changes.
sim_key() {
    sim_front
    sleep 0.2
    # Keys go to whatever is in front, so never send one unless that's the simulator.
    [ "$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true')" = "simulator" ] || {
        echo "sim_key: the simulator isn't in front, so key $1 wasn't sent" >&2
        return 1
    }
    osascript -e 'tell application "System Events" to key code '"$1" >/dev/null
    sleep 0.6
}

# Bring the simulator to the front (taps and drags go to whatever window is on top). By exact name, as
# the iPhone simulator's background processes also have "simulator" in their names.
sim_front() {
    osascript -e 'tell application "System Events" to tell (first process whose name is "simulator") to set frontmost to true' >/dev/null
}

# Tap or drag at screen coordinates (points). Map from a screenshot using sim_bounds.
sim_tap() { sim_front; sleep 0.3; "$SIM_BIN/hidtap" "$1" "$2"; }
sim_drag() { sim_front; sleep 0.3; "$SIM_BIN/hiddrag" "$1" "$2" "$3" "$4"; }

# Load a .prg on a device; app output (System.println) goes to bin/sim.log.
sim_run() {
    pgrep -f "ConnectIQ.app/Contents/MacOS/simulator" >/dev/null || { open -g "$SIM_SDK/bin/ConnectIQ.app"; sleep 8; }
    pkill -f "monkeydo|MonkeyDoDeux"; sleep 1
    ("$SIM_SDK/bin/monkeydo" "$1" "$2" > "$SIM_REPO/bin/sim.log" 2>&1 &)
    sleep 8
}

# Build a test copy under bin/testcopy with its own app id (so the real app's settings, saved match and
# history are untouched) and optional property overrides, e.g.:
#   sim_testcopy venu3 periodMin=1 halftimeMin=0 breakAt=0:20 breakLenSec=15
# Prints the .prg path. Change SIM_TEST_ID to start from empty storage. Builds for other devices are kept.
sim_testcopy() {
    local device="$1"; shift
    local dir="$SIM_REPO/bin/testcopy"
    mkdir -p "$dir"
    rsync -a --delete --exclude bin --exclude '*.md' --exclude tools --exclude '*.prg' --exclude '*.prg.debug.xml' "$SIM_REPO/" "$dir/"
    sed -i '' "s/id=\"96dae5fe5bf34b6997efbd34ec61f984\"/id=\"${SIM_TEST_ID:-7a8b9c0d1e2f30415263748596a7b8c9}\"/" "$dir/manifest.xml"
    local kv
    for kv in "$@"; do
        sed -i '' -E "s|(<property id=\"${kv%%=*}\" type=\"[a-z]+\">)[^<]*(</property>)|\1${kv#*=}\2|" "$dir/resources/settings/properties.xml"
    done
    "$SIM_SDK/bin/monkeyc" -f "$dir/monkey.jungle" -d "$device" -y "$SIM_KEY" -o "$dir/$device.prg" >/dev/null || return 1
    echo "$dir/$device.prg"
}
