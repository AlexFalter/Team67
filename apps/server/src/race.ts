import { Room, type Client } from "colyseus";
import { performance } from "node:perf_hooks";
import * as C from "@race/shared";
import { Player, RaceState } from "./state.ts";
import { VehicleManager } from "./vehicles.ts";
interface Entry {
  id: string;
  player: Player;
  client: Client;
  lastMove: number;
  index: number;
}
export class Race extends Room<{ state: RaceState }> {
  maxClients = 40;
  state = new RaceState();
  private entries: Entry[] = [];
  private slots: boolean[] = Array(40).fill(false);
  private cooldown = new Float64Array(1600);
  private contact = C.createContact();
  private hit: C.Impulse = { from: "", ix: 0, iy: 0, iz: 0, knockdown: false };
  private bump: C.Bump = { a: "", b: "", x: 0, y: 0, z: 0, t: 0 };
  private ticks = 0;
  private duration = 0;
  private collisions = 0;
  private reportAt = Date.now();
  private vehicles!: VehicleManager;
  private world =
    process.env.GAME_WORLD === "flat" ? C.flatWorld : C.zurichWorld;
  private vehicleHit = (
    driver: string,
    target: string,
    x: number,
    y: number,
    z: number,
    ix: number,
    iy: number,
    iz: number,
    knockdown: boolean,
  ) => {
    const entry = this.entries.find((e) => e.id === target);
    if (!entry) return;
    this.hit.from = driver;
    this.hit.ix = ix;
    this.hit.iy = iy;
    this.hit.iz = iz;
    this.hit.knockdown = knockdown;
    entry.client.send("impulse", this.hit);
    this.bump.a = driver;
    this.bump.b = target;
    this.bump.x = x;
    this.bump.y = y;
    this.bump.z = z;
    this.bump.t = this.state.serverTime;
    this.broadcast("bump", this.bump);
    this.collisions++;
  };
  onCreate() {
    this.vehicles = new VehicleManager(this.state, this.world);
    this.state.serverTime = Date.now();
    this.setPatchRate(1000 / C.SERVER_PATCH_RATE);
    this.onMessage("move", (client, data: unknown) => this.move(client, data));
    this.onMessage("vehicleEnter", (client, data: unknown) =>
      this.vehicles.enter(client, data),
    );
    this.onMessage("vehicleExit", (client) => this.vehicles.exit(client));
    this.onMessage("vehicleMove", (client, data: unknown) =>
      this.vehicles.move(client, data),
    );
    this.onMessage("ping", (client, data: unknown) => {
      const t = (data as C.Ping)?.clientTime;
      if (Number.isFinite(t))
        client.send("pong", { clientTime: t, serverTime: Date.now() });
    });
    this.setSimulationInterval(() => this.tick(), 1000 / C.COLLISION_TICK_RATE);
  }
  onJoin(client: Client) {
    const player = new Player();
    Object.assign(player, C.spawnPoint(this.world));
    player.color = `hsl(${Math.floor(Math.random() * 360)}, 85%, 65%)`;
    const index = this.slots.indexOf(false);
    this.slots[index] = true;
    this.entries.push({
      id: client.sessionId,
      player,
      client,
      lastMove: Date.now(),
      index,
    });
    this.state.players.set(client.sessionId, player);
    console.log(`join ${client.sessionId} (${this.entries.length})`);
  }
  onLeave(client: Client) {
    this.vehicles.disconnect(client.sessionId);
    const i = this.entries.findIndex((e) => e.id === client.sessionId);
    if (i >= 0) {
      const slot = this.entries[i].index;
      this.slots[slot] = false;
      for (let j = 0; j < 40; j++) {
        this.cooldown[slot * 40 + j] = 0;
        this.cooldown[j * 40 + slot] = 0;
      }
      this.entries.splice(i, 1);
    }
    this.state.players.delete(client.sessionId);
    console.log(`leave ${client.sessionId} (${this.entries.length})`);
  }
  private move(client: Client, data: unknown) {
    if (
      !Array.isArray(data) ||
      data.length !== 8 ||
      !data.every((v) => typeof v === "number" && Number.isFinite(v))
    )
      return;
    const entry = this.entries.find((e) => e.id === client.sessionId);
    if (!entry || entry.player.vehicleId) return;
    const p = entry.player,
      now = Date.now(),
      dt = Math.max(0.001, (now - entry.lastMove) / 1000);
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
    p.anim = Math.max(0, Math.min(3, Math.floor(data[7])));
    entry.lastMove = now;
  }
  private tick() {
    const start = performance.now(),
      now = Date.now();
    this.state.serverTime = now;
    this.vehicles.tick(now, this.vehicleHit);
    const es = this.entries,
      o = this.contact,
      h = this.hit,
      bump = this.bump;
    for (let i = 0; i < es.length; i++)
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i],
          b = es[j],
          key = Math.min(a.index, b.index) * 40 + Math.max(a.index, b.index);
        if (
          a.player.vehicleId ||
          b.player.vehicleId ||
          now - this.cooldown[key] < C.PAIR_COOLDOWN_MS ||
          now - a.lastMove > 500 ||
          now - b.lastMove > 500
        )
          continue;
        if (!C.collisionImpulses(a.player, b.player, o)) continue;
        this.cooldown[key] = now;
        this.collisions++;
        h.from = b.id;
        h.ix = o.ax;
        h.iy = o.ay;
        h.iz = o.az;
        h.knockdown = o.knockA;
        a.client.send("impulse", h);
        h.from = a.id;
        h.ix = o.bx;
        h.iy = o.by;
        h.iz = o.bz;
        h.knockdown = o.knockB;
        b.client.send("impulse", h);
        bump.a = a.id;
        bump.b = b.id;
        bump.x = (a.player.x + b.player.x) / 2;
        bump.y = (a.player.y + b.player.y) / 2 + C.CAPSULE_HEIGHT / 2;
        bump.z = (a.player.z + b.player.z) / 2;
        bump.t = now;
        this.broadcast("bump", bump);
      }
    this.ticks++;
    this.duration += performance.now() - start;
    if (now - this.reportAt >= 10000) {
      console.log(
        `players=${es.length} collision-tick=${(this.duration / this.ticks).toFixed(3)}ms collisions/s=${((this.collisions * 1000) / (now - this.reportAt)).toFixed(1)}`,
      );
      this.reportAt = now;
      this.ticks = this.duration = this.collisions = 0;
    }
  }
}
