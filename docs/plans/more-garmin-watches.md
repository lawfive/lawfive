# Plan: more Garmin watches

**Status:** Agreed, not built: steps 1 to 4, with step 5 left for later. The model: the Garmin app runs on every Garmin watch with at least two buttons and the memory for it (1 MB or more for a watch app, or 768 KB on Connect IQ 5 and later, and the Forerunner 255's 512 KB if a match fits), on Connect IQ 3.2 or later. Watches with a touchscreen take every control by touch as now; watches without one take every control by their five buttons, which already reach every screen. So a referee with a fēnix 6 Pro, a Forerunner 255 or 945, a recent Forerunner, fēnix, vívoactive, Venu or one of their editions finds LawFive in the store. Watches with too little memory or an older Connect IQ are left out. Its requirements are drafted under [Proposed requirements](#proposed-requirements), to move into [devices.md](../requirements/devices.md) and [controls.md](../requirements/controls.md) when it's built.

## In short

LawFive's Garmin app is built for 28 models (46 part numbers, counting regional versions). Other referee apps in the Connect IQ store list far more: REFSIX's listing names 165 part numbers, 105 models, including all 28 of ours. Of the 77 models it has that LawFive doesn't:

- **46 have touchscreens** and have simply never been added. Most of them are recent watches with the screens and memory LawFive already runs on, so adding them is mainly building and checking.
- **31 have no touchscreen** (fēnix 5 and 6, Forerunner 245, 255, 645, 745 and 945, the first MARQs, Descent Mk2, D2 Delta, Instinct 3 AMOLED). DEV-2 had every control work by touch, but the five-button touch watches already have a button for everything (INP-7, INP-12), so most of these need building and checking too. What leaves some out is memory: a watch app gets 128 KB or less on the plain fēnix 6, Forerunner 245 and others, and LawFive's build is about 515 KB.

This plan adds them in five steps: the touch watches with a screen size LawFive already lays out, the three with new sizes, the buttons-only watches on Connect IQ 5 and 6, the buttons-only watches on Connect IQ 3, and later the touch watches on Connect IQ 3.

Not in this plan:

- **Watches with too little memory:** the plain fēnix 6 and 6S, Forerunner 245, 645, 935 and 55, fēnix 5, 5S and Chronos, the first Enduro, Instinct 2, 2S, 2X, Crossover, E and 3 Solar (96 to 128 KB for a watch app). Their Pro and Music versions are in the plan.
- **Watches below Connect IQ 3.2:** the fēnix 5X, D2 Delta, D2 Charlie and Descent Mk1.
- **The vívoactive 3 Music and Music LTE.** They have one button, so the essentials can't come first for the buttons (INP-5), and the LTE version's Connect IQ 3.1 is below the app's minimum (3.2).

## What's already there

- **Screens.** Layouts scale from the screen's size (`Screen.mc`), with fonts for the 360, 390 and 454 round sizes and the Venu X1 (`resources-360`, `resources-390`, `resources-454`, `resources-venux1`, chosen in `monkey.jungle`). Today's watches cover round 240, 260, 280, 360, 390, 416 and 454, and the Venu X1's 448 × 486 rectangle.
- **Memory.** Every watch LawFive runs on gives a watch app 768 KB or more. The release build is about 515 KB.
- **Buttons.** INP-7 maps five-button watches and Venus. Touch lock (INP-12) finds five-button watches by their Up and Down buttons, so a new model needs no list. Every screen already has a button route, used by the five-button touch watches: the match screen (INP-7), the system menus (start menu, settings, history, the game and team menus), number entry (Up and Down change the digit, Start moves on and confirms, Back goes back), confirmations (Up and Down move between the answers, Start chooses), and the coin toss, compass, pitch mark and Link screens (Start and Back). After regular time, Start takes the suggested choice and the game menu has the others (ET-1).
- **Touch-only settings.** Tap for stoppage (INP-4) and Touch lock (INP-12) are in Settings → Controls on every watch with Up and Down.
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

### Step 3: buttons only, Connect IQ 5 or 6 (7 models)

All five buttons. These build strict as they are.

| Model (SDK id) | Screen | Memory |
|---|---|---|
| Forerunner 255 Music, 255S Music (`fr255m`, `fr255sm`) | round 260 and 218, memory-in-pixel | 768 KB |
| Forerunner 255, 255S (`fr255`, `fr255s`) | round 260 and 218, memory-in-pixel | 512 KB: less than any watch LawFive runs on, so they're in only if a full match with a track fits (see [Decided](#decided) and [Checks](#checks)) |
| Instinct 3 AMOLED 45 and 50 mm (`instinct3amoled45mm`, `instinct3amoled50mm`), Instinct Crossover AMOLED (`instinctcrossoveramoled`) | round 390 and 416 | 768 KB |

Round 218 (the 255S) is a new size.

### Step 4: buttons only, Connect IQ 3.2 to 3.4 (21 models)

All five buttons, all 1 MB or more for a watch app, all on screen sizes LawFive already lays out. On Connect IQ 3 the start menu's icon has to be typed as a resource bitmap (`WatchUi.BitmapResource`) rather than `Graphics.BitmapType`; with that, the eleven tried build strict.

| Family | Models (SDK id) | Screen |
|---|---|---|
| fēnix 5 Plus | 5 Plus, 5S Plus, 5X Plus (`fenix5plus`, `fenix5splus`, `fenix5xplus`) | round 240, memory-in-pixel |
| fēnix 6 Pro | 6 Pro, 6S Pro, 6X Pro and their Sapphire, Solar and Dual Power versions, quatix 6, tactix Delta (`fenix6pro`, `fenix6spro`, `fenix6xpro`) | round 260, 240 and 280, memory-in-pixel |
| Forerunner | 245 Music (`fr245m`), 745 (`fr745`), 945 and 945 LTE (`fr945`, `fr945lte`), 645 Music (`fr645m`) | round 240, memory-in-pixel |
| MARQ (first generation) | Adventurer, Athlete, Aviator, Captain, Commander, Driver, Expedition, Golfer (`marqadventurer` and the others) | round 240, memory-in-pixel |
| Descent | Mk2 and Mk2i, Mk2 S (`descentmk2`, `descentmk2s`) | round 280 and 240, memory-in-pixel |

The Forerunner 645 Music's Connect IQ 3.2 has no drag events, which the match screen reads to tell a swipe right from Back (INP-10); on a watch without a touchscreen there's no swipe to tell, so that code needs `has` checks or an annotation to leave it out there.

### Step 5, later: touch, Connect IQ 3 (10 models, without the vívoactive 3)

| Model (SDK id) | Screen | Memory |
|---|---|---|
| Venu (`venu`), Venu Mercedes-Benz (`venud`) | round 390 | 1 MB |
| Venu Sq Music (`venusqm`) | rectangle 240 × 240, LCD | 1 MB |
| vívoactive 4 (`vivoactive4`), 4S (`vivoactive4s`) | round 260 and 218, memory-in-pixel | 1 MB |
| D2 Air (`d2air`) | round 390 | 1 MB |
| Captain Marvel, First Avenger, Rey, Darth Vader (`legacyherocaptainmarvel`, `legacyherofirstavenger`, `legacysagarey`, `legacysagadarthvader`) | round 218 and 260, memory-in-pixel | 1 MB |

These are older watches. Step 4's fix makes Connect IQ 3 build, but these haven't been tried, and the 240 square is a new size.

## Proposed behavior

- The app runs on each watch above as on the ones it runs on now: the same screens, sync and tracks. A five-button watch is mapped as INP-7's five-button watches; a two-button watch is mapped as a Venu.
- **Without a touchscreen**, every control is reached by the five buttons, as it already is on the five-button touch watches: nothing new to learn and no screen of its own. Settings → Controls leaves out Tap for stoppage and Touch lock, which have nothing to do there, and the phones' settings for them do nothing on such a watch. A kickoff team is chosen with Up and Down, and changed by pressing the other.
- Nothing about a match changes. The store listing names the new watches once a build with them is uploaded.

## Proposed requirements

In [devices.md](../requirements/devices.md):

- **DEV-1** The Garmin app runs on Garmin's watches with at least two buttons and Connect IQ 3.2 or later that give a watch app enough memory: the Forerunner 70, 165, 170, 245 Music, 255, 265, 570, 645 Music, 745, 945, 955, 965 and 970, the fēnix 5 Plus, 6 Pro, 7, 8, 9 and E, the epix (Gen 2), the Enduro 3, the Instinct 3 AMOLED and Instinct Crossover AMOLED, the vívoactive 5 and 6, the Venu series, the MARQ, and their D2, Approach and Descent editions.
- **DEV-2** Most have a touchscreen; some (the fēnix 5 Plus and 6 Pro, the Forerunner 245 Music, 255, 645 Music, 745 and 945, the first MARQ, the Descent Mk2 and the Instinct AMOLEDs) don't, and the Venu series and other two-button watches (vívoactive, Approach, D2 Air X10) have only 2 or 3 buttons. So every control works by touch on a touchscreen and by the buttons on a five-button watch, and the essential match controls also work with the two-button watches' buttons (INP-5).

In [controls.md](../requirements/controls.md), INP-4 and INP-12 add: on a Garmin without a touchscreen, the setting isn't shown and its phone setting does nothing.

When it's built, devices.md's Status gives the new count, the FAQ and On the watch list the new families, and R-6 lists the buttons-only watches as built but not seen on one.

## Decided

- **Steps 1 to 4.** Step 5's touch watches on Connect IQ 3 are left for later: they're five or more years old and bring a new screen size.
- **The Forerunner 255 and 255S** (512 KB) are in if a full match with a track stays under the limit in the simulator with room to spare; otherwise they're left out, and the Music versions (768 KB) are in regardless.
- **The vívoactive 6** is mapped as the Venu, with whatever a long press gives, checked in the simulator first: the Venu's essentials (INP-5) use Start and Back.

## The work, in order

1. **Step 1:** add the 31 products to `manifest.xml`, with launcher icon sizes in `monkey.jungle` where the build warns; build each strict; run the unit tests on one five-button and one two-button new watch; `node scripts/garminModels.ts` in `schema/`, then `pnpm generate`. About half a day.
2. **Look at each new watch in the simulator:** the start menu, a match's running screen in each layout (UI-21 to UI-25), the game menu, the full-time screen. Memory-in-pixel screens get a look at the team colors (R-8). About half a day.
3. **Step 2:** the fēnix 9 Pro 51 mm and the Venu Sq 2, with fonts or layout changes for 466 round and 320 × 360. About half a day, more if the rectangle needs its own layouts.
4. **Step 3:** the Connect IQ 5 and 6 buttons-only watches; Settings → Controls without the touch settings where there's no touchscreen; the memory check on the Forerunner 255 before adding it and the 255S. Round 218 gets a look. About half a day.
5. **Step 4:** the start menu's icon type, the 645 Music's drag events, then the 21 Connect IQ 3 products, built strict, the unit tests on the fēnix 6 Pro, and a full match by buttons alone on the Forerunner 945. About half a day.
6. **The written lists:** DEV-1, DEV-2, INP-4, INP-12, devices.md's Status, the site's FAQ and On the watch.
7. **The store:** a new build uploaded to Connect IQ with the new watches.

## Checks

- Every new product builds strict and runs the unit tests in the simulator.
- On a five-button touch watch (Forerunner 165, fēnix 9) and a two-button one (vívoactive 5 and 6, Venu Sq 2): a full match from kickoff to full time, a card, a stoppage by button, Touch lock on the five-button one.
- On a buttons-only watch on each Connect IQ (Forerunner 255, Forerunner 945): a full match with only the buttons, from the start menu through a card with a player number and reason, a stoppage, the halftime break, extra time and a shoot-out, to full time and the events list; and Settings → Controls without the touch settings.
- Memory: a full match with a track on the Forerunner 255 (512 KB), on a 768 KB watch with the largest screen (Forerunner 970) and on the Venu Sq 2, watching the simulator's memory view.
- Real watches aren't available for these, so each goes into R-6 as built but not seen on one.

## Sources

- REFSIX's Connect IQ listing: its compatible devices as the store's app service gives them (`apps.garmin.com/api/appsLibraryExternalServices/api/asw/apps/741674b3-33c4-46fd-bc07-0d4dbdd02174`) and the store's device list (`.../asw/deviceTypes`), matched to SDK device ids by part number.
- The Connect IQ SDK's device files (`compiler.json` and `simulator.json` for each device): screen size and shape, display type, Connect IQ version, the watch app's memory limit, touch, and buttons.
- Strict builds of today's app, in a scratch copy with the products added, for the Forerunner 255, 255S, 245 Music, 645 Music, 745 and 945, the fēnix 5 Plus, 6 Pro and 6X Pro, the MARQ Athlete, the Descent Mk2 and the Instinct 3 AMOLED 45 mm.
