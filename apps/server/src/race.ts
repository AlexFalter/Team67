import { Room, type Client } from "colyseus";
import * as C from "@race/shared";
import { Player, RaceState } from "./state.ts";
import { VehicleManager } from "./vehicles.ts";
import { ContactWorld } from "./physics.ts";
import { PeelManager } from "./peels.ts";
// The prototype runs one server process. Reserve synchronously before async
// physics initialization so two simultaneous creates cannot claim one code.
const codes = new Set<string>();

export class Race extends Room<{ state: RaceState; input: C.MoveInput }> {
  maxClients = 40;
  state = new RaceState();
  inputs = this.defineInput(C.MoveInput, { bufferMaxSize: 32,
    sanitize: (cmd) => {
      cmd.x = Number.isFinite(cmd.x) ? Math.max(-1, Math.min(1, cmd.x)) : 0;
      cmd.z = Number.isFinite(cmd.z) ? Math.max(-1, Math.min(1, cmd.z)) : 0;
      cmd.facing = Number.isFinite(cmd.facing) ? Math.atan2(Math.sin(cmd.facing), Math.cos(cmd.facing)) : 0;
    },
  });
  private world = process.env.GAME_WORLD === "flat" ? C.flatWorld : C.zurichWorld;
  private contact = C.createContact();
  private physics!: ContactWorld;
  private vehicles!: VehicleManager;
  private peels = new PeelManager(this.state, this.world);
  private rewind = this.allowRewindState({ maxRewindMs: 250 });
  private code?: string;
  async onCreate(options: { code?: unknown } = {}) {
    if (options.code !== undefined) {
      const code = C.roomCode(options.code);
      if (codes.has(code)) throw new Error("That code is already in use. Join it or choose another.");
      codes.add(code); this.code = code; this.roomId = code;
    }
    this.physics = await ContactWorld.create(this.world);
    this.vehicles = new VehicleManager(this.state, this.world);
    this.rewind.attachAll(this.state.players, { fields: ["x", "y", "z"] });
    this.setPatchRate(1000 / C.SERVER_PATCH_RATE);
    this.onMessage("vehicleEnter", (client, data: unknown) => this.vehicles.enter(client, data, this.clock.elapsedTime));
    this.onMessage("vehicleExit", (client) => this.vehicles.exit(client));
    this.setFixedTimestep(({ dt }) => this.tick(dt), C.COLLISION_TICK_RATE);
  }
  onJoin(client: Client, options: { character?: unknown } = {}) {
    const index = this.state.players.size;
    this.state.players.set(client.sessionId, new Player({
      ...(this.world.name === "flat" ? { x: (index % 5 - 2) * 2, y: 0, z: Math.floor(index / 5) * 2 } : C.spawnPoint(this.world)),
      color: `hsl(${Math.floor(Math.random() * 360)}, 85%, 65%)`,
      character: options.character === 1 || options.character === 2 ? options.character : 0,
    }));
  }
  onLeave(client: Client) {
    this.vehicles.disconnect(client.sessionId);
    this.state.players.delete(client.sessionId);
  }
  onDispose() { this.physics?.dispose(); if (this.code) codes.delete(this.code); }
  private hit(target: string, hit: C.Impulse) {
    const p = this.state.players.get(target);
    if (p) C.applyImpulse(p, hit, p.simTime);
  }
  private bump(a: string, b: string, x: number, y: number, z: number) {
    this.broadcast("bump", { a, b, x, y, z, t: this.state.serverTime } satisfies C.Bump);
  }
  private tick(dt: number) {
    const now = this.state.serverTime = this.clock.elapsedTime;
    const vehicleHit: Parameters<VehicleManager["tick"]>[1] = (from, target, x, y, z, ix, iy, iz, knockdown) => {
      this.hit(target, { from, ix, iy, iz, knockdown, durationMs: 2500 });
      this.bump(from, target, x, y, z);
    };
    const positions = new Map([...this.state.players].map(([id, p]) => [id, { x: p.x, z: p.z }]));
    for (const [id, p] of this.state.players) {
      const cmd = this.inputs.get(id).next();
      const attack = p.attackReadyAt;
      const peel = p.peelReadyAt;
      const impact = C.stepPlayer(p, cmd ?? C.IDLE_INPUT, dt, this.world) ?? 0;
      this.vehicles.syncDriver(id);
      if (p.vehicleKind === 2 && impact >= C.CART_MIN_HIT_SPEED) this.vehicles.crashBike(p.vehicleId, now, vehicleHit, impact);
      if (p.peelReadyAt !== peel) this.peels.drop(id, !!cmd?.throwBanana, now);
      if (p.attackReadyAt !== attack) {
        const seen = this.rewind.lastSeenBy(id);
        for (const [target, other] of this.state.players) if (target !== id && !other.vehicleId &&
          C.inHitCone(p, seen.read(other, ["x", "y", "z"]), this.world)) {
          this.hit(target, { from: id, ix: Math.sin(p.rotY) * 8, iy: 1.5, iz: Math.cos(p.rotY) * 8,
            knockdown: true, durationMs: C.ATTACK_KNOCKDOWN_MS });
          this.bump(id, target, other.x, other.y + 0.9, other.z);
        }
      }
    }
    this.vehicles.tick(now, vehicleHit);
    this.vehicles.bikeContacts(now, vehicleHit);
    this.physics.sync(this.state.players, this.state.vehicles);
    this.vehicles.contacts(now, vehicleHit, (a, b) => this.physics.intersects(a, b));
    this.peels.tick(now, (from, target) => {
      const p = this.state.players.get(target)!;
      this.hit(target, { from, ix: p.vx * 0.7, iy: 1, iz: p.vz * 0.7, knockdown: true, durationMs: C.PEEL_SLIP_MS });
      this.bump(from, target, p.x, p.y, p.z);
    });
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
  }
}
