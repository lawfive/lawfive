#!/bin/bash
# Build a release copy for a watch and copy it to the watch over USB, e.g. `tools/device/install.sh venu2`.
# `--server https://lawfive.example.com` builds that server in as the default (SYNC-8): a sideloaded app
# gets no phone settings (R-9), so this is how it links to your own server.
# Needs `brew install libmtp`, and OpenMTP / Garmin Express closed (only one program can use the watch).
# The device id must match the watch model (venu2, venu2s and venu2plus are different builds).
# `--test-matches` adds two finished matches with tracks to the upload queue, once, for trying a sync
# without refereeing a game (TestMatches.mc). They go to the linked account; install normally afterwards.
set -e
device="${1:?usage: tools/device/install.sh <device-id> [--server https://...] [--test-matches]}"
server=""
test_matches=""
if [ "${@: -1}" = "--test-matches" ]; then
    test_matches=1
    set -- "${@:1:$#-1}"
fi
if [ "$2" = "--server" ]; then
    server="${3%/}"
    case "$server" in
        *[!A-Za-z0-9.:/_-]*) echo "That doesn't look like a server address: $server" >&2; exit 1 ;;
        https://?*) ;;
        *) echo "The server must be an https:// address (watches only make HTTPS requests)." >&2; exit 1 ;;
    esac
fi
repo="$(cd "$(dirname "$0")/../.." && pwd)"
sdk="$(cat "$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg")"
key="${SIM_KEY:-$HOME/.lawfive/garmin/developer_key}"
out="$repo/bin/device"
mkdir -p "$out" "$repo/bin/tools"

if [ ! -x "$repo/bin/tools/mtpput" ] || [ "$repo/tools/device/mtpput.c" -nt "$repo/bin/tools/mtpput" ]; then
    cc -O2 "$repo/tools/device/mtpput.c" $(pkg-config --cflags --libs libmtp) -o "$repo/bin/tools/mtpput"
fi

# Built from a copy with this version stamped in (VER-1, Sync.APP_VERSION), and with --server that
# server built in (SYNC-8, Sync.BUILT_IN_SERVER).
src="$out/src"
rsync -a --delete --exclude bin --exclude tools --exclude '*.md' "$repo/" "$src/"
# A build with uncommitted changes says so: "2026.10.30.6+".
read -r version commit _ <<< "$("$repo/../tools/version.sh" watch)"
case "$commit" in *+) version="$version+" ;; esac
sed -i '' -E "s|(const APP_VERSION = \")[^\"]*(\";)|\1$version\2|" "$src/source/Sync.mc"
grep -qF "APP_VERSION = \"$version\";" "$src/source/Sync.mc" || { echo "Couldn't set the version in the build." >&2; exit 1; }
if [ -n "$server" ]; then
    sed -i '' -E "s|(const BUILT_IN_SERVER = \")[^\"]*(\";)|\1$server\2|" "$src/source/Sync.mc"
    grep -q "BUILT_IN_SERVER = \"$server\";" "$src/source/Sync.mc" || { echo "Couldn't set the server in the build." >&2; exit 1; }
fi
if [ -n "$test_matches" ]; then
    "$repo/tools/device/add-test-matches.sh" "$src"
    version="$version test matches"
fi
echo "Version $version"

"$sdk/bin/monkeyc" -r -f "$src/monkey.jungle" -d "$device" -y "$key" -o "$out/LawFive.prg" -l 3
# SoccerRef.prg is what the app was installed as before it was renamed; it's the same app (same id),
# so it's removed rather than left as a second copy. Its settings and matches are kept by app id.
"$repo/bin/tools/mtpput" "$out/LawFive.prg" GARMIN/APPS SoccerRef.prg
echo "Unplug the watch; LawFive appears in its app list.${server:+ It links to $server.}"
