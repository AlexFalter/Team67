# Interactions

Import from `src/interactions/index.js`. This is the roster for vending/payment, tickets, item collection/use, photos, bags, knife actions and teleport transitions. NPC conversations are grouped separately in `src/npcs/`; puzzle logic is in `src/games/`.

Pass camera/world/solver and callbacks into the original factories and drive their input/update/reset APIs from the host game. The roster does not create UI or start encounters on import. Feature modules remain responsible for assets and state.

Use `npm run features:export -- interactions --out exports/next` to export the group, or choose `mate`, `tickets`, `photos`, `inventory`, `karambit` or `ersti-bags` individually. Some UI still depends on the included legacy stylesheet.

Canonical implementations now live here in `mate/`, `tickets/`, `photos/`, `bags/`, `knife/`, `inventory/` and `machine-ui/`. See [the code map](../README.md) for boundaries and extension steps.
