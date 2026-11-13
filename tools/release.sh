#!/bin/bash
# VER-5: releases the server. Tags main's newest commit with the server's version from git (VER-1),
# as v2026.11.12, and pushes the tag. CI then tests it, publishes the image as that version and
# `latest`, and makes the GitHub release with its notes (CONTRIBUTING.md, Releasing).
# Usage: tools/release.sh   (on main, with nothing uncommitted and nothing waiting to push)
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch -q origin main --tags
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    echo "Check out main as it is on origin first: a release is of what CI has built." >&2
    exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
    echo "Commit or stash your changes first." >&2
    exit 1
fi

read -r version commit _ <<< "$(tools/version.sh server)"
tag="v$version"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    echo "$tag is already released: the server hasn't changed since." >&2
    exit 1
fi
git tag -a "$tag" -m "LawFive server $tag"
git push origin "$tag"
echo "Tagged $tag (the server as of $commit). CI publishes the image and then the release."
