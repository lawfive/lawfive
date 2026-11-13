# Security policy

## Reporting a problem

Please report security problems privately, by email to **security@lawfive.app**, not in a public issue, pull request or discussion.

Include what you found, where (the component, version and address), how to reproduce it, and what someone could do with it. A proof of concept helps, but please test only against your own server or account, never other people's data.

You'll hear back within a week. Once it's fixed, we'll agree with you when to make it public, and credit you if you'd like.

## What's covered

- The server and its web app, and the hosted service at `app.lawfive.app` and `api.lawfive.app`
- The watch and phone apps (Garmin, Android, Wear OS, iPhone and Apple Watch)
- The push relay at `push.lawfive.app`
- The websites at `lawfive.app` and `lawfive.dev`

A self-hosted server is run by whoever hosts it. Report a problem in LawFive's code here, and a problem with how one server is set up to whoever runs it.

Not covered: denial of service by sheer traffic, social engineering, and reports from automated scanners without a demonstrated problem.

## Supported versions

Fixes go into the newest version, published as `latest` and as a tagged release. Upgrade to get them ([upgrades](https://lawfive.dev/run/upgrades/)). The hosted service and the store apps always run the newest version.

## How LawFive protects a server

[lawfive.dev's security page](https://lawfive.dev/contribute/license-security/) lists what a server does by itself: sign-in limits, security headers, size limits, webhook restrictions, hashed API keys and encrypted secrets.
