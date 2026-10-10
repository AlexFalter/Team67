// Vehicle roster. Implementations and assets stay with their feature owners.
export {createTransport} from './rail/transport.js';
export {createPolybahn} from './rail/polybahn.js';
export {createShuttleIntro} from './shuttle/shuttle-intro.js';
export {createShuttleExplosion} from './shuttle/shuttle-explosion.js';
export {createInterviewLimo} from '../npcs/interview/interview-limo.js';
export {loadPubliBike} from './publibike/publibike-model.js';
export {createPubliBikeStation} from './publibike/publibike-station.js';
export {loadTransitModel,loadETHLink} from './rail/transit-models.js';
export {createVehicleAudio} from './audio/vehicle-audio.js';
export {createVehiclePassengers,VEHICLE_CAPACITIES,BOARDING_SECONDS} from './passengers/vehicle-passengers.js';
export {VEHICLE_SEATS} from './passengers/vehicle-seats.js';
export {createPassengerLook} from './passengers/passenger-look.js';
export {createGroundVehiclePath,withVehicleWalls} from '../world/core/vehicle-path.js';
export {createBikeFleetState} from './publibike/bike-fleet-state.js';
