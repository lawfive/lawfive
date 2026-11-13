#!/bin/bash
# The iPhone's snapshot pictures (mobile/ios/README.md#snapshot-pictures): the screens in ScreenSnapshots, drawn
# from the shared fixtures (schema/generated/fixtures) at the iPhone 17's and the SE's size, light and
# dark, at the default and the largest standard text size, into a folder to look at. Nothing is
# compared or committed.
#
#   tools/snapshots.sh [--no-build] [--keep] [--watch] [testMatches testStats ...]
#
# Builds once for testing into one DerivedData (incremental, so a run after a change only builds what
# changed; --no-build skips it), then only tests. Runs on one simulator (LAWFIVE_SIMULATOR, the iPhone
# 17 by default), booted for the run and shut down after unless it was already up or --keep is given;
# its text size is set for each pass (iOS reads it from the phone, not a view) and put back.
# Pictures: build/snapshots/{screen}__{iphone17|se}-{light|dark}-{1x|large}.png (LAWFIVE_SNAPSHOTS
# for another folder), the same names as Android's with its widths, so a script can pair them.
# --watch also draws the Apple Watch's screens (LawFiveWatchTests, with SwiftUI's ImageRenderer, as
# watchOS has no window to host one in) on LAWFIVE_WATCH_SIMULATOR (Apple Watch Series 12 (46mm)),
# after the iPhone's is shut down, one simulator at a time.
set -euo pipefail
cd "$(dirname "$0")/.."

out="${LAWFIVE_SNAPSHOTS:-$PWD/build/snapshots}"
derived="${LAWFIVE_DERIVED_DATA:-$PWD/build/DerivedData}"
name="${LAWFIVE_SIMULATOR:-iPhone 17}"
build=1
keep=0
watch=0
only=()
for arg in "$@"; do
    case "$arg" in
        --no-build) build=0 ;;
        --keep) keep=1 ;;
        --watch) watch=1 ;;
        test*) only+=("-only-testing:LawFiveTests/ScreenSnapshots/$arg") ;;
        *) echo "Unknown: $arg" >&2; exit 2 ;;
    esac
done
[ ${#only[@]} -gt 0 ] || only=("-only-testing:LawFiveTests/ScreenSnapshots")

# The newest runtime's simulator of that name.
udid=$(xcrun simctl list devices available | grep -E "^    $name \(" | tail -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$udid" ] || { echo "No simulator named $name" >&2; exit 1; }
destination="platform=iOS Simulator,id=$udid"
started=$(date +%s)

if [ "$build" = 1 ]; then
    echo "Building for testing ($derived)…"
    xcodebuild -project LawFive.xcodeproj -scheme LawFive -destination "$destination" -derivedDataPath "$derived" \
        build-for-testing -quiet
fi

booted=0
if ! xcrun simctl list devices booted | grep -q "$udid"; then
    xcrun simctl boot "$udid"
    booted=1
fi
xcrun simctl bootstatus "$udid" -b >/dev/null
size=$(xcrun simctl ui "$udid" content_size)

finish() {
    xcrun simctl ui "$udid" content_size "$size" || true
    if [ "$booted" = 1 ] && [ "$keep" = 0 ]; then xcrun simctl shutdown "$udid" || true; fi
}
trap finish EXIT

mkdir -p "$out"
# A full run starts afresh; a run of some screens leaves the others' pictures.
[ "${only[0]}" = "-only-testing:LawFiveTests/ScreenSnapshots" ] && find "$out" -maxdepth 1 -name '*__*.png' -delete
for text in large extra-extra-extra-large; do
    echo "Pictures at the $text text size…"
    xcrun simctl ui "$udid" content_size "$text"
    TEST_RUNNER_LAWFIVE_SNAPSHOTS="$out" xcodebuild -project LawFive.xcodeproj -scheme LawFive -destination "$destination" \
        -derivedDataPath "$derived" test-without-building -only-testing:LawFiveTests/FixturesTests "${only[@]}" \
        -test-timeouts-enabled YES -maximum-test-execution-time-allowance 600 -quiet
done

if [ "$watch" = 1 ]; then
    finish
    trap - EXIT
    wname="${LAWFIVE_WATCH_SIMULATOR:-Apple Watch Series 12 (46mm)}"
    wudid=$(xcrun simctl list devices available | grep -F "    $wname (" | tail -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
    [ -n "$wudid" ] || { echo "No simulator named $wname" >&2; exit 1; }
    wdest="platform=watchOS Simulator,id=$wudid"
    [ "$build" = 1 ] && xcodebuild -project LawFive.xcodeproj -scheme LawFiveWatch -destination "$wdest" -derivedDataPath "$derived" build-for-testing -quiet
    wbooted=0
    if ! xcrun simctl list devices booted | grep -q "$wudid"; then xcrun simctl boot "$wudid"; wbooted=1; fi
    xcrun simctl bootstatus "$wudid" -b >/dev/null
    echo "The Apple Watch's pictures…"
    TEST_RUNNER_LAWFIVE_SNAPSHOTS="$out" xcodebuild -project LawFive.xcodeproj -scheme LawFiveWatch -destination "$wdest" \
        -derivedDataPath "$derived" test-without-building -only-testing:LawFiveWatchTests -quiet || echo "The Apple Watch's pictures didn't come (see above)" >&2
    if [ "$wbooted" = 1 ] && [ "$keep" = 0 ]; then xcrun simctl shutdown "$wudid" || true; fi
fi

echo "$(find "$out" -maxdepth 1 -name '*__*.png' | wc -l | tr -d ' ') pictures in $out ($(( $(date +%s) - started )) s)"
