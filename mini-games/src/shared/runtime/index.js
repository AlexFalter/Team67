// Transport-independent state and host integration helpers. Safe to import in Node.
export {createBikeFleetState} from '../../vehicles/publibike/bike-fleet-state.js';
export {createMateMachineState} from '../../interactions/mate/mate-machine-state.js';
export {createMateInventoryState} from '../../interactions/mate/mate-inventory-state.js';
export {createVehiclePassengers} from '../../vehicles/passengers/vehicle-passengers.js';
export {createWorldAdapter} from '../../world/core/world-adapter.js';
export {createInteractionCoordinator} from './interaction-coordinator.js';
export {createFeatureLifecycle,disposeOwnedObject} from './feature-lifecycle.js';
