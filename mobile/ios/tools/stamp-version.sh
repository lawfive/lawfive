#!/bin/bash
# VER-1: the app's version comes from git, never by hand. A build phase runs this: it writes the
# version into the built app's Info.plist. CFBundleShortVersionString keeps three numbers, as the
# App Store allows; LFVersion is the whole version, shown in Settings and sent to the server.
set -euo pipefail
read -r version commit build <<< "$("$SRCROOT/../../tools/version.sh" ios)"
plist="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :LFVersion $version" -c "Set :LFCommit $commit" -c "Set :CFBundleVersion $build" "$plist"
short=$(echo "$version" | cut -d. -f1-3)
case "$short" in
    *.*.*) /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $short" "$plist" ;;
esac
