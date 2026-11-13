# Versions (VER)

How each part of LawFive gets its version, where it shows, and how apps and servers of different versions keep working together. It covers the server (with the web app), the Android and iPhone apps, and the watch apps.

## Where versions come from

- **VER-1** **Versions come from git**, made when each part is built, so nobody sets one by hand (`tools/version.sh`).
  - A version is the day (UTC) of the last commit that changed the part, as `2026.10.30`, with `.2`, `.3`… for its second and later changes that day, and that commit's short hash.
  - Each part that ships on its own has one: the server (with the web app and the schema in it, as the server serves that web app), the Android app (with the schema's generated Kotlin), the iPhone app (with its generated Swift), and the Garmin watch app.
  - A build with uncommitted changes adds "+" (to the watch's version, to the phone's commit).
  - Android's versionCode, and the iPhone's build number, is the number of commits that changed the app, so it only grows. It counts the commits from before the repository's history began again too, so it never falls below a build already on a device or in a store. The Wear OS app's is a million more, as Google Play needs them to differ under one listing.

## Where they show

- **VER-2** Settings → About shows them: on the website, the server's (which is the web app's); on the phones, their own and the server's; on the watch, its own, the server and the server's version. A server that doesn't say its version shows **Version unknown**.
- **VER-3** **Apps say theirs.** The watch and the phone add `app=` and their version to their `X-LawFive-Device` header (SYNC-10), and the devices lists on the website and the phones show it with each. `GET /v1/meta` gives the server's version and commit, and the watch gets the server's with its matches. Every server answer also carries a `LawFive-Version` header.

## Releases

- **VER-5** **The server is released when the maintainer chooses**, not with every change. A release is tagged `v` and the server's version (`v2026.11.12`) and published as an image with that tag and `latest`, so `latest` is always a release. Every change to main is published as `edge`, and every build as `sha-<commit>`.
  - Each release has a GitHub release listing the server's changes since the one before, from the commit messages, with anything to do before upgrading added by the maintainer.
  - The hosted service runs `edge`. Self-hosters choose `latest`, a release's version, or `edge`.
  - The apps aren't tagged: each store build carries its own version (VER-1) and works with older servers (VER-4).

## Working across versions

- **VER-4** **No shared schema version.** Apps and servers of different versions keep working together because the API under `/v1` only grows: new fields are optional, apps ignore fields they don't know, and servers accept requests without the new ones. A change older apps couldn't follow would raise `GET /v1/meta`'s `apiVersion` (and go under `/v2`). Its `capabilities` say what a server offers, so a newer app can work with an older self-hosted server.
  - The apps support every server from `v2026.11.13` on. Ending that is announced in the release notes at least three months ahead, on a best-effort basis (lawfive.dev's Upgrades says so).

## Status

Everything above is built: versions from git for every part (CI builds the server's into its image), shown in each About, in the device header and devices lists, and in `GET /v1/meta`; releases (VER-5) with `tools/release.sh` and CI.

Not done yet:

- The first release (VER-5).
