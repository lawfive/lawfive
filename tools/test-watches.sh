#!/bin/bash
# WCH-2: every copy of the match rules, tested: the three watches' engines with the shared match cases
# (schema/match-cases/), and the phones' match screen pictures with its screen cases. The website's run
# with `pnpm test`. Each part runs only when its tools are on this computer, and the end says which
# were skipped. `pnpm test:watches` from the repo root; exits 1 if any part failed.
set -uo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)
failed=()
skipped=()
passed=()

step() { printf '\n== %s\n' "$1"; }

# The cases are generated from schema/match-cases; out of date, every copy would test old cases.
step "Shared cases (schema)"
generated=(schema/generated/match-cases.json schema/generated/kotlin-tests/MatchCases.kt schema/generated/swift-tests/MatchCases.swift watch-garmin/source/MatchCases.mc mobile/ios/LawFiveTests/MatchCases.swift)
before=$(cat "${generated[@]}" 2>/dev/null | shasum)
if (cd schema && pnpm -s generate >/dev/null) && [ "$(cat "${generated[@]}" | shasum)" = "$before" ]; then
    passed+=("cases up to date")
else
    echo "The generated cases were out of date: pnpm generate has updated them, so commit them with the case files."
    failed+=("cases out of date")
fi

step "Wear OS and Android (Gradle)"
java_home="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
if [ -d "$java_home" ] && [ -x mobile/android/gradlew ]; then
    if (cd mobile/android && JAVA_HOME="$java_home" ./gradlew -q :wear:testDebugUnitTest :app:testDebugUnitTest); then
        passed+=("Wear OS and Android")
    else
        failed+=("Wear OS and Android")
    fi
else
    skipped+=("Wear OS and Android (no Java 21)")
fi

step "Apple Watch engine (swiftc)"
if command -v swiftc >/dev/null; then
    if bash mobile/ios/tools/test-watch-engine.sh; then passed+=("Apple Watch"); else failed+=("Apple Watch"); fi
else
    skipped+=("Apple Watch (no Swift)")
fi

step "iPhone unit tests (xcodebuild)"
# An iPhone simulator on the newest iOS there is, by its id: LAWFIVE_SIMULATOR if set (as
# mobile/ios/tools/snapshots.sh takes it), else the iPhone 17 the other scripts use, else the first iPhone.
simulator=${LAWFIVE_SIMULATOR:-$(xcrun simctl list devices available -j 2>/dev/null | python3 -c '
import json, re, sys
runtimes = json.load(sys.stdin)["devices"]
ios = sorted((r for r in runtimes if "iOS" in r), key=lambda r: [int(n) for n in re.findall(r"\d+", r)])
phones = [d for r in reversed(ios) for d in runtimes[r] if d["name"].startswith("iPhone")]
print(next((d["udid"] for d in phones if d["name"] == "iPhone 17"), phones[0]["udid"] if phones else ""))' 2>/dev/null)}
if command -v xcodebuild >/dev/null && [ -n "$simulator" ]; then
    if (cd mobile/ios && xcodebuild -quiet -project LawFive.xcodeproj -scheme LawFive -destination "id=$simulator" -only-testing:LawFiveTests test 2>&1 | grep -E "error:|failed|Executed" | tail -5; exit "${PIPESTATUS[0]}"); then
        passed+=("iPhone")
    else
        failed+=("iPhone")
    fi
else
    skipped+=("iPhone (no Xcode or iPhone simulator)")
fi

step "Garmin (Connect IQ simulator)"
sdk_cfg="$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg"
key="${SIM_KEY:-$HOME/.lawfive/garmin/developer_key}"
if [ -f "$sdk_cfg" ] && [ -f "$key" ]; then
    sdk="$(cat "$sdk_cfg")"
    (cd watch-garmin && "$sdk/bin/monkeyc" -f monkey.jungle -d fr965 -y "$key" -o bin/LawFive.prg -l 3 2>&1 | grep -E "ERROR|BUILD" | tail -3) \
        && (cd watch-garmin && "$sdk/bin/monkeyc" -t -f monkey.jungle -d fr965 -y "$key" -o bin/LawFive-test.prg -l 3 2>&1 | grep -E "ERROR" | tail -5; exit "${PIPESTATUS[0]}")
    built=$?
    if [ $built -ne 0 ]; then
        failed+=("Garmin (build)")
    else
        # The tests run in the simulator: started in the background if it isn't running.
        pgrep -f "ConnectIQ.app/Contents/MacOS/simulator" >/dev/null || { open -g "$sdk/bin/ConnectIQ.app"; sleep 10; }
        out=$(cd watch-garmin && timeout 300 "$sdk/bin/monkeydo" bin/LawFive-test.prg fr965 -t 2>&1)
        if [ -z "$out" ]; then
            # The simulator sometimes stops answering after many runs: once more, started afresh.
            echo "The simulator didn't answer: starting it again."
            pkill -f "ConnectIQ.app/Contents/MacOS/simulator"; sleep 3
            open -g "$sdk/bin/ConnectIQ.app"; sleep 10
            out=$(cd watch-garmin && timeout 300 "$sdk/bin/monkeydo" bin/LawFive-test.prg fr965 -t 2>&1)
        fi
        echo "$out" | grep -E "ERROR|FAIL|PASSED|Ran " | tail -8
        if echo "$out" | grep -q "PASSED"; then
            passed+=("Garmin")
        elif [ -z "$out" ]; then
            failed+=("Garmin (the simulator didn't answer twice)")
        else
            failed+=("Garmin")
        fi
    fi
else
    skipped+=("Garmin (no Connect IQ SDK or developer key)")
fi

printf '\n== Watches and pictures\n'
for p in "${passed[@]}"; do echo "passed:  $p"; done
for s in "${skipped[@]+"${skipped[@]}"}"; do echo "skipped: $s"; done
for f in "${failed[@]+"${failed[@]}"}"; do echo "FAILED:  $f"; done
[ ${#failed[@]} -eq 0 ]
