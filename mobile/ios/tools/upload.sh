#!/bin/bash
# Archives the iPhone app, with its Apple Watch app, from committed code and uploads it to App Store
# Connect for TestFlight (runbook Apple 7). The archive signs in with an App Store Connect API key; the upload
# signs with Xcode's account on this Mac, as the distribution certificate is cloud-managed and only the Account
# Holder or an Admin may use it (an App Manager key may not). Submitting to App Review stays a click.
#   mobile/ios/tools/upload.sh
# The team and key stay outside the repo, in ~/.lawfive/apple/upload.conf (or $LAWFIVE_ASC_CONFIG):
#   team_id=…  key_id=…  issuer_id=…  key_path=/path/to/AuthKey_….p8
# The key needs the App Manager role. Versions come from git (VER-1); the build number isn't changed.
set -euo pipefail
ios="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$ios/../.." && pwd)"
conf="${LAWFIVE_ASC_CONFIG:-$HOME/.lawfive/apple/upload.conf}"
[ -f "$conf" ] || { echo "No $conf with team_id, key_id, issuer_id and key_path." >&2; exit 1; }
value() { sed -n "s/^$1=//p" "$conf" | head -1; }
team="$(value team_id)"; key_id="$(value key_id)"; issuer="$(value issuer_id)"; key_path="$(value key_path)"
key_path="${key_path/#\~/$HOME}"
[ -n "$team" ] && [ -n "$key_id" ] && [ -n "$issuer" ] && [ -f "$key_path" ] || { echo "$conf is missing a value, or its key_path isn't a file." >&2; exit 1; }

# What's uploaded is what's in git: an uncommitted change would be a build nobody can trace.
if [ -n "$(git -C "$repo" status --porcelain -- mobile/ios schema)" ] && [ -z "${LAWFIVE_ALLOW_DIRTY:-}" ]; then
    echo "mobile/ios or schema has uncommitted changes; commit them first (or LAWFIVE_ALLOW_DIRTY=1)." >&2
    exit 1
fi

out="$ios/build/upload"
rm -rf "$out"; mkdir -p "$out"
auth=(-allowProvisioningUpdates -authenticationKeyPath "$key_path" -authenticationKeyID "$key_id" -authenticationKeyIssuerID "$issuer")

echo "Archiving…"
xcodebuild archive -quiet -project "$ios/LawFive.xcodeproj" -scheme LawFive -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$out/LawFive.xcarchive" "${auth[@]}" \
    DEVELOPMENT_TEAM="$team"

cat > "$out/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>method</key><string>app-store-connect</string>
    <key>destination</key><string>upload</string>
    <key>teamID</key><string>$team</string>
    <key>signingStyle</key><string>automatic</string>
    <key>manageAppVersionAndBuildNumber</key><false/>
    <key>uploadSymbols</key><true/>
</dict></plist>
PLIST

echo "Uploading (with Xcode's account on this Mac)…"
# Homebrew's rsync first on PATH makes the export fail with "Copy failed" (mobile/ios/README.md).
PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -exportArchive -archivePath "$out/LawFive.xcarchive" \
    -exportOptionsPlist "$out/ExportOptions.plist" -exportPath "$out/export" -allowProvisioningUpdates

version=$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$out/LawFive.xcarchive/Info.plist")
build=$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$out/LawFive.xcarchive/Info.plist")
echo "Uploaded $version ($build). App Store Connect processes it, then it's in TestFlight for internal testers."
