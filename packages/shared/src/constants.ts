export const CAPSULE_RADIUS = 0.5,
  CAPSULE_HEIGHT = 1.8,
  PLANE_SIZE = 60;
export const SERVER_PATCH_RATE = 20,
  COLLISION_TICK_RATE = 60;
export const INTERP_DELAY_MS = 100,
  WALK_SPEED = 7.5,
  SPRINT_SPEED = 11,
  JUMP_VELOCITY = 8,
  GRAVITY = -25;
export const KNOCKDOWN_DURATION_MS = 700,
  PAIR_COOLDOWN_MS = 300;
// Horizontal acceleration/deceleration in m/s²; drag and lateral grip in s⁻¹.
export const ACCELERATION = 40,
  BRAKING_DECELERATION = 45,
  REVERSAL_ACCELERATION = 90,
  OVERSPEED_DECELERATION = 14,
  FRICTION = 4,
  GROUND_GRIP = 9,
  AIR_ACCELERATION = 9,
  COYOTE_MS = 90,
  JUMP_BUFFER_MS = 120,
  RESPAWN_DEPTH = -10;

export const VEHICLE_BOARD_DISTANCE = 3.2,
  VEHICLE_BOARD_HEIGHT = 0.6;
export const CART_SPEED = 16,
  CART_ACCELERATION = 7,
  CART_FRICTION = 5;
export const CART_RADIUS = 1,
  CART_SEAT_HEIGHT = 0.8,
  CART_HIT_HEIGHT = 1.1;
export const CART_HIT_STRENGTH = 1.4,
  CART_HIT_LIFT = 2,
  CART_MIN_HIT_SPEED = 3;
export const SHUTTLE_CAPACITY = 6,
  SHUTTLE_COUNTDOWN_MS = 10000,
  SHUTTLE_SPEED = 8;
export const SHUTTLE_SEAT_HEIGHT = 1;
export const CART_SPAWNS = [
  { x: -5, z: 0 },
  { x: 5, z: 0 },
  { x: 0, z: -5 },
];
export const BIKE_SPEED = 12, BIKE_HIT_STRENGTH = 0.65;
export const ATTACK_RANGE = 2.4, ATTACK_HALF_ANGLE = Math.PI / 4,
  ATTACK_COOLDOWN_MS = 1500, ATTACK_KNOCKDOWN_MS = 5000;
export const SHUTTLE_STOPS = [
  { x: -12, z: 9 },
  { x: 12, z: 9 },
];
export const MAX_GROUND_STEP = 0.65;
export const SPAWN_SPREAD = 8;

export const CLIENT_SEND_RATE = 20, MAX_POSITION = 100, MAX_VERTICAL_SPEED = 50;
// Include boosted running, airborne momentum, and collision impulses.
export const MAX_HORIZONTAL_SPEED = 3 * SPRINT_SPEED;
export const VEHICLE_STALE_MS = 500;

// A brief grounded sprint slide; keep the normal collision clearance so
// standing up cannot trap a player beneath the coarse terrain mask.
export const SLIDE_ANIM = 4, SLIDE_DURATION_MS = 750, SLIDE_COOLDOWN_MS = 1200,
  SLIDE_MIN_SPEED = 9, SLIDE_FRICTION = 0.8;
