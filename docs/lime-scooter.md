# Lime scooter

The playable Lime uses the shared vehicle kind `LIME_KIND` (7). Its nine map spawns use `[x, y, z]` positions in `NPC_LAYOUT.lime.positions`: `[-58.78, 9.34, 57.53]`, `[-21.84, 8.32, 124.78]`, two on Bahnhofbrücke at `[-159, 8.28, 60]` and `[-156, 8.2925, 60.5]`, and two in the Haldenegg plaza at `[8.18, 21.9491, -131.57]` and `[10.18, 21.9791, -131.57]`. Three more scooters sit around `(92.81, 20.78, 150.07)`, in a loose triangle, roughly 8–11 metres apart. Lime scooters do not appear as question marks on either map. Their map placement lives in `packages/shared/src/npc-layout.json`, independently of its model and mini-game.

The server vehicle manager grants two distinct riding positions, validates driver movement and promotes the rear passenger when the front rider leaves. It keeps the parked scooter reserved until its rider submits the parking photo. The last rider to get off must take the photo. Leaving the room releases the reservation; a new round creates fresh vehicle state. Photo submissions carry the round ID to reject stale requests.

WASD rides the scooter, Shift boosts from 12 to 18 m/s, and E parks it. The rider stands on the deck in both camera modes. Other players see the same networked vehicle.

The parking-photo encounter reuses the existing workspace feature from `exports/photos/src/interactions/photos/scooter-photo.js`, adapted to the current map collision interface and host lifecycle. Its integrated implementation is `apps/client/src/npcPrototype/src/interactions/photos/scooter-photo.js`. The portrait phone uses the shared mouse-aim and camera-preview modules. A photo must include the scooter; retake remains available and submitting ends the ride. The server validates ownership and proximity; image framing is validated in the client.

The model is shared with the existing NPC scooter encounter in `src/vehicles/scooter/lime-model.js`; its multiplayer adapter lives in `apps/client/src/multiplayer/limeScooter.ts`. Vehicle prediction, avatar pose and camera height use shared deck-height constants so the scooter stays on the ground.

Tests: `node --import tsx --test tests/lime-scooter.test.ts tests/vehicles.test.ts`.

Space performs a cosmetic hop and deck tailwhip while driving a Lime. The server validates the driver and enforces a one-second cooldown; all clients animate from the synchronized timestamp. This does not change movement or collision physics. Set `LIME_TAILWHIP_ENABLED = false` in `packages/shared/src/limeTailwhip.ts` to disable the entire feature.

Starting a tailwhip immediately shows a two-second skate-style `Tailwhip +180` popup for the driver. This is display-only feedback, managed by `limeTrickScore.ts`; it does not change race results and uses the same feature toggle.

Consecutive tailwhips within three seconds add a visible ×2, ×3, … multiplier. The chain resets after the gap, dismounting, an interaction, pausing, or starting a new round.
