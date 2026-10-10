# Integrating with another map and multiplayer game

Keep the destination game's network transport, map loader, renderer and player controller. Import feature libraries into that host; do not merge the Zürich `main.js` bootstrap or replace the destination map with our loader.

## State ownership

| State | Owner | API |
| --- | --- | --- |
| Bike working status, ownership, battery, docks and parked poses | Authoritative host | `createBikeFleetState` |
| Exactly one working Mate flavor | Authoritative host, selected once per run | Supply `workingFlavor` to each player's `createMateMachineState` |
| Mate attempts, payment, collection and boost | Per-player state, host validates rewards | `createMateMachineState`, `createMateInventoryState` |
| Passenger IDs, seat slots and boarding timer | Authoritative host | `createVehiclePassengers` |
| Phone, dialogue, camera, scanner and inventory presentation | Local client | Existing UI factories and `createInteractionCoordinator` |
| Collision, map assets, player movement and vehicle transform replication | Destination host | `createWorldAdapter` and the destination's existing systems |

The state modules have no DOM, Three.js, asset loader or network dependency. Import them from `src/shared/runtime/index.js` or export the `integration-core` feature. Factories produce fresh instances, not global world/player state. Exported feature/group entries that include UI import CSS; use the integration-core entry for the server.

This prepares contracts for multiplayer; it does not create a server or choose a networking protocol. Rail vehicle motion, quest progression and combat reactions still need binding to the destination host's replicated entities. Passenger snapshots alone do not synchronize rail transforms or the complete rail ride state.

## Host rules and snapshots

```js
import {
  createBikeFleetState,
  createMateMachineState,
  createMateInventoryState,
} from './src/shared/runtime/index.js';

const fleet = createBikeFleetState({
  fleetId: 'campus-bikes', // Namespaces stable entity IDs across stations.
  failurePercent: 50,
  batterySeconds: 15,
});
const workingFlavor = Math.floor(hostRandom() * 4);
const mateByPlayer = new Map();
const inventoryByPlayer = new Map();

function connect(authenticatedPlayerId) {
  if (!mateByPlayer.has(authenticatedPlayerId)) {
    mateByPlayer.set(authenticatedPlayerId, createMateMachineState({workingFlavor}));
    inventoryByPlayer.set(authenticatedPlayerId, createMateInventoryState());
  }
}

function claimBike(authenticatedPlayerId, bikeId) {
  // Validate proximity and player movement/quest state using the host map first.
  return fleet.claim(bikeId, authenticatedPlayerId);
}

function collectMate(authenticatedPlayerId, grantId) {
  const machine = mateByPlayer.get(authenticatedPlayerId);
  if (!machine?.collect()) return false;
  return inventoryByPlayer.get(authenticatedPlayerId).add(grantId);
}

// Drive this once from the host clock, regardless of anyone's open phone/dialogue.
fleet.tick(dt);
broadcast(fleet.snapshot());
```

`claim` rejects occupied/broken bikes, duplicate claims and a player claiming another bike in the same fleet. `park` and `destroy` require the current owner. `park` rejects an occupied dock. `setPose` requires the supplied owner ID to match (null for parked bikes). Battery consumption belongs to `tick`; parking and remounting do not recharge it. `reset({workingIds})` allows a host to supply predetermined results; otherwise reset samples fresh availability. Snapshot configuration derives count/battery/fleet ID when constructing a replica from a snapshot.

Mate `select`, `pay` and `collect` reject duplicate or out-of-phase actions. Exactly one working flavor remains guaranteed. Inventory reward `grantId`s are retained in snapshots, preventing a replayed grant from adding another can. Use a stable host-generated grant ID per actual reward. Reset clears grants for a new run.

All models expose JSON-safe `snapshot()` and validated `restore(snapshot)`. Restoration validates before mutation. Bike `applySnapshot(snapshot)` ignores older revisions; the station's `restore` uses it. An explicit model `restore` can initialize a new session regardless of revision. Passenger snapshots preserve exact player-to-seat assignments and the boarding countdown. They do not regenerate seats on reconnect.

Authenticate player identity through the destination's connection/session, never a player ID trusted from a received payload. The host must also validate distance, movement, reward eligibility, request ordering, map/session identity and command rate. These modules enforce their own state transitions; they cannot validate connection identity or map proximity without the host. Do not accept client-authored snapshots as authoritative game state. Persist personal state and reward grants on the host if reconnecting should retain them.

## Bike client view

```js
const fleetReplica = createBikeFleetState({snapshot:initialHostSnapshot});
const station = createPubliBikeStation(scene, world, makeBike, solver, {
  stateModel: fleetReplica,
  playerId: session.playerId,
  replicated: true,
  uiRoot: localHud,
  placement: bikePlacement,
  onCommand: command => network.send(command),
});
network.onBikeSnapshot(snapshot => station.restore(snapshot));
```

In replicated mode, claims/parking/destruction produce commands; they do not mutate the local state. `updateRide` does not drain batteries and `reset` does not reroll availability. Mounting a supplied state model also preserves its results. A successful local `take` in the original standalone mode returns a bike; a replicated `take` returns null until the host confirms ownership via a snapshot. The destination controller should react to that ownership confirmation to begin/end riding. It must publish moving-bike transforms separately (or use host `setPose`); this station renders parked bikes and tracks the local active bike, while the host supplies rider/remote vehicle rendering.

For exact map placement, publish eight `{x,z}` points in `placement.slots` alongside `anchor` and `next` (which define orientation). The station uses those points directly. Without `slots`, its existing safety search chooses a nearby station. Mate supports an exact `placement.position:[x,z]` or its existing `searchAnchors`. Resolve placements on the host or use identical static profiles, rather than allowing dynamic player collision to make clients choose different sites.

## Mate client view

Mate also accepts `{stateModel, replicated:true, onCommand, entityId, uiRoot}`. It emits `mate.select` (with `flavor`), `mate.pay`, and `mate.collect`; the host identifies the machine by `entityId`, authenticates the player and calls that player's rule model. Restore the host's personal snapshot with `mate.restore(snapshot)`. The client does not advance payment/drop timers, select a winner or collect a reward in replicated mode. Pending actions disable repeated input until a snapshot responds; send the current snapshot on rejection as well. Restoring updates the active interface without closing it, and an approved collection calls `onWin` once for that transition. Use this callback for local feedback; synchronize inventory from the authoritative inventory model or use its stable reward grant IDs. Reconnecting to an already-collected snapshot must restore inventory rather than issue a new reward. Drive each active player's Mate rule model from the host clock.

## Map contract

`createWorldAdapter` translates the destination's map queries without loading Zürich assets:

```js
const {world, solver} = createWorldAdapter({
  height: (x,z) => hostMap.floorHeight(x,z),
  blocked: (x,z) => hostMap.outOfBounds(x,z),
  isWater: (x,z) => hostMap.isWater(x,z),
  bounds: hostMap.bounds,
  placements: hostPlacements,
  penetration: position => hostPhysics.penetration(position),
  solve: position => hostPhysics.resolveCapsule(position),
});
```

Coordinates are local x/z metres with y up. `solve` mutates the supplied position and returns a correction vector. Supply real collision queries; constant no-collision callbacks are only suitable for the flat-map test fixture. Features use height, water and collision through this contract; this adapter does not replace host movement.

Road vehicles additionally need `bodyBlocked(x,y,z,radius,height)` and either `vehicleWallBlocked(position,quaternion,halfWidth,halfLength,height)` or a compatible collider BVH. The former provides broad body checks and the latter oriented wall/footprint checks. A host can supply `navigationFactory(world,solver,{step,clearance})` returning `path`, `line` and `nearest`; otherwise the existing grid navigator is used. Routing must respect the passed world/solver because encounters add clearance and parked obstacles. Supply required street/route metadata in `data` and per-feature placement profiles for rail, shuttle and NPCs.

`addStationPassages` is optional. If present, Polybahn uses the host's passage handling; if absent it does not carve the destination map. The host must provide an accessible station and track route. Changing placement JSON alone does not create tunnels through another map's buildings. The world adapter has an accompanying TypeScript declaration in `src/world/core/world-adapter.d.ts`.

## Local interactions and cleanup

The current bootstrap uses one capability registry for item use, phone opening, map opening, camera input and encounter keyboard routing. Register new local encounters once through `createInteractionCoordinator` with their `active` callback and blocked capabilities. This coordinator does not change a server clock or freeze other players.

Use a supplied `uiRoot` to mount local UI. `createItemInventory` owns acquisition order per instance; pass it to Mate inventory as `inventory` and the ticket machine as `itemInventory`. The default wrappers remain for the standalone game. Photo factories accept `renderCanvas`, so capture need not find `#game canvas`. Physical machine panels use the supplied canvas viewport bounds. Mate/Einstein accept an `assetUrl` resolver for a host asset prefix; other factories retain existing public asset paths unless adapted by the host.

Call `dispose()` before removing/recreating a feature. Cleanup now covers the bike station, Mate machine/inventory, ticket machine/readers/QR camera, phone, settings, photo encounters, shared phone-camera preview/listeners, shared RPG dialogue, Einstein, finance, Polybahn characters/inspector, and the private-property encounter. Dispose dependent features before their shared inventory or scene. Bike models share the loader's geometry/material resources: the station releases its cloned frame materials and QR/station resources but leaves shared model assets to the host. Pending Mate asset loads are discarded after disposal.

Some APIs retain fixed DOM IDs and legacy global CSS/body classes for compatibility. Mount one local instance of each encounter UI per player viewport; remote players should be represented by world actors rather than additional phone/dialogue UI. The complete Zürich bootstrap, rail/shuttle/interview renderers and combat systems still need host-specific teardown/state adapters. Do not infer a universal disposal contract from `reset()`.

## Validation and merge order

1. Keep the destination bootstrap; import integration-core and connect the host state/clock.
2. Implement the map adapter and exact placements against its existing terrain/physics.
3. Bind one replicated bike station and local phone/scanner view; verify host-confirmed ownership.
4. Add personal Mate/inventory and quests, using host-approved reward grants.
5. Bind passenger/vehicle entities and the remaining encounter states to the destination's existing networking.
6. Dispose/recreate the feature set on map/session changes and verify reconnect.

Run `npm run test:integration` with the development server on port 5173. It checks state without a browser, two-player claim conflicts, duplicate grants/collections, battery persistence, reconnect/invalid/stale snapshots, seat assignment, local input policies, a flat alternative map and feature disposal during pending asset loads. The browser fixture also proves replicated bike views don't modify host availability or ownership. Run `npm run test:modules`, `npm run features:check` and `npm run build` for export/build boundaries. Browser encounter/ride checks remain separate regression tests.
