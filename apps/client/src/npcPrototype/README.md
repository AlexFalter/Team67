# Prototype NPC adapter

Selected encounters copied from the restored `mini-games` prototype. Keep the original models, dialogue, recordings and animations here; main owns movement, networking, terrain and rendering.

`host.js` adapts the JavaScript encounter APIs to `MapGame`; `host.d.ts` describes the TypeScript boundary. `src/world/core/main-world.js` wraps main's world and geometry. `src/world/core/geo-world.js` intentionally contains placement math only, with no prototype world loader or global raycasting changes.

See `docs/npc-encounters-multiplayer.md` at the repository root for ownership, scope and validation notes.
