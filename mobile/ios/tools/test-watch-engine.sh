#!/bin/bash
# WCH-2: the Apple Watch's match rules, its track packing (TRK-7) and the rules for linking from the iPhone
# (decision 4c), tested on the Mac: they need nothing of watchOS.
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
mkdir -p "$out/src"
cp LawFiveWatch/MatchEngine.swift "$out/src/MatchEngine.swift"
cp LawFiveWatch/TrackPacking.swift "$out/src/TrackPacking.swift"
cp LawFiveWatch/PhoneLinkRules.swift "$out/src/PhoneLinkRules.swift"
cp LawFiveWatchEngineTests/main.swift LawFiveWatchEngineTests/CaseRunner.swift "$out/src/"
# WCH-2: the shared match cases, as pnpm generate writes them in schema/.
cp ../../schema/generated/swift-tests/MatchCases.swift "$out/src/MatchCases.swift"
swiftc "$out/src/MatchEngine.swift" "$out/src/TrackPacking.swift" "$out/src/PhoneLinkRules.swift" "$out/src/MatchCases.swift" "$out/src/CaseRunner.swift" "$out/src/main.swift" -o "$out/engine-tests"
"$out/engine-tests"
