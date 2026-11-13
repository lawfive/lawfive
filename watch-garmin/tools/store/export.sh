#!/bin/bash
# Build the package for the Connect IQ Store, e.g. `tools/store/export.sh`, for every watch in the manifest.
# The version comes from git (VER-1, Sync.APP_VERSION), so a Store build is made from committed code only.
# `--beta` builds it under a separate app ID instead, for a private Beta App upload: a beta can't become the
# public app, so it keeps its own ID. That ID is made once and kept outside the repo, in
# ~/.lawfive/garmin/beta-app-id, so later betas update the same one.
set -e
beta=""
[ "$1" = "--beta" ] && beta=1
repo="$(cd "$(dirname "$0")/../.." && pwd)"
sdk="$(cat "$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg")"
key="${SIM_KEY:-$HOME/.lawfive/garmin/developer_key}"
out="$repo/bin/store"
mkdir -p "$out"

read -r version commit _ <<< "$("$repo/../tools/version.sh" watch)"
case "$commit" in
    *+) [ -n "$beta" ] || { echo "The watch app has uncommitted changes; commit them first, so the Store build is what's in git." >&2; exit 1; }
        version="$version+" ;;
esac

src="$out/src"
rsync -a --delete --exclude bin --exclude tools --exclude '*.md' "$repo/" "$src/"
sed -i '' -E "s|(const APP_VERSION = \")[^\"]*(\";)|\1$version\2|" "$src/source/Sync.mc"
grep -qF "APP_VERSION = \"$version\";" "$src/source/Sync.mc" || { echo "Couldn't set the version in the build." >&2; exit 1; }

name="LawFive-$version"
if [ -n "$beta" ]; then
    idfile="$HOME/.lawfive/garmin/beta-app-id"
    [ -s "$idfile" ] || uuidgen | tr -d '-' | tr 'A-Z' 'a-z' > "$idfile"
    id="$(cat "$idfile")"
    sed -i '' -E "s|(<iq:application [^>]*id=\")[0-9a-f]{32}(\")|\1$id\2|" "$src/manifest.xml"
    grep -q "id=\"$id\"" "$src/manifest.xml" || { echo "Couldn't set the beta app ID." >&2; exit 1; }
    name="$name-beta"
fi
echo "Version $version${beta:+, beta app ID $id}"

"$sdk/bin/monkeyc" -e -r -f "$src/monkey.jungle" -y "$key" -o "$out/$name.iq" -l 3
echo "Built $out/$name.iq. Upload it at https://apps.garmin.com/developer/upload${beta:+ with Beta App ticked}."
