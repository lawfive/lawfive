# Plan: more Garmin watches

**Status:** Proposed, not built. The model: the Garmin app runs on every Garmin watch with a touchscreen and at least two buttons that has Connect IQ 5 or later, so a referee with a recent Forerunner, fēnix, vívoactive, Venu or one of their editions finds LawFive in the store. Watches without a touchscreen, and the older Connect IQ 3 watches, are left for later. Its requirements are drafted under [Proposed requirements](#proposed-requirements), to move into [devices.md](../requirements/devices.md) when it's built.

## In short

LawFive's Garmin app is built for 28 models (46 part numbers, counting regional versions). Other referee apps in the Connect IQ store list far more: REFSIX's listing names 165 part numbers, 105 models, including all 28 of ours. Of the 77 models it has that LawFive doesn't:

- **31 have no touchscreen** (fēnix 5 and 6, Forerunner 245, 255, 645, 745 and 945, the first MARQs, Descent Mk2, D2 Delta, Instinct 3 AMOLED). Leaving these out was a choice: DEV-2 has every control work by touch. They'd need a match run entirely by buttons, which is a plan of its own.
- **46 have touchscreens** and have simply never been added. Most of them are recent watches with the screens and memory LawFive already runs on, so adding them is mainly building and checking.

This plan adds the touch watches in three steps: first those with a screen size LawFive already lays out, then the three with new screen sizes, then (if wanted) the Connect IQ 3 watches.

Not in this plan:

- **Watches without a touchscreen.** They'd need a match run by buttons alone, including menus, number entry and confirmations (INP-12 runs play by buttons but leaves those to touch). See [Open questions](#open-questions).
- **The vívoactive 3 Music and Music LTE.** They have one button, so the essentials can't come first for the buttons (INP-5), and the LTE version's Connect IQ 3.1 is below the app's minimum (3.2).

## What's already there

- **Screens.** Layouts scale from the screen's size (`Screen.mc`), with fonts for the 360, 390 and 454 round sizes and the Venu X1 (`resources-360`, `resources-390`, `resources-454`, `resources-venux1`, chosen in `monkey.jungle`). Today's watches cover round 240, 260, 280, 360, 390, 416 and 454, and the Venu X1's 448 × 486 rectangle.
- **Memory.** Every watch LawFive runs on gives a watch app 768 KB or more, as do all the Connect IQ 5 and 6 candidates below.
- **Buttons.** INP-7 maps five-button watches and Venus. Touch lock (INP-12) finds five-button watches by their Up and Down buttons, so a new model needs no list.
- **The watch's name.** The server names a synced watch from `schema/src/garminModels.ts`, made from the manifest by `schema/scripts/garminModels.ts` (SYNC-10), so adding a product means running it again.
- **Where the list is written:** [devices.md](../requirements/devices.md) (DEV-1 and its Status), the site's FAQ (`site/public/faq.html`) and On the watch (`site/public/watch.html`, "which watches").

## The watches

### Step 1: touch, Connect IQ 5 or 6, a screen size already laid out (31 models)

| Family | Models (SDK id) | Screen | Buttons |
|---|---|---|---|
| Forerunner | 70 (`fr70`), 165 and 165 Music (`fr165`, `fr165m`), 170 and 170 Music (`fr170`, `fr170m`), 570 42 and 47 mm (`fr57042mm`, `fr57047mm`), 955 (`fr955`), 970 (`fr970`) | round 260 to 454; the 955 is memory-in-pixel | Five |
| fēnix | 9 43 and 47/51 mm (`fenix943mm`, `fenix947mm`), 9 Pro 43 and 47 mm (`fenix9pro43mm`, `fenix9pro47mm`), 9 Pro Solar 47 and 51 mm (`fenix9prosolar47mm`, `fenix9prosolar51mm`), E (`fenixe`) | round 260 to 454; the Solar models are memory-in-pixel | Five |
| Enduro | 3 (`enduro3`) | round 280, memory-in-pixel | Five |
| vívoactive | 5 (`vivoactive5`), 6 (`vivoactive6`) | round 390 | Two (the 6 reports no Menu button) |
| MARQ | Gen 2 (`marq2`), Gen 2 Aviator (`marq2aviator`) | round 390 | Five |
| D2 | Air X10 (`d2airx10`), Mach 1 (`d2mach1`), Mach 2 and Mach 2 Pro (`d2mach2`, `d2mach2pro`) | round 416 and 454 | Two (Air X10) or five |
| Approach | S50 (`approachs50`), S70 42 and 47 mm (`approachs7042mm`, `approachs7047mm`) | round 390 and 454 | Two |
| Descent | G2 (`descentg2`), Mk3 43 mm (`descentmk343mm`), Mk3i 51 mm (`descentmk351mm`) | round 390 and 454 | Five |

### Step 2: touch, Connect IQ 5 or 6, a new screen size (3 models)

| Model (SDK id) | Screen | What's new |
|---|---|---|
| fēnix 9 Pro 51 mm (`fenix9pro51mm`) | round 466 | Slightly larger than 454; likely the 454 fonts |
| Venu Sq 2 and Sq 2 Music (`venusq2`, `venusq2m`) | rectangle 320 × 360 | A narrow rectangle; the Venu X1's layouts are the starting point |

### Step 3, if wanted: touch, Connect IQ 3 (10 models, without the vívoactive 3)

| Model (SDK id) | Screen | Memory |
|---|---|---|
| Venu (`venu`), Venu Mercedes-Benz (`venud`) | round 390 | 1 MB |
| Venu Sq Music (`venusqm`) | rectangle 240 × 240, LCD | 1 MB |
| vívoactive 4 (`vivoactive4`), 4S (`vivoactive4s`) | round 260 and 218, memory-in-pixel | 1 MB |
| D2 Air (`d2air`) | round 390 | 1 MB |
| Captain Marvel, First Avenger, Rey, Darth Vader (`legacyherocaptainmarvel`, `legacyherofirstavenger`, `legacysagarey`, `legacysagadarthvader`) | round 218 and 260, memory-in-pixel | 1 MB |

These are older watches, and their Connect IQ 3.3 may lack features the app uses: the manifest's minimum (3.2) lets the build try, but it hasn't been tried. Round 218 and the 240 square are new sizes too.

## Proposed behavior

- The app runs on each watch above as on the ones it runs on now: the same screens, controls, sync and tracks. A five-button watch is mapped as INP-7's five-button watches and gets Touch lock (INP-12); a two-button watch is mapped as a Venu.
- Nothing about a match changes. The store listing names the new watches once a build with them is uploaded.

## Proposed requirements

In [devices.md](../requirements/devices.md), DEV-1 becomes:

- **DEV-1** The Garmin app runs on Garmin's watches with a touchscreen and at least two buttons that have Connect IQ 5 or later: the Forerunner 70, 165, 170, 265, 570, 955, 965 and 970, the fēnix 7, 8, 9 and E, the epix (Gen 2), the Enduro 3, the vívoactive 5 and 6, the Venu series, the MARQ (Gen 2), and their D2, Approach and Descent editions.

DEV-2 stays as written (the Venu series is joined by the other two-button watches: "on the two-button watches (Venu, vívoactive, Approach, D2 Air X10)"), as does INP-5.

When it's built, devices.md's Status gives the new count, and the FAQ and On the watch list the new families.

## Open questions

1. **Which watches.** (a) Steps 1 and 2: every touch watch with Connect IQ 5 or later; (b) step 1 only, leaving the new screen sizes; (c) all three steps, the Connect IQ 3 watches too. *Recommend (a):* step 1 is mostly building and checking, and the Venu Sq 2 is one of Garmin's cheapest touch watches, so it's the one a referee on a budget is likely to have. Step 3's watches are five or more years old, and each brings a new screen size or an older Connect IQ to check.
2. **Watches without a touchscreen.** (a) Later, as their own plan: a match run entirely by buttons, including the menus, number entry and confirmations; (b) now, with this plan. *Recommend (a):* that's new controls on every screen, and needs its own design. It's 31 models, among them the fēnix 6 and the Forerunner 255 and 945, so it's worth doing next.
3. **The vívoactive 6's buttons.** It reports Start and Back but no Menu. (a) Map it as the Venu with whatever a long press gives; (b) leave it out until it's tried on a real watch. *Recommend (a)*, checked in the simulator first: the Venu's essentials (INP-5) use Start and Back.

## The work, in order

1. **Step 1:** add the 31 products to `manifest.xml`, with launcher icon sizes in `monkey.jungle` where the build warns; build each strict; run the unit tests on one five-button and one two-button new watch; `node scripts/garminModels.ts` in `schema/`, then `pnpm generate`. About half a day.
2. **Look at each new watch in the simulator:** the start menu, a match's running screen in each layout (UI-21 to UI-25), the game menu, the full-time screen. Memory-in-pixel screens get a look at the team colors (R-8). About half a day.
3. **Step 2:** the fēnix 9 Pro 51 mm and the Venu Sq 2, with fonts or layout changes for 466 round and 320 × 360. About half a day, more if the rectangle needs its own layouts.
4. **The written lists:** DEV-1, devices.md's Status, the site's FAQ and On the watch.
5. **The store:** a new build uploaded to Connect IQ with the new watches.

## Checks

- Every new product builds strict and runs the unit tests in the simulator.
- On a five-button watch (Forerunner 165, fēnix 9) and a two-button one (vívoactive 5 and 6, Venu Sq 2): a full match from kickoff to full time, a card, a stoppage by button, Touch lock on the five-button one.
- Memory: a full match with a track on a 768 KB watch with the largest screen (Forerunner 970) and the Venu Sq 2, watching the simulator's memory view.
- Real watches aren't available for these, so each goes into R-6 as built but not seen on one.

## Sources

- REFSIX's Connect IQ listing: its compatible devices as the store's app service gives them (`apps.garmin.com/api/appsLibraryExternalServices/api/asw/apps/741674b3-33c4-46fd-bc07-0d4dbdd02174`) and the store's device list (`.../asw/deviceTypes`), matched to SDK device ids by part number.
- The Connect IQ SDK's device files (`compiler.json` and `simulator.json` for each device): screen size and shape, display type, Connect IQ version, the watch app's memory limit, touch, and buttons.
