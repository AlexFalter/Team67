# Moonwalking Michael Jackson

`await createMichaelJackson(scene, world, solver, {placement, avoid, signal})` loads the Blender character and validates a clear, level loop near the supplied anchor. Placement defaults to `world.placements.features.michaelJackson` and accepts `{anchor: [x,z], radius: 1.4, speed: .65}` or `searchAnchors`.

Call `update(dt, listenerPosition, {active, muted})` from the host loop. Animation and backward travel loop while active. The short “hee-hee” recording plays at most once every seven seconds, only within hearing distance and after browser audio permission allows playback. Failed autoplay retries directly inside the next click/key gesture. Sound reaches full volume within six metres and fades out by 28 metres. The host has a separate Michael Jackson sound setting, enabled by default, independent of vehicle audio. `reset()` stops audio and rewinds animation; `dispose()` removes the NPC, stops audio, unregisters listeners and frees model resources.

Serve `public/models/michael-jackson/` and `public/audio/michael-jackson-hee-hee.mp3`. Model source and builder are in `assets/blender/`. Audio attribution is in `public/audio/CREDITS.md`.
