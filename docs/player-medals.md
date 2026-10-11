# Multiplayer medals

Medal rules live in `apps/server/src/medals.ts`. Shared IDs, titles and descriptions live in `packages/shared/src/medals.ts`; presentation and sound live in `apps/client/src/multiplayer/medals/`.

| Medal | Requirement per round |
| --- | --- |
| First Blood | First accepted punch or bicycle run-over on another connected player, across the room. |
| Road Rage | Knock down another connected player with a bicycle. Once per victim for each attacker. |
| Bloodthirsty | Land punches on three different connected players. |
| Personal Grudge | Land three punches on the same connected player. Once per victim. |

Only the server awards medals, after normal combat validation. NPCs, self-hits, misses and hits on already knocked-down players do not advance medal progress. The victim must recover before another punch counts. Progress resets with the round; the attacker receives the award message, not the victim.

The client deduplicates award IDs by server event key, displays simultaneous medals in sequence with recent badges beside the current badge, and groups repeated medals into a multiplier. Old-round messages are ignored. The existing medal art and quieter sound are reused; provenance accompanies the assets.

To add a medal, add its shared definition, track its server condition, and map its art in `medal-art.js`. Keep client presentation independent of map coordinates and gameplay validation.

Validation: `node --import tsx --test tests/player-medals.test.ts tests/vehicles.test.ts`.
