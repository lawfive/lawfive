---
title: License and security
description: LawFive's license, and how to report a security problem.
---

## License

LawFive is open source under the Apache License 2.0: the server, the website, the watch and phone apps, and everything else in the repository. The repository has the [license](https://github.com/lawfive/lawfive/blob/main/LICENSE) and its [notice file](https://github.com/lawfive/lawfive/blob/main/NOTICE); anyone sharing a copy, changed or not, keeps both with it.

The iPhone app also includes Garmin's Connect IQ SDK, a closed library under Garmin's own license, so anyone building the iPhone app accepts Garmin's terms for it.

The apps use open-source fonts and icons with their own licenses, listed in the apps. Fonts are from Google Fonts under the OFL, and icons are from [Phosphor](https://phosphoricons.com) under MIT.

## Reporting a security problem

Please report security problems privately, by email to [security@lawfive.app](mailto:security@lawfive.app), not in a public issue. Include what you found, where (the component, version and address), and how to reproduce it, and test only against your own server or account. You'll hear back within a week, and once it's fixed we'll agree with you when to make it public, crediting you if you'd like.

This covers LawFive's code: the server and web app, the watch and phone apps, the push relay, and the hosted service and websites. A problem with how one self-hosted server is set up goes to whoever runs it. Fixes go into the newest version, so [upgrade](/run/upgrades/) to get them. The repository's [`SECURITY.md`](https://github.com/lawfive/lawfive/blob/main/SECURITY.md) says the same.

## How LawFive protects a server

- **Sign-in limits:** signing in, password resets, link codes and similar all have limits per visitor. Behind a reverse proxy, set [`TRUSTED_PROXIES`](/run/settings/), and `TRUSTED_IP_HEADER` behind a second one. Wrong passwords also lock that email address for a while, growing to at most an hour.
- **Headers:** every answer sets a content security policy, and HSTS on an HTTPS server.
- **Size limits:** a request is at most 32 MB, and a zip is checked against what it says it holds before it's opened.
- **Webhooks** can't reach the server's own network, unless you allow it.
- **API keys** are stored only as hashes, and can't take over an account.
- **Secrets** saved in the web app are stored encrypted, and never sent back.
- **Sessions:** the phones and Apple Watch keep them out of backups, and release builds send them only over HTTPS.
