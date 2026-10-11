# Vehicles

Import from `src/vehicles/index.js`, matching the NPC roster pattern. This groups the tram, Polybahn, ETH Link arrival, PubliBike, limousine, passenger capacities/seats, cabin look, paths and vehicle audio. Vehicle factories still receive scene/world/solver/callbacks and expose their original update/reset APIs.

The Lime model and ride data belong to `createTransport`. The three-rider scooter conversation stays in `src/npcs/`; its dialogue is an NPC encounter. The limousine is available in both rosters because the same encounter owns the interview quest and vehicle motion. Neither roster duplicates its implementation.

Use `npm run features:export -- vehicles --out exports/next` to generate a reviewable group library, or export `rail`, `publibike`, `shuttle`, `vehicle-passengers` or `vehicle-audio` individually. Canonical implementations are here: `rail/`, `publibike/`, `shuttle/`, `passengers/` and `audio/`. Vehicle sounds stay in `audio/`. See [the code map](../README.md) for extension rules.
