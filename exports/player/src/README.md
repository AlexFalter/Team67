# Code map

Gameplay tuning lives in [`game.config.json`](../game.config.json). See the [configuration guide](../docs/game-configuration.md) before editing timers, rewards, movement, NPC dialogue or presentation values.

Start here when finding or extending a feature. Each category owns its real implementations, not just a list of exports. `index.js` is its entry point; `main.js` at the project root connects them into the game.

| Folder | Owns | Put new work here |
| --- | --- | --- |
| `vehicles/` | Tram/Polybahn, bikes, ETH Link, seats and vehicle audio | New vehicle, ride path, boarding or engine/door sound |
| `npcs/` | Character encounters, quest dialogue and conversation camera | New character, dialogue choices or quest |
| `interactions/` | Mate/ticket machines, photos, bags, knife and inventory | New usable world object, item or collection flow |
| `games/` | Bike scan challenge, quizzes, timers and quiz penalty | New puzzle or challenge rules |
| `player/` | Avatar, first-person hands, movement and animations | Player controls or animation |
| `world/` | Map/collision/navigation, map UI and water | Terrain, collision, routing or environment |
| `ui/` | Phone shell/apps, HUD and settings | General presentation or menus |
| `shared/` | Small camera/dialogue helpers used by multiple owners | Only helpers that are actually reused |

Sounds stay with the feature that uses them. Vehicle sound code is in `vehicles/audio/`; NPCs keep their voice timing and recordings with their encounters. Shared volume/subtitle helpers remain in `shared/dialogue/`. Runtime media stays in `public/` and cue data in `assets/`, with credits retained.

## Boundaries

- Category and feature `index.js` files expose public factories/helpers. Import those when connecting systems; edit the implementation beside them.
- Each factory owns its local state, UI, model and feature behavior. Pass scene/world/camera/solver and callbacks explicitly.
- `main.js` owns the game loop, player state and coordination. A feature never imports `main.js` or reads `window.__test`.
- World objects present a challenge; `games/` owns reusable challenge rules. PubliBike station/motion is in `vehicles/publibike/`; scanning is in `games/bike-scan/`.
- NPCs may own a vehicle as part of a quest: the interview limousine remains in `npcs/interview/` and is exposed by the vehicle roster too. Photos include tourist characters because their photo flow shares one owner. There is one implementation of each.
- Ticket CAPTCHA and the interview code puzzle still live inside their machine/quest flows. Extract them into `games/` when another feature needs their rules, rather than adding a wrapper with no independent API.
- Root JS/CSS files are legacy forwarding entries for tests and old imports. New code goes in `src/`.

## Add a feature

1. Choose its owner from the table and create a descriptive folder, such as `interactions/locker/`.
2. Keep its implementation, feature CSS and README together; expose its factory through `index.js`.
3. Export that factory from the category `index.js`. Use callbacks for rewards, movement or quest changes owned by other modules.
4. Connect input, update and reset in `main.js`. If the feature installs listeners or timers, give it a cleanup method and remove them there. Reuse existing interaction gating so two encounters cannot run at once.
5. Add an entry to `feature-modules.json` if it should export separately. Literal runtime assets are collected automatically; declare dynamic asset paths in `assetOverrides`.
6. Add checks for the feature's behavior and reset/cancel cases. Run `npm run test:modules` and `npm run build`, then verify the actual interaction in the browser.

See [module exports](../docs/feature-modules.md) for sharing a feature or category. No GitHub publication is part of this workflow.

Map coordinates and routes belong to the [placement profile](world/placements/README.md), supplied by the host. Keep placement data separate from feature behavior; new features should accept a placement option and use world queries for terrain and collision.
