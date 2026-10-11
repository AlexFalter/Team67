# Tiki Tiki performer

Stylized Blender NPC based on https://www.youtube.com/shorts/jWA3RldPP7w: brown fringe, charcoal hoodie, pale jeans, black/white sneakers, wheeled party speaker with twin pink LED rings. A five-second loop blends a crouch, jumping backflip, tucked rotation, landing and the original dance; the speaker remains planted on the ground. The hip pivot is animated in Blender independently of the music box.

`await createTikiPerformer(scene, world, solver, {placement, avoid, avoidPaths, signal})` returns `group`, `center`, `audio`, `mixer`, `update(dt, listener, {active, muted})`, `reset()`, `dispose()` and `state()`. The host supplies world terrain and the `tikiPerformer` feature placement (`anchor` or `searchAnchors`, optional `heading`). Avoid vectors keep it away from nearby actors; `avoidPaths` holds vehicle polylines as `[x,z]` pairs with a 3.5 m clearance. No camera or specific map imports.

The full user-provided 5:30 slowed MP3 plays with a three-second gap, fades by player distance (3–19 m), respects mute/pause, retries after user gestures, and stops on reset/disposal. Blender source: `assets/blender/tiki-performer.blend`; rebuild with `/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/blender/build-tiki-performer.py`.

Integrated placement comes from `NPC_LAYOUT.tikiPerformer` in the shared NPC layout. A supplied `position: [x, y, z]` places the performer exactly at that point; `anchor`/`searchAnchors` retain the original terrain search for other maps. The existing NPC host owns updates, audio distance fades, map markers, reset and disposal. Model, dance, audio and Blender source were restored from `origin/mini-games-2`.
