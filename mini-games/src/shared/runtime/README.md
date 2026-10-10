# Host integration and state

Import this entry for browser-free gameplay rules and host adapters. It has no CSS, media, Three.js runtime, DOM initialization or networking dependency. `createBikeFleetState`, `createMateMachineState`, `createMateInventoryState` and `createVehiclePassengers` own serializable state. UI factories live in their original feature folders and accept these models separately.

See [the integration guide](../../../docs/multiplayer-integration.md) for state ownership, command validation, client views, map capabilities, lifecycle APIs and migration order. The helper `disposeOwnedObject` operates on a supplied Three.js object but does not import Three.js; use it only for resources owned by that feature.
