// World objects and interaction flows; NPC conversations have their own roster.
export {createMateMachine} from './mate/mate-machine.js';
export {createMateInventory} from './mate/mate-inventory.js';
export {createPolybahnTicketMachine} from './tickets/polybahn-ticket-machine.js';
export {createScooterPhoto} from './photos/scooter-photo.js';
export {createTouristPhoto} from './photos/tourist-photo.js';
export {createErstiBags} from './bags/ersti-bags.js';
export {createKarambit} from './knife/karambit.js';
export {createTeleportTransition} from '../npcs/einstein/teleport-transition.js';
export * from './inventory/item-inventory.js';
export * from './machine-ui/machine-panel.js';
export * from './machine-ui/ticket-card-reader.js';
