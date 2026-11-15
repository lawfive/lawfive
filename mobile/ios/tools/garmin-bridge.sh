#!/bin/bash
# IOS-9: a build phase. A build without the Garmin bridge (no GARMIN_BRIDGE among the Swift conditions,
# so every Release build, App Store ones included) leaves out its Bluetooth background mode, as App
# Review expects a background mode to be used. Its Bluetooth permission words stay: Garmin's SDK is
# still in the app, and the App Store asks for them wherever Bluetooth code is, used or not.
set -euo pipefail
case " ${SWIFT_ACTIVE_COMPILATION_CONDITIONS:-} " in *" GARMIN_BRIDGE "*) exit 0 ;; esac
plist="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
count=$(/usr/libexec/PlistBuddy -c 'Print :UIBackgroundModes' "$plist" 2>/dev/null | grep -c '^ ' || true)
for ((i = count - 1; i >= 0; i--)); do
    if [ "$(/usr/libexec/PlistBuddy -c "Print :UIBackgroundModes:$i" "$plist")" = "bluetooth-central" ]; then
        /usr/libexec/PlistBuddy -c "Delete :UIBackgroundModes:$i" "$plist"
    fi
done
