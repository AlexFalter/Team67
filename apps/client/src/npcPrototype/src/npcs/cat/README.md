# Bench cat

`createCatBench(scene, world, solver, {camera, placement, avoid, onBite, onComplete, onClose, uiRoot})` owns a resting tabby cat, wooden bench, seated first-person world view with a flat 3D pointer-controlled hand, mouse/trackpad interaction and bite slowdown. Optional placement supplies a `[x,z]` position/heading or search anchors; otherwise it finds clear, level, reachable ground beside the route. Avoid other encounter positions with `avoid`.

Register `active`/`keydown` with the host interaction coordinator. While active, freeze local movement and call `update(dt)` for the camera, petting animation and completion/bite exit. Call `tick(dt, playing)` each game frame and multiply movement targets by `speedMultiplier()`. The slowdown lasts 15 seconds, pauses in settings/petting, and clears on reset. Include `blocked` in movement collisions and `group.position` in map markers. `dispose()` releases instance-owned resources.

Pet back and forth five times at a relaxed pace. No button hold or contour accuracy is required; horizontal, vertical and diagonal strokes all count. The hand stays on the model's surface. A stroke requires `strokeDistance` travel and at least `minimumStrokeSeconds` since the previous counted stroke. Only rubbing above `maximumStrokeSpeed` for a cumulative `roughPetSeconds` triggers a bite; one abrupt movement is forgiven, and slowing down clears agitation. The intensity bar and “Slow down!” warning give time to correct. Relative input starts automatically at the guide's first point, with pointer lock and an offset-based fallback. Success/bites auto-close after the reaction; Escape leaves early. Balance values are in `game.config.json` → `npcs.cat`.

`cat-petting.js` is a pure tempo state machine. Tests cover relaxed strokes, high-frequency samples, arbitrary directions, pauses, single-jump forgiveness, sustained roughness and reset.

The locally bundled CC0 GLB is documented in `public/models/cat/SOURCE.md`. `ready` resolves after loading; `state().modelReady` gates interaction until it is visible. The tracing points are raycast against its actual body mesh, and `cat-coat.js` adds fine tabby markings. The model is static: the bite reaction tilts the body rather than using a skeletal rig.

`cat-sound.js` plays a recorded greeting meow and loops a recorded purr during gentle pointer movement and the happy reaction. Idle purring fades out; biting replaces the purr with an aggressive recorded meow/yowl; exiting, pausing and reset stop playback. Configure `meowVolume`, `purrVolume` and `angryVolume` in `npcs.cat`; sound playback/error state is available through `state().sound`. Audio sources and licences are in `public/audio/CREDITS.md`.

Interaction first opens the shared compact RPG dialogue with **Pet the cat** and **Move away**. Arrow keys / Enter, Tab / Space, or clicking select the action. Only choosing petting shows the hand, seeds the virtual cursor and requests pointer lock. Leaving or Escape closes without starting a stroke or applying a penalty. `state().mode` distinguishes `choice`, `petting` and `closed`.

`biteReactionSeconds` keeps the bite scene open long enough for the full angry yowl.

## Multiplayer game integration

The encounter is restored from `origin/mini-games-2`, including its original model, coat and recordings. The map-owned bench placement is `NPC_LAYOUT.cat.position = [64.74, 32.60, -27.87]`; a three-value position preserves its explicit elevation, while two-value positions retain terrain placement. `NpcFeature` owns loading, input, camera, updates, resets and disposal. Gentle curved strokes count continuously. A bite applies the original 30% walking slowdown for 15 seconds through normal movement input; vehicle controls remain unaffected.
