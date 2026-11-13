#!/bin/bash
# Build the app for a device and load it in the simulator, e.g. `tools/sim/run.sh venu3`.
# Device ids are the <iq:product id="..."> entries in manifest.xml (fr965, venu2, venu3, fenix7, ...).
set -e
device="${1:?usage: tools/sim/run.sh <device-id>}"
source "$(dirname "$0")/sim.sh"
"$SIM_SDK/bin/monkeyc" -f "$SIM_REPO/monkey.jungle" -d "$device" -y "$SIM_KEY" \
    -o "$SIM_REPO/bin/LawFive-$device.prg" -l 3
sim_run "$SIM_REPO/bin/LawFive-$device.prg" "$device"
echo "Loaded on $device. App output: bin/sim.log"
