# Map placement

Feature behavior does not choose a Zürich route index or load Zürich route files. The host supplies `world.placements.features` or passes a feature's `{placement}` option. The generic helper reports missing placements instead of silently choosing another map's coordinates.

The Zürich world loader reads `public/gameplay/feature-placements.json`. This is the place to edit coordinate anchors, NPC destinations, tram/Polybahn routes, scooter arrival points, the player spawn/goal and tourist camera location. Coordinates are local `[x,z]` metres; terrain height supplies y. Station, machine and NPC anchors are safety-search seeds: existing footprint/path checks may choose a nearby valid position. They still refuse unsafe floor locations.

Example for another map:

```js
const station = createPubliBikeStation(scene, world, makeBike, solver, {
  placement: {anchor: [20, 30], next: [25, 30]},
});
const tram = await createTransport(scene, world, solver, {
  placement: {route: {points: [[10, 20], [40, 20]]}},
  scooterPlacement: {position: [16, 24]},
});
```

Supply map queries through the existing world interface: height/ground, collision/water checks, navigation bounds/street data, and passage carving for the Polybahn. Modules depend on those capabilities, not on a specific GIS asset. Model-local coordinates (seats, hands, QR labels and dispenser trays) belong to the model and are intentionally retained.

`createWorld(scene, {placements: myProfile})` overrides the default profile while loading the Zürich terrain. For a different terrain, use its own world adapter and pass the same placement/world contracts. `main.js` remains the Zürich game host; its map labels and mission presentation are not a reusable feature library.

## Roads, bus routes and NPC routes

`roads.source` selects the imported road/location JSON; `roads.streets: null` keeps its existing street network. Set `roads.streets` to an array of `{id, name, width, points}` to override it. Each `points` list contains at least two `[x,z]` coordinates and `width` is metres. This describes roads for world queries; it does not remodel imported pavement, bridges or building collision meshes. Edit those map assets separately when changing physical geography.

`features.shuttle` defines the bus passenger drop-off (`arrival`), orientation (`heading`, radians), optional `departureWaypoints`, optional `departureTarget`, and `riverFinale`. Empty waypoints and a null target preserve the existing automatic departure. Set a target and `riverFinale: false` for a normal bus departure. The flying Battle Bus arrival animation remains separate from the ground departure route.

`features.scooterEncounter` is the three riders who give the player the knife. `ridePoints` defines their final lane; `entrance` optionally chooses an on-map entry, `entranceX` seeds the default northern entry search, and `approachWaypoints` selects intermediate stops. The navigator finds collision-checked paths between these stops; the riders still slow/stop near the player and offer the knife through the existing interaction callback. Dialogue, audio, rider appearance and gift logic remain in the NPC feature.

For example, on a different map (coordinates are illustrative):

```json
{
  "roads": {"streets": [{"id": "campus", "name": "Campus road", "width": 6, "points": [[20, 30], [80, 30]]}]},
  "features": {
    "shuttle": {"arrival": [20, 30], "heading": 1.57, "departureWaypoints": [[40, 30]], "departureTarget": [80, 30], "riverFinale": false},
    "scooterEncounter": {"entrance": [20, 30], "approachWaypoints": [[40, 30]], "ridePoints": [[60, 30], [80, 30]]}
  }
}
```

This is a fragment to merge into a complete host profile. Other NPCs already have their own entries (`einstein`, `finance`, `interview`, `tourists`); add a feature factory and profile entry for a new NPC type. A JSON entry does not by itself instantiate a new character.
