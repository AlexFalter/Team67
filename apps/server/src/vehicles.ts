import type { Client } from "colyseus";
import * as C from "@race/shared";
import { Vehicle, type RaceState, type Player } from "./state.ts";

export class VehicleManager {
  private parkingPhotos = new Map<string, string>();
  private reports = new Map<string, number>();
  private trafficStart: number;
  private hitTimes = new Map<string, Map<string, number>>();
  private contact: C.VehicleContact = { nx: 0, nz: 0, closing: 0 };
  constructor(private state: RaceState, private world: C.MovementWorld = C.flatWorld, legacyTraffic = true) {
    this.trafficStart = state.serverTime;
    world.carts.forEach((p, i) =>
      this.add(`cart-${i + 1}`, { ...C.createVehicle(0, p.x, p.z), y: p.y }),
    );
    const [a, b] = world.stops,
      shuttle = C.createVehicle(1, a.x, a.z);
    shuttle.y = a.y;
    shuttle.toX = b.x;
    shuttle.toZ = b.z;
    shuttle.rotY = Math.atan2(b.x - a.x, b.z - a.z);
    this.add("shuttle-1", shuttle);
    const addNear = (id: string, kind: number, x: number, z: number, vx = 0, vz = 0) => {
      const p = world.name === "flat" ? { x, y: 0, z } : C.findGround(world, world.spawn.x + x, world.spawn.z + z);
      if (p) this.add(id, { ...C.createVehicle(kind, p.x, p.z), y: p.y, vx, vz });
    };
    addNear("bike-1", 2, 3, 4); addNear("bike-2", 2, -3, 4);
    if (legacyTraffic) addNear("npc-car", 3, -20, 6);
    addNear("loose-ball", 4, 10, -5, 7, 3);
    if (world.name === "zurich") {
      const [x,z]=C.NPC_LAYOUT.lime.position,site=C.findGround(world,x,z);
      if(site)this.add("lime-1",{...C.createVehicle(C.LIME_KIND,site.x,site.z),y:site.y});
      const tram = C.createVehicle(C.TRAM_KIND); tram.capacity = 18; tram.railDistance = C.TRAM_START_DISTANCE;
      Object.assign(tram, C.railFrame(tram)); this.add("tram-1", tram);
      for (let i = 0; i < 2; i++) {
        const cabin = C.createVehicle(C.POLYBAHN_KIND); cabin.capacity = 12;
        cabin.railDistance = i ? C.polybahnPath.length : C.POLYBAHN_START_DISTANCE; cabin.railReverse = !!i; cabin.railLane = i ? -1.25 : 1.25;
        Object.assign(cabin, C.railFrame(cabin)); this.add(`polybahn-${i + 1}`, cabin);
      }
    }
  }
  add(id: string, props: C.VehicleState) {
    this.state.vehicles.set(id, new Vehicle(props));
    this.hitTimes.set(id, new Map());
  }
  enter(client: Client, data: unknown, now = Date.now(), scanned = false) {
    const p = this.state.players.get(client.sessionId),
      v = typeof data === "string" ? this.state.vehicles.get(data) : undefined;
    if (!p || !v) return this.result(client, false, "Vehicle not found.");
    const battery = this.state.publiBikes.get(data as string);
    if (battery && (battery.broken || battery.batteryMs <= 0)) return this.result(client, false, "This bike is permanently out of battery.");
    if (this.state.publiBikes.has(data as string) && !scanned)
      return this.result(client, false, "Scan the PubliBike QR code to unlock it.");
    if (this.parkingPhotos.has(client.sessionId) || [...this.parkingPhotos.values()].includes(data as string))
      return this.result(client,false,"Finish your Lime parking photo first.");
    if (!C.isRideable(v)) return this.result(client, false, "This object cannot be ridden.");
    if (now < v.fallenUntil) return this.result(client, false, "Give the bike a moment to recover.");
    if (p.vehicleId)
      return this.result(client, false, "You are already riding.");
    const boarding = C.isRail(v) ? C.railBoardingPoint(v) : v;
    if (
      p.simTime < p.knockdownUntil ||
      Math.abs(p.y - boarding.y) > C.VEHICLE_BOARD_HEIGHT ||
      Math.hypot(p.x - boarding.x, p.z - boarding.z) > (C.isRail(v) ? C.railBoardingDistance(v) : C.VEHICLE_BOARD_DISTANCE)
    )
      return this.result(client, false, "Move closer to board.");
    if (v.traveling)
      return this.result(client, false, "The shuttle is already moving.");
    if (C.isRail(v) && v.departureAt && now >= v.departureAt)
      return this.result(client, false, "Doors are closing. Wait for the next stop.");
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
        v.kind === C.LIME_KIND ? "Both Lime riding positions are occupied." : v.kind === 0 ? "This cart is occupied." : "The shuttle is full.",
      );
    if (v.kind === C.POLYBAHN_KIND) {
      const npc = this.state.npcs.get(client.sessionId);
      if (npc) { npc.polybahnTicketed = npc.ticketCount > 0; if (npc.polybahnTicketed) npc.ticketCount--; }
    }
    p.vehicleId = data as string;
    p.vehicleKind = v.kind;
    p.seat = seat;
    p.cabinStanding = false; p.cabinX = p.cabinZ = p.cabinYaw = 0;
    p.vx = p.vy = p.vz = 0;
    p.anim = 0;
    if (!C.isPassengerVehicle(v) && (v.kind!==C.LIME_KIND || seat===0)) {
      v.driver = client.sessionId;
      this.reports.set(data as string, now);
      this.hitTimes.get(data as string)!.clear();
    } else if (C.isPassengerVehicle(v) && v.departureAt === 0) {
      v.departureAt = now + (v.kind === C.TRAM_KIND ? C.TRAM_BOARDING_MS : C.isRail(v) ? C.TRANSIT_BOARDING_MS : C.SHUTTLE_COUNTDOWN_MS);
      if (v.kind === C.POLYBAHN_KIND) for (const other of this.state.vehicles.values())
        if (other.kind === C.POLYBAHN_KIND) other.departureAt = v.departureAt;
    }
    this.attach(p, v);
    this.result(
      client,
      true,
      v.kind===C.LIME_KIND&&seat===1?"Rear riding position claimed. E to get off.":!C.isPassengerVehicle(v)
        ? "Vehicle claimed. WASD to drive."
        : "Boarded. Waiting for departure.",
    );
  }
  exit(client: Client) {
    const p = this.state.players.get(client.sessionId),
      v = p ? this.state.vehicles.get(p.vehicleId) : undefined;
    if (!p || !v) return;
    if (v.traveling || (C.isRail(v) && v.departureAt > 0 && this.state.serverTime >= v.departureAt))
      return this.result(client, false, "Stay aboard until the next stop.");
    const id=p.vehicleId;this.release(p);
    if(v.kind===C.LIME_KIND&&!this.occupied(id))this.parkingPhotos.set(client.sessionId,id);
    this.result(client, true, this.parkingPhotos.has(client.sessionId)?"Parked. Take your Lime parking photo.":"");
  }
  photoRequired(id:string){return this.parkingPhotos.get(id);}
  finishParkingPhoto(id:string,vehicle:unknown){
    const pending=this.parkingPhotos.get(id),p=this.state.players.get(id),v=pending&&this.state.vehicles.get(pending);
    if(!pending||vehicle!==pending||!p||!v||p.vehicleId||Math.hypot(p.x-v.x,p.z-v.z)>12)return false;
    this.parkingPhotos.delete(id);return true;
  }
  releaseForRespawn(id: string) {
    this.parkingPhotos.delete(id);
    const p = this.state.players.get(id);
    if (p?.vehicleId) this.release(p);
  }
  disconnect(id: string) {
    this.releaseForRespawn(id);
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
      const landing = C.isRail(v) ? this.railLanding(v, p) : C.findGround(this.world, x, z);
      Object.assign(p, landing ?? C.raceSpawnPoint(this.world));
      p.grounded = true; p.groundTime = p.simTime;
      if (!C.isPassengerVehicle(v)) {
        const remaining=v.kind===C.LIME_KIND?[...this.state.players].find(([,other])=>other!==p&&other.vehicleId===id):undefined;
        if(!remaining||seat===0){
          this.reports.delete(id);v.driver="";v.vx=v.vz=0;
          if(remaining){const [driver,rider]=remaining;rider.seat=0;v.driver=driver;this.reports.set(id,Date.now());this.attach(rider,v);}
        }
      }
    }
    p.cabinStanding = false; this.cabinReports.delete(p);
    p.vehicleId = "";
    p.vehicleKind = -1;
    p.seat = -1;
    p.vx = p.vy = p.vz = 0;
    p.anim = 0;
    if (v?.kind === 1 && !v.traveling && !this.occupied(id)) v.departureAt = 0;
    if (v && C.isRail(v) && !v.traveling) {
      const cabins = v.kind === C.POLYBAHN_KIND ? ["polybahn-1", "polybahn-2"] : [id];
      if (!cabins.some(key => this.occupied(key))) for (const key of cabins) this.state.vehicles.get(key)!.departureAt = 0;
    }
  }
  private occupied(id: string) {
    for (const p of this.state.players.values())
      if (p.vehicleId === id) return true;
    return false;
  }
  private railLanding(v: Vehicle, passenger: Player) {
    const base = C.railBoardingPoint(v), spacing = C.CAPSULE_RADIUS * 2 + 0.15;
    for (let ring = 0; ring <= 8; ring++) for (let i = 0; i < (ring ? 16 : 1); i++) {
      const angle = i * Math.PI / 8, ground = C.findGround(this.world, base.x + Math.cos(angle) * ring * spacing, base.z + Math.sin(angle) * ring * spacing);
      if (ground && Math.abs(ground.y - base.y) < 2 &&
        [...this.state.players.values()].every(p => p === passenger || p.vehicleId || Math.hypot(p.x - ground.x, p.z - ground.z) >= spacing)) return ground;
    }
    return C.findGround(this.world, base.x, base.z);
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
      (v.kind !== 0 && v.kind !== 2 && v.kind !== C.LIME_KIND) ||
      v.driver !== client.sessionId ||
      p?.vehicleId !== data[0]
    )
      return;
    const dt = Math.max(
        0.001,
        (now - (this.reports.get(data[0]) ?? now)) / 1000,
      ),
      bounds = this.world.bounds;
    const y = this.world.height(data[1], data[2], v.y);
    if (
      Math.hypot(data[1] - v.x, data[2] - v.z) > C.vehicleSpeed(v) * 2 * dt + 0.15 ||
      data[1] < bounds.minX + C.vehicleRadius(v) ||
      data[1] > bounds.maxX - C.vehicleRadius(v) ||
      data[2] < bounds.minZ + C.vehicleRadius(v) ||
      data[2] > bounds.maxZ - C.vehicleRadius(v) ||
      y === undefined ||
      C.bridgeCowSweepBlocked(v, data[1], data[2], C.vehicleRadius(v), C.CART_HIT_HEIGHT, now, this.world) ||
      this.world.blocked(
        data[1],
        y,
        data[2],
        C.vehicleRadius(v),
        C.CART_HIT_HEIGHT,
      ) ||
      Math.hypot(data[4], data[5]) > C.vehicleSpeed(v) * 2
    )
      return;
    v.x = data[1];
    v.y = y;
    v.z = data[2];
    v.rotY = data[3] % (Math.PI * 2);
    v.vx = data[4];
    v.vz = data[5];
    this.reports.set(data[0], now);
    p.simTime = now;
    this.attach(p, v);
  }
  syncDriver(id: string) {
    const p = this.state.players.get(id), v = p && this.state.vehicles.get(p.vehicleId);
    if (!p || !v || v.driver !== id) return;
    v.x = p.x; v.y = p.y - (v.kind === C.LIME_KIND ? C.LIME_DECK_HEIGHT : v.kind===2 ? C.BIKE_SEAT_HEIGHT : C.CART_SEAT_HEIGHT); v.z = p.z; v.rotY = p.rotY; v.vx = p.vx; v.vz = p.vz;
  }
  private cabinReports = new WeakMap<Player, number>();
  walkCabin(id: string, data: unknown) {
    const p = this.state.players.get(id), v = p && this.state.vehicles.get(p.vehicleId);
    if (!p || !v || v.kind !== C.POLYBAHN_KIND || !Array.isArray(data) || data.length !== 5 || data[0] !== p.vehicleId || !data.slice(1).every(Number.isFinite)) return;
    const now = Date.now(), elapsed = Math.min(.25, Math.max(0, (now - (this.cabinReports.get(p) ?? now - 100)) / 1000));
    const bounds = C.cabinBounds(data[1], data[2]);
    const startZ = p.cabinStanding ? p.cabinZ : C.railSeat(v, p.seat).z;
    if (bounds.x !== data[1] || bounds.z !== data[2] || Math.hypot(data[1] - (p.cabinStanding ? p.cabinX : 0), data[2] - startZ) > C.CABIN_SPEED * elapsed + .12) return;
    C.standInCabin(p, v);
    p.cabinX = data[1]; p.cabinZ = data[2]; p.cabinYaw = data[3] % (2*Math.PI); p.anim = data[4] === 1 ? 1 : 0;
    this.cabinReports.set(p, now); this.attach(p, v);
  }
  private attach(p: Player, v: Vehicle) {
    if (v.kind === C.POLYBAHN_KIND && p.cabinStanding) {
      C.cabinPosition(v, p);
      p.vx = p.anim ? Math.sin(p.rotY) * C.CABIN_SPEED : 0;
      p.vz = p.anim ? Math.cos(p.rotY) * C.CABIN_SPEED : 0;
      p.vy = 0;
      return;
    }
    C.seatPosition(v, p.seat, p);
    p.rotY = C.passengerYaw(v, p.seat);
    p.vx = v.vx;
    p.vy = 0;
    p.vz = v.vz;
    p.anim = 0;
    p.grounded = false;
  }
  crashBike(id: string, now: number, hit: Parameters<VehicleManager["tick"]>[1], speed?: number, impact?: { from: string; rotY: number; kind: number }) {
    const v = this.state.vehicles.get(id);
    if (!v || v.kind !== 2 || now < v.fallenUntil || now < (this.state.players.get(v.driver)?.invincibleUntil ?? 0)) return;
    speed ??= Math.hypot(v.vx, v.vz);
    v.fallenUntil = now + 2500;
    this.ejectDriver(v, impact?.from ?? id, speed, hit, impact?.rotY ?? v.rotY, impact?.kind ?? v.kind);
  }
  /** Traffic ejects exposed riders at the impact point, using the normal vehicle impact. */
  runOver(id: string, now: number, hit: Parameters<VehicleManager['tick']>[1], speed: number, impact: { from: string; rotY: number; kind: number }) {
    const v = this.state.vehicles.get(id);
    if (!v || C.isPassengerVehicle(v) || [...this.state.players.values()].some(p => p.vehicleId === id && now < p.invincibleUntil)) return;
    if (v.kind === 2) this.crashBike(id, now, hit, speed, impact);
    else {
      v.fallenUntil = now + 2500;
      this.ejectDriver(v, impact.from, speed, hit, impact.rotY, impact.kind);
    }
    this.reports.delete(id);
    // The Lime's second rider must also leave; no automatic driver promotion on impact.
    for (const [target, rider] of this.state.players) if (rider.vehicleId === id) {
      rider.vehicleId = ''; rider.vehicleKind = -1; rider.seat = -1; rider.cabinStanding = false;
      hit(impact.from, target, rider.x, rider.y + 0.8, rider.z,
        Math.sin(impact.rotY) * speed * 1.35, 4, Math.cos(impact.rotY) * speed * 1.35, true, impact.kind);
    }
  }
  private ejectDriver(v: Vehicle, from: string, speed: number, hit: Parameters<VehicleManager["tick"]>[1], rotY = v.rotY, sourceKind = v.kind) {
    const rider = this.state.players.get(v.driver), driver = v.driver;
    if (rider && this.state.serverTime < rider.invincibleUntil) return;
    const carHit = sourceKind === 3 && (v.kind === 2 || v.kind === C.LIME_KIND);
    const force = speed * (carHit ? 1.35 : .6), lift = carHit ? 4 : 2;
    v.driver = ""; v.vx = v.vz = 0;
    if (rider) {
      // Keep the rider at the impact point; reconciliation blends the ejection.
      rider.vehicleId = ""; rider.vehicleKind = -1; rider.seat = -1;
      hit(from, driver, rider.x, rider.y + 0.8, rider.z,
        Math.sin(rotY) * force, lift, Math.cos(rotY) * force, true, sourceKind);
    }
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
      sourceKind?: number,
    ) => void,
  ) {
    this.tickRail(now);
    for (const [id, v] of this.state.vehicles) {
      if (v.driver && now - (this.reports.get(id) ?? now) > C.VEHICLE_STALE_MS) v.vx = v.vz = 0;
      if (v.fallenUntil && now >= v.fallenUntil) v.fallenUntil = 0;
      if(v.kind===C.LIME_KIND)for(const p of this.state.players.values())if(p.vehicleId===id)this.attach(p,v);
      if (v.kind === 1) {
        if (!v.traveling && v.departureAt > 0 && now >= v.departureAt) {
          v.traveling = true;
          v.tripStartedAt = v.departureAt;
          v.fromX = v.x;
          v.fromZ = v.z;
          v.arrivalAt =
            v.tripStartedAt +
            ((this.world.name === "zurich" ? this.world.routeLength : Math.hypot(v.toX - v.fromX, v.toZ - v.fromZ)) / C.SHUTTLE_SPEED) *
              1000;
        }
        if (v.traveling) {
          C.shuttlePosition(v, now, this.world);
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
      } else if (v.kind === 3) {
        if (this.world.name === "zurich") {
          const phase = ((now - this.trafficStart) / 1000 * 8) % (2 * this.world.routeLength);
          C.routePoint(this.world, phase % this.world.routeLength, v, phase >= this.world.routeLength);
          v.vx = Math.sin(v.rotY) * 8; v.vz = Math.cos(v.rotY) * 8;
          continue;
        }
        const phase = ((now - this.trafficStart) / 1000 * 8) % 80;
        v.x = phase < 40 ? -20 + phase : 60 - phase;
        v.vx = phase < 40 ? 8 : -8;
        v.rotY = v.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }
  private tickRail(now: number) {
    // Update both counterweighted cabins before releasing any passenger.
    const arrived: [string, Vehicle][] = [];
    for (const [id, v] of this.state.vehicles) {
      if (!C.isRail(v)) continue;
      if (!v.traveling && v.departureAt > 0 && now >= v.departureAt) {
        v.traveling = true; v.tripStartedAt = v.departureAt + C.TRANSIT_DOOR_MS;
        v.arrivalAt = v.tripStartedAt + C.railTripDuration(v) + C.TRANSIT_DOOR_MS;
      }
      if (!v.traveling) continue;
      C.railMotion(v, now, !this.state.railCrashProtection);
      if(v.kind===C.TRAM_KIND&&!this.state.railCrashProtection&&!v.railReverse&&!v.derailStartedAt&&v.railDistance>=C.tramFirstCorner&&C.tramTurnLoad(v)>C.TRAM_TRACK_ADHESION){
        v.railDistance=C.tramFirstCorner;Object.assign(v,C.railFrame(v));v.derailStartedAt=now;
        const incoming=C.railFrame({kind:v.kind,railLane:v.railLane,railDistance:C.tramFirstCorner-8});
        const speed=Math.hypot(v.vx,v.vz);
        v.vx=Math.sin(incoming.rotY)*speed;v.vz=Math.cos(incoming.rotY)*speed;
      }
      if(v.derailStartedAt){
        v.derailAge=Math.min(8,Math.max(0,(now-v.derailStartedAt)/1000));
        for(const p of this.state.players.values())if(p.vehicleId===id){this.attach(p,v);if(v.derailAge>=1.1)this.release(p);}
        continue;
      }
      for (const p of this.state.players.values()) if (p.vehicleId === id) this.attach(p, v);
      if (now >= v.arrivalAt) arrived.push([id, v]);
    }
    for (const [, v] of arrived) { v.traveling = false; v.departureAt = 0; }
    for (const [id, v] of arrived) {
      for (const p of this.state.players.values()) if (p.vehicleId === id) this.release(p);
      v.railReverse = !v.railReverse; v.tripStartedAt = v.arrivalAt = 0;
    }
  }
  bikeContacts(now: number, hit: Parameters<VehicleManager["tick"]>[1], intersects?: (a: string, b: string) => boolean) {
    // Bikes fall against any solid object; heavy transport is never displaced.
    for (const [id, v] of this.state.vehicles) if (v.kind === 2 && now >= v.fallenUntil) {
      for (const [otherId, other] of this.state.vehicles) {
        if (id === otherId || other.derailStartedAt || (intersects && !intersects(`v:${id}`, `v:${otherId}`))) continue;
        const dx = other.x - v.x, dz = other.z - v.z, distance = Math.hypot(dx, dz);
        const closing = ((v.vx - other.vx) * dx + (v.vz - other.vz) * dz) / Math.max(distance, 0.001);
        if (distance <= C.vehicleRadius(v) + C.vehicleRadius(other) + 0.02 && closing >= C.CART_MIN_HIT_SPEED) {
          const otherSpeed = Math.hypot(other.vx, other.vz), bikeSpeed = Math.hypot(v.vx, v.vz);
          const incomingVehicle = other.kind !== 2 && otherSpeed > bikeSpeed;
          this.crashBike(id, now, hit, Math.max(closing, bikeSpeed), incomingVehicle
            ? { from: other.driver || otherId, rotY: Math.atan2(other.vx, other.vz), kind: other.kind } : undefined); break;
        }
      }
    }
  }
  contacts(now: number, hit: Parameters<VehicleManager["tick"]>[1], intersects?: (a: string, b: string) => boolean) {
    this.bikeContacts(now, hit, intersects);
    for (const [id, v] of this.state.vehicles) if (v.driver) {
      for (const [otherId, other] of this.state.vehicles) if (id !== otherId && !other.derailStartedAt && (other.driver || C.isPassengerVehicle(other) || other.kind === 3) && (!intersects || intersects(`v:${id}`, `v:${otherId}`))) {
        const dx = v.x - other.x, dz = v.z - other.z, distance = Math.hypot(dx, dz);
        const radius = C.vehicleRadius(v) + C.vehicleRadius(other);
        if (distance >= radius) continue;
        if (C.isPassengerVehicle(other) && Math.hypot(other.vx, other.vz) >= C.CART_MIN_HIT_SPEED) {
          this.ejectDriver(v, otherId, Math.hypot(other.vx, other.vz), hit, other.rotY, other.kind); break;
        }
        v.x += (distance > 0.001 ? dx / distance : 1) * (radius - distance);
        v.z += (distance > 0.001 ? dz / distance : 0) * (radius - distance);
        v.vx = v.vz = 0; this.attach(this.state.players.get(v.driver)!, v);
      }
    }
    for (const [id, v] of this.state.vehicles) {
      const cooldown = this.hitTimes.get(id)!;
      if (v.derailStartedAt) continue;
      for (const [target, p] of this.state.players) {
        if (p.vehicleId || (intersects && !intersects(target, `v:${id}`))) continue;
        if (
          now - (cooldown.get(target) ?? -Infinity) < C.PAIR_COOLDOWN_MS ||
          !C.cartContact(v, p, this.contact)
        )
          { this.separate(v, p); continue; }
        const o = this.contact, strength = v.kind === 2 ? C.BIKE_HIT_STRENGTH : C.CART_HIT_STRENGTH;
        cooldown.set(target, now);
        hit(
          v.driver || id,
          target,
          p.x,
          p.y + C.CAPSULE_HEIGHT / 2,
          p.z,
          o.nx * o.closing * strength,
          v.kind === 2 ? 1 : C.CART_HIT_LIFT,
          o.nz * o.closing * strength,
          true,
          v.kind,
        );
        this.separate(v, p);
        if (v.kind === 2) this.crashBike(id, now, hit);
      }
    }
  }
  private separate(v: Vehicle, p: Player) {
    if (p.vehicleId || p.y - v.y > C.CART_HIT_HEIGHT || p.y + C.CAPSULE_HEIGHT < v.y) return;
    const dx = p.x - v.x, dz = p.z - v.z, distance = Math.hypot(dx, dz);
    const radius = C.vehicleRadius(v) + C.CAPSULE_RADIUS;
    if (distance >= radius) return;
    const nx = distance > 0.001 ? dx / distance : 1, nz = distance > 0.001 ? dz / distance : 0;
    p.x += nx * (radius - distance); p.z += nz * (radius - distance);
  }
}
