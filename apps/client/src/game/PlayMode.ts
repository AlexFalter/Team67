import { Color } from "three";
import * as C from "@race/shared";
import type { Engine, Mode } from "../engine/Engine";
import type { Net, StateView } from "../net/Net";
import { Avatars, Rig, type AvatarState } from "./avatars";
import { CameraRig, FAR, VIEWS } from "./camera";
import { Hud } from "./hud";
import { Input } from "./input";
import { LocalPlayer } from "./LocalPlayer";
import { Remotes, type Remote } from "./remotes";
import { Vehicles, type VehicleView } from "./vehicles";

export interface Settings { sensitivity: number; bob: boolean }

/** What React shows around the game. Emitted only when it changes. */
export interface RoomInfo {
  code: string;
  phase: C.Phase;
  me: string;
  host: string;
  active: boolean; // I have an entity in the running round
  players: { id: string; name: string; ready: boolean; waiting: boolean }[];
  results: { name: string; hits: number; taken: number }[];
}

const world = C.zurichWorld;

/** Playing on the map, offline (practice) or in a room. */
export class PlayMode implements Mode {
  readonly input: Input;
  readonly hud: Hud;
  readonly camera: CameraRig;
  readonly avatars: Avatars;
  readonly local: LocalPlayer;
  readonly remotes = new Remotes();
  readonly vehicles: Vehicles;
  private myVehicle = ""; // vehicle id I am in (from the server)
  private crashSent = false;
  private rig = new Rig();
  private me: AvatarState = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, anim: 0, riding: -1, shoes: false, character: 0, color: new Color("#ffcc33") };
  private active: boolean;
  private nextPunch = 0;
  private nextSend = 0;
  private hudTime = 0;
  private eye = C.EYE_HEIGHT;
  private move: C.Move = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  private corrections = 0;
  private correctionRate = 0;
  private infoKey = "";
  private orbit = 0;
  private unsubscribe: (() => void)[] = [];
  /** Server time remote entities are drawn at this frame. */
  renderTime = 0;

  constructor(private engine: Engine, hudRoot: HTMLElement, settings: Settings, onLock: (locked: boolean) => void,
    private net?: Net, private onRoom?: (info: RoomInfo) => void) {
    const spawn = C.spawnPoint(world);
    this.input = new Input(engine.renderer.domElement);
    this.input.onLockChange = onLock;
    this.hud = new Hud(hudRoot);
    this.camera = new CameraRig(engine.camera, engine.colliders, world);
    engine.setFog(FAR * 0.3, FAR);
    this.avatars = new Avatars(engine.scene);
    this.vehicles = new Vehicles(engine.scene);
    this.local = new LocalPlayer(world, spawn.x, spawn.y, spawn.z);
    this.local.afterTick = b => {
      for (const r of this.remotes.all.values())
        if (r.visible && !r.vehicle && r.buffer.size) C.separate(b, r.pose.x, r.pose.y, r.pose.z, world);
    };
    this.active = !net;
    this.apply(settings);
    if (net) this.listen(net);
    if (import.meta.env.DEV) (window as unknown as { play?: PlayMode }).play = this; // test hook
  }

  apply(settings: Settings) {
    this.input.sensitivity = settings.sensitivity;
    this.camera.bob = settings.bob;
  }

  private listen(net: Net) {
    const room = net.room, onState = (state: StateView) => this.patch(state);
    room.onStateChange(onState);
    if (room.state?.players) this.patch(room.state);
    this.unsubscribe.push(() => room.onStateChange.remove(onState));
    this.unsubscribe.push(room.onMessage<number[]>(C.CORRECT, ([x, y, z, vx, vy, vz, onFoot]) => {
      if (!this.active) return;
      if (onFoot && this.myVehicle) this.boardChange(room.state, ""); // may arrive before the patch
      this.local.correct(x, y, z, vx, vy, vz);
      this.corrections++;
    }));
    this.unsubscribe.push(room.onMessage<number[]>(C.KNOCK, ([ix, iy, iz, ms]) => {
      if (!this.active) return;
      C.knock(this.local.body, ix, iy, iz, ms);
      this.hud.notice("Knocked down!", 1500);
    }));
    this.unsubscribe.push(room.onMessage<number[]>(C.HIT, ([x, y, z]) => {
      const b = this.local.body;
      if (this.rig.punch < 0.6 && Math.hypot(x - b.x, y - 1 - b.y, z - b.z) < C.PUNCH_RANGE + 2) this.hud.notice("Hit!", 800);
    }));
    this.unsubscribe.push(room.onMessage<string>(C.NOTICE, text => this.hud.notice(text)));
  }

  private patch(state: StateView) {
    const net = this.net!, mine = state.players.get(net.id);
    this.remotes.ingest(state, net.id, net.clock.now());
    this.vehicles.ingest(state);
    const active = state.phase === C.RUNNING && !!mine && !mine.waiting;
    if (active && !this.active && mine) {
      // Round start: the server placed everyone at a spawn point.
      this.local.place(mine.x, mine.y, mine.z);
      this.local.snapRender();
      this.local.body.down = 0;
      this.local.body.shoes = false;
      this.remotes.clear();
      this.vehicles.clear();
      this.nextPunch = 0;
      this.local.drive(undefined);
      this.myVehicle = "";
    }
    if (active && mine && mine.vehicle !== this.myVehicle) this.boardChange(state, mine.vehicle);
    if (!active && this.active) this.input.unlock();
    this.active = active;
    if (mine) {
      this.me.character = mine.character;
      this.me.color.setHSL(mine.hue / 360, 0.75, 0.55);
    }
    // Cheap change detection for the React overlay (rare: joins, ready, phase, results).
    let key = `${state.phase}|${state.host}|${active}|${state.results.length}`;
    for (const [id, p] of state.players) key += `|${id}${p.ready ? 1 : 0}${p.waiting ? 1 : 0}${p.name}`;
    if (key !== this.infoKey) {
      this.infoKey = key;
      this.onRoom?.({
        code: net.room.roomId, phase: state.phase, me: net.id, host: state.host, active,
        players: [...state.players].map(([id, p]) => ({ id, name: p.name, ready: p.ready, waiting: p.waiting })),
        results: [...state.results].map(r => ({ name: r.name, hits: r.hits, taken: r.taken })),
      });
    }
  }

  /** The server put me into or took me out of a vehicle. */
  private boardChange(state: StateView, vehicleId: string) {
    const v = state.vehicles.get(vehicleId), local = this.local;
    this.myVehicle = vehicleId;
    this.crashSent = false;
    if (v && (v.kind === C.CART || v.kind === C.BIKE)) {
      local.drive({ kind: v.kind, x: v.x, y: v.y, z: v.z, yaw: v.yaw, vx: 0, vz: 0 });
      this.input.yaw = v.yaw;
    } else {
      // Off a vehicle (or onto the shuttle): stand where we are; the server's exit point follows as a correction.
      const r = local.render, g = world.height(r.x, r.z);
      local.drive(undefined);
      local.place(r.x, Number.isNaN(g) ? r.y : g, r.z);
      local.snapRender();
    }
  }

  frame(dt: number, now: number) {
    const { input, local, hud, net } = this;
    net?.clock.update(dt);
    if (input.cycleView) { input.cycleView = false; this.camera.cycle(); hud.notice(VIEWS[this.camera.view], 1200); }
    if (input.toggleDebug) { input.toggleDebug = false; hud.debug.hidden = !hud.debug.hidden; }
    const b = local.body;
    if (this.active) {
      if (input.shoes) {
        b.shoes = !b.shoes;
        net?.send(C.SHOES);
        hud.notice(b.shoes ? "Running shoes on" : "Running shoes off", 1200);
      }
      if (input.punch && now >= this.nextPunch && b.down <= 0 && !this.myVehicle) {
        this.nextPunch = now + C.PUNCH_COOLDOWN_MS;
        this.rig.punch = 0;
        net?.send(C.PUNCH, [input.yaw, net.clock.now() - this.remotes.delay]);
      }
    }
    const serverNow = net ? net.clock.now() : 0;
    let near: VehicleView | undefined;
    if (this.active && net) {
      near = this.myVehicle ? undefined : this.vehicles.nearest(b.x, b.y, b.z, serverNow);
      if (input.interact) {
        if (this.myVehicle) net.send(C.EXIT);
        else if (near) net.send(C.ENTER, near.id);
      }
    }
    input.punch = input.shoes = input.interact = false;

    this.remotes.adapt(dt);
    const renderTime = this.renderTime = net ? serverNow - this.remotes.delay : 0;
    const riding = this.myVehicle ? this.vehicles.all.get(this.myVehicle) : undefined;
    if (this.active) {
      if (riding?.kind === C.SHUTTLE) {
        // Passenger: placed on the seat of the scheduled shuttle, nothing to simulate or send.
        this.vehicles.update(renderTime, serverNow);
        C.seatPosition(riding.pose, net!.state.players.get(net!.id)?.seat ?? 0, local.render);
        local.place(local.render.x, local.render.y, local.render.z);
      } else {
        local.frame(dt, input.locked ? input : undefined);
        if (local.vehicle?.kind === C.BIKE && local.impact >= C.RUN_OVER_SPEED && !this.crashSent) {
          this.crashSent = true;
          this.send(net!, now);
          net?.send(C.CRASH);
        }
        if (net && now >= this.nextSend) this.send(net, now);
      }
    }
    if (net) {
      this.vehicles.update(renderTime, serverNow, local.vehicle && this.myVehicle ? { id: this.myVehicle, pose: local.vehicleRender } : undefined);
      this.remotes.update(renderTime, this.seat);
    }
    const r = local.render;
    this.avatars.begin();
    if (this.active) {
      if (local.landedSpeed > 0) this.camera.land(local.landedSpeed);
      this.eye += ((b.down > 0 ? 0.45 : riding ? 1.0 : C.EYE_HEIGHT) - this.eye) * (1 - Math.exp(-10 * dt));
      this.camera.update(r.x, r.y, r.z, this.eye, input.yaw, input.pitch, b.grounded ? Math.hypot(b.vx, b.vz) : 0, dt);
      this.engine.focus.copy(r);
      const me = this.me;
      me.x = r.x; me.y = r.y; me.z = r.z; me.yaw = input.yaw;
      me.vx = b.vx; me.vz = b.vz; me.anim = riding ? C.ANIM_IDLE : C.animOf(b); me.shoes = b.shoes;
      me.riding = riding ? riding.kind : -1;
      if (riding) me.yaw = riding.kind === C.SHUTTLE ? riding.pose.yaw : local.vehicleRender.yaw;
      this.avatars.draw(me, this.rig, dt, this.camera.view === 0 ? this.engine.camera : undefined);
    } else this.spectate(dt);
    this.remotes.draw(this.avatars, dt);
    this.avatars.end();

    hud.crosshair.hidden = !this.active || this.camera.view !== 0 || !input.locked;
    hud.tick(now);
    if (now - this.hudTime > 100) {
      this.writeHud(now, renderTime);
      hud.set(hud.prompt, this.active ? this.prompt(near, riding, serverNow) : "");
    }
  }

  private prompt(near: VehicleView | undefined, riding: VehicleView | undefined, serverNow: number) {
    if (riding?.kind === C.SHUTTLE) {
      if (riding.tripStart) return `Riding to ${riding.dir ? "HB" : "ETH"}…`;
      return riding.departAt ? `Departure in ${Math.max(0, Math.ceil((riding.departAt - serverNow) / 1000))} s · E to get off` : "E to get off";
    }
    if (riding) return "E to get off";
    if (!near) return "";
    if (near.kind === C.SHUTTLE) {
      if (near.tripStart) return "The shuttle is on its way";
      let seats = 0;
      for (const p of this.net!.state.players.values()) if (p.vehicle === near.id) seats++;
      return `E to board the shuttle to ${near.dir ? "HB" : "ETH"} (${seats}/${C.SHUTTLE_SEATS})${near.departAt ? ` · leaves in ${Math.max(0, Math.ceil((near.departAt - serverNow) / 1000))} s` : ""}`;
    }
    return near.driver ? "" : `E to ${near.kind === C.BIKE ? "ride the bike" : "drive the cart"}`;
  }

  /** Put a remote rider on their seat. */
  private seat = (r: Remote) => {
    const v = this.vehicles.all.get(r.vehicle);
    if (!v) return false;
    const a = r.avatar;
    C.seatPosition(v.pose, Math.max(0, r.seat), a);
    a.yaw = v.pose.yaw; a.vx = v.pose.vx; a.vz = v.pose.vz;
    a.riding = v.kind;
    return true;
  };

  private send(net: Net, now: number) {
    const b = this.local.body, v = this.local.vehicle, m = this.move;
    this.nextSend = Math.max(this.nextSend + 1000 / C.SEND_HZ, now - 100);
    m[0] = net.clock.now() - this.local.pending * 1000; // server time of the latest tick
    if (v) { // driving: report the vehicle
      m[1] = v.x; m[2] = v.y; m[3] = v.z; m[4] = v.yaw; m[5] = v.vx; m[6] = 0; m[7] = v.vz; m[8] = 0;
    } else {
      m[1] = b.x; m[2] = b.y; m[3] = b.z; m[4] = b.yaw; m[5] = b.vx; m[6] = b.vy; m[7] = b.vz; m[8] = C.animOf(b);
    }
    net.send(C.MOVE, m);
  }

  /** No entity (lobby, results, joined mid-round): slow orbit over the spawn square. */
  private spectate(dt: number) {
    this.orbit += dt * 0.05;
    const s = world.spawn, c = this.engine.camera;
    c.position.set(s.x + Math.cos(this.orbit) * 70, s.y + 35, s.z + Math.sin(this.orbit) * 70);
    c.lookAt(s.x, s.y + 5, s.z);
    this.engine.focus.set(s.x, s.y, s.z);
  }

  private writeHud(now: number, renderTime: number) {
    const { hud, net, local } = this, b = local.body;
    const elapsed = (now - this.hudTime) / 1000;
    this.hudTime = now;
    this.correctionRate += (this.corrections / Math.max(elapsed, 0.001) - this.correctionRate) * 0.3;
    this.corrections = 0;
    const state = net?.state;
    if (this.active && state) {
      const left = Math.max(0, Math.ceil((state.endsAt - net!.clock.now()) / 1000));
      hud.set(hud.timer, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
    } else hud.set(hud.timer, "");
    hud.set(hud.status, !this.active ? "" : [b.shoes ? "Running shoes" : "", b.down > 0 ? `Knocked down ${b.down.toFixed(1)} s` : "", now < this.nextPunch ? "Punch recharging" : ""].filter(Boolean).join(" · "));
    if (hud.debug.hidden) return;
    const s = this.engine.stats;
    let text = `${s.fps.toFixed(0)} fps · ${s.cpuMs.toFixed(1)} ms cpu\n${s.calls} calls · ${(s.triangles / 1e6).toFixed(2)} M tris\n` +
      `pos ${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.z.toFixed(1)} · ${Math.hypot(b.vx, b.vz).toFixed(1)} m/s`;
    if (net) {
      const c = net.clock;
      text += `\nrtt ${c.rtt.toFixed(0)} ms · jitter ${c.jitter.toFixed(1)} ms\nclock offset ${c.offset.toFixed(0)} (target Δ ${(c.target - c.offset).toFixed(1)}) ms` +
        `\ninterp delay ${this.remotes.delay.toFixed(0)} ms · buffer ${this.remotes.depth(renderTime).toFixed(1)} samples · ${this.remotes.all.size} remote\ncorrections ${this.correctionRate.toFixed(2)}/s`;
    }
    hud.set(hud.debug, text);
  }

  /** The connection belongs to the caller; only our listeners are removed. */
  dispose() {
    this.unsubscribe.forEach(u => u());
    this.input.dispose();
    this.avatars.dispose();
    this.vehicles.dispose();
    this.hud.dispose();
  }
}
