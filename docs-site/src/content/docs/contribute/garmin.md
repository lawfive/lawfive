---
title: The Garmin watch app
description: Build, test and install the LawFive Connect IQ watch app.
sidebar:
  label: Garmin
---

## Setting up

- **Connect IQ SDK 9.3.0**, installed with Garmin's SDK Manager, with device profiles for the watches you want.
- **Java**, for the compiler.
- **VS Code** with Garmin's Monkey C extension.
- **A developer key**, kept outside the repository. To make one:

  ```sh
  openssl genrsa -out developer_key.pem 4096
  openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key -nocrypt
  ```

  Keep it at `~/.lawfive/garmin/developer_key`, where the scripts look (or set `SIM_KEY` to another path), and point the extension's `monkeyC.developerKeyPath` setting at it.

:::caution
Never commit a developer key. Publishing updates to the Connect IQ Store needs the same key, so anyone publishing must back it up. Store builds are signed with the project's own key.
:::

## Commands

Run these from `watch-garmin/`, with these set first:

```sh
SDK="$(cat "$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg")"
KEY="${SIM_KEY:-$HOME/.lawfive/garmin/developer_key}"
```

| Task | Command |
|---|---|
| Build for one watch | `"$SDK/bin/monkeyc" -f monkey.jungle -d fr965 -y "$KEY" -o bin/LawFive.prg -l 3` |
| Build every target | `"$SDK/bin/monkeyc" -e -r -f monkey.jungle -y "$KEY" -o bin/LawFive.iq -l 3` |
| Run in the simulator | `tools/sim/run.sh venu3` |
| Unit tests | `"$SDK/bin/monkeyc" -t -f monkey.jungle -d fr965 -y "$KEY" -o bin/LawFive-test.prg -l 3`, then `"$SDK/bin/monkeydo" bin/LawFive-test.prg fr965 -t` with the simulator running |

The device IDs used most are `fr965` (five buttons and touch), and `venu3` and `venu2` (two buttons and touch). `manifest.xml` has the full list.

## Installing on your watch

Over USB, with the watch's exact model id. It needs `brew install libmtp`, with OpenMTP and Garmin Express closed:

```sh
tools/device/install.sh venu2
```

Add `--test-matches` to queue two made-up finished matches with tracks, once, for trying a sync.

A sideloaded app gets no phone settings, so build your own server in with `--server`:

```sh
tools/device/install.sh venu2 --server https://lawfive.example.com
```

## Testing sync in the simulator

Run the [demo server](/contribute/server-web/#the-demo-server), then load a test copy pointed at it:

```bash
bash -c 'source tools/sim/sim.sh; sim_run "$(sim_testcopy fr965 serverUrl=http://localhost:3000)" fr965'
```

- The simulator enforces the watch's HTTPS rule. Turn off **Settings → Use Device HTTPS Requirements** to reach `http://localhost`, and back on afterward.
- Choose Link account, then enter the code at `http://localhost:5173/link`.
- For a track, play a GPX file under **Simulation → Activity Data**, and set **Settings → Set GPS Quality** to Good before kickoff. GPX gives no heart rate.

[`watch-garmin/README.md`](https://github.com/lawfive/lawfive/blob/main/watch-garmin/README.md) has more on the code's layout, the match model and known quirks.
