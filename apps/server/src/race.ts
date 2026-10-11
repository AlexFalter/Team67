import {MoodleEvents} from './moodle.ts';
import {PlayerMedals} from "./medals.ts";
import { Room, type Client } from "colyseus";
import * as C from "@race/shared";
import { Player, RaceState } from "./state.ts";
import { VehicleManager } from "./vehicles.ts";
import { ContactWorld } from "./physics.ts";
import { registerExamDebug } from "./examDebug.ts";
import { RoundManager } from "./round.ts";
import { PubliBikes } from "./publiBikes.ts";
import { MateMachine } from "./mate.ts";
import { TrafficManager } from "./traffic.ts";
import { NpcEncounters } from "./npcs.ts";
import { TicketMachine } from './tickets.ts';
// The prototype runs one server process. Reserve synchronously before async
// physics initialization so two simultaneous creates cannot claim one code.
const codes = new Set<string>();

export class Race extends Room<{ state: RaceState }> {
  maxClients = 40;
  state = new RaceState();
  private moodle!:MoodleEvents;
  private medals = new PlayerMedals();
  private lastMoves = new Map<string, number>();
  private world = process.env.GAME_WORLD === "flat" ? C.flatWorld : C.zurichWorld;
  private contact = C.createContact();
  private physics!: ContactWorld;
  private vehicles!: VehicleManager;
  private code?: string;
  private rounds!: RoundManager;
  private publiBikes!: PubliBikes;
  private mate!: MateMachine;
  private npcs!: NpcEncounters;
  private traffic!: TrafficManager;
  private trafficTime = Date.now();
  private trafficEdits = new Map<string, number>();
  async onCreate(options: { code?: unknown; devMode?: unknown; skipIntro?: unknown; goldPubliBikes?: unknown; railCrashProtection?: unknown } = {}) {
    if (options.code !== undefined) {
      const code = C.roomCode(options.code);
      if (codes.has(code)) throw new Error("That code is already in use. Join it or choose another.");
      codes.add(code); this.code = code; this.roomId = code;
    }
    this.state.devMode = options.devMode === true;
    this.state.railCrashProtection=this.state.devMode&&options.railCrashProtection===true;
    this.state.goldPubliBikes = options.goldPubliBikes !== false;
    this.state.skipIntro = this.state.devMode && options.skipIntro === true;
    this.physics = await ContactWorld.create(this.world);
    this.state.serverTime = Date.now();
    this.vehicles = new VehicleManager(this.state, this.world, false);
    this.publiBikes = this.createPubliBikes();
    this.mate = new MateMachine(this.state, this.world);
    this.npcs = this.createNpcs();
    this.moodle=new MoodleEvents(this.state,(id,result)=>this.clients.find(c=>c.sessionId===id)?.send('moodleResult',result),id=>!this.npcs.busy(id));
    this.onMessage('moodleAnswer',(client,data:unknown)=>this.moodle.answer(client.sessionId,data,Date.now()));
    this.onMessage('moodleSettings',(client,data:unknown)=>{if(client.sessionId===this.state.hostId&&typeof data==='boolean')this.moodle.enabled(data);});
    this.traffic = new TrafficManager(this.state);
    const tickets = new TicketMachine(this.state,this.world);
    this.onMessage('ticket', (client, data: unknown) => tickets.command(client,data));
    const configuredDuration = Number(process.env.ROUND_DURATION_MS ?? C.ROUND_DURATION_MS);
    const duration = Number.isFinite(configuredDuration) && configuredDuration > 0 ? configuredDuration : C.ROUND_DURATION_MS;
    const introDuration = Number(process.env.BATTLE_BUS_INTRO_MS ?? C.BATTLE_BUS_DURATION_MS);
    const introLead = Number(process.env.BATTLE_BUS_LEAD_MS ?? C.BATTLE_BUS_LEAD_MS);
    this.rounds = new RoundManager(this.state, duration, () => {
      for (const id of this.state.players.keys()) this.lastMoves.set(id, Date.now());
    }, () => this.resetRound(), {
      durationMs: this.state.skipIntro ? 0 : Number.isFinite(introDuration) && introDuration > 0 ? introDuration : C.BATTLE_BUS_DURATION_MS,
      leadMs: this.state.skipIntro ? 0 : Number.isFinite(introLead) && introLead >= 0 ? introLead : C.BATTLE_BUS_LEAD_MS,
      onArrival: () => this.arriveFromBus(),
    });
    registerExamDebug(this, this.world, this.lastMoves, id => this.rounds.canPlay(id));
    this.onMessage("trafficEdit", (client, data: unknown) => {
      if (!this.state.devMode || client.sessionId !== this.state.hostId) {
        client.send("trafficResult", { ok: false, message: "Only the development room host can edit traffic." }); return;
      }
      const now = Date.now();
      if (now - (this.trafficEdits.get(client.sessionId) ?? 0) < 100) {
        client.send("trafficResult", { ok: false, message: "Please wait before applying another edit." }); return;
      }
      this.trafficEdits.set(client.sessionId, now);
      try {
        const command = data as { network?: unknown; settings?: unknown };
        if (!command || typeof command !== "object") throw new Error("Invalid traffic command.");
        if (command.network !== undefined) this.traffic.replace(C.validateTrafficNetwork(command.network));
        else if (command.settings !== undefined) this.traffic.settings(command.settings);
        else throw new Error("Send a traffic network or settings.");
        client.send("trafficResult", { ok: true, message: "Traffic updated." });
      } catch (error) { client.send("trafficResult", { ok: false, message: error instanceof Error ? error.message : "Invalid traffic edit." }); }
    });
    this.onMessage("ready", (client, ready: unknown) => this.rounds.ready(client.sessionId, ready));
    this.onMessage("restartRound", client => this.rounds.restart(client.sessionId));
    this.onMessage("finishRound", client => {
      if (client.sessionId === this.state.hostId) this.rounds.finish();
    });
    this.onMessage("move", (client, data: unknown) => this.move(client, data));
    this.onMessage('respawn', client => {
      const p = this.state.players.get(client.sessionId), now = Date.now();
      if (!p || !this.rounds.canPlay(client.sessionId) || this.npcs.busy(client.sessionId) || p.moodleSitUntil > now) return;
      const vehicleId = p.vehicleId;
      this.vehicles.releaseForRespawn(client.sessionId);
      if (vehicleId) this.publiBikes.park(vehicleId);
      p.simTime = now; C.respawn(p, this.world); p.anim = 0;
      this.lastMoves.set(client.sessionId, now);
      client.send('respawned', this.correction(p));
    });
    this.onMessage("cabinMove", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId)) this.vehicles.walkCabin(client.sessionId, data);
    });
    this.onMessage("vehicleMove", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId)) this.vehicles.move(client, data);
    });
    this.onMessage("ping", (client, data: unknown) => {
      const t = (data as C.Ping)?.clientTime;
      if (Number.isFinite(t)) client.send("pong", { clientTime: t, serverTime: Date.now() });
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
      if (this.rounds.canPlay(client.sessionId) && !this.npcs.busy(client.sessionId) && (this.state.players.get(client.sessionId)?.moodleSitUntil??0)<=Date.now()) this.vehicles.enter(client, data, Date.now());
    });
    this.onMessage("vehicleExit", client => {
      if (this.rounds.canPlay(client.sessionId)) {
        const id = this.state.players.get(client.sessionId)?.vehicleId;
        this.vehicles.exit(client);
        const photo=this.vehicles.photoRequired(client.sessionId);if(photo)client.send("limePhotoRequired",{vehicleId:photo,roundStartedAt:this.state.startedAt});
        if (id) this.publiBikes.park(id);
      }
    });
    this.onMessage("limePhotoSubmit",(client,data:unknown)=>{
      const photo=data as {vehicleId?:unknown;roundStartedAt?:unknown}|null;
      const ok=!!photo&&photo.roundStartedAt===this.state.startedAt&&this.rounds.canPlay(client.sessionId)&&this.vehicles.finishParkingPhoto(client.sessionId,photo.vehicleId);
      client.send("limePhotoResult",{ok,roundStartedAt:this.state.startedAt});
    });
    this.onMessage("bikeScanBegin", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId) && !this.npcs.busy(client.sessionId)) this.publiBikes.begin(client, data);
    });
    this.onMessage("bikeScanFinish", (client, data: unknown) => {
      if (this.rounds.canPlay(client.sessionId)) this.publiBikes.finish(client, data);
    });
    this.onMessage("bikeScanCancel", (client, data: unknown) => this.publiBikes.cancel(client, data));
    this.onMessage("mate", (client, data: unknown) => { if (!this.npcs.busy(client.sessionId)) this.mate.command(client, data); });
    this.onMessage("npc", (client, data: unknown) => {if((this.state.players.get(client.sessionId)?.moodleSitUntil??0)<=Date.now())this.npcs.command(client, data);});
    this.onMessage("npcPose", (client, data: unknown) => this.npcs.pose(client, data));
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
    this.npcs.join(id);
  }
  private resetRound() {
    this.medals.reset();this.moodle.reset();
    const colors = new Map([...this.state.players].map(([id, p]) => [id, p.color]));
    this.state.players.clear(); this.state.vehicles.clear(); this.state.publiBikes.clear(); this.lastMoves.clear();
    this.physics.sync(new Map(), new Map());
    this.vehicles = new VehicleManager(this.state, this.world, false);
    this.publiBikes = this.createPubliBikes();
    this.state.mates.clear(); this.mate = new MateMachine(this.state, this.world);
    this.state.npcs.clear(); this.npcs = this.createNpcs();
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
    this.npcs.leave(client.sessionId);
    this.vehicles.disconnect(client.sessionId);
    if (id) this.publiBikes.park(id);
    this.state.players.delete(client.sessionId);
    this.lastMoves.delete(client.sessionId);
    this.medals.leave(client.sessionId);
    this.trafficEdits.delete(client.sessionId);
    this.rounds.leave(client.sessionId);
  }
  onDispose() { this.physics?.dispose(); if (this.code) codes.delete(this.code); }
  private hit(target: string, hit: C.Impulse, kind?: "punch" | "bicycle") {
    const p = this.state.players.get(target);
    if (p && this.rounds.canPlay(target) && !this.npcs.busy(target)) {
      const standing = Date.now() >= p.knockdownUntil;
      if (hit.knockdown && p.knockdownUntil > Date.now()) return;
      this.rounds.hit(hit.from, target);
      p.simTime = Date.now();
      const correction = this.correction(p);
      hit.at = p.simTime;
      C.applyImpulse(p, hit, p.simTime);
      const client = this.clients.find(c => c.sessionId === target);
      client?.send("playerCorrection", correction);
      client?.send("impulse", hit);
      const attacker = this.clients.find(c => c.sessionId === hit.from);
      if (kind && standing && client && attacker && this.state.players.has(hit.from) && this.rounds.canPlay(hit.from)) {
        const award = this.medals.record(hit.from, target, kind, this.state.startedAt);
        if (award) attacker.send("medal", award);
      }
      return true;
    }
    return false;
  }
  private bump(a: string, b: string, x: number, y: number, z: number) {
    this.broadcast("bump", { a, b, x, y, z, t: this.state.serverTime } satisfies C.Bump);
  }
  private vehicleHit: Parameters<VehicleManager["tick"]>[1] = (from, target, x, y, z, ix, iy, iz, knockdown, kind) => {
    const car = this.state.trafficCars.get(from), player = this.state.players.get(target);
    if (car && player?.vehicleId) {
      this.vehicles.runOver(player.vehicleId, this.state.serverTime, this.vehicleHit, car.speed, { from, rotY: car.rotY, kind: 3 });
      return;
    }
    if (this.hit(target, C.collisionImpact(from, ix, iy, iz, kind === 2 ? "bike" : "vehicle", knockdown), knockdown && kind===2 ? "bicycle" : undefined))
      this.bump(from, target, x, y, z);
  };
  private correction(p: C.PlayerState): C.PlayerCorrection {
    return { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, grounded: p.grounded,
      vehicleId: p.vehicleId, vehicleKind: p.vehicleKind, seat: p.seat };
  }
  private move(client: Client, data: unknown) {
    if (!this.rounds.canPlay(client.sessionId) || this.npcs.busy(client.sessionId)) return;
    if (
      !Array.isArray(data) ||
      data.length !== 8 ||
      !data.every((v) => typeof v === "number" && Number.isFinite(v))
    )
      return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.vehicleId || p.moodleSitUntil>Date.now()) return;
    const
      now = Date.now(),
      dt = Math.max(0.001, (now - (this.lastMoves.get(client.sessionId) ?? now)) / 1000);
    const spawn = C.raceSpawnPoint(this.world);
    const respawn =
      p.y < (this.world.height(p.x, p.z, p.y) ?? this.world.spawn.y) - 8 &&
      Math.abs(data[0] - spawn.x) <= C.SPAWN_SPREAD &&
      Math.abs(data[2] - spawn.z) <= C.SPAWN_SPREAD &&
      Math.abs(data[1] - (this.world.height(data[0], data[2], data[1]) ?? Infinity)) <
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
    p.anim = now < p.knockdownUntil ? 3 : Math.max(0, Math.min(C.SLIDE_ANIM, Math.floor(data[7])));
    p.simTime = now;
    p.grounded = Math.abs(p.y - (this.world.height(p.x, p.z, p.y) ?? Infinity)) < 0.1 && p.vy <= 0;
    if (p.anim === C.SLIDE_ANIM && (!p.grounded || Math.hypot(p.vx, p.vz) < 1))
      p.anim = p.grounded ? 0 : 2;
    this.lastMoves.set(client.sessionId, now);
  }
  private attack(client: Client) {
    if (!this.rounds.canPlay(client.sessionId) || this.npcs.busy(client.sessionId)) return;
    const p = this.state.players.get(client.sessionId), now = Date.now();
    if (!p || p.vehicleId || now < p.knockdownUntil || now < p.moodleSitUntil || now < p.attackReadyAt) return;
    p.simTime = now; p.attackReadyAt = now + C.ATTACK_COOLDOWN_MS;
    for (const [target, other] of this.state.players) if (target !== client.sessionId && !other.vehicleId && C.inHitCone(p, other, this.world)) {
      if (this.hit(target, { from: client.sessionId, ix: Math.sin(p.rotY) * 8, iy: 1.5, iz: Math.cos(p.rotY) * 8,
        knockdown: true, durationMs: C.ATTACK_KNOCKDOWN_MS }, "punch"))
        this.bump(client.sessionId, target, other.x, other.y + 0.9, other.z);
    }
  }
  private tick() {
    const now = this.state.serverTime = Date.now(), vehicleHit = this.vehicleHit;
    this.rounds.tick(now);
    const trafficDt = (now - this.trafficTime) / 1000;
    this.trafficTime = now;
    if ((this.state.phase === C.RoomPhase.Running && this.state.introComplete) || (this.state.devMode && this.state.phase === C.RoomPhase.Lobby)) {
      const exposed = new Set([...this.state.players.values()].map(p => p.vehicleId).filter(Boolean));
      const obstacles = [...this.state.vehicles].filter(([id, v]) => v.kind !== 4 && v.kind !== 2 && v.kind !== C.LIME_KIND && now >= v.fallenUntil &&
        (C.isPassengerVehicle(v) || !exposed.has(id)))
        .map(([,v]) => v)
        .map(p => ({ x: p.x, y: p.y, z: p.z, rotY: p.rotY, speed: 0 }));
      this.traffic.tick(trafficDt, obstacles, vehicleHit, id => this.rounds.canPlay(id) && !this.npcs.busy(id), (id, from, car) => {
        const ridden = [...this.state.players.values()].some(p => p.vehicleId === id);
        this.vehicles.runOver(id, now, vehicleHit, car.speed, { from, rotY: car.rotY, kind: 3 });
        if (!ridden) this.bump(from, id, car.x, car.y + .6, car.z);
      });
    }
    this.publiBikes.tick(now);
    this.mate.tick(now);
    this.npcs.tick(now);
    if (this.state.phase !== C.RoomPhase.Running || !this.state.introComplete) return;
    this.moodle.tick(now);
    const positions = new Map([...this.state.players].map(([id, p]) => [id, this.correction(p)]));
    for (const p of this.state.players.values()) {
      p.simTime = now;
      if (p.anim === 3 && now >= p.knockdownUntil)
        p.anim = !p.grounded ? 2 : Math.hypot(p.vx, p.vz) > 0.2 ? 1 : 0;
    }
    this.vehicles.tick(now, vehicleHit);
    this.vehicles.bikeContacts(now, vehicleHit);
    // Docked bikes and bikes currently being scanned remain held in place.
    this.physics.sync(this.state.players, this.state.vehicles, new Set([...this.state.publiBikes]
      .filter(([, bike]) => bike.dock >= 0 || !!bike.reservedBy).map(([id]) => id)));
    this.vehicles.contacts(now, vehicleHit, (a, b) => this.physics.intersects(a, b));
    const entries = [...this.state.players];
    for (let pass = 0; pass < 4; pass++) for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      const [aId, a] = entries[i], [bId, b] = entries[j];
      if (a.vehicleId || b.vehicleId || this.npcs.busy(aId) || this.npcs.busy(bId) || (pass === 0 && !this.physics.intersects(aId, bId))) continue;
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
  private createNpcs() {
    return new NpcEncounters(this.state, this.world, (id, point) => {
      const p = this.state.players.get(id); if (!p) return;
      Object.assign(p, point, { vx: 0, vy: 0, vz: 0, grounded: true, anim: 0, simTime: Date.now() });
      this.lastMoves.set(id, p.simTime);
      this.clients.find(c => c.sessionId === id)?.send("playerCorrection", this.correction(p));
    }, client => this.vehicles.exit(client));
  }
}
