# Zurich — Late for ETH

This standalone prototype lives in `mini-games/`. Run the commands below from this folder; from the repository root, use `npm run dev:mini-games` or `npm run build:mini-games`. The multiplayer workspace remains alongside it in `apps/` and `packages/`.

A browser-game prototype using actual Zurich geography. Start in the original Bahnhofbrücke area and reach ETH Zentrum before the two-minute deadline. Gameplay locations follow the original path; the optional walking guide adapts to the current native map. V switches between first-person and third-person movement.

## Run

`npm install` then `npm run dev`. Open http://127.0.0.1:5173/.

V toggles first-person walking with animated arms and the third-person chase camera. Both views use the same movement and collision controller. First-person uses mouse drag or arrow keys to look, with WASD to walk/strafe, Shift to sprint and Space to jump. Vehicle rides keep their existing cameras and return to your selected view on foot.

WASD moves relative to the camera, Shift sprints, Space jumps, arrow left/right or mouse drag rotates the camera, M toggles the overhead map view, R restarts. A suggested gold street trail, an ETH finish sign and the schematic minimap show the route. The best score is stored locally.

## Map

The complete map from [AlexFalter/Team67](https://github.com/AlexFalter/Team67) replaces the previous map. The game loads `public/maps/zurich/hb-eth.glb` directly with its original Buildings and Terrain meshes, materials, vertices and indices. Its fixed LV95 origin is [2683475, 1248000, 400]. No old terrain, bridge overlays, aerial imagery or façade styling is loaded.

Rendering matches the upstream MapViewer: neutral hemisphere/sun lighting, original material colors, no cinematic tone mapping or fog, a 60-degree gameplay camera and player-centered live shadows. No map geometry is simplified. `npm run test:render` compares the original and integrated map from the same overview camera and verifies pixel equality; it also checks the gameplay renderer configuration. This comparison requires the dev server on port 5173 and production preview on 4173.

Walking uses the upstream two-metre terrain/collision grid and its native HB–ETH route. The grid is an approximate building footprint mask, as in the source game. Camera obstruction uses the original building geometry. Interaction props use clear native ground; station entrances use walking paths without cutting map geometry. Buildings and terrain: Stadt Zürich, CC0. Street/river annotations: OpenStreetMap contributors, ODbL. Source records and the imported revision/hash live in `public/maps/zurich/`.

`npm run build` creates the static site. Start `npm run preview -- --port 4173` and run `npm run test:map:interactions` for gameplay regression. `npm run test:map` checks the original source file and every runtime position/index byte, native coordinates and absence of old map requests.

## PubliBike station and unlocking

The station beside the early route has eight individually numbered bikes. Walk to a bike and press E. The scanner uses the same centered handset as the photo encounters, with a shared shell in phone-shell.js / phone-shell.css and app-specific PubliBike content. The close view makes the selected bike’s rear QR and number clear. Aim with WASD/arrows or the mouse, center that code and hold still. Scanning starts automatically, briefly stutters while the tiny lock goblin buffers, then finishes if you stay steady. Moving the frame stalls the scan and drains progress; no Space or click is needed. Escape cancels. The lecture timer pauses during unlocking.

Each bike randomly works or has a permanent lock fault for the current run. Tune the failure percentage with `vehicles.bikeFailurePercent` in `game.config.json` (default 50%). Working frames are golden by default; turn off “Highlight working PubliBikes” in Settings to hide the hint. Each usable bike has 15 seconds of battery, shown by a draining bar at the bottom. Battery drains during active rides, pauses with menus, and stays depleted when parked and remounted. At zero charge you dismount and must choose another bike. R rerolls working bikes and restores their batteries.

Press E while riding to park. Near the station, the bike returns to a vacant bay; elsewhere it remains where you leave it and can be scanned again. M shows the station, its current usable bike count, and working bikes parked elsewhere.

`npm run test:bikes` verifies the scanner UI, all eight bike selections, permanent faults, golden hints and their setting, the battery HUD/cutoff, replacement, parking without recharging, and reset. Set `GAME_URL=http://127.0.0.1:4173` to test against a running production preview instead of the dev server.

## Vehicle chaos

Riding a PubliBike into the Limmat triggers an explosion and destroys that bike for the current run. The existing five-second penalty and dry-ground rescue still apply. Walking or using a scooter into water produces the normal splash.

Tram 6 accelerates to over 130 km/h and derails at the first bend in its existing route. The cars skid and tip, then the rider is placed on nearby clear ground with a five-second penalty. The wreck cannot be boarded again; R restores the tram and bikes. `node verify-vehicle-chaos.mjs` exercises both events, inventory, safe recovery and reset, and saves screenshots.

## Polybahn tickets and inspections

Press E at the ticket machine beside the lower Central station entrance. The upper station has no ticket machine. Swipe your card, endure the declined payment, pull out the phone camera, frame and scan the QR code, and select three tram pictures in the CAPTCHA. After payment, the camera looks down while a ticket prints; click inside the collection tray to collect it (Enter also works). The ticket appears in your inventory until boarding. Closing the view preserves the paid ticket for collection. Then walk to the actual carriage door and press E to board (within 1.5 metres). Each ticket covers one trip and is consumed when boarding. The carriage closes its sliding doors, accelerates along a smooth inclined track, brakes, and opens its doors before you walk out beside the carriage. Boarding and exiting follow continuous two-second walking animations instead of teleporting between station markers.

Boarding without a ticket triggers Inspector Bünzli shortly after departure. His animated, subtitled inspection cannot be skipped with game controls or restart. He issues a fictional CHF 100 fare notice and adds ten seconds to the lecture timer, then the ride resumes. Fare notices accumulate for the current run; reset clears them after the inspection finishes. Browser speech reads the dialogue slowly when available; each subtitle remains until its sentence finishes. Subtitles also work without speech.

`npm run test:polybahn` checks continuous carriage motion and the ticket/fine flow. The browser test uses the production preview at port 4173 by default; set GAME_URL for another server. Editable sliding-door and axle source: `assets/blender/polybahn-animation.blend`, rebuilt with `assets/blender/build-polybahn.py`. Run this builder after the older general transit builder to preserve the animated Polybahn asset.

## Wrong-way encounter

Entering the twelve-metre strip along any playable-map boundary triggers the private-property pickup, on foot or on a bike/scooter. The driver uses a short excerpt of the real “Hit the road, dude” recording with subtitles; provenance is in `public/audio/CREDITS.md`. The roughly eight-second cutscene blocks movement, map, restart and skip controls while pausing the lecture clock. It returns you to the start and repeats every time you approach an edge again. `node verify-private-property.mjs` checks the actual movement trigger, audio playback, locked controls, safe return and reset.

An unmarked laptop set back from the tram at Central hides Jane Street’s fill-in-the-blank JavaScript interview challenge. Press E to focus the blank directly inside the loop condition. Type the missing number so the code prints 0, 1, 2 and press Enter. Success closes the laptop and sends a Jane Street invitation to your phone, where you can request your complimentary Uber Black. When the black-and-gold stretch limousine arrives, its butler walks over and opens the passenger door. Approach it and press E to board. It follows the uphill street route to ETH. Read the rejection on your phone (notification or P) to trigger the animated kick-out and getaway, then continue on foot. The lecture clock pauses while coding and during the ride. Escape closes an unsolved challenge; R resets the ride. The answer is validated without executing player input. Run `npm run test:interview` against the production preview on port 4173 (or set GAME_URL).

An unmarked Finance Guy NPC stands on a reachable side detour from the native route, away from the gold walking route. Approaching within 2.8 metres starts an unskippable conversation with a 9.5-second edit containing only the Finance Guy’s answers from the original SRF audio. Interviewer questions and interjections are cut out. The NPC has sunglasses, earbuds, a cream quarter-zip and animated gestures. Movement, map and reset are blocked, the lecture clock pauses, and control returns where you stopped after the recording finishes. The encounter happens once per run and resets with R. Source and excerpt offsets are documented in `public/audio/CREDITS.md`; `npm run test:finance` checks actual audio playback and completion against the production preview.

The El Tony Mate machine beside the early walking route uses compact controls beside the physical cabinet, with the street still visible. Choose Basic, Light, Mint or Ginger, then swipe to pay. The machine loads for 1.4 seconds; unavailable flavors refund payment and retain the existing cooldown. Exactly one randomly selected flavor works per run; the other three fail and cannot be retried until restart. A successful purchase drops a can into the dispenser. Click the Mate in the tray (or press Enter) to collect it. Stepping away preserves the uncollected Mate. Mate and Polybahn tickets share a centered three-slot inventory; drinking Mate consumes it for a 15-second +35% walking boost. Run `node verify-mate-machine.mjs` to check purchases, physical collection and inventory.

The ETH Link opening now flies in from beyond the playable map, eases down to the arrival stop and switches from an establishing shot into its glazed cabin. While riding the bus or Polybahn, mouse drag and arrow keys look around independently of the vehicle; horizontal look wraps freely and vertical look stays bounded. The Polybahn cabin also has a grey-hoodie, fluffy-haired 6–7 kid who is initially quiet. WASD moves within the cabin; approach him and press E for an RPG dialogue. Up/down arrows choose a response, Enter confirms, and Escape leaves. Answer “67” to trigger his endless palm gestures and the real kid’s audio from the original Cam Wilder video. Other answers keep him quiet. Dialogue pauses the ride and lecture clock. Once triggered, the chant persists for the run, is quieter during fare inspection, and stops on dismount/reset. Source offsets are recorded in public/audio/CREDITS.md. `npm run test:cabins` verifies the approach, free-look controls, camera anchor and looping kid.

### Updating the Team67 map

The integrated revision is recorded in `public/maps/zurich/integration.json`, including the source SHA-256 and fixed coordinate origin. To update it, pull the source checkout and run:

```sh
git -C artifacts/team67-upstream pull --ff-only
node scripts/import-team67-map.mjs artifacts/team67-upstream
node scripts/route-native-map.mjs
npm run build
npm run test:physics:node
```

The importer copies the complete map and its supplied physics data verbatim. Gameplay interactions are retained and placed on the new map. Normal builds never contact GitHub or GIS services.

For a complete map integration regression, start the production preview on port 4173 and run `npm run test:map:interactions`. It checks physical walking access, all bikes and scanner/breakdown behavior, ticket inspections, cabin look/audio, bus opening, limousine/butler, Finance Guy, Mate machine, boundary encounter, water rescue/explosions and tram derailment. Set `GAME_URL` to use a different server. On macOS the browser checks use native Metal rendering.

## Saved test settings and teleporting

Open **GAME SETTINGS** before starting, or **SETTINGS** during play. Choices persist in this browser: golden highlights for working PubliBikes (enabled by default), paused lecture timer, skipped bus intro, and teleport mode. Turning settings off restores normal behavior; restart resets the bike inventory. Water crashes still work normally.

With teleport mode enabled, press **M** and click the map or choose Start, PubliBike station, Central, either Polybahn station, or ETH finish. Teleports dismount bikes/scooters, find clear dry ground within twelve metres, and preserve the lecture timer. Blocked destinations are rejected. Teleporting is available on the street, outside rides and encounters.

`node verify-game-settings.mjs` checks browser persistence, reliable locks and rides, timer/intro settings, landmark buttons, map-click coordinate mapping, safe destinations and return to normal settings. It saves screenshots in `artifacts/test-settings-menu.png` and `artifacts/test-teleport-map.png`.

`node verify-bike-hover.mjs` tests the production scanner independently: hover-only scanning, the buffering stutter, holding steady, progress loss when moving away, cancellation, retry and permanent lock faults. Screenshot: `artifacts/publibike-hover-stutter.png`.

At the upper Polybahn exit, three visiting Asian tourists ask for two group photos: horizontal, then vertical. The mandatory camera interaction freezes walking and the lecture timer. Frame everyone with the arrow keys or camera buttons, take a cropped photo of the rendered scene with Space/TAKE PHOTO, review or retake it, keep the horizontal shot, then take the vertical shot and hand back both photos to continue. Both interactions use the regular phone handset design with a live camera screen and shutter flash. Escape and restart cannot skip the request. Both accepted photos stay in memory for the encounter. Run `node verify-tourist-photo.mjs` against the development server to check the full flow.

Mission completion only checks arrival at the ETH finish on the ground. There are no intermediate checkpoints, floating checkpoint markers, or checkpoint progress bar; the gold map line is an optional suggested route.

## Lime parking photos

Press E to park the Lime scooter. Once the dismount finishes, the phone rises with a live Camera app for a required parking photo. Frame the entire scooter with the arrow keys or on-screen controls, press Space or TAKE PHOTO, then SUBMIT PARKING PHOTO. RETAKE lets you try again. The timer pauses, and movement, map, phone, restart and remount stay blocked until submission. Each normal dismount requires a new photo. Forced rescue/teleport parks do not interrupt those flows.

The scooter and tourist cameras share framing validation and real rendered PNG capture. `node verify-scooter-photo.mjs` checks the full parking flow, framing rejection, retake/submission, repeat rides and first-person behavior. `node --import ./scripts/browser-gpu.mjs verify-tourist-photo.mjs` verifies the original tourists interaction. Screenshots are saved in `artifacts/scooter-parking-camera.png` and `artifacts/scooter-parking-preview.png`.

Polybahn food encounter: WASD walks along the clear aisle; benches and NPCs bound movement. E near the seated food enthusiast opens arrow-key dialogue with short original German audio excerpts from the supplied Instagram reel, translated captions and animated eating. Voice lines finish before another answer can play; the ride and lecture timer pause in dialogue. The existing 67 kid remains reachable at the other end. Interior details use the real carriage photograph https://commons.wikimedia.org/wiki/File:Polybahn_Wagen.jpg as a visual reference (not embedded). Settings → Prevent rail crashes defaults on, is saved in the browser, and makes the tram complete its route normally; turning it off restores the old first-corner derailment. The Polybahn remains a safe funicular. Verify with node verify-polybahn-eater.mjs.

## Original gameplay layout

The original Bahnhofbrücke path and gameplay ordering are preserved in `public/gameplay/classic-layout.json`. Its coordinates are translated from the original map origin to the native map origin. The PubliBike station, Mate machine, Lime scooter and Finance Guy use these stable layout anchors; the tram, laptop and Polybahn remain in their original geographic areas. The ETH destination also matches the original path.

The displayed walking guide follows those areas with clear ground and shoreline clearance on the current collision grid. It remains optional, with no checkpoints. Run `node scripts/restore-classic-layout.mjs` after map changes to regenerate the guide while keeping item placement stable. The native-route importer preserves this layout. `node verify-classic-layout.mjs` checks historical placement and walks the full guide at 30, 60 and 120 Hz. `verify-native-detours.mjs` checks walking access to every bike and other interaction.

Polybahn station access uses the original station and track locations on the current native map. Narrow passages open the station walls and rail tunnels at runtime, with matching collision clearances and blended floors connecting to the street paths. The source GLB stays unchanged. `node --import ./scripts/browser-gpu.mjs verify-station-access.mjs` checks walking in from Central, boarding, riding and walking out toward ETH.

Restored visible water: river-surface.js draws the existing local map water polygons with a lightweight animated ripple shader, beneath the native bridges. Splash droplets and expanding rings use the rendered water level and reset properly on repeated falls. No map refresh or imported replacement geometry is used. Verify with node verify-river-surface.mjs; visual artifacts are artifacts/restored-limmat-water.png and artifacts/restored-water-splash.png.

Vehicle paths reserve room for the whole limousine and each tram carriage on the native collision grid. Curves are sampled before use; unsafe corner rounding falls back to the checked road segments. The tram keeps its rear carriages on the rails at both stops. The opening shuttle follows a clear approach to its river finale. `node --import ./scripts/browser-gpu.mjs verify-riding-paths.mjs` checks complete vehicle footprints, tram round trips, both Polybahn passing lanes, the shuttle departure. The spare parked ETH Link has been removed; its detached model template is used only for the opening ride.

Bahnhofbrücke Lime trio: three matching GG-pattern streetwear riders share one Lime scooter; the third is parented to the rear rider in a piggyback pose. Approaching the west side of Bahnhofbrücke starts a short pass across the original bridge with three sequential real meme clips and subtitles. The scooter yields when the player is in its path, has a solid footprint, and parks at the east end; E nearby replays the exchange. It resets with the run. “Tall horns” was interpreted as Talahons / streetwear guys; optional literal horns are available through the module setHorns method. Verify with node verify-bridge-scooter.mjs; screenshot artifacts/bridge-lime-trio.png. Voice provenance: public/audio/CREDITS.md.

Einstein’s teleporter: look for the Albert Einstein question mark on the route map. Press E nearby to hear his explanation, then accept his test or press E beside the ring. It chooses a random clear street location and uses the GTA lift/tilt/descent transition without enabling teleport mode. Escape closes his dialogue. Original Blender models and editable source are in assets/blender/einstein-teleporter.blend; rebuild via build-einstein.py in Blender. Verify with node verify-einstein.mjs.

## Sound

Vehicle sounds are enabled by default; toggle them in Settings. The limousine and shuttle use recorded engines; the tram and Polybahn use a recorded rail bed, with proximity attenuation and recorded doors. Bikes and scooters have no artificial engine tone. Loops retain normal playback speed and stop when inactive, paused or muted. Conversations lower the vehicle mix. Walking and running use alternating recorded concrete steps paced by actual distance traveled. Jump takeoff, landings and obstacle bumps have recorded feedback; held wall contact is silent after the first impact. Water, explosions and photo shutters also have effects. Audio starts after the first click or keypress.

Tourists randomly choose from twelve original Mandarin lines across the request, horizontal-photo follow-up, thanks and goodbye. Each recording has its exact Chinese text and English translation in `tourist-voice-lines.js`; regenerate with `python3 scripts/build-tourist-voices.py` (macOS Tingting speech and ffmpeg). Shared playback and subtitle lifecycle live in `encounter-ui.js`; subtitle typography and appearance use tokens in `encounter-ui.css`. Every encounter dialogue uses the same font, size, weight and line spacing. Verify the photo flow, all twelve audio decodes and shared styles with `GAME_URL=http://127.0.0.1:4173 node verify-tourist-photo.mjs`. Audio provenance is in public/audio/CREDITS.md.

Run `node verify-movement-audio.mjs` to check walking/running cadence, idle silence, collision debounce, jump landings and mute.

PubliBike uses the shared live phone-camera handset in its own app. The scan view faces the real QR label on the back of the selected bike, with the surroundings visible. Move the mouse inside the vertical PubliBike app to aim the live camera, center the rear code in the fixed scanner, and hold still; the existing connection stutter, broken bikes, retries and battery behavior remain.

The walking HUD shows the objective, timer, contextual transport prompt and inventory only when items are present. Controls and source credits live in Controls at the lower left. Machine interactions hide the walking HUD and floating labels; mobile uses the full map instead of an overlapping minimap. Run `node verify-ui-layout.mjs` to check four viewport sizes, populated inventory, machine controls and access to help/credits.

On the tram, press V to switch between the exterior view and the passenger cabin. Drag the mouse or use arrow keys to look around independently of the moving carriage. The model has a hollow interior, seats, poles and transparent windows; the camera stays in the middle carriage through turns and resets passenger look on exit. Run `node verify-tram-camera.mjs` to verify boarding, both camera modes and look controls.

With the karambit equipped in first person, left-click or press Q to hit a nearby bus passenger or parked scooter rider. The swing connects once at its forward stroke and uses the same comic launch/tumble/get-up reaction as a thrown Ersti bag. Targets must be close, in front and visible past the map geometry. Q still throws a bag when carrying one. Phone/menu interactions cancel pending swings. Run `node verify-karambit-hit.mjs` to check hits, recovery, cooldown, misses and reset.

Vehicle passenger slots use the named seat layouts in `vehicle-seats.js`: PubliBike and player Lime 1 each, limousine 3, ETH Link 12, tram 18 (6 per carriage), Polybahn 12 (two reserved for its existing characters), and the encounter scooter 3. Capacities count passengers, excluding drivers. The ETH Link starts with the player and three students; the encounter scooter is occupied by its three riders. Tram and Polybahn boarding accepts a player ID, rejects duplicates/full vehicles and late arrivals, assigns stable cabin positions, renders additional riders, and releases slots on arrival/reset. The first passenger starts an eight-second departure countdown; further passengers do not extend it. The Polybahn keeps doors open during the wait and closes them before moving. The riding HUD shows occupancy and remaining boarding time. These are local multiplayer foundations; networking and remote input are not implemented. Verify with `node verify-vehicle-passengers.mjs` and `GAME_URL=http://127.0.0.1:4175 node verify-vehicle-boarding.mjs`.

Each seat declares its carriage, cushion/deck position, seated avatar root, camera eye, facing direction and optional NPC reservation. Tram and Polybahn riders use those anchors rather than generated spacing; additional riders sit facing their seat direction. Polybahn passengers can still leave their seat to move through the aisle. Limousine cushions are modeled at its three anchors. Run `node verify-vehicle-seats.mjs` to check complete layouts and assignments.

Major features have canonical implementations under their category folders in `src/`; see the [code map](src/README.md) for ownership and how to extend them. Use `npm run features:list` to browse them and `npm run features:export -- phone` to produce a separate, reviewable feature library in `exports/phone/`. All modules have already been exported locally. See [feature modules and GitHub exports](docs/feature-modules.md) for the complete module list, dependencies, build commands and sharing workflow. Edit the canonical files in `src/`; root compatibility wrappers keep older imports working.

Top-level rosters now follow the NPC folder pattern: `src/npcs/`, `src/vehicles/`, `src/interactions/` and `src/games/`. Each has an `index.js` entry and can be exported as a complete group; for example, `npm run features:export -- vehicles --out exports/next`.

For merging features into another multiplayer/map host, see [the integration guide](docs/multiplayer-integration.md). Run `npm run test:integration` for host state, reconnect/ownership and alternative-map lifecycle checks.

## Achievement medals

Collect the karambit to earn **REVENGE**. Run over an eligible NPC with a PubliBike to earn **BLOODTHIRSTY**, with the existing comic knockdown and recovery. Each action earns an animated medal chain: Revenge + Frankfurt Delivery for the knife, and Bloodthirsty + Public Menace + Bike Lane Justice for a run-over. The newest medal turns in with an orange flash while previous distinct medals shrink to the right. Back-to-back repeats show 2x/3x on one badge and do not replay its entry animation or chime. Motion and placement use a Black Ops 3 gameplay reference; the sound uses the original BO3 multiplayer beta medal-earned recording and artwork uses original BO3 textures from a community pack. Awards queue and run-over medals only trigger once per NPC per run; restart clears them. Medal sounds have their own setting, independent of vehicle audio. See [medal module](src/ui/medals/README.md) to add achievements or substitute host-provided art/audio.
