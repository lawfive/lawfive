---
title: Android and Wear OS
description: Build and test the LawFive Android and Wear OS apps.
sidebar:
  label: Android and Wear OS
---

## Setting up

- **JDK 21.** Newer ones are too new for the Android build tools.
- **The Android SDK,** from Android Studio, or:

  ```sh
  brew install --cask android-commandlinetools
  sdkmanager "platforms;android-37.0" "build-tools;37.0.0" "platform-tools"
  ```

- **`mobile/android/local.properties`,** which isn't committed:

  ```ini title="local.properties"
  sdk.dir=/path/to/your/Android/sdk
  # Optional: build in another server instead of the hosted service.
  # lawfive.server=https://lawfive.example.com
  # To sign release builds:
  # lawfive.keystore=/path/to/lawfive.jks
  # lawfive.keystore.password=…
  # lawfive.keystore.alias=…
  ```

  Make the signing key once with `keytool -genkeypair` and keep it, and its password, somewhere safe outside the repo: a phone only takes updates signed with the same key.

## Notifications

Notifications from the server (weather risks and matches from integrations) need a Firebase app registered as `app.lawfive`, with its values from `google-services.json` in `local.properties`. Without them the app builds and runs as usual, and doesn't offer the setting.

```ini title="local.properties"
lawfive.firebase.appId=1:…:android:…
lawfive.firebase.apiKey=…
lawfive.firebase.projectId=…
lawfive.firebase.senderId=…
```

A build with your own Firebase project also needs [your own relay](/contribute/relay/#running-your-own), set with `lawfive.push.relay`.

## Commands

Run these from `mobile/android/`, with `JAVA_HOME` set to JDK 21.

| What | Command |
|---|---|
| Build | `./gradlew :app:assembleDebug` |
| Install on a phone or emulator | `./gradlew :app:installDebug` |
| Unit tests | `./gradlew :app:testDebugUnitTest` |
| Wear OS unit tests | `./gradlew :wear:testDebugUnitTest` |
| Release build | `./gradlew :app:assembleRelease` |
| Check a Google Play release | `tools/release-check.sh` |
| Install over Wi-Fi | `tools/wifi.sh`, with the phone plugged in once |

Versions come from git, so a newer build always installs over an older one. A debug build has to be uninstalled before installing a release build, as they're signed with different keys.

## An emulator

```sh
sdkmanager "emulator" "system-images;android-37.0;google_apis;arm64-v8a"
avdmanager create avd -n pixel9pro -k "system-images;android-37.0;google_apis;arm64-v8a" -d pixel_9_pro
emulator -avd pixel9pro
```

The [demo server](/contribute/server-web/#the-demo-server) is `http://10.0.2.2:3000` from the emulator.

## Wear OS

The watch app is the `wear` module, beside the phone app, with the same application ID. It has run on an emulator and a Galaxy Watch4. [`mobile/android/README.md`](https://github.com/lawfive/lawfive/blob/main/mobile/android/README.md) has more detail on it, and on testing a Garmin watch through the phone.
