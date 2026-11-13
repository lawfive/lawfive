#!/bin/bash
# Puts TestMatches.mc into a copy of the source (never the repo's own): install.sh --test-matches, or a simulator test copy.
set -e
src="${1:?usage: add-test-matches.sh <copy of watch-garmin>}"
here="$(cd "$(dirname "$0")" && pwd)"
cp "$here/TestMatches.mc" "$src/source/TestMatches.mc"
# Each install loads them once more.
sed -i '' "s/\"testMatchesLoaded\"/\"testMatches$(date +%s)\"/" "$src/source/TestMatches.mc"
sed -i '' 's/^        var stored = loadMatch();$/        TestMatches.start();\
        var stored = loadMatch();/' "$src/source/LawFiveApp.mc"
sed -i '' 's/^    function onTick() as Void {$/    function onTick() as Void {\
        TestMatches.tick();/' "$src/source/LawFiveApp.mc"
grep -q "TestMatches.start" "$src/source/LawFiveApp.mc" && grep -q "TestMatches.tick" "$src/source/LawFiveApp.mc" || { echo "Couldn't add the test matches." >&2; exit 1; }
