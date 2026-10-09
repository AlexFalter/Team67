import type { Client } from "colyseus";
import * as C from "@race/shared";
import { Vehicle, type RaceState, type Player } from "./state.ts";

export class VehicleManager {
  private reports = new Map<string, number>();
  private hitTimes = new Map<string, Map<string, number>>();
  private contact: C.VehicleContact = { nx: 0, nz: 0, closing: 0 };
  constructor(private state: RaceState) {
    C.CART_SPAWNS.forEach((p, i) =>
      this.add(`cart-${i + 1}`, C.createVehicle(0, p.x, p.z)),
    );
    const [a, b] = C.SHUTTLE_STOPS,
      shuttle = C.createVehicle(1, a.x, a.z);
    shuttle.toX = b.x;
    shuttle.toZ = b.z;
    shuttle.rotY = Math.atan2(b.x - a.x, b.z - a.z);
    this.add("shuttle-1", shuttle);
  }
  private add(id: string, props: C.VehicleState) {
    this.state.vehicles.set(id, new Vehicle(props));
    this.hitTimes.set(id, new Map());
  }
  enter(client: Client, data: unknown, now = Date.now()) {
    const p = this.state.players.get(client.sessionId),
      v = typeof data === "string" ? this.state.vehicles.get(data) : undefined;
    if (!p || !v) return this.result(client, false, "Vehicle not found.");
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
        v.kind === 0 ? "This cart is occupied." : "The shuttle is full.",
      );
    p.vehicleId = data as string;
    p.seat = seat;
    p.vx = p.vy = p.vz = 0;
    p.anim = 0;
    if (v.kind === 0) {
      v.driver = client.sessionId;
      this.reports.set(data as string, now);
      this.hitTimes.get(data as string)!.clear();
    } else if (v.departureAt === 0)
      v.departureAt = now + C.SHUTTLE_COUNTDOWN_MS;
    this.attach(p, v);
    this.result(
      client,
      true,
      v.kind === 0
        ? "Cart claimed. WASD to drive."
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
      const offset = v.kind === 0 ? 2 : 2.5;
      const along = v.kind === 0 ? 0 : (Math.floor(seat / 2) - 1) * 1.25;
      const bound = C.PLANE_SIZE / 2 - C.CAPSULE_RADIUS;
      p.x = Math.max(
        -bound,
        Math.min(
          bound,
          v.x + side * offset * Math.cos(v.rotY) + along * Math.sin(v.rotY),
        ),
      );
      p.z = Math.max(
        -bound,
        Math.min(
          bound,
          v.z - side * offset * Math.sin(v.rotY) + along * Math.cos(v.rotY),
        ),
      );
      p.y = 0;
      if (v.kind === 0) {
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
      data.length !== 6 ||
      typeof data[0] !== "string" ||
      !data.slice(1).every((n) => typeof n === "number" && Number.isFinite(n))
    )
      return;
    const v = this.state.vehicles.get(data[0]),
      p = this.state.players.get(client.sessionId);
    if (
      !v ||
      v.kind !== 0 ||
      v.driver !== client.sessionId ||
      p?.vehicleId !== data[0]
    )
      return;
    const dt = Math.max(
        0.001,
        (now - (this.reports.get(data[0]) ?? now)) / 1000,
      ),
      bound = C.PLANE_SIZE / 2 - C.CART_RADIUS;
    if (
      Math.hypot(data[1] - v.x, data[2] - v.z) > C.CART_SPEED * 2 * dt + 0.15 ||
      Math.abs(data[1]) > bound ||
      Math.abs(data[2]) > bound ||
      Math.hypot(data[4], data[5]) > C.CART_SPEED * 2
    )
      return;
    v.x = data[1];
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
      if (v.kind === 1) {
        if (!v.traveling && v.departureAt > 0 && now >= v.departureAt) {
          v.traveling = true;
          v.tripStartedAt = v.departureAt;
          v.fromX = v.x;
          v.fromZ = v.z;
          v.arrivalAt =
            v.tripStartedAt +
            (Math.hypot(v.toX - v.fromX, v.toZ - v.fromZ) / C.SHUTTLE_SPEED) *
              1000;
        }
        if (v.traveling) {
          C.shuttlePosition(v, now);
          for (const p of this.state.players.values())
            if (p.vehicleId === id) this.attach(p, v);
          if (now >= v.arrivalAt) {
            v.traveling = false;
            v.departureAt = 0;
            v.tripStartedAt = v.arrivalAt = 0;
            v.toX = v.fromX;
            v.toZ = v.fromZ;
            v.fromX = v.x;
            v.fromZ = v.z;
            for (const p of this.state.players.values())
              if (p.vehicleId === id) this.release(p);
          }
        }
        continue;
      }
      if (!v.driver || now - (this.reports.get(id) ?? 0) > C.VEHICLE_STALE_MS) {
        v.vx = v.vz = 0;
        continue;
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
          o.closing > C.KNOCKDOWN_SPEED,
        );
      }
    }
  }
}
