# The time of day font

The running screen's time of day (UI-25) is smaller than any font the watches have, so the app carries one. `time-font.sh` makes it from Roboto Condensed Regular (in the Connect IQ SDK's fonts, Apache License 2.0), with only the characters a time needs, at about 4.3% of the screen's height:

| Screens | Size | Folder |
|---|---|---|
| 360 × 360 | 16 px | `resources-360` |
| 390 × 390 | 17 px | `resources-390` |
| 416 × 416 | 18 px | `resources` |
| 448 × 486 (Venu X1) | 19 px | `resources-venux1` |
| 454 × 454 | 20 px | `resources-454` |

`monkey.jungle` adds each folder for its screens. Screens under 360 pixels (the MIP fēnix models) use the watch's own smallest font, which is already small there. To remake one:

```sh
tools/fonts/time-font.sh 20 resources-454/fonts
```
