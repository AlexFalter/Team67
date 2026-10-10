import * as C from "@race/shared";
import { Vehicle, type GameState, type Player } from "./state.ts";

const world = C.zurichWorld;

/** What the vehicle rules need from the room. */
export interface VehicleHost {
  state: GameState;
  notice(id: string, text: string): void;
  /** Place a player on foot (tells the client to move there). */
  release(id: string, x: number, y: number, z: number): void;
  knockDown(targetId: string, fromId: string, ix: number, iy: number, iz: number, ms: number): void;
}

/**
 * Vehicle rules. The server grants seats atomically (one message at a time), owns the shuttle schedule
 * and decides run-overs and crashes. Drivers own their cart/bike motion like foot players do.
 */
export class Vehicles {
  private lastReport = new Map<string, number>();
  private pose: C.VehicleBody = { kind: 0, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
  private exitAt = { x: 0, y: 0, z: 0 };

  constructor(private host: VehicleHost) {}

  /** Fresh set of vehicles for a new round. */
  reset(now: number) {
    const vehicles = this.host.state.vehicles;
    vehicles.clear();
    const add = (id: string, kind: number, p: C.Point | undefined, yaw = 0) => {
      if (p) vehicles.set(id, new Vehicle({ kind, x: p.x, y: p.y, z: p.z, yaw, t: now }));
    };
    world.carts.forEach((p, i) => add(`cart-${i + 1}`, C.CART, p));
    add("bike-1", C.BIKE, C.findGround(world, world.spawn.x + 3, world.spawn.z + 4, C.BIKE_RADIUS));
    add("bike-2", C.BIKE, C.findGround(world, world.spawn.x - 3, world.spawn.z + 4, C.BIKE_RADIUS));
    const shuttle = this.pose;
    C.shuttlePose(world, 0, 0, now, shuttle);
    add("shuttle", C.SHUTTLE, shuttle, shuttle.yaw);
    add("traffic", C.TRAFFIC, world.route[0]);
  }

  /** Current pose of any vehicle (analytic for shuttle and traffic). */
  poseOf(v: Vehicle, now: number, out: C.VehicleBody) {
    out.kind = v.kind;
    if (v.kind === C.SHUTTLE) C.shuttlePose(world, v.dir, v.tripStart, now, out);
    else if (v.kind === C.TRAFFIC) C.trafficPose(world, this.host.state.trafficStart, now, out);
    else { out.x = v.x; out.y = v.y; out.z = v.z; out.yaw = v.yaw; out.vx = v.vx; out.vz = v.vz; }
    return out;
  }

  private riders(vehicleId: string) {
    let n = 0;
    for (const p of this.host.state.players.values()) if (p.vehicle === vehicleId) n++;
    return n;
  }

  enter(id: string, p: Player, vehicleId: unknown, now: number) {
    const v = typeof vehicleId === "string" ? this.host.state.vehicles.get(vehicleId) : undefined;
    const say = (text: string) => this.host.notice(id, text);
    if (!v || typeof vehicleId !== "string") return say("No vehicle there.");
    if (p.vehicle) return say("You are already riding.");
    if (v.kind === C.TRAFFIC) return say("You cannot ride traffic.");
    if (now < p.downUntil) return say("Get up first.");
    if (now < v.fallenUntil) return say("The bike is still on the ground.");
    const at = this.poseOf(v, now, this.pose);
    if (Math.hypot(p.x - at.x, p.z - at.z) > C.BOARD_DISTANCE + C.vehicleRadius(v.kind) - C.CART_RADIUS || Math.abs(p.y - at.y) > C.BOARD_HEIGHT + 1)
      return say("Move closer.");
    if (v.kind === C.SHUTTLE && v.tripStart) return say("The shuttle is already moving.");
    // Lowest free seat; single-seat vehicles need an empty driver seat.
    const taken = new Set<number>();
    for (const o of this.host.state.players.values()) if (o.vehicle === vehicleId) taken.add(o.seat);
    let seat = 0;
    while (taken.has(seat)) seat++;
    if (seat >= C.seatCount(v.kind)) return say(v.kind === C.SHUTTLE ? "The shuttle is full." : "Someone is already driving.");
    p.vehicle = vehicleId;
    p.seat = seat;
    p.vx = p.vy = p.vz = 0;
    if (v.kind === C.SHUTTLE) {
      if (!v.departAt) v.departAt = now + C.SHUTTLE_COUNTDOWN_MS; // later passengers do not reset it
      say(`Boarded. Departure in ${Math.ceil((v.departAt - now) / 1000)} s.`);
    } else {
      v.driver = id;
      v.t = now;
      this.lastReport.set(vehicleId, now);
      say(v.kind === C.BIKE ? "Riding the bike. E to get off." : "Driving the cart. E to get out.");
    }
    C.seatPosition(at, seat, p);
  }

  exit(id: string, p: Player, now: number) {
    const v = this.host.state.vehicles.get(p.vehicle);
    if (!v) return;
    if (v.kind === C.SHUTTLE && v.tripStart) return this.host.notice(id, "Stay aboard until the next stop.");
    this.dismount(id, p, v, now);
  }

  /** Off the vehicle, onto free ground beside it. */
  dismount(id: string, p: Player, v: Vehicle, now: number) {
    const at = this.poseOf(v, now, this.pose), e = this.exitAt;
    C.exitPoint(at, p.seat, e);
    const ground = C.findGround(world, e.x, e.z) ?? C.findGround(world, at.x, at.z) ?? world.spawn;
    const vehicleId = p.vehicle;
    p.vehicle = "";
    p.seat = -1;
    if (v.driver === id) { v.driver = ""; v.vx = v.vz = 0; }
    if (v.kind === C.SHUTTLE && !v.tripStart && !this.riders(vehicleId)) v.departAt = 0; // empty: cancel countdown
    this.host.release(id, ground.x, ground.y, ground.z);
  }

  /** Driver report for a cart/bike: [t, x, y, z, yaw, vx, vy, vz, anim]. Returns false if rejected. */
  drive(id: string, p: Player, m: C.Move, stamped: number, dt: number) {
    const v = this.host.state.vehicles.get(p.vehicle);
    if (!v || v.driver !== id) return true; // passengers send nothing meaningful; ignore quietly
    const [, x, , z, yaw, vx, , vz] = m, top = v.kind === C.BIKE ? C.BIKE_SPEED : C.CART_SPEED;
    const g = world.height(x, z);
    if (Math.hypot(x - v.x, z - v.z) > top * 1.2 * dt + 1 || Number.isNaN(g) ||
      world.blocked(x, g, z, C.vehicleRadius(v.kind) * 0.8, C.VEHICLE_HIT_HEIGHT) || Math.hypot(vx, vz) > top * 1.5) return false;
    v.x = x; v.y = g; v.z = z; v.yaw = yaw; v.vx = vx; v.vz = vz; v.t = stamped;
    this.lastReport.set(p.vehicle, Date.now());
    C.seatPosition(v, p.seat, p);
    return true;
  }

  /** The rider says their bike hit something: it falls and throws them off. */
  crash(id: string, p: Player, now: number) {
    const v = this.host.state.vehicles.get(p.vehicle);
    if (!v || v.kind !== C.BIKE || v.driver !== id || now < v.fallenUntil) return;
    this.throwOff(id, p, v, now, Math.max(4, Math.hypot(v.vx, v.vz)), id);
    v.fallenUntil = now + C.BIKE_FALL_MS;
  }

  /** Eject a driver with a knockdown; `from` gets the credit ("" = nobody, the driver = own crash). */
  private throwOff(id: string, p: Player, v: Vehicle, now: number, speed: number, from: string) {
    const yaw = this.poseOf(v, now, this.pose).yaw;
    this.dismount(id, p, v, now);
    this.host.knockDown(id, from, -Math.sin(yaw) * speed * 0.6, 2, -Math.cos(yaw) * speed * 0.6, C.RUN_OVER_KNOCKDOWN_MS);
  }

  tick(now: number) {
    const { state } = this.host, a = this.pose;
    for (const [vid, v] of state.vehicles) {
      if (v.fallenUntil && now >= v.fallenUntil) v.fallenUntil = 0;
      if (v.driver && now - (this.lastReport.get(vid) ?? now) > C.DRIVER_STALE_MS) v.vx = v.vz = 0;
      if (v.kind !== C.SHUTTLE) continue;
      if (!v.tripStart && v.departAt && now >= v.departAt) {
        if (this.riders(vid)) v.tripStart = v.departAt;
        v.departAt = 0;
      }
      if (v.tripStart && now >= v.tripStart + C.shuttleTripMs(world)) {
        // Arrived: everyone gets off; the shuttle now waits for the trip back.
        for (const [pid, p] of state.players) if (p.vehicle === vid) this.dismount(pid, p, v, now);
        v.tripStart = 0;
        v.dir ^= 1;
        C.shuttlePose(world, v.dir, 0, now, a);
        v.x = a.x; v.y = a.y; v.z = a.z; v.yaw = a.yaw;
      }
    }
    this.collide(now);
  }

  /** Run-overs, carts hit by heavy vehicles, bikes hitting things. */
  private collide(now: number) {
    const { state } = this.host, a = this.pose, b = { kind: 0, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
    for (const [vid, v] of state.vehicles) {
      this.poseOf(v, now, a);
      const speed = Math.hypot(a.vx, a.vz);
      if (speed < C.RUN_OVER_SPEED || (v.kind !== C.SHUTTLE && v.kind !== C.TRAFFIC && !v.driver)) continue;
      for (const [pid, p] of state.players) {
        if (p.waiting || p.vehicle || pid === v.driver || now < p.downUntil || !C.vehicleTouches(a, p)) continue;
        const strength = v.kind === C.BIKE ? 0.6 : 1.3;
        this.host.knockDown(pid, v.driver, a.vx * strength, 3, a.vz * strength, C.RUN_OVER_KNOCKDOWN_MS);
        if (v.kind === C.BIKE) { this.crash(v.driver, state.players.get(v.driver)!, now); break; }
      }
      if (v.kind === C.BIKE || v.kind === C.CART) continue;
      // Heavy vehicles keep moving: they knock drivers off carts and bikes in their way.
      for (const [oid, o] of state.vehicles) {
        if (oid === vid || !o.driver || (o.kind !== C.CART && o.kind !== C.BIKE)) continue;
        this.poseOf(o, now, b);
        const r = C.vehicleRadius(v.kind) + C.vehicleRadius(o.kind);
        if ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 > r * r) continue;
        const driver = state.players.get(o.driver);
        if (driver) this.throwOff(o.driver, driver, o, now, speed, "");
        if (o.kind === C.BIKE) o.fallenUntil = now + C.BIKE_FALL_MS;
      }
    }
  }

  disconnect(id: string, p: Player, now: number) {
    const v = this.host.state.vehicles.get(p.vehicle);
    if (v) this.dismount(id, p, v, now);
  }
}
