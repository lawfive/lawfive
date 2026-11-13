---
title: iPhone and Apple Watch
description: Build and test the LawFive iPhone and Apple Watch apps.
sidebar:
  label: iPhone and Apple Watch
---

## Setting up

You'll need a Mac with Xcode 27 or later. The app runs on iOS 17 and later. Xcode downloads Garmin's Connect IQ SDK as a Swift package, the project's one third-party package, and using it means accepting [Garmin's license](https://developer.garmin.com/connect-iq/sdk/).

## Commands

Run these from `mobile/ios/`. Use any simulator you have installed as the destination.

| What | Command |
|---|---|
| Build | `xcodebuild -project LawFive.xcodeproj -scheme LawFive -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' build` |
| Unit tests | The same, with `-only-testing:LawFiveTests test` |
| Screenshots of every screen | `tools/screenshots.sh <folder> [light\|dark]`, with the demo running |
| Run it | Open `LawFive.xcodeproj` in Xcode, and press Run |

To click around by hand on Xcode 27, use an iOS 27 simulator, because Device Hub doesn't pass mouse clicks to iOS 17.

## Trying it with sample data

Run the [demo server](/contribute/server-web/#the-demo-server), run the app in a simulator, choose **Use another server**, enter `http://localhost:3000`, and sign in as `demo@lawfive.dev` with the password `lawfive-demo`.

## On a real iPhone

Choose your Apple account's team under Signing & Capabilities in Xcode, then run it on the plugged-in phone. A free account's builds expire after 7 days, and TestFlight and the App Store need a paid one. The bundle ID is `app.lawfive`, which belongs to the project's own Apple team, so to run it under yours, change it to one of your own, such as `dev.yourname.lawfive`, in both targets and as `WKCompanionAppBundleIdentifier` in `LawFiveWatch-Info.plist`.

## Apple Watch

`LawFiveWatch/` is the watch app, a target in this project embedded in the iPhone app, as Apple requires. It syncs straight with the server over the watch's own connection. So far it's run only on a simulator.

```bash
tools/test-watch-engine.sh    # the match's rules, on the Mac
xcodebuild -project LawFive.xcodeproj -scheme LawFiveWatch -destination 'platform=watchOS Simulator,name=Apple Watch Series 12 (46mm)' test
```

[`mobile/ios/README.md`](https://github.com/lawfive/lawfive/blob/main/mobile/ios/README.md) has more detail on how it's built.
