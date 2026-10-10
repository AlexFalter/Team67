# Real-map prototype — verified visual pass

Local game: http://127.0.0.1:5173/.

Actual Stadt Zürich wall/roof geometry, swisstopo terrain and aerial reference, OpenStreetMap street network and Limmat boundaries. Public geodata remains about 4.8 MB. The playable view uses stylized windows, terracotta roofs and a painted street map for readability; M shows the aerial overview.

Two parallel agents checked physics and independently inspected four browser screenshots. Fixed the camera test to run gameplay instead of the intro. Collision checks passed on 12 native walls with zero penetration, river blocking, and an obstructed camera selecting a safe view about 11.46 m away. Keyboard movement, jumping and the complete 78-point route passed, with no browser errors.

Visual fixes: smaller HUD, continuous gold route, decorative windows, readable ETH finish label, cached street shadows. Disabled shadow reception on buildings to remove diagonal shadow artifacts. Ground edges remain soft at street level; this is a stylized prototype rather than photorealistic street rendering.

Fresh screenshots: artifacts/checked-spawn.png, checked-bridge.png, checked-city.png, checked-eth.png. Production build passes, with Vite's bundle-size advisory.

## Floating geometry repair

Source audit identified unsupported EO13 shelter models, three detached geomtype2 rooftop components, and three roof-only source fragments. Omitted those parts while preserving main bodies, bridges and supporting columns. Added semantic rendering masks so bridges, piers, chimneys and foundations do not get façade windows. Closed small native-base/coarse-terrain gaps with 102 foundation triangles. Bridge road surfaces now use exact surveyed deck triangles.

Inspected repaired screenshots at spawn rotated toward the former canopy strips, bridge approach and Leonhardstrasse: artifacts/fixed-geometry-shelters.png, fixed-geometry-bridge.png, fixed-geometry-hillside.png. Collision assertions remain unchanged; sample selection now excludes tiny wall corners around which the capsule can legitimately slide. Twelve continuous wall impacts, river/camera checks and the full route pass.

## Parallel graphics pass

Three agents implemented building-materials.js, ground-material.js and student-model.js independently; root integrated them and added atmosphere.js. Reviewed five isolated renderer views and live gameplay screenshots. Improved window trim/plaster/roof tiles, world-coordinate paving/asphalt/river details and rounded student. Collision, keyboard/jump, full mission route and production build passed after integration. Main transport work is concurrent in another thread and retained.

## Photo façade pass

Replaced uniform generated windows with local photographic references: concrete apartment windows/balconies, brick apartments and brick windows. Assigned profiles per building gid and generated metre-based tangent coordinates during geodata conversion; foundation/support faces remain plain. ETH main building EGID 3169989 uses a licensed Roland zh photograph as an approximate decorative projection. This is not a calibrated reconstruction of every street frontage. Added visible source/license credits. Original geometry/collisions are retained. Four JPEGs about1.32MB, coordinate gzip about1.29MB.


## One-hour texture gauntlet — 9 October 2026

Window: 17:13:16–18:13:16 UTC. User selected GTA San Andreas texture readability with real Zürich building identity. Separate texture builder, geodata identity builder and harsh critic iterated four material candidates.

Implemented distinct geographic architectural families and verified landmark profiles: LEE 302034660, Polybahn 140004, Central Plaza 140539. Corrected ETH photo from incorrectly textured wings to central west pavilion, normalized UVs near 0–1. Added photographed pane/curtain interiors and sandstone grain, shutters, ground-floor glazing, cornices, shallow derivative relief and material roughness. Removed repeated red station doors.

Validation: npm run build passes; node scripts/check-facade-data.mjs passes, including source profile assignment, profile continuity, ETH UV bounds and doorway interpolation. Native WallSurface and RoofSurface buffers, map and terrain hashes match baseline. No paid APIs or generated imagery. CPU material preview and independent critique saved in artifacts/cpu-facade-swatches.png and artifacts/critic-baseline.md.

Remaining: browser and local-server launch denied by managed sandbox; no new game screenshot, runtime shader compile, current gameplay test, or blind San Andreas win claimed. The timed improvement run does not constitute a visual gauntlet pass.


### Resumed verification — 9 October 2026, 20:25 Zürich

Current-state check found Node PID 80833 listening at 127.0.0.1:5173. This managed session cannot connect (curl exit7) or launch Chromium (MachPortRendezvous Permission denied1100), so listener presence is not proof that the page renders. The server was not restarted.

`npm run test:physics:node` passes against the current world: route traversal at30/60/120Hz, actual station approach and exit, Polybahn round trip, tram braking/boarding, jump landing, fast boundary and20wall impacts, and water recovery. Continuity checks pass with worst station seam7.24cm and terrain diagonal crease below0.000008m. Fresh runtime graphics and reference comparison remain outstanding; no visual win claimed.


### Full-access visual verification — 9 October 2026

Server on127.0.0.1:5173 responds HTTP200. Eight actual landmark scene captures run with no shader/browser errors. Separate critic found actual GPU speckle absent in CPU boards; removed derivative normal relief and quantized interpolated seed before hash. Critic independently inspected refreshedLEE/Centralrenders and accepted specklefix. `npm test` passes allfivebrowser scripts: collision, complete78-pointwalkingroute, vehicles/water, rider/Polybahn andactualstationapproach/exittoETHfinish. `npm run build` passes. Finalgameplayviews saved artifacts/checked-{spawn,bridge,city,eth}.png. Architectureisstylized; exactrecessdepth/windowproportionsstillapproximate.


### Manual facade finishing after goal pause

User authorized facade changes separately from completed street work. Materialv9 samples read-only graded groundheight into facadeGroundY, uses it for base color/glazing/awning placement, preserves upper level windowgrid, addsLEEpairedpanes/blinds andflushmetaldoors, masks oldhotelwindowframes fromnewgroundbands, and stabilizes storefront color. No terrain/collision-source edits. Eight currentrenders saved withoutshader/browsererrors. Exactpositionarray invariance checks pass forwalls/terrain/collider; currentNodephysics/continuitysuite andproductionbuild pass. Gauntlet remainspaused; noSAreferencewinclaimed.

### Blender MCP PubliBike pass — 9 October 2026

Replaced the procedural bicycle with an original Blender-authored local GLB. Added a low-entry berry frame, detailed wheel assemblies, mudguards, front carrier, rear rack, brake cables, chain/crank/pedals, lights and side branding. Editable source and repeatable builder are in assets/blender; runtime integration is in publibike-model.js. The two wheel pivots retain the previous centers and roll around X. Both pickup and ridden instances clone the same asset.

Inspected Blender side/three-quarter views, actual exported Three.js rendering (artifacts/publibike-model.png), and gameplay bike pose. Production build passes with the existing bundle-size advisory. Rider/Polybahn browser verification passes, including forward bike motion and mount/dismount; exported asset renders without browser errors. Approximately 468 KiB, 14,400 triangles and 14 material draw calls per bike. Stylized interpretation, not a measured replica.

### Blender MCP transit pass — 9 October 2026

Added original Blender-authored Polybahn and tram assets to the existing rail systems, plus a new parked ETH eLink articulated bus at a clear road segment near ETH. Source: assets/blender/transit.blend and build-transit.py; runtime loading and bus placement: transit-models.js. Rail movement and boarding APIs remain the same. Polybahn includes a hollow cabin, transparent glazing, benches and grab poles; opaque window backing found in the initial passenger screenshot was removed. Tram details include wheel hubs, double doors, framed panes, lights, roof equipment and fixed route number; existing destination sprite still updates on return trips. Shuttle details include the accordion joint, three axles, mirrors, batteries, white/red graphics and ETH lettering.

ETH Link is a parked visual model, with no boarding or new bus journey. Hönggerberg is outside the current map. Reference: ETH's official eLink photograph, https://ethz.ch/staffnet/en/service/mobility/link.html. Original geometry only; reference photos are not shipped.

Production build passes with the existing bundle-size advisory. Browser station-access test passes including Central approach, Polybahn cabin, dismount and walk to ETH finish. Transport/water test passes including tram round trip. All three exported models render without browser errors. Previews: artifacts/{polybahn,tram,eth-link}-model.png. Bus placement center is clear of native buildings, checked along its footprint and away from route markers.

### Interactive PubliBike station and QR unlock game — 9 October 2026

Created an eight-bike station beside the early route with marked bays, a terminal, live usable-bike count, per-bike number/QR tags and occupancy lights. E selects the nearest physical bike and opens a local phone scanner. Aim with mouse/WASD/arrows, then hold Space or SCAN; alignment and hold time are required. The lecture timer and world movement pause during unlocking. Escape cancels, keyboard focus stays within the phone dialog, and returning near the station fills a vacant bay. Remote parked bikes retain their identity and can be scanned again.

Faults are repeatable per bike rather than random test failures: bike 8 has one retryable croissant QR error, bike 3 permanently refuses its lock, and bike 6 breaks down after 3.5 seconds of moving. Breakdown stops riding, dismounts the player and leaves the bike out of service. Broken bikes show a red bay light and no longer count as available. Five bikes remain reliable; reset restores all eight and clears fault attempts.

The station browser suite passes: all eight independent selections, cancel, alignment/hold, paused timer and position, successful scan, retry/permanent errors, actual riding breakdown, replacement bike, remote remount and reset. Screenshots: artifacts/publibike-unlock.png, publibike-scan-error.png and publibike-breakdown.png. Added npm run test:bikes and updated bicycle regression helpers to drive the actual scanner UI. Existing shuttle intro is preserved; Space/Enter can skip it, and Enter's default button action is suppressed when skipping.

Final verification: production build passes (existing bundle-size advisory). The production-preview station suite, transport/water suite and rider/Polybahn suite all pass with the actual QR unlock interaction. The route map now includes remotely parked working bikes. Refreshed station preview: artifacts/publibike-station.png.

### Polybahn animation and mandatory ticket inspection — 9 October 2026

Rebuilt the Polybahn in Blender with sliding door leaves and rolling axle pivots; editable source is assets/blender/polybahn-animation.blend and repeatable builder is build-polybahn.py. Runtime shares a continuous metre-based 3D curve between track, cars and cabin camera. Cars follow the incline, accelerate/brake, and close/open doors before departure/arrival.

Collect a ticket with E at either entrance; boarding consumes it. Fareless rides trigger Inspector Bünzli's mandatory 18-second cinematic with six comic lines, optional speech, a fictional CHF 100 game fine and 10-second time penalty. Keyboard, reset and map controls cannot skip the scene; completion charges once and resumes the ride. Reset clears tickets and fines.

Production build, curve motion checks, production-browser ticket suite, station walking access, rider/Polybahn round trip and Node physics suite pass. Inspected the exported model and actual cabin/inspector screenshots. Preview: artifacts/polybahn-ticket-checker.png. Existing unrelated bicycle, shuttle and tram features preserved.

### James’s coding challenge and complimentary limousine — 9 October 2026

Added a reachable laptop at lower Central beside the uphill street route. E opens a one-line JavaScript challenge: print 0, 1, 2 using a for loop. Validation parses a narrowly scoped loop without executing player input; supports alternate variable names, optional braces and equivalent increments/upper bounds. Wrong answers give a retry hint. Coding pauses the clock and world controls, Escape cancels, and keyboard focus stays inside the dialog. Success announces James’s interview invitation and lets the player request a free Uber Black.

Added an original native Three.js black-and-gold stretch limousine with rounded bodywork, tinted windows, gold wheels, grille, chrome bumpers, handles, mirrors, lights and animated passenger door. It approaches the pickup over four seconds, waits for E boarding, accelerates along the existing curved uphill street/tram route, brakes at ETH and drops the passenger on a checked pedestrian route point near the finish. Ride fare is CHF 0 and the lecture clock pauses aboard. R/reset supports replay.

Production build and syntax checks pass. Production-browser interview suite passes input variants/rejected code, pause/cancel/retry, invitation, pickup/boarding, moving ride, safe ETH landing, fare and timer, plus replay after reset. Existing station-access/Polybahn/ETH walking suite passes. Inspected runtime invitation and limousine screenshots: artifacts/interview-{laptop,invitation,limousine}.png. Test command: npm run test:interview.

### Jane Street Easter egg and butler — 9 October 2026

Corrected the invitation and ride copy to Jane Street. The laptop now has a small physical screen mark, no floating sign, no proximity HUD hint and no advertised reward before solving the challenge. Placement checks the full table footprint, a walking access line and at least nine metres of clearance from the tram route and its parked trailing car footprint. The limousine pickup is offset 4.5 metres from the tram, merging into its street route ahead of the stop.

Added a tuxedoed butler with white gloves, bow tie and lapels. He walks to the passenger door and opens it before E boarding, steps aside as it closes, and opens it again at ETH. Removed fixed window/body panels behind the moving passenger door. Reset clears the actor and restores the neutral challenge. Production build passes; interview suite verifies unmarked laptop/rail clearance, Jane Street invitation, visible butler/open door, full free ride and reset.

### Finance Guy original-audio encounter — 9 October 2026

Added an unmarked, reachable Finance Guy NPC on a Leonhardstrasse side detour at least five metres from the normal walking route. Within 2.8 metres, automatic proximity starts a mandatory 20.5-second conversation once per run. The original SRF upload linked by the user is Md6pO_m2HKs; the locally shipped MP3 is its continuous 37.800–58.300 second excerpt, covering sales, ETFs, asset management and market chatter. Only transcoding and tiny edge fades are applied; no synthesized voice or invented dialogue. Provenance is recorded in public/audio/CREDITS.md, original audio and automatic captions cached in artifacts.

The stylized NPC wears a cream quarter-zip, pink collar, tortoiseshell sunglasses, earbuds, watch, navy trousers and red socks. Animated mouth and hands follow the recording time, with a close camera and topic captions. Movement, map, camera dragging, vehicle interactions and reset are locked; lecture clock and position pause. Completion waits for the real recording to end, restores the player locally, and prevents immediate retriggers. R outside the scene resets the encounter. Failed audio playback falls back to the full scene duration rather than leaving the game locked.

Production build and the browser finance suite pass: actual walking detour/proximity, off-route clearance, original audio playback through completion, skip/reset/map lock, paused clock/position, safe local return, once-per-run and replay/reset. Actual gameplay image inspected: artifacts/finance-guy-cutscene.png.

### Finance Guy single-speaker audio correction — 9 October 2026

Replaced the continuous interview excerpt with four separate Finance Guy answer clips: Sales (37.800–39.000), ETFs (40.980–43.120), Asset Manager (44.840–46.660), Market (54.480–58.280). Removed interviewer questions, acknowledgements and the short years-of-service exchange. The 9.5-second edit preserves the original voice, uses 180 ms pauses and tiny fades at joins, and has a reproducible cut list plus Python/FFmpeg builder. Runtime duration and topic captions derive from the same edit manifest. Source footage and automatic-caption timing were inspected for the speaker boundaries.

Production build passes and ffprobe confirms exactly 9.5 seconds. Browser validation additionally compares the decoded recording length to the manifest; mandatory interaction behavior is retained.

Final verification for the single-speaker edit: production browser suite passes with the decoded 9.5-second audio, all skip/map/reset controls blocked, completion snapshot preserving the paused lecture timer and local position, safe return and replay. Short-cutscene controls are tested in one browser event batch so test driver latency cannot outlast the recording.

### Dynamic arrivals, passenger look and six-seven kid — 9 October 2026

ETH Link now enters on a smooth aerial curve from beyond the playable world, beginning with an exterior shot before moving into its cabin. Transparent windows, a seated uniformed driver and sliding exit doors support the arrival view. Mouse drag and arrow keys rotate the passenger view in both the bus and Polybahn while keeping the camera attached to the moving vehicle; cabin grade is preserved and view state resets when leaving.

Added a gray-hoodie kid in the Polybahn aisle with raised open palms, alternating six-seven gestures and animated mouth. The original viral kid audio is clipped from Cam Wilder's original upload (806.700–808.450 seconds), with a short pause, and loops throughout the ride. It quiets during ticket inspection and stops on exit/reset. Source attribution is in public/audio/CREDITS.md.

Production build, passenger camera checks, production-browser cabin ride/audio checks, shuttle arrival/exit/explosion suite and Polybahn ticket suite pass. Inspected final bus interior at artifacts/eth-link-void-arrival.png and kid at artifacts/polybahn-six-seven-kid.png. Camera and cabin checks run with npm run test:cabins.

### Team67 official map integration — 9 October 2026

Fetched AlexFalter/Team67 main at 0b14df1f28f25338b8a2ce6a96722bbccbfc694e into artifacts/team67-upstream. Imported its official combined LoD1/2 Buildings and TIN terrain GLB. The source origin (2683475,1248000,400) is deliberately translated by (-75,0,-50) to the existing game origin, preserving all geographic entity placements and saved coordinates. The original GLB, source provenance, SHA-256 and integration manifest are shipped in public/maps/zurich. Runtime uses converted compressed building geometry and terrain samples; normal builds perform no remote downloads.

The converter scripts/import-team67-map.mjs preserves surveyed building vertices, omits only degenerate triangles, and carries decorative material coordinates onto the new surfaces. The official terrain supplies all playable-grid samples; existing street grading, bridge/terrace decks, route clearances and station passages retain safe movement and boarding. Existing interaction modules remain wired into the game. Credits distinguish the new CC0 map from earlier supplemental deck geometry and imagery. README documents pulling/updating the checkout and reproducible imports.

Verification: production build passes. Node physics checks pass the full route at 30/60/120 Hz, Polybahn approach/exit/round trip, wall impacts, jump, boundaries and river recovery; world continuity checks pass. Source-vertex comparison, source hash and browser map checks verify the actual imported geometry and all eight bike sites plus laptop/finance/vending detours are physically reachable. Production browser suites pass bikes/QR/errors/chain failure/replacement/remote parking/reset; Polybahn tickets/doors/unskippable fine; passenger free look and original looping six-seven audio; ETH Link void arrival/exit/explosion; Jane Street laptop/limo/butler/ETH drop-off; Finance Guy edited original audio/unskippable controls; Mate machine; repeated boundary encounter; scooter mounting; water rescue/bike explosion; tram derailment; and station-to-ETH walking.

The bike breakdown regression now drives along a dry uphill street and explicitly asserts CHAIN.EXE, keeping it separate from the newer river-explosion mechanic. Browser checks use the native Metal backend on macOS to avoid software-GPU timing stalls. npm run test:map:interactions provides a sequential repeatable full regression against production preview (4173, overridable via GAME_URL). Inspected actual Central and ETH station gameplay screenshots, including artifacts/team67-map-central.png.


### Complete Team67 map replacement — 10 October 2026

This supersedes the earlier hybrid integration. Pulled Team67 main to e5c2a71aaf62b3bd71ba7f672bc286436edf160e and replaced the map loader with the complete original hb-eth.glb. Buildings (294,738 vertices) and Terrain (141,925 vertices) retain their original positions, indices, materials and fixed LV95 origin [2683475,1248000,400]. GLB SHA-256: ed22c0dd01a6bc0a569e99d36a2096474d17ff081c4c154f59a36321352b9f28. BVHs use indirect indices so runtime collision acceleration does not reorder source geometry.

Deleted the old served data/texture assets, converted runtime geometry and old terrain/facade generation modules/scripts. No legacy terrain, street grading, synthetic bridge overlays, foundation triangles, facade styling or station passage cuts remain in the world. The map importer now copies the upstream GLB, provenance, area definition and supplied physics data verbatim. Walking uses the upstream two-metre terrain/roof grid and native HB–ETH route; the roof grid is the same approximate building footprint mask used upstream. OSM street/river annotations identify gameplay zones and draw the schematic minimap.

Preserved the interaction systems and migrated geographic props into the native coordinate frame. Native navigation finds clear station entrances and routes both the Polybahn and limousine around source building footprints. Every bike, NPC, laptop, scooter, tram and ticket pickup has a tested walking connection to the native route. Central/ETH teleport targets now use native locations and account for the denser route. The kid audio and passenger look state stop immediately on disembarking, before the mandatory tourist photo interaction begins.

The final build snapshot is served at http://127.0.0.1:4174/ from artifacts/native-final-preview to keep browser validation stable while other workspace changes occur. Test logs: artifacts/native-map-regression.log.

Final validation: production build passes and all 22 map/interaction regression modules pass against the fixed production snapshot (GAME_URL=http://127.0.0.1:4174 npm run test:map:interactions). Includes original-file/runtime geometry identity, full native route at 30/60/120 Hz, native collision mask, physical detours, all bikes/scanner/faults/replacement, Polybahn tickets/fines/round trip/cabin/kid, tourist photo/audio, settings/teleport, first person, encounter maps, scooter photo, bus intro, laptop/limousine/butler, Finance Guy audio, vending machine, boundary encounters, water recovery/explosions and tram derailment.


### GitHub rendering parity — 10 October 2026

Matched Team67 MapViewer rendering rather than the previous cinematic atmosphere: original background, no fog, NoToneMapping, neutral hemisphere light (#ffffff/#7c8792, intensity 2), original sun (#fff7e6, intensity 2.5), PCF shadows and the original 60m focused shadow camera. Sun follows the player with the upstream offset (-20,+40,+20), with live shadow updates and shadow receiving enabled on all original map meshes. Gameplay camera now matches 60-degree FOV, 0.1m near and 6000m far; pixel ratio cap is 2. Removed the screen-edge vignette. Geometry and materials remain original and unchanged.

verify-render-parity.mjs compares the original GLB with the integrated map at the upstream overview camera [650,850,900], targeting [0,25,0], FOV 45. All 3,840,000 pixel-channel bytes are identical. It additionally checks production gameplay renderer/camera/shadow configuration. Screenshots: artifacts/github-render-parity.png and artifacts/github-style-gameplay.png. Updated the previously linked 4174 build snapshot with this renderer.

### Map marker correction — 10 October 2026
Reduced map label and question-mark sizes. Removed fabricated boundary markers and unspawned tourist markers. Markers now follow available interactions: collected tickets, completed encounters and unavailable vehicle boarding disappear; the Polybahn marker points to its current boarding door. Verified live ticket collection, marker positions/rendering and responsive zoom/pan/teleport controls against the production build.

### GTA location-transfer camera — 10 October 2026
Preserve the source camera before moving the player. Transition lifts over the source in two steps, travels to the destination with a gentle temporary camera bank, then descends in three steps to the normal destination view. Retains 4.5-second duration, six audio pulses and gameplay lock. Production build, transition regression and responsive map controls pass.
Visual reference: https://www.youtube.com/watch?v=rpHAikePRiw (GTA 5 Character Switching Details), reviewed frame sequences at 108–132 seconds: close overhead lift, wider aerial steps, tilted map transfer, close descent. Reference video and sampled contact sheets retained under artifacts/gta-switch-*.

### ETH Link departure steering — 10 October 2026
The intro update was overwriting the departure path yaw every frame, making the bus slide sideways. Parked-pose restoration now runs only before departure. The route starts at the exact bus origin rather than the snapped navigation grid cell, removing the initial lateral jump. Regression samples actual movement and verifies nose alignment and preservation of the departure quaternion through the intro update.

### Scooter dialogue edit — 10 October 2026
Retained original Frankfurt challenge. Replaced tank/document fragments with original recorded complete responses “Du bellst so viel” and “Wir sind alles Freunde”; captions match. Saved second German ASR transcript with timestamps, a review of uncertain material and a reproducible cut list/script. Production build and full scooter arrival/dialogue/audio/captions/replay/reset regression pass.

### Bag impacts and bridge collision — 10 October 2026
Thrown Ersti bags sweep against the three bus passengers. A hit launches a comic tumble, brief grounded pause, and kneeling-to-standing recovery; bags bounce off, duplicate hits during recovery are ignored, and restart clears reactions. Landing paths stop before buildings/water. Passenger exits are sequential and finish before the player exits. Bridge grid roof comparison now tolerates deck quantization and the tiny downward gravity step, so its deck is not treated as a building interior. Crossings pass both directions, three lanes, 12/22 m/s and 30/60/120 Hz; full Node physics and world continuity pass.

### Einstein, Battle Bus recording, and phone pointer aim — 10 October 2026
Built original Einstein (silver hair/moustache/tweed suit) and copper ion-ring teleporter models through Blender MCP. Editable source and repeatable builder: assets/blender/einstein-teleporter.blend and build-einstein.py; exported local GLBs. Einstein is placed on a flat walkable roadside site with E dialogue and state-aware map markers. Machine selects a validated clear street destination, avoids nearby/repeated destinations, and reuses the GTA transition without enabling teleport settings. Dialogue pauses player/timer; Escape closes it. Browser regression passes normal-mode travel, safe varied landings, repeated use and reset.
Original Fortnite Battle Bus sound is cached and credited, excerpted to the seven-second arrival with a 400 ms fade. Intro start plays it once; skip/finish stops and rewinds; replay does not overlap. Actual decode/playback and restart/skip regression pass.
Both phone photo viewfinders accept direct mouse/trackpad hover like the QR scanner, mapping pointer position to yaw/pitch with time-based easing; no drag required. Center and orientation changes reset pointer aim; preview buttons remain independent. Complete scooter and tourist photo suites include real pointer movement, framing, crops, retake and submit.

### Tourist portrait-first flow — 10 October 2026
Tourists now request the vertical photo first, then ask for a sideways photo after accepting it. Handset, camera FOV, actual PNG crop and accepted-photo ordering switch portrait→landscape together. Removed directional and Center buttons plus arrow-key aiming from both photo apps; direct mouse/trackpad motion is the aiming control. Visible unused tourists have a map marker at the accessible meeting point; completion removes it.

### Scooter portrait camera and free photos — 10 October 2026
Scooter parking handset, camera framing and captured PNGs now remain portrait. Pointer aiming spans a full horizontal turn with greater vertical movement. Shutter accepts people/scenery photos outside scooter framing; their preview explains that a scooter photo is still needed and disables parking submission until that requirement is met. Retake restores the camera. Production build and scooter regression pass, including real pointer motion, an off-scooter photo, portrait PNG dimensions, mandatory parking submission, repeated rides and reset. Visually reviewed the vertical handset with Einstein visible in the live camera.

### Randomized tourist Mandarin and shared encounter typography — 10 October 2026
Twelve original Mandarin lines (three variants each for request, sideways follow-up, thanks, goodbye) rendered with macOS Tingting; exact Chinese/English strings and audio IDs live in tourist-voice-lines.js. Rebuild via scripts/build-tourist-voices.py. New encounter-ui.js owns shared subtitle creation, typography classes and cancellable voice playback; newer lines replace older ones, immediate repetitions are avoided, subtitles disappear when speech ends, and restart clears pending audio/subtitles. encounter-ui.css centralizes dialogue font/size/weight/leading/color and subtitle surface tokens. Applied common typography to tourists, scooter trio, Finance Guy, inspector, private-property NPC, 67 kid, food enthusiast and Einstein. No map changes.
Production build and tourist tests pass all twelve actual audio decodes, matching translations, nonrepeating responses, subtitle end/reset cleanup, identical computed typography across eight encounters, and full portrait/landscape photo flow. Existing Finance Guy, private-property, scooter-trio, 67 kid, food-enthusiast and Einstein regressions pass. The older verify-polybahn-ticket script assumes direct free ticket pickup and aboard inspection, both superseded by the current payment machine and station-exit inspection; added verify-encounter-ui.mjs to check the actual station-exit inspector independently. Updated the shared photo test helper for the two-photo flow.
