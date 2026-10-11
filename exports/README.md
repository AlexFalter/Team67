# Reusable gameplay feature exports

These packages contain the existing reusable feature libraries, their source dependencies, required assets, and integration instructions. The current multiplayer game remains in `apps/client`, `apps/server`, and `packages/shared`; these libraries expose host-driven factories rather than running a separate game server.

Start with `groups/npcs`, `groups/vehicles`, `groups/games`, or `groups/interactions` for category bundles. Individual packages cover phone/scanner UI, dialogue, inventory, medals, PubliBike, vehicle passengers, rail transport, ticket machines, Mate, NPC encounters, world access, and player controls.

Each package has a `README.md`, `package.json`, Vite configuration, entry module, and `feature-manifest.json`. Follow its README to install/build and supply the host scene, camera, world, update loop, and callbacks. Keep network authority in the multiplayer host when integrating a library. Asset paths and placement/configuration requirements are documented per package.

Historical merge-ready snapshots, installed dependencies, build outputs, and local review artifacts are excluded.
