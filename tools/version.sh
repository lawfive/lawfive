#!/bin/bash
# VER-1: a unit's version, from git, so nobody bumps one by hand. Prints three words:
#   the version: the day (UTC) of the last commit that touched the unit's folders, "2026.10.30",
#     with ".2", ".3"... for its second and later changes that day;
#   that commit's short hash, with "+" after it when those folders have uncommitted changes;
#   a build number that only grows: how many commits touched them (Android's versionCode, the
#     iPhone's build number), counting those before the repository's history began again
#     (`before`), so it never goes below a build already on a device or in a store.
# Usage: tools/version.sh server|android|ios|watch   ->   2026.10.30 f5de635 412
# Outside a git checkout it prints "dev unknown 1".
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
    # The server image carries the web UI and the schema, and its dependencies come from the lockfile.
    server) paths=(server web schema pnpm-lock.yaml) before=204 ;;
    # The app builds in the schema's generated Kotlin.
    android) paths=(mobile/android schema) before=205 ;;
    # The same, with its generated Swift.
    ios) paths=(mobile/ios schema) before=193 ;;
    watch) paths=(watch-garmin) before=70 ;;
    *) echo "usage: tools/version.sh server|android|ios|watch" >&2; exit 1 ;;
esac

commit=$(git log -1 --format=%h -- "${paths[@]}" 2>/dev/null || true)
if [ -z "$commit" ]; then
    echo "dev unknown 1"
    exit 0
fi
day=$(TZ=UTC git log -1 --date=format-local:%Y-%m-%d --format=%cd -- "${paths[@]}")
nth=$(TZ=UTC git log --date=format-local:%Y-%m-%d --format=%cd -- "${paths[@]}" | grep -c "^$day$")
IFS=- read -r year month date <<< "$day"
version="$year.$((10#$month)).$((10#$date))"
if [ "$nth" -gt 1 ]; then
    version="$version.$nth"
fi
if [ -n "$(git status --porcelain -- "${paths[@]}")" ]; then
    commit="$commit+"
fi
echo "$version $commit $((before + $(git rev-list --count HEAD -- "${paths[@]}")))"
