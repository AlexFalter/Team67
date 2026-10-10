import { Room, type Client } from "colyseus";
import * as C from "@race/shared";
import { Player, RaceState } from "./state.ts";
import { VehicleManager } from "./vehicles.ts";
import { ContactWorld } from "./physics.ts";
import { RoundManager } from "./round.ts";
import { PubliBikes } from "./publiBikes.ts";
import { MateMachine } from "./mate.ts";
// The prototype runs one server process. Reserve synchronously before async
// physics initialization so two simultaneous creates cannot claim one code.
const codes = new Set<string>();

export class Race extends Room<{ state: RaceState }> {
  maxClients = 40;
  state = new RaceState();
  private lastMoves = new Map<string, number>();
  private world = process.env.GAME_WORLD === "flat" ? C.flatWorld : C.zurichWorld;
  private contact = C.createContact();
  private physics!: ContactWorld;
  private vehicles!: VehicleManager;
  private code?: string;
  private rounds!: RoundManager;
  private publiBikes!: PubliBikes;
  private mate!: MateMachine;
  async onCreate(options: { code?: unknown } = {}) {
    if (options.code !== undefined) {
      const code = C.roomCode(options.code);
      if (codes.has(code)) throw new Error("That code is already in use. Join it or choose another.");
      codes.add(code); this.code = code; this.roomId = code;
    }
    this.physics = await ContactWorld.create(this.world);
    this.state.serverTime = Date.now();
    this.vehicles = new VehicleManager(this.state, this.world);
    this.publiBikes = this.createPubliBikes();
    this.mate = new MateMachine(this.state, this.world);
    const configuredDuration = Number(process.env.ROUND_DURATION_MS ?? C.ROUND_DURATION_MS);
    const duration = Number.isFinite(configuredDuration) && configuredDuration > 0 ? configuredDuration : C.ROUND_DURATION_MS;
    const introDuration = Number(process.env.BATTLE_BUS_INTRO_MS ?? C.BATTLE_BUS_DURATION_MS);
    const introLead = Number(process.env.BATTLE_BUS_LEAD_MS ?? C.BATTLE_BUS_LEAD_MS);
    this.rounds = new RoundManager(this.state, duration, () => {
      for (const id of this.state.players.keys()) this.lastMoves.set(id, Date.now());
    }, () => this.resetRound(), {
      durationMs: Number.isFinite(introDuration) && introDuration > 0 ? introDuration : C.BATTLE_BUS_DURATION_MS,
      leadMs: Number.isFinite(introLead) && introLead >= 0 ? introLead : C.BATTLE_BUS_LEAD_MS,
      onArrival: () => this.arriveFromBus(),
    });
    this.onMessage("ready", (client, ready: unknown) => this.rounds.ready(client.sessionId, ready));
    this.onMessage("restartRound", client => this.rounds.restart(client.sessionId));
    this.onMessage("finishRound", client => {
      if (client.sessionId === this.state.hostId) this.rounds.finish();
    });
    this.onMessage("move", (client, data: unknown) => this.move(client, data));
    this.onMessage("vehicleMove", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId)) this.vehicles.move(client, data);
    });
    this.onMessage("ping", (client, data: unknown) => {
      const t = (data as C.Ping)?.clientTime;
      if (Number.isFinite(t)) client.send("pong", { clientTime: t, serverTime: Date.now() });
    });
    this.onMessage("toggleShoes", client => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.rounds.canPlay(client.sessionId)) p.shoes = !p.shoes;
    });
    this.onMessage("hit", client => this.attack(client));
    this.onMessage("bikeCrash", client => {
      const p = this.state.players.get(client.sessionId), v = p && this.state.vehicles.get(p.vehicleId);
      if (!this.rounds.canPlay(client.sessionId) || !v || v.kind !== 2 || v.driver !== client.sessionId) return;
      const probe = C.snapshot(v, C.createVehicle());
      const impact = C.stepCart(probe, { ...C.IDLE_INPUT, x: Math.sin(v.rotY), z: Math.cos(v.rotY) }, 1 / C.CLIENT_SEND_RATE, this.world);
      if (impact > 0.001) this.vehicles.crashBike(p!.vehicleId, Date.now(), this.vehicleHit);
    });
    this.setPatchRate(1000 / C.SERVER_PATCH_RATE);
    this.onMessage("vehicleEnter", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId)) this.vehicles.enter(client, data, Date.now());
    });
    this.onMessage("vehicleExit", client => {
      if (this.rounds.canPlay(client.sessionId)) {
        const id = this.state.players.get(client.sessionId)?.vehicleId;
        this.vehicles.exit(client); if (id) this.publiBikes.park(id);
      }
    });
    this.onMessage("bikeScanBegin", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId)) this.publiBikes.begin(client, data);
    });
    this.onMessage("bikeScanFinish", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId)) this.publiBikes.finish(client, data);
    });
    this.onMessage("bikeScanCancel", (client, data: unknown) => this.publiBikes.cancel(client, data));
    this.onMessage("mate", (client, data: unknown) => this.mate.command(client, data));
    this.setSimulationInterval(() => this.tick(), 1000 / C.COLLISION_TICK_RATE);
  }
  onJoin(client: Client, options: { name?: unknown; character?: unknown } = {}) {
    const member = this.rounds.join(client.sessionId, options);
    if (!member.spectator) this.spawnPlayer(client.sessionId, member.character);
  }
  private spawnPlayer(id: string, character: number, color?: string) {
    this.lastMoves.set(id, Date.now());
    const index = this.state.players.size;
    this.state.players.set(id, new Player({
      ...(this.world.name === "flat" ? { x: (index % 5 - 2) * 2, y: 0, z: Math.floor(index / 5) * 2 } : C.spawnPoint(this.world)),
      color: color ?? `hsl(${Math.floor(Math.random() * 360)}, 85%, 65%)`,
      simTime: Date.now(), character,
    }));
    this.mate.join(id);
  }
  private resetRound() {
    const colors = new Map([...this.state.players].map(([id, p]) => [id, p.color]));
    this.state.players.clear(); this.state.vehicles.clear(); this.state.publiBikes.clear(); this.lastMoves.clear();
    this.physics.sync(new Map(), new Map());
    this.vehicles = new VehicleManager(this.state, this.world);
    this.publiBikes = this.createPubliBikes();
    this.state.mates.clear(); this.mate = new MateMachine(this.state, this.world);
    for (const [id, member] of this.state.members) this.spawnPlayer(id, member.character, colors.get(id));
  }
  private arriveFromBus() {
    const points = this.world.name === "zurich" ? C.battleBusDropoffs(this.world, this.maxClients) : undefined;
    for (const [id, p] of this.state.players) {
      const seat = this.state.members.get(id)!.introSeat;
      if (points) Object.assign(p, points[seat], { rotY: C.BATTLE_BUS_HEADING + Math.PI });
      p.vx = p.vy = p.vz = 0; p.grounded = true; p.anim = 0;
      p.simTime = Date.now();
      this.lastMoves.set(id, p.simTime);
    }
  }
  onLeave(client: Client) {
    const id = this.state.players.get(client.sessionId)?.vehicleId;
    this.publiBikes.disconnect(client.sessionId);
    this.mate.leave(client.sessionId);
    this.vehicles.disconnect(client.sessionId);
    if (id) this.publiBikes.park(id);
    this.state.players.delete(client.sessionId);
    this.lastMoves.delete(client.sessionId);
    this.rounds.leave(client.sessionId);
  }
  onDispose() { this.physics?.dispose(); if (this.code) codes.delete(this.code); }
  private hit(target: string, hit: C.Impulse) {
    const p = this.state.players.get(target);
    if (p && this.rounds.canPlay(target)) {
      this.rounds.hit(hit.from, target);
      p.simTime = Date.now();
      const correction = this.correction(p);
      C.applyImpulse(p, hit, p.simTime);
      const client = this.clients.find(c => c.sessionId === target);
      client?.send("playerCorrection", correction);
      client?.send("impulse", hit);
    }
  }
  private bump(a: string, b: string, x: number, y: number, z: number) {
    this.broadcast("bump", { a, b, x, y, z, t: this.state.serverTime } satisfies C.Bump);
  }
  private vehicleHit: Parameters<VehicleManager["tick"]>[1] = (from, target, x, y, z, ix, iy, iz, knockdown) => {
    this.hit(target, { from, ix, iy, iz, knockdown, durationMs: 2500 });
    this.bump(from, target, x, y, z);
  };
  private correction(p: C.PlayerState): C.PlayerCorrection {
    return { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, grounded: p.grounded,
      vehicleId: p.vehicleId, vehicleKind: p.vehicleKind, seat: p.seat };
  }
  private move(client: Client, data: unknown) {
    if (!this.rounds.canPlay(client.sessionId)) return;
    if (
      !Array.isArray(data) ||
      data.length !== 8 ||
      !data.every((v) => typeof v === "number" && Number.isFinite(v))
    )
      return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.vehicleId) return;
    const
      now = Date.now(),
      dt = Math.max(0.001, (now - (this.lastMoves.get(client.sessionId) ?? now)) / 1000);
    const respawn =
      p.y < (this.world.height(p.x, p.z) ?? this.world.spawn.y) - 8 &&
      Math.abs(data[0] - this.world.spawn.x) <= C.SPAWN_SPREAD &&
      Math.abs(data[2] - this.world.spawn.z) <= C.SPAWN_SPREAD &&
      Math.abs(data[1] - (this.world.height(data[0], data[2]) ?? Infinity)) <
        0.1;
    if (
      !respawn &&
      Math.hypot(data[0] - p.x, data[2] - p.z) >
        C.MAX_HORIZONTAL_SPEED * dt + 0.15
    )
      return;
    const clamp = (v: number, n: number) => Math.max(-n, Math.min(n, v));
    const bounds = this.world.bounds;
    p.x =
      this.world.name === "flat"
        ? clamp(data[0], C.MAX_POSITION)
        : Math.max(bounds.minX - 20, Math.min(bounds.maxX + 20, data[0]));
    p.y = clamp(data[1], this.world.name === "flat" ? C.MAX_POSITION : 500);
    p.z =
      this.world.name === "flat"
        ? clamp(data[2], C.MAX_POSITION)
        : Math.max(bounds.minZ - 20, Math.min(bounds.maxZ + 20, data[2]));
    p.rotY = data[3] % (2 * Math.PI);
    p.vx = clamp(data[4], C.MAX_HORIZONTAL_SPEED);
    p.vy = clamp(data[5], C.MAX_VERTICAL_SPEED);
    p.vz = clamp(data[6], C.MAX_HORIZONTAL_SPEED);
    p.anim = now < p.knockdownUntil ? 3 : Math.max(0, Math.min(3, Math.floor(data[7])));
    p.simTime = now;
    p.grounded = Math.abs(p.y - (this.world.height(p.x, p.z) ?? Infinity)) < 0.1 && p.vy <= 0;
    this.lastMoves.set(client.sessionId, now);
  }
  private attack(client: Client) {
    if (!this.rounds.canPlay(client.sessionId)) return;
    const p = this.state.players.get(client.sessionId), now = Date.now();
    if (!p || p.vehicleId || now < p.knockdownUntil || now < p.attackReadyAt) return;
    p.simTime = now; p.attackReadyAt = now + C.ATTACK_COOLDOWN_MS;
    for (const [target, other] of this.state.players) if (target !== client.sessionId && !other.vehicleId && C.inHitCone(p, other, this.world)) {
      this.hit(target, { from: client.sessionId, ix: Math.sin(p.rotY) * 8, iy: 1.5, iz: Math.cos(p.rotY) * 8,
        knockdown: true, durationMs: C.ATTACK_KNOCKDOWN_MS });
      this.bump(client.sessionId, target, other.x, other.y + 0.9, other.z);
    }
  }
  private tick() {
    const now = this.state.serverTime = Date.now(), vehicleHit = this.vehicleHit;
    this.rounds.tick(now);
    this.publiBikes.tick(now);
    this.mate.tick(now);
    if (this.state.phase !== C.RoomPhase.Running || !this.state.introComplete) return;
    const positions = new Map([...this.state.players].map(([id, p]) => [id, this.correction(p)]));
    for (const p of this.state.players.values()) p.simTime = now;
    this.vehicles.tick(now, vehicleHit);
    this.vehicles.bikeContacts(now, vehicleHit);
    // Docked bikes and bikes currently being scanned remain held in place.
    this.physics.sync(this.state.players, this.state.vehicles, new Set([...this.state.publiBikes]
      .filter(([, bike]) => bike.dock >= 0 || !!bike.reservedBy).map(([id]) => id)));
    this.vehicles.contacts(now, vehicleHit, (a, b) => this.physics.intersects(a, b));
    const entries = [...this.state.players];
    for (let pass = 0; pass < 4; pass++) for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      const [aId, a] = entries[i], [bId, b] = entries[j];
      if (a.vehicleId || b.vehicleId || (pass === 0 && !this.physics.intersects(aId, bId))) continue;
      const o = this.contact;
      if (C.capsuleContact(a, b, o)) {
        const amount = (2 * C.CAPSULE_RADIUS - o.dist) / 2;
        a.x -= o.nx * amount; a.z -= o.nz * amount;
        b.x += o.nx * amount; b.z += o.nz * amount;
      }
    }
    for (const [id, p] of entries) if (!p.vehicleId && this.world.blocked(p.x, p.y, p.z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT))
      Object.assign(p, positions.get(id));
    for (const [id, p] of entries) {
      const previous = positions.get(id)!;
      if (Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z) > 0.001 || Math.hypot(p.vx - previous.vx, p.vy - previous.vy, p.vz - previous.vz) > 0.001 || p.vehicleId !== previous.vehicleId)
        this.clients.find(c => c.sessionId === id)?.send("playerCorrection", this.correction(p));
    }
  }
  private createPubliBikes() {
    return new PubliBikes(this.state, this.vehicles, this.world, (id, message) =>
      this.clients.find(c => c.sessionId === id)?.send("vehicleResult", { ok: false, message }));
  }
}
