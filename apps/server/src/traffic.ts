import { buildLaneGraph, sampleLane, trafficOverlap, validateTrafficNetwork, DEFAULT_TRAFFIC_SETTINGS, MAX_TRAFFIC_CARS, randomTrafficAppearance,
  type LaneGraph, type LanePath, type TrafficNetwork, type TrafficSettings, type TrafficCarState } from '@race/shared';
import initialNetwork from '../../../packages/shared/src/traffic-network.json' with { type: 'json' };
import { CAPSULE_RADIUS, CAPSULE_HEIGHT, CART_MIN_HIT_SPEED, CART_HIT_STRENGTH, CART_HIT_LIFT, PAIR_COOLDOWN_MS, LIME_KIND, isPassengerVehicle, vehicleRadius } from '@race/shared';
import type { VehicleManager } from './vehicles.ts';
import { TrafficCar, type RaceState } from './state.ts';
interface Driver { lane: string; distance: number; next?: string; reservation?: string; clearing?: boolean; waiting?: number }
type BikeHit = (bikeId: string, carId: string, car: TrafficCarState) => void;
export class TrafficManager {
  graph!: LaneGraph;
  private drivers = new Map<string, Driver>();
  private reservations = new Map<string, string>();
  private serial = 0;
  private spawnClock = 0;
  private playerHits = new Map<string, number>();
  constructor(private state: RaceState, private random = Math.random) {
    this.state.trafficDensity = DEFAULT_TRAFFIC_SETTINGS.density;
    this.state.trafficSpawnInterval = DEFAULT_TRAFFIC_SETTINGS.spawnInterval;
    this.state.trafficSpeedMultiplier = DEFAULT_TRAFFIC_SETTINGS.speedMultiplier ?? 1;
    this.replace(validateTrafficNetwork(initialNetwork));
    this.populate();
  }
  replace(network: TrafficNetwork) {
    const speed = network.roads[0]?.speed ?? 8;
    network = { ...network, roads: network.roads.map(road => ({ ...road, speed })) };
    const graph = buildLaneGraph(network);
    this.graph = graph;
    this.state.trafficNetwork = JSON.stringify(network);
    this.state.trafficCars.clear(); this.drivers.clear(); this.reservations.clear(); this.playerHits.clear(); this.spawnClock = 0;
  }
  /** Fill an opening room without waiting for cars to travel in from its boundary. */
  private populate() {
    const lanes = [...this.graph.paths.values()].filter(p => !p.turn);
    // Spread the initial cars evenly across road lanes, away from junctions.
    for (let distance = 10; distance < 10000 && this.drivers.size < this.state.trafficDensity; distance += 10) {
      let available = false;
      for (const lane of lanes) {
        if (distance > lane.length - 6) continue;
        available = true;
        const pose = sampleLane(lane, distance);
        if (!this.clear(pose)) continue;
        const id = `traffic-${++this.serial}`;
        this.drivers.set(id, { lane: lane.id, distance }); this.state.trafficCars.set(id, new TrafficCar({ ...pose, ...randomTrafficAppearance(this.random) }));
        if (this.drivers.size >= this.state.trafficDensity) break;
      }
      if (!available) break;
    }
  }
  settings(value: unknown) {
    const s = value as TrafficSettings;
    if (!s || !Number.isInteger(s.density) || s.density < 0 || s.density > MAX_TRAFFIC_CARS ||
      !Number.isFinite(s.spawnInterval) || s.spawnInterval < 0.25 || s.spawnInterval > 60 ||
      (s.speedMultiplier !== undefined && (!Number.isFinite(s.speedMultiplier) || s.speedMultiplier < 0.5 || s.speedMultiplier > 3)) ||
      (s.speedLimit !== undefined && (!Number.isFinite(s.speedLimit) || s.speedLimit < 1 || s.speedLimit > 25))) throw new Error('Density must be 0–60 cars; spawn interval 0.25–60 seconds; speed multiplier 0.5–3; road speed limit 1–25 m/s.');
    this.state.trafficDensity = s.density; this.state.trafficSpawnInterval = s.spawnInterval;
    if (s.speedMultiplier !== undefined) this.state.trafficSpeedMultiplier = s.speedMultiplier;
    if (s.speedLimit !== undefined) {
      const network = JSON.parse(this.state.trafficNetwork) as TrafficNetwork;
      network.roads = network.roads.map(road => ({ ...road, speed: s.speedLimit }));
      // Only speeds change: retain cars, lane progress and intersection reservations.
      this.graph = buildLaneGraph(network);
      this.state.trafficNetwork = JSON.stringify(network);
    }
  }
  tick(dt: number, obstacles: TrafficCarState[] = [], hit?: Parameters<VehicleManager['tick']>[1], canHit: (id: string) => boolean = () => true, hitBike?: BikeHit) {
    // Keep traffic flowing, but let players and their vehicles pass through cars.
    if (this.state.noCarCollisions) { obstacles = []; hit = undefined; hitBike = undefined; }
    for (const id of this.playerHits.keys()) if (!this.state.players.has(id)) this.playerHits.delete(id);
    // Small fixed substeps bound travel through collision checks after server stalls.
    let remaining = Math.max(0, Math.min(dt, 0.2));
    while (remaining > 0.00001) { const step = Math.min(remaining, 0.05); this.step(step, obstacles, hit, canHit, hitBike); remaining -= step; }
  }
  /** Reuse traffic impacts for independently animated cars such as the donut GT-R. */
  collideCar(id: string, car: TrafficCarState, hit?: Parameters<VehicleManager['tick']>[1], canHit: (id: string) => boolean = () => true, hitBike?: BikeHit, impactHeading = car.rotY) {
    if (this.state.noCarCollisions) return;
    if (hitBike) this.hitBikes(id, car, hitBike);
    if (hit) this.hitPlayers(id, car, hit, canHit, impactHeading);
  }
  private touches(car: TrafficCarState, body: {x:number;y:number;z:number}, radius: number) {
    if (body.y > car.y + 1.5 || body.y + CAPSULE_HEIGHT < car.y) return false;
    const dx=body.x-car.x, dz=body.z-car.z;
    // Conservative enclosing circle rejects remote bodies before oriented-footprint maths.
    const reach = Math.hypot(2.2, .95) + radius;
    if (dx * dx + dz * dz > reach * reach) return false;
    const fx=Math.sin(car.rotY), fz=Math.cos(car.rotY);
    const along=dx*fx+dz*fz, across=dx*fz-dz*fx;
    return Math.hypot(Math.max(0,Math.abs(along)-2.2),Math.max(0,Math.abs(across)-.95))<=radius;
  }
  private hitBikes(id: string, car: TrafficCarState, hit: BikeHit) {
    if (car.speed < CART_MIN_HIT_SPEED) return;
    for (const [bikeId,bike] of this.state.vehicles) if ((bike.kind===2 || bike.kind===LIME_KIND) &&
      this.state.serverTime>=bike.fallenUntil && this.touches(car,bike,vehicleRadius(bike))) hit(bikeId,id,car);
  }
  private hitPlayers(id: string, car: TrafficCarState, hit: Parameters<VehicleManager['tick']>[1], canHit: (id: string) => boolean, impactHeading = car.rotY) {
    if (car.speed < CART_MIN_HIT_SPEED) return;
    const now = this.state.serverTime, forwardX = Math.sin(impactHeading), forwardZ = Math.cos(impactHeading);
    for (const [target, player] of this.state.players) {
      const vehicle = player.vehicleId ? this.state.vehicles.get(player.vehicleId) : undefined;
      if ((player.vehicleId && (!vehicle || isPassengerVehicle(vehicle))) || now < player.knockdownUntil || now < player.invincibleUntil ||
        now - (this.playerHits.get(target) ?? -Infinity) < PAIR_COOLDOWN_MS) continue;
      const body = vehicle ?? player, radius = vehicle ? vehicleRadius(vehicle) : CAPSULE_RADIUS;
      // Capsule versus the car's oriented footprint; don't hit nearby sidewalk pedestrians.
      if (!this.touches(car,body,radius) || !canHit(target)) continue;
      this.playerHits.set(target, now);
      const force = Math.min(car.speed, 25) * CART_HIT_STRENGTH;
      hit(id, target, player.x, player.y + CAPSULE_HEIGHT / 2, player.z,
        forwardX * force, CART_HIT_LIFT, forwardZ * force, true);
    }
  }
  private clear(pose: TrafficCarState, own?: string, extra = 0.3, obstacles: TrafficCarState[] = []) {
    for (const [id, car] of this.state.trafficCars)
      if (id !== own && trafficOverlap(pose, car, extra)) return false;
    for (const obstacle of obstacles) if (trafficOverlap(pose, obstacle, extra)) return false;
    return true;
  }
  private remove(id: string) {
    const d = this.drivers.get(id);
    if (d?.reservation && this.reservations.get(d.reservation) === id) this.reservations.delete(d.reservation);
    this.drivers.delete(id); this.state.trafficCars.delete(id);
  }
  private clearTurn(turn: LanePath, id: string, obstacles: TrafficCarState[]) {
    const outgoing = this.graph.paths.get(turn.next[0])!;
    // Leave enough space to clear this junction before joining an exit queue.
    // Otherwise short blocks can trap cars holding neighboring reservations.
    const exitSpace = 7 + Math.min(5, outgoing.length / 2);
    for (const [otherId, driver] of this.drivers)
      if (otherId !== id && driver.lane === outgoing.id && driver.distance < exitSpace) return false;
    if (!this.clear(sampleLane(outgoing, 3), id, 0.3, obstacles)) return false;
    for (let distance = 0; distance <= turn.length; distance += 1)
      if (!this.clear(sampleLane(turn, distance), id, 0.3, obstacles)) return false;
    return this.clear(sampleLane(turn, turn.length), id, 0.3, obstacles);
  }
  private step(dt: number, obstacles: TrafficCarState[], hit?: Parameters<VehicleManager['tick']>[1], canHit: (id: string) => boolean = () => true, hitBike?: BikeHit) {
    this.spawnClock += dt;
    if (this.spawnClock >= Math.max(0.25, this.state.trafficSpawnInterval * 20 / Math.max(1, this.state.trafficDensity))) {
      this.spawnClock = 0;
      if (this.drivers.size < this.state.trafficDensity && this.graph.spawns.length) {
        const spawns = this.graph.spawns;
        const offset = Math.floor(this.random() * spawns.length);
        for (let i = 0; i < spawns.length; i++) {
          const lane = spawns[(i + offset) % spawns.length], pose = sampleLane(this.graph.paths.get(lane)!, 0);
          if (!this.clear(pose, undefined, 1.5, obstacles)) continue;
          const id = `traffic-${++this.serial}`;
          this.drivers.set(id, { lane, distance: 0 }); this.state.trafficCars.set(id, new TrafficCar({ ...pose, ...randomTrafficAppearance(this.random) })); break;
        }
      }
    }
    for (const [id, driver] of this.drivers) {
      const lane = this.graph.paths.get(driver.lane)!, car = this.state.trafficCars.get(id)!;
      if (!driver.next && lane.next.length) driver.next = lane.next[Math.floor(this.random() * lane.next.length)];
      if (!lane.turn && !driver.reservation && (driver.waiting ?? 0) >= 5 && lane.next.length > 1) {
        const alternate = lane.next.find(candidate => {
          const turn = this.graph.paths.get(candidate)!;
          return candidate !== driver.next && !this.reservations.has(turn.turn!) && this.clearTurn(turn, id, obstacles);
        });
        if (alternate) driver.next = alternate;
        driver.waiting = 0;
      }
      const previousDistance = driver.distance;
      let limit = lane.length;
      for (const [otherId, other] of this.drivers) if (id !== otherId && other.lane === driver.lane && other.distance > driver.distance)
        limit = Math.min(limit, other.distance - 7);
      const next = driver.next && this.graph.paths.get(driver.next);
      let canEnter = true;
      if (next && next.turn && next.yield && lane.length - driver.distance < 10) {
        const owner = this.reservations.get(next.turn);
        canEnter = (!driver.reservation || driver.reservation === next.turn) && (!owner || owner === id) && this.clearTurn(next, id, obstacles);
        if (canEnter && !driver.reservation) { this.reservations.set(next.turn, id); driver.reservation = next.turn; }
        if (!canEnter && driver.reservation === next.turn && !driver.clearing) {
          this.reservations.delete(next.turn); driver.reservation = undefined;
        }
        // Wide curb lanes make turns sweep farther across short approaches.
        // Hold waiting cars back so they cannot block an already reserved turn.
        if (!canEnter) {
          const stopDistance = owner && owner !== id && !driver.clearing ? Math.min(6, lane.length * 0.6) : Math.min(4, lane.length / 3);
          limit = Math.min(limit, lane.length - stopDistance);
        }
      }
      const gap = Math.max(0, limit - driver.distance);
      const continuing = next && canEnter && limit === lane.length;
      const multiplier = this.state.trafficSpeedMultiplier;
      const desired = Math.min(lane.speed * multiplier, Math.sqrt((continuing ? (next.speed * multiplier) ** 2 : 0) + 2 * 5 * gap));
      let speed = Math.min(desired, car.speed + 6 * multiplier * dt);
      const distance = Math.min(limit, driver.distance + speed * dt);
      const pose = sampleLane(lane, Math.max(driver.distance, distance));
      if (this.clear(pose, id, 0.3, obstacles)) {
        driver.distance = Math.max(driver.distance, distance); Object.assign(car, pose);
      } else speed = 0;
      car.speed = speed;
      this.collideCar(id, car, hit, canHit, hitBike);
      driver.waiting = driver.distance > previousDistance + 0.0001 ? 0 : (driver.waiting ?? 0) + dt;
      // Release only after the rear has cleared the junction.
      if (driver.clearing && driver.reservation && driver.distance >= Math.min(5, lane.length / 2)) {
        this.reservations.delete(driver.reservation); driver.reservation = undefined; driver.clearing = false;
      }
      if (driver.distance < lane.length - 0.001) continue;
      if (!next || (!lane.turn && this.drivers.size > this.state.trafficDensity)) { this.remove(id); continue; }
      if (!canEnter) continue;
      if (lane.turn) driver.clearing = true;
      driver.lane = next.id; driver.distance = 0; driver.next = undefined;
    }
  }
}
