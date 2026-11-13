#!/bin/bash
# Installing over Wi-Fi (adb over TCP), with the phone and this computer on the same network.
#   tools/wifi.sh   with the phone plugged in: switches its adb to Wi-Fi, connects, and remembers
#                   its address in local.properties (lawfive.adb.wifi, not committed);
#                   without the cable: reconnects to the address remembered.
# Then ./gradlew :app:installDebug installs without the cable. The phone forgets Wi-Fi mode when it
# restarts (plug it in and run this again), and a new address from the router needs the same.
set -euo pipefail
cd "$(dirname "$0")/.."
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
props=local.properties
# Plugged in by USB, and not a watch: an emulator or a device found over Wi-Fi by its name (a Wear OS
# watch's wireless debugging) has no colon either, but isn't the phone.
usb=$("$adb" devices -l | awk '$2 == "device" && / usb:/ && $1 !~ /^emulator-/ {print $1}' | while read -r name; do
    "$adb" -s "$name" shell getprop ro.build.characteristics </dev/null | grep -q watch || { echo "$name"; break; }
done)

if [ -n "$usb" ]; then
    address=$("$adb" -s "$usb" shell ip -4 -o addr show wlan0 | awk '{print $4}' | cut -d/ -f1)
    [ -n "$address" ] || { echo "The phone isn't on Wi-Fi." >&2; exit 1; }
    "$adb" -s "$usb" tcpip 5555 >/dev/null
    sleep 3
    touch "$props"
    grep -v '^lawfive.adb.wifi=' "$props" > "$props.new" || true
    echo "lawfive.adb.wifi=$address" >> "$props.new"
    mv "$props.new" "$props"
else
    address=$(sed -n 's/^lawfive.adb.wifi=//p' "$props" 2>/dev/null || true)
    [ -n "$address" ] || { echo "Plug the phone in once first, so its address is known." >&2; exit 1; }
fi

if "$adb" connect "$address:5555" | grep -q "connected to"; then
    echo "Connected over Wi-Fi: installs work without the cable now."
else
    echo "Couldn't reach the phone over Wi-Fi: is it on the same network, and has it restarted since? (Plug it in and run this again.)" >&2
    exit 1
fi
