# Ersti Bags

Canonical implementation: `src/interactions/bags/`. Public API: `./index.js`.

This belongs to **interactions**. Keep behavior, feature UI and feature-specific sounds with this owner; use callbacks for changes owned by other systems.

See [code map](../../README.md) for folder ownership, integration and the steps to add a new feature.

`onHitPerson(from, to, velocity, {bagId, throwId})` receives the swept projectile path and stable per-release identity. Return true only for a successful NPC hit. The host awards the Bagged medal after a successful strike; medal UI stays outside this feature.
