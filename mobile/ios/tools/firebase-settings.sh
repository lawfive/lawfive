#!/bin/bash
# PUSH-5, NOTE-4: a build phase. Copies the Firebase app's settings (GoogleService-Info.plist, from a
# Firebase app registered as app.lawfive) into the built app when they're there, so the app can get a
# Firebase token for the push relay. They identify the app rather than being secret, but stay out of
# the repo, as Android's do, so a fork makes its own. Without them the app builds and works, and
# doesn't offer notifications from the server. LAWFIVE_FIREBASE_PLIST (a build setting, or in the
# environment) says where they are; by default ~/.lawfive/apple/GoogleService-Info.plist.
set -euo pipefail
source="${LAWFIVE_FIREBASE_PLIST:-$HOME/.lawfive/apple/GoogleService-Info.plist}"
target="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/GoogleService-Info.plist"
if [ -f "$source" ]; then
    bundle=$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "$source" 2>/dev/null || true)
    if [ -n "$bundle" ] && [ "$bundle" != "$PRODUCT_BUNDLE_IDENTIFIER" ]; then
        echo "warning: $source is for $bundle, not $PRODUCT_BUNDLE_IDENTIFIER: no notifications from the server in this build."
        rm -f "$target"
        exit 0
    fi
    cp "$source" "$target"
else
    # A copy from an earlier build mustn't linger once the settings have gone.
    rm -f "$target"
    echo "note: no Firebase settings at $source, so this build doesn't offer notifications from the server (mobile/ios/README.md)."
fi
