#!/bin/bash
# Pictures of every screen in light or dark, for reviewing the design, from the demo's made-up data.
# Needs the demo server (pnpm demo in server/).   tools/screenshots.sh <output folder> [light|dark]
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
scheme=${2:-light}
device=${LAWFIVE_SIMULATOR:-iPhone 18 Pro Max}
xcrun simctl boot "$device" 2>/dev/null || true
xcrun simctl ui "$device" appearance "$scheme"
xcrun simctl uninstall "$device" app.lawfive 2>/dev/null || true
TEST_RUNNER_LAWFIVE_SHOTS="$out/$scheme" xcodebuild -project LawFive.xcodeproj -scheme LawFive \
    -destination "platform=iOS Simulator,name=$device" -only-testing:LawFiveUITests/Walkthrough test
