// Every gameplay tuning value lives here. Units: metres, seconds, m/s (ms only where named *_MS).

// Timing
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const SEND_HZ = 30;
export const PATCH_HZ = 30;
export const INTERP_DELAY_MS = 100;
export const MAX_EXTRAPOLATE_MS = 100;

// Player capsule
export const RADIUS = 0.5;
export const HEIGHT = 1.8;
export const EYE_HEIGHT = 1.6;
export const STEP_HEIGHT = 0.65;

// Movement (Quake-style: accelerate toward the wish velocity, friction on the ground only)
export const WALK_SPEED = 7.5;
export const SPRINT_SPEED = 11;
export const JUMP_SPEED = 8;
export const GRAVITY = -25;
export const GROUND_ACCEL = 12;
export const FRICTION = 12;
export const STOP_SPEED = 3;
export const AIR_ACCEL = 4;
export const AIR_WISH_CAP = 1.2; // air strafing: wish speed along the wish direction is capped
export const MAX_SPEED = 24; // hard horizontal cap (strafe gains, knockback)
export const COYOTE_TIME = 0.09;
export const JUMP_BUFFER = 0.12;
export const DOWN_FRICTION = 6;

// Running shoes (R)
export const SHOE_SPEED = 1.5;
export const SHOE_JUMP = 1.35;

// Combat
export const PUNCH_RANGE = 2.4;
export const PUNCH_HALF_ANGLE = Math.PI / 4;
export const PUNCH_HEIGHT = 1.2;
export const PUNCH_COOLDOWN_MS = 1500;
export const PUNCH_KNOCKDOWN_MS = 5000;
export const PUNCH_PUSH = 8;
export const PUNCH_LIFT = 1.5;

// Vehicles. Kinds: 0 cart, 1 shuttle, 2 bike, 3 traffic car.
export const CART = 0, SHUTTLE = 1, BIKE = 2, TRAFFIC = 3;
export const CART_SPEED = 16;
export const BIKE_SPEED = 12;
export const CART_ACCEL = 7;
export const CART_FRICTION = 5;
export const CART_RADIUS = 1;
export const BIKE_RADIUS = 0.65;
export const SHUTTLE_RADIUS = 2.4;
export const CART_SEAT_HEIGHT = 0.8;
export const SHUTTLE_SEAT_HEIGHT = 1;
export const VEHICLE_HIT_HEIGHT = 1.1;
export const BOARD_DISTANCE = 3.2;
export const BOARD_HEIGHT = 0.8;
export const RUN_OVER_SPEED = 3;
export const RUN_OVER_KNOCKDOWN_MS = 2500;
export const BIKE_FALL_MS = 2500;
export const SHUTTLE_SEATS = 6;
export const SHUTTLE_COUNTDOWN_MS = 10000;
export const SHUTTLE_SPEED = 8;
export const TRAFFIC_SPEED = 8;
export const DRIVER_STALE_MS = 500;

// Rooms
export const MAX_PLAYERS = 40;
export const ROUND_MS = 3 * 60 * 1000;
export const MAX_NAME_LENGTH = 24;
export const SPAWN_SPREAD = 8;
