import { Room, type Client } from "colyseus";
import * as C from "@race/shared";
import { GameState, Player, Result } from "./state.ts";
import { Vehicles } from "./vehicles.ts";

const world = C.zurichWorld;
const codes = new Set<string>(); // one process: reserve codes synchronously so two creates cannot share one
const roundMs = Number(process.env.ROUND_DURATION_MS) > 0 ? Number(process.env.ROUND_DURATION_MS) : C.ROUND_MS;
const HISTORY = 32;
const DELAY_WINDOW = 60; // ~2 s of moves

/** Server-only bookkeeping per session (not synced). */
class Member {
  lastT = 0; // last accepted pose sample time
  lastCorrection = 0;
  punchReadyAt = 0;
  grace = 0; // after the server placed the player (vehicle exit): accept a bigger first step
  // Pose history for lag-compensated punches: ring of [t, x, y, z].
  history = new Float64Array(HISTORY * 4);
  head = 0;
  // Recent (receive time − client sample time): the minimum is this client's least-delayed uplink.
  private delays = new Float64Array(DELAY_WINDOW).fill(Infinity);
  private delayCount = 0;
  constructor(public client: Client) {}
  /** Restamp a client sample onto the server timeline: precise spacing, minimal added latency. */
  restamp(t: number, now: number) {
    this.delays[this.delayCount++ % DELAY_WINDOW] = now - t;
    let min = Infinity;
    for (let i = 0; i < DELAY_WINDOW; i++) min = Math.min(min, this.delays[i]);
    return t + Math.max(0, min);
  }
  record(t: number, x: number, y: number, z: number) {
    const i = (this.head++ % HISTORY) * 4;
    this.history[i] = t; this.history[i + 1] = x; this.history[i + 2] = y; this.history[i + 3] = z;
  }
  /** Position at time t (linear between samples, clamped to the recorded window). */
  at(t: number, out: C.Point) {
    let before = -1, after = -1;
    for (let k = 0; k < Math.min(this.head, HISTORY); k++) {
      const ti = this.history[k * 4];
      if (ti <= t && (before < 0 || ti > this.history[before * 4])) before = k;
      if (ti > t && (after < 0 || ti < this.history[after * 4])) after = k;
    }
    const a = before >= 0 ? before : after, b = after >= 0 ? after : before;
    if (a < 0) return false;
    const ta = this.history[a * 4], tb = this.history[b * 4], f = tb > ta ? (t - ta) / (tb - ta) : 0;
    out.x = this.history[a * 4 + 1] + (this.history[b * 4 + 1] - this.history[a * 4 + 1]) * f;
    out.y = this.history[a * 4 + 2] + (this.history[b * 4 + 2] - this.history[a * 4 + 2]) * f;
    out.z = this.history[a * 4 + 3] + (this.history[b * 4 + 3] - this.history[a * 4 + 3]) * f;
    return true;
  }
}

interface Score { name: string; hits: number; taken: number }

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = C.MAX_PLAYERS;
  state = new GameState();
  private members = new Map<string, Member>();
  private scores = new Map<string, Score>();
  private code?: string;
  private probe = { x: 0, y: 0, z: 0 };
  private vehicles = new Vehicles(this);

  onCreate(options: { code?: unknown } = {}) {
    if (options.code !== undefined) {
      const code = C.roomCode(options.code);
      if (codes.has(code)) throw new Error("That room code is taken. Join it or pick another.");
      codes.add(code);
      this.code = code;
      this.roomId = code;
    }
    this.state.trafficStart = Date.now();
    this.setPatchRate(1000 / C.PATCH_HZ);
    this.setSimulationInterval(() => this.tick(), 1000 / C.TICK_HZ);
    this.onMessage(C.PING, (client, t: unknown) => {
      if (typeof t === "number") client.send(C.PONG, [t, Date.now()]);
    });
    this.onMessage(C.MOVE, (client, m: unknown) => this.move(client, m));
    this.onMessage(C.PUNCH, (client, m: unknown) => this.punch(client, m));
    this.onMessage(C.ENTER, (client, vehicleId: unknown) => {
      const p = this.playing(client.sessionId);
      if (p) this.vehicles.enter(client.sessionId, p, vehicleId, Date.now());
    });
    this.onMessage(C.EXIT, client => {
      const p = this.playing(client.sessionId);
      if (p?.vehicle) this.vehicles.exit(client.sessionId, p, Date.now());
    });
    this.onMessage(C.CRASH, client => {
      const p = this.playing(client.sessionId);
      if (p?.vehicle) this.vehicles.crash(client.sessionId, p, Date.now());
    });
    this.onMessage(C.SHOES, client => {
      const p = this.playing(client.sessionId);
      if (p) p.shoes = !p.shoes;
    });
    this.onMessage(C.READY, (client, ready: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (this.state.phase !== C.LOBBY || !p || typeof ready !== "boolean") return;
      p.ready = ready;
      this.startIfReady();
    });
    this.onMessage(C.END_ROUND, client => {
      if (client.sessionId === this.state.host) this.finish();
    });
    this.onMessage(C.TO_LOBBY, client => {
      if (client.sessionId === this.state.host && this.state.phase === C.FINISHED) this.toLobby();
    });
  }

  onJoin(client: Client, options: { name?: unknown; character?: unknown } = {}) {
    const name = C.playerName(options.name); // throws → join rejected
    const character = options.character === 1 || options.character === 2 ? options.character : 0;
    this.members.set(client.sessionId, new Member(client));
    this.state.players.set(client.sessionId, new Player({
      name, character, hue: Math.floor(Math.random() * 360), waiting: this.state.phase !== C.LOBBY,
    }));
    if (!this.state.host) this.state.host = client.sessionId;
  }

  onLeave(client: Client) {
    const id = client.sessionId, p = this.state.players.get(id);
    if (p?.vehicle) this.vehicles.disconnect(id, p, Date.now());
    this.state.players.delete(id);
    this.members.delete(id);
    if (this.state.host === id) this.state.host = this.state.players.keys().next().value ?? "";
    if (this.state.phase === C.LOBBY) this.startIfReady();
    else if (this.state.phase === C.RUNNING && ![...this.state.players.values()].some(p => !p.waiting)) this.finish();
  }

  onDispose() {
    if (this.code) codes.delete(this.code);
  }

  /** The player if this session may act in the running round. */
  private playing(id: string) {
    const p = this.state.players.get(id);
    return this.state.phase === C.RUNNING && p && !p.waiting ? p : undefined;
  }

  private startIfReady() {
    const players = [...this.state.players];
    if (!players.length || players.some(([, p]) => !p.ready)) return;
    const now = Date.now();
    this.scores.clear();
    this.state.results.clear();
    for (const [id, p] of players) {
      const spawn = C.spawnPoint(world), m = this.members.get(id)!;
      Object.assign(p, { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0, t: now, anim: 0, downUntil: 0, shoes: false, vehicle: "", seat: -1 });
      m.lastT = now;
      m.head = 0;
      m.punchReadyAt = 0;
      this.scores.set(id, { name: p.name, hits: 0, taken: 0 });
    }
    // Traffic starts mid-route (heading to ETH), a minute away from the spawn square.
    this.state.trafficStart = now - (world.routeLength / 2 / C.TRAFFIC_SPEED) * 1000;
    this.vehicles.reset(now);
    this.state.endsAt = now + roundMs;
    this.state.phase = C.RUNNING;
  }

  private finish() {
    if (this.state.phase !== C.RUNNING) return;
    this.state.phase = C.FINISHED;
    const rows = C.rankResults([...this.scores.values()]);
    for (const r of rows) this.state.results.push(new Result(r));
  }

  private toLobby() {
    this.state.phase = C.LOBBY;
    this.state.results.clear();
    for (const p of this.state.players.values()) { p.ready = false; p.waiting = false; }
  }

  /** Rate-limited: point the client back at its last accepted pose (or its vehicle's). */
  private correct(id: string, p: Player) {
    const m = this.members.get(id)!, now = Date.now(), v = this.state.vehicles.get(p.vehicle);
    if (now - m.lastCorrection < 500) return;
    m.lastCorrection = now;
    m.client.send(C.CORRECT, v ? [v.x, v.y, v.z, 0, 0, 0] : [p.x, p.y, p.z, 0, 0, 0]);
  }

  notice(id: string, text: string) {
    this.members.get(id)?.client.send(C.NOTICE, text);
  }

  release(id: string, x: number, y: number, z: number) {
    const p = this.state.players.get(id), m = this.members.get(id);
    if (!p || !m) return;
    p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0;
    p.t = Math.max(p.t, Date.now());
    m.grace = Date.now() + 1500;
    m.client.send(C.CORRECT, [x, y, z, 0, 0, 0, 1]); // 1: you are on foot now
  }

  private move(client: Client, msg: unknown) {
    const id = client.sessionId, p = this.playing(id), m = this.members.get(id);
    if (!p || !m || !Array.isArray(msg) || msg.length !== 9) return;
    for (const v of msg) if (typeof v !== "number" || !Number.isFinite(v)) return;
    const [t, x, y, z, yaw, vx, vy, vz, anim] = msg as C.Move, now = Date.now();
    if (t <= m.lastT || t > now + 1000 || t < now - 3000) return; // out of order or nonsense clock
    const dt = Math.min(0.5, (t - m.lastT) / 1000);
    if (p.vehicle) {
      if (!this.vehicles.drive(id, p, msg as C.Move, m.restamp(t, now), dt)) return this.correct(id, p);
      m.lastT = t;
      return;
    }
    const g = world.height(x, z), slack = now < m.grace ? 8 : 1;
    const ok =
      Math.hypot(x - p.x, z - p.z) <= C.MAX_SPEED * dt + slack && // speed (with slack for jitter)
      Math.abs(y - p.y) <= 30 * dt + 1 &&
      !Number.isNaN(g) && y >= g - 0.3 && // on or above the ground
      !world.blocked(x, Math.max(y, g), z, C.RADIUS * 0.8, C.HEIGHT); // not inside a building
    if (!ok) return this.correct(id, p);
    m.lastT = t;
    const stamped = m.restamp(t, now);
    m.record(stamped, x, y, z);
    p.x = x; p.y = y; p.z = z; p.yaw = yaw;
    p.vx = Math.max(-C.MAX_SPEED, Math.min(C.MAX_SPEED, vx));
    p.vy = Math.max(-60, Math.min(60, vy));
    p.vz = Math.max(-C.MAX_SPEED, Math.min(C.MAX_SPEED, vz));
    p.t = stamped;
    p.anim = now < p.downUntil ? C.ANIM_DOWN : Math.max(0, Math.min(3, anim | 0));
  }

  /** Punch: [yaw, viewTime]. Targets are tested where the attacker saw them (lag compensation). */
  private punch(client: Client, msg: unknown) {
    const id = client.sessionId, p = this.playing(id), m = this.members.get(id);
    if (!p || !m || p.vehicle || !Array.isArray(msg) || typeof msg[0] !== "number" || typeof msg[1] !== "number") return;
    const now = Date.now();
    if (now < m.punchReadyAt || now < p.downUntil) return;
    m.punchReadyAt = now + C.PUNCH_COOLDOWN_MS;
    p.yaw = msg[0];
    p.punches = (p.punches + 1) & 255;
    const viewTime = Math.max(now - 500, Math.min(now, msg[1])), at = this.probe, attacker = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    for (const [targetId, o] of this.state.players) {
      if (targetId === id || o.waiting || o.vehicle || now < o.downUntil) continue;
      const tm = this.members.get(targetId)!;
      if (!tm.at(viewTime, at)) { at.x = o.x; at.y = o.y; at.z = o.z; }
      if (!C.inPunchCone(attacker, at, world)) continue;
      this.knockDown(targetId, id, -Math.sin(p.yaw) * C.PUNCH_PUSH, C.PUNCH_LIFT, -Math.cos(p.yaw) * C.PUNCH_PUSH, C.PUNCH_KNOCKDOWN_MS);
    }
  }

  /** Server-owned knockdown: score it, tell the victim to apply the impulse, broadcast the impact. */
  knockDown(targetId: string, fromId: string, ix: number, iy: number, iz: number, ms: number) {
    const o = this.state.players.get(targetId), now = Date.now();
    if (!o) return;
    o.downUntil = now + ms;
    o.anim = C.ANIM_DOWN;
    const victim = this.scores.get(targetId), attacker = this.scores.get(fromId);
    if (victim && fromId !== targetId) victim.taken++; // own bike crashes do not count
    if (attacker && fromId !== targetId) attacker.hits++;
    this.members.get(targetId)?.client.send(C.KNOCK, [ix, iy, iz, ms]);
    this.broadcast(C.HIT, [o.x, o.y + 1, o.z]);
  }

  private tick() {
    const now = Date.now();
    if (this.state.phase !== C.RUNNING) return;
    if (now >= this.state.endsAt) return this.finish();
    this.vehicles.tick(now);
  }
}
