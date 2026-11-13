#!/bin/bash
# Checks a Google Play release before uploading it (runbook Google 2): the tests pass, this machine
# isn't building in anything of its own, the phone and watch have different version codes, the target
# levels meet Google's floor, and the bundles build. Run from anywhere. Fails on the first problem.
#   mobile/android/tools/release-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# What Google Play asks for as of 2026-10-28; check https://developer.android.com/google/play/requirements/target-sdk
phone_floor=36
wear_floor=35

fail() { echo "NOT READY: $1" >&2; exit 1; }
ok() { echo "ok: $1"; }

# This machine's own settings would be built into what goes to the store.
if [ -f local.properties ]; then
    grep -q '^lawfive.server=' local.properties && fail "local.properties builds in another server (lawfive.server)"
    grep -q '^lawfive.ciq.tethered=true' local.properties && fail "local.properties has lawfive.ciq.tethered=true"
fi
ok "local.properties builds in no other server, and isn't tethered to a simulator"

# PUSH-5: without the Firebase app, the release would quietly have no notifications; with another relay, they'd go astray.
grep -q '^lawfive.firebase.appId=.' local.properties 2>/dev/null || fail "local.properties has no Firebase app, so notifications would be missing (mobile/android/README.md)"
grep -q '^lawfive.push.relay=' local.properties 2>/dev/null && fail "local.properties points at another push relay (lawfive.push.relay)"
ok "local.properties has the Firebase app and the project's relay"

# Android Gradle reads these from the build files, so a change there is checked here.
target() { sed -nE 's/^[[:space:]]*targetSdk = ([0-9]+).*/\1/p' "$1/build.gradle.kts"; }
[ "$(target app)" -ge "$phone_floor" ] || fail "the phone's targetSdk $(target app) is under $phone_floor"
[ "$(target wear)" -ge "$wear_floor" ] || fail "the watch's targetSdk $(target wear) is under $wear_floor"
ok "target levels: phone $(target app) (at least $phone_floor), watch $(target wear) (at least $wear_floor)"

if [ -n "$(git status --porcelain -- . ../../schema)" ]; then
    echo "warning: uncommitted changes, so this isn't what main would build" >&2
fi

./gradlew -q :app:testDebugUnitTest :wear:testDebugUnitTest
ok "unit tests, phone and watch"
(cd ../../server && pnpm test >/dev/null) || fail "the server's tests"
ok "the server's tests"

./gradlew -q :app:bundleRelease :wear:bundleRelease
phone_aab=app/build/outputs/bundle/release/app-release.aab
wear_aab=wear/build/outputs/bundle/release/wear-release.aab
[ -f "$phone_aab" ] || fail "no phone bundle at $phone_aab"
[ -f "$wear_aab" ] || fail "no watch bundle at $wear_aab"
ok "bundles built"

# What was really built, from the generated build config.
config() { find "$1/build/generated" -path '*release*' -name BuildConfig.java -print -quit; }
field() { sed -nE "s/.* $2 = \"?([^\";]*)\"?;.*/\1/p" "$(config "$1")"; }
for module in app wear; do
    [ "$(field "$module" DEFAULT_SERVER)" = "https://api.lawfive.app" ] || fail "$module's release build uses server $(field "$module" DEFAULT_SERVER)"
done
ok "release builds use https://api.lawfive.app"
[ "$(field app CIQ_TETHERED)" = "false" ] || fail "the phone's release build is tethered to a simulator"

phone_code=$(field app VERSION_CODE)
wear_code=$(field wear VERSION_CODE)
[ "$phone_code" != "$wear_code" ] || fail "the phone and watch share versionCode $phone_code"
ok "version codes: phone $phone_code, watch $wear_code"

if [ -z "$(sed -n 's/^lawfive.keystore=//p' local.properties 2>/dev/null)" ]; then
    echo "warning: no lawfive.keystore in local.properties, so these bundles aren't signed for upload" >&2
fi
echo "READY: $phone_aab and $wear_aab. The mapping files to keep are in */build/outputs/mapping/release."
