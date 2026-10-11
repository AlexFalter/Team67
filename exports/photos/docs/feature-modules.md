# Feature modules and GitHub exports

Game implementations are grouped by ownership under `src/vehicles/`, `src/npcs/`, `src/interactions/`, `src/games/`, `src/player/`, `src/world/` and `src/ui/`; reused helpers live in `src/shared/`. Start with the [code map](../src/README.md). Each folder has an `index.js` public entry. `main.js` still owns the host scene, game loop and coordination between features. Root JS/CSS files are compatibility re-exports/imports for existing tests and old callers; edit implementations in `src/`, not those wrappers.

## Group entry points

The top-level rosters follow the existing NPC folder pattern. Import from `src/npcs/index.js`, `src/vehicles/index.js`, `src/interactions/index.js` or `src/games/index.js`. The game uses these rosters; each underlying feature keeps its implementation and assets. Vehicles cover transportation and passengers, interactions cover world objects/items, and games cover scanning and quizzes. Cross-cutting encounters may appear in more than one roster without duplicating their implementation.

Export a complete group using `npm run features:export -- vehicles --out exports/next` (or `npcs`, `interactions`, `games`). The individual feature exports remain available. Group libraries are larger because their manifests include all dependencies of their roster. Ticket CAPTCHA and the interview coding puzzle still belong to their existing quest implementations; see the games README for their boundaries.

## Features

| Module | What it owns |
| --- | --- |
| phone | Phone apps, messages, quizzes and handset shell |
| phone-camera | Live handset preview, aiming, capture and scanner helpers |
| publibike | Bike models, station, battery and phone unlocking |
| vehicle-passengers | Capacities, seat layouts, passenger actors and cabin look |
| rail | Tram and Polybahn paths, boarding and interiors |
| shuttle | ETH Link arrival, cabin and departure/explosion |
| interview | Jane Street laptop, invitation and limousine encounter |
| mate | Vending machine, physical can drop, inventory and boost |
| inventory | Shared item tray and acquisition order |
| player | Student rig, walking/riding, first person, slide and quiz penalty |
| karambit | Knife movement and melee/knockdown |
| ersti-bags | Bags, carrying and throws |
| photos | Tourist and scooter photo encounters |
| einstein | Teleporter encounter and camera transition |
| scooter-encounter | Three-rider scooter dialogue and item offer |
| polybahn-encounters | Kid, eater and ticket inspector |
| finance | Finance encounter |
| private-property | Boundary encounter |
| water | River surface, splash and water effects |
| world | Map loading, collision, navigation, boundaries and atmosphere |
| map | Map controls and encounter markers |
| hud | Game HUD and settings |
| dialogue | Dialogue, subtitles and distance attenuation |
| machine-ui | Projected machine panel and card reader |
| vehicle-audio | Recorded movement and vehicle sounds |
| tickets | Ticket machine, payment, QR scanning and collection |

## Export a feature

```sh
npm run features:list
npm run features:export -- publibike
```

The output is `exports/publibike/`. It includes a public entry, canonical source files, shared dependencies, required runtime assets, package/build configuration, README and a manifest of included files. Generated exports are ignored by the game's Git configuration so they can be separate repositories. Exporting never commits, pushes, creates a GitHub repository or changes the existing game settings.

```sh
npm run features:check                       # Validate every dependency and asset
npm run features:export -- --all --out /tmp/eth-feature-review
npm run features:export -- phone --dry-run  # Inspect dependencies without copying
```

Existing export directories are never overwritten. To regenerate, choose a fresh `--out` directory. These exports are feature libraries for a host game, not standalone playable demos. Factory signatures and callbacks are preserved. Supply the scene/camera/world/solver and drive the update, input and reset methods as appropriate. Serve the exported `public/` directory at the site's root. UI modules use browser DOM APIs and still include the shared legacy stylesheet where needed; that stylesheet should be scoped when adapting a feature to another application.

## Build and share an exported folder

```sh
cd exports/publibike
npm install
npm run build
```

The folder is ready to initialize as a separate Git repository when you want to publish it. Choose the public repository name and code license yourself. Refer to included asset credits: exporting preserves existing credits but does not grant new rights to recordings, models or branding. The exporter deliberately omits a blanket license declaration for the generated package.

## Maintain the boundaries

Import a feature through its category entry or its feature folder `index.js`; use `src/README.md` to find the owner. Keep orchestration in `main.js`; communicate through constructor callbacks and returned APIs. Do not import `main.js` into a feature. Prefer explicit scene/world/camera arguments over reaching into the host. Keep feature-specific CSS in its folder. Add new features and dynamic URL assets to `feature-modules.json`.

Exports follow relative JS/CSS/JSON imports automatically. Literal asset URLs under `/audio`, `/models`, `/assets`, `/maps` and `/gameplay` are collected too. Dynamic URLs need an `assetOverrides` declaration: transit models, movement audio, Mate image variants and the map asset family already have them. Imported cue JSON is copied as source data. npm dependencies remain package dependencies, rather than copying `node_modules`. Tests, screenshots, caches, the game bootstrap and unrelated source modules are excluded.

## Verification

Run `npm run test:modules` for export isolation, required assets, preserved credits and overwrite protection. `npm run features:check` audits all feature dependencies. Every generated feature library and the full game were built; UI, bike scanning, seat assignment, boarding, tram camera and shared photo helpers were checked after relocation.

## Adapting features to another map

See [map placements](../src/world/placements/README.md). The Zürich host loads `public/gameplay/feature-placements.json`; exported features accept placements from the host through `world.placements.features` or their placement option. Copy or replace the relevant anchors/routes when integrating a feature. Private-property encounters accept map bounds; model-local coordinates remain with their feature. The Zürich world loader and main game still contain map-specific terrain and presentation.
