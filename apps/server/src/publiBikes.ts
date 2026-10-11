import type { Client } from "colyseus";
import * as C from "@race/shared";
import { PubliBike, type RaceState } from "./state.ts";
import type { VehicleManager } from "./vehicles.ts";

interface Lease { owner: string; token: string; requestId: string; startedAt: number }
export class PubliBikes {
  private riddenAt = new Map<string, number>();
  private leases = new Map<string, Lease>();
  readonly station;
  constructor(private state: RaceState, private vehicles: VehicleManager, private world: C.MovementWorld,
    private send: (id: string, message: string) => void = () => {}) {
    this.station = C.publiBikeStation(world);
    this.station.slots.forEach((p, i) => {
      const id = `publibike-${i + 1}`;
      state.publiBikes.set(id, new PubliBike({ broken: false, dock: i }));
      vehicles.add(id, { ...C.createVehicle(2, p.x, p.z), y: p.y, rotY: this.station.heading + Math.PI });
    });
  }
  private eligible(owner: string, id: string, now: number) {
    const p = this.state.players.get(owner), v = this.state.vehicles.get(id), bike = this.state.publiBikes.get(id);
    return !!p && !!v && !!bike && !bike.broken && bike.batteryMs > 0 && !p.vehicleId && now >= p.knockdownUntil && now >= v.fallenUntil && !v.driver &&
      Math.abs(p.y - v.y) <= C.VEHICLE_BOARD_HEIGHT && Math.hypot(p.x - v.x, p.z - v.z) <= C.PUBLI_BIKE_RANGE &&
      Array.from({ length: 6 }, (_, i) => (i + 1) / 7).every(t =>
        !this.world.blocked(p.x + (v.x - p.x) * t, p.y + 0.8, p.z + (v.z - p.z) * t, 0.1, 0.2));
  }
  private reply(client: Client, bikeId: string, requestId: string, ok: boolean, message: string, token?: string) {
    client.send("bikeUnlockResult", { bikeId, requestId, ok, message, token } satisfies C.BikeUnlockResult);
  }
  begin(client: Client, data: unknown, now = Date.now()) {
    if (!data || typeof data !== "object") return;
    const { bikeId, requestId } = data as Record<string, unknown>;
    if (typeof bikeId !== "string" || typeof requestId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(requestId)) return;
    const bike = this.state.publiBikes.get(bikeId);
    if (!bike || !this.eligible(client.sessionId, bikeId, now)) return this.reply(client, bikeId, requestId, false, "Move closer to an unoccupied bike.");
    const existing = this.leases.get(bikeId);
    if (existing && now >= bike.reservationUntil) this.release(bikeId);
    const lease = this.leases.get(bikeId);
    if (lease) return lease.owner === client.sessionId && lease.requestId === requestId
      ? this.reply(client, bikeId, requestId, true, "Aim at the rear QR code and hold still.", lease.token)
      : this.reply(client, bikeId, requestId, false, "Another player is unlocking this bike.");
    if ([...this.leases.values()].some(l => l.owner === client.sessionId))
      return this.reply(client, bikeId, requestId, false, "Finish or cancel your current scan first.");
    const token = crypto.randomUUID();
    this.leases.set(bikeId, { owner: client.sessionId, token, requestId, startedAt: now });
    bike.reservedBy = client.sessionId; bike.reservationUntil = now + C.PUBLI_BIKE_LEASE_MS;
    this.reply(client, bikeId, requestId, true, "Aim at the rear QR code and hold still.", token);
  }
  finish(client: Client, data: unknown, now = Date.now()) {
    const lease = this.match(client, data); if (!lease) return;
    const { bikeId } = data as { bikeId: string }, bike = this.state.publiBikes.get(bikeId)!;
    if (now >= bike.reservationUntil || !this.eligible(client.sessionId, bikeId, now)) {
      this.release(bikeId); return this.reply(client, bikeId, lease.requestId, false, "Scan expired. Try again nearby.");
    }
    if (now - lease.startedAt < C.PUBLI_BIKE_SCAN_MS)
      return this.reply(client, bikeId, lease.requestId, false, "Hold still until the scan completes.");
    this.release(bikeId);
    this.vehicles.enter(client, bikeId, now, true);
    const success = this.state.players.get(client.sessionId)?.vehicleId === bikeId;
    if (success) { bike.dock = -1; this.riddenAt.set(bikeId, now); }
    this.reply(client, bikeId, lease.requestId, success, success ? "Unlocked. WASD to ride; E to return." : "The bike cannot be boarded here.");
  }
  private match(client: Client, data: unknown, cancel = false) {
    if (!data || typeof data !== "object") return;
    const { bikeId, token, requestId } = data as Record<string, unknown>;
    const lease = typeof bikeId === "string" ? this.leases.get(bikeId) : undefined;
    return lease?.owner === client.sessionId && (cancel ? requestId === lease.requestId : token === lease.token) ? lease : undefined;
  }
  cancel(client: Client, data: unknown) { if (this.match(client, data, true)) this.release((data as { bikeId: string }).bikeId); }
  private release(id: string) {
    this.leases.delete(id); const b = this.state.publiBikes.get(id);
    if (b) { b.reservedBy = ""; b.reservationUntil = 0; }
  }
  disconnect(id: string) { for (const [bikeId, lease] of this.leases) if (lease.owner === id) this.release(bikeId); }
  park(id: string) {
    const bike = this.state.publiBikes.get(id), v = this.state.vehicles.get(id); if (!bike || !v || v.driver) return;
    let dock = -1, distance = 3;
    this.station.slots.forEach((slot, i) => {
      if ([...this.state.publiBikes].some(([id, b]) => b.dock === i && C.publiBikeIsDocked(b, this.state.vehicles.get(id), this.station.slots))) return;
      const d = Math.hypot(slot.x - v.x, slot.z - v.z);
      if (d < distance) { dock = i; distance = d; }
    });
    bike.dock = dock;
    if (dock >= 0) Object.assign(v, this.station.slots[dock], { rotY: this.station.heading + Math.PI });
  }
  tick(now: number) {
    if (this.state.phase !== C.RoomPhase.Running || !this.state.introComplete) { this.riddenAt.clear(); for (const id of this.leases.keys()) this.release(id); return; }
    for (const [id, lease] of this.leases) if (now >= this.state.publiBikes.get(id)!.reservationUntil || !this.eligible(lease.owner, id, now)) this.release(id);
    for (const [id, b] of this.state.publiBikes) {
      const v = this.state.vehicles.get(id)!;
      if (b.dock >= 0 && !C.publiBikeIsDocked(b, v, this.station.slots)) b.dock = -1;
      const previous = this.riddenAt.get(id);
      if (v.driver && previous !== undefined) b.batteryMs = Math.max(0, b.batteryMs - Math.max(0, now - previous));
      if (v.driver) this.riddenAt.set(id, now); else this.riddenAt.delete(id);
      if (b.batteryMs <= 0) {
        b.broken = true;
        if (v.driver) {
          const owner = v.driver;
          this.vehicles.exit({ sessionId: owner, send() {} } as unknown as Client);
          this.send(owner, "PubliBike battery empty. Find another bike.");
        }
        v.vx = v.vz = 0; this.riddenAt.delete(id);
      }
    }
  }
}
