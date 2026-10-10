import type { Client } from "colyseus";
import * as C from "@race/shared";
import { Vehicle, type RaceState, type Player } from "./state.ts";

export class VehicleManager {
  private pendingCrashes = new Set<string>();
  private reports = new Map<string, number>();
  private hitTimes = new Map<string, Map<string, number>>();
  private contact: C.VehicleContact = { nx: 0, nz: 0, closing: 0 };
  constructor(
    private state: RaceState,
    private world: C.MovementWorld = C.flatWorld,
  ) {
    world.carts.slice(0, 1).forEach((p, i) =>
      this.add(`car-${i + 1}`, { ...C.createVehicle(0, p.x, p.z), y: p.y }),
    );
    const anchor = world.carts[1] ?? world.spawn;
    this.add("bike-1", { ...C.createVehicle(2, anchor.x, anchor.z), y: anchor.y });
  }
  private add(id: string, props: C.VehicleState) {
    this.state.vehicles.set(id, new Vehicle(props));
    this.hitTimes.set(id, new Map());
  }
  enter(client: Client, data: unknown, now = Date.now()) {
    const p = this.state.players.get(client.sessionId),
      v = typeof data === "string" ? this.state.vehicles.get(data) : undefined;
    if (!p || !v) return this.result(client, false, "Vehicle not found.");
    if (now < v.fallenUntil) return this.result(client, false, "Bike is recovering.");
    if (p.vehicleId)
      return this.result(client, false, "You are already riding.");
    if (
      p.anim === 3 ||
      Math.abs(p.y - v.y) > C.VEHICLE_BOARD_HEIGHT ||
      Math.hypot(p.x - v.x, p.z - v.z) > C.VEHICLE_BOARD_DISTANCE
    )
      return this.result(client, false, "Move closer to board.");
    if (v.traveling)
      return this.result(client, false, "The shuttle is already moving.");
    let seat = 0;
    for (; seat < v.capacity; seat++) {
      let occupied = false;
      for (const other of this.state.players.values())
        if (other.vehicleId === data && other.seat === seat) {
          occupied = true;
          break;
        }
      if (!occupied) break;
    }
    if (seat >= v.capacity)
      return this.result(
        client,
        false,
        v.kind !== 1 ? "This vehicle is occupied." : "The shuttle is full.",
      );
    p.vehicleId = data as string;
    p.seat = seat;
    p.vx = p.vy = p.vz = 0;
    p.anim = 0;
    if (v.kind !== 1) {
      v.driver = client.sessionId;
      this.reports.set(data as string, now);
      this.hitTimes.get(data as string)!.clear();
    } else if (v.departureAt === 0)
      v.departureAt = now + C.SHUTTLE_COUNTDOWN_MS;
    this.attach(p, v);
    this.result(
      client,
      true,
      v.kind !== 1
        ? "Vehicle claimed. WASD to drive."
        : "Boarded. Waiting for departure.",
    );
  }
  exit(client: Client) {
    const p = this.state.players.get(client.sessionId),
      v = p ? this.state.vehicles.get(p.vehicleId) : undefined;
    if (!p || !v) return;
    if (v.traveling)
      return this.result(client, false, "Stay aboard until the next stop.");
    this.release(p);
    this.result(client, true, "Exited vehicle.");
  }
  disconnect(id: string) {
    const p = this.state.players.get(id);
    if (p?.vehicleId) this.release(p);
    for (const hits of this.hitTimes.values()) hits.delete(id);
  }
  private release(p: Player) {
    const id = p.vehicleId,
      v = this.state.vehicles.get(id),
      seat = p.seat;
    if (v) {
      const side = seat % 2 === 0 ? -1 : 1;
      const offset = v.kind !== 1 ? 2 : 2.5;
      const along = v.kind !== 1 ? 0 : (Math.floor(seat / 2) - 1) * 1.25;
      const bounds = this.world.bounds;
      const x = Math.max(
        bounds.minX + C.CAPSULE_RADIUS,
        Math.min(
          bounds.maxX - C.CAPSULE_RADIUS,
          v.x + side * offset * Math.cos(v.rotY) + along * Math.sin(v.rotY),
        ),
      );
      const z = Math.max(
        bounds.minZ + C.CAPSULE_RADIUS,
        Math.min(
          bounds.maxZ - C.CAPSULE_RADIUS,
          v.z - side * offset * Math.sin(v.rotY) + along * Math.cos(v.rotY),
        ),
      );
      Object.assign(
        p,
        C.findGround(this.world, x, z) ?? C.spawnPoint(this.world),
      );
      if (v.kind !== 1) {
        v.driver = "";
        v.vx = v.vz = 0;
        this.reports.delete(id);
      }
    }
    p.vehicleId = "";
    p.seat = -1;
    p.vx = p.vy = p.vz = 0;
    p.anim = 0;
    if (v?.kind === 1 && !v.traveling && !this.occupied(id)) v.departureAt = 0;
  }
  private occupied(id: string) {
    for (const p of this.state.players.values())
      if (p.vehicleId === id) return true;
    return false;
  }
  private result(client: Client, ok: boolean, message: string) {
    client.send("vehicleResult", { ok, message } satisfies C.VehicleResult);
  }
  move(client: Client, data: unknown, now = Date.now()) {
    if (
      !Array.isArray(data) ||
      (data.length !== 6 && data.length !== 7) ||
      typeof data[0] !== "string" ||
      !data.slice(1, 6).every((n) => typeof n === "number" && Number.isFinite(n))
    )
      return;
    const v = this.state.vehicles.get(data[0]),
      p = this.state.players.get(client.sessionId);
    if (
      !v ||
      v.kind === 1 ||
      v.driver !== client.sessionId ||
      p?.vehicleId !== data[0]
    )
      return;
    const dt = Math.max(
        0.001,
        (now - (this.reports.get(data[0]) ?? now)) / 1000,
      ),
      bounds = this.world.bounds;
    const y = this.world.height(data[1], data[2]);
    if (
      Math.hypot(data[1] - v.x, data[2] - v.z) > C.CART_SPEED * 2 * dt + 0.15 ||
      data[1] < bounds.minX + C.CART_RADIUS ||
      data[1] > bounds.maxX - C.CART_RADIUS ||
      data[2] < bounds.minZ + C.CART_RADIUS ||
      data[2] > bounds.maxZ - C.CART_RADIUS ||
      y === undefined ||
      this.world.blocked(
        data[1],
        y,
        data[2],
        C.CART_RADIUS,
        C.CART_HIT_HEIGHT,
      ) ||
      Math.hypot(data[4], data[5]) > C.CART_SPEED * 2
    )
      return;
    if (data[6] === true && v.kind === 2) {
      const probe = { ...C.createVehicle(v.kind, data[1], data[2]), y, vx: data[4], vz: data[5] };
      const direction = { x: Math.sin(data[3]), z: Math.cos(data[3]), sprint: false, jump: false };
      if (C.stepCart(probe, direction, 1 / C.SERVER_PATCH_RATE, this.world))
        this.pendingCrashes.add(data[0]);
    }
    v.x = data[1];
    v.y = y;
    v.z = data[2];
    v.rotY = data[3] % (Math.PI * 2);
    v.vx = data[4];
    v.vz = data[5];
    this.reports.set(data[0], now);
    this.attach(p, v);
  }
  private attach(p: Player, v: Vehicle) {
    C.seatPosition(v, p.seat, p);
    p.rotY = v.rotY;
    p.vx = v.vx;
    p.vy = 0;
    p.vz = v.vz;
    p.anim = 0;
  }
  tick(
    now: number,
    hit: (
      driver: string,
      target: string,
      x: number,
      y: number,
      z: number,
      ix: number,
      iy: number,
      iz: number,
      knockdown: boolean,
    ) => void,
  ) {
    for (const [id, v] of this.state.vehicles) {
      if (v.fallenUntil && now >= v.fallenUntil) v.fallenUntil = 0;
      if (this.pendingCrashes.delete(id)) this.crashBike(id, now, hit);
      if (v.kind === 2 && !v.fallenUntil) {
        for (const [otherId, other] of this.state.vehicles) {
          if (otherId === id || Math.abs(v.y - other.y) > C.CART_HIT_HEIGHT) continue;
          if (Math.hypot(v.x - other.x, v.z - other.z) < C.CART_RADIUS * 2 &&
              Math.hypot(v.vx - other.vx, v.vz - other.vz) > 0.01) {
            this.crashBike(id, now, hit); break;
          }
        }
      }
      if (!v.driver || now - (this.reports.get(id) ?? 0) > C.VEHICLE_STALE_MS) {
        v.vx = v.vz = 0;
        continue;
      }
      if (v.kind === 2) {
        for (const p of this.state.players.values()) {
          if (!p.vehicleId && Math.abs(p.y - v.y) <= C.CART_HIT_HEIGHT &&
              Math.hypot(p.x - v.x, p.z - v.z) < C.CART_RADIUS + C.CAPSULE_RADIUS &&
              Math.hypot(v.vx - p.vx, v.vz - p.vz) > 0.01) {
            this.crashBike(id, now, hit); break;
          }
        }
      }
      const cooldown = this.hitTimes.get(id)!;
      for (const [target, p] of this.state.players) {
        if (
          now - (cooldown.get(target) ?? 0) < C.PAIR_COOLDOWN_MS ||
          !C.cartContact(v, p, this.contact)
        )
          continue;
        const o = this.contact;
        cooldown.set(target, now);
        hit(
          v.driver,
          target,
          p.x,
          p.y + C.CAPSULE_HEIGHT / 2,
          p.z,
          o.nx * o.closing * C.CART_HIT_STRENGTH,
          C.CART_HIT_LIFT,
          o.nz * o.closing * C.CART_HIT_STRENGTH,
          true,
        );
        if (v.kind === 2) this.crashBike(id, now, hit);
      }
    }
  }
  private crashBike(id: string, now: number, hit: Parameters<VehicleManager["tick"]>[1]) {
    const v = this.state.vehicles.get(id)!;
    if (v.fallenUntil > now) return;
    const driver = v.driver, rider = this.state.players.get(driver), vx = v.vx, vz = v.vz;
    v.fallenUntil = now + 2500;
    if (rider) {
      this.release(rider);
      hit(id, driver, rider.x, rider.y + 0.8, rider.z, vx * 0.6, 2, vz * 0.6, true);
    }
  }
}
