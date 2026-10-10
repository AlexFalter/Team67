import { Color } from "three";
import { INTERP_DELAY_MS, PATCH_HZ } from "@race/shared";
import { HOLDING, SampleBuffer, type Pose } from "../net/interp";
import type { StateView } from "../net/Net";
import { Rig, type Avatars, type AvatarState } from "./avatars";

export class Remote {
  readonly buffer = new SampleBuffer();
  readonly rig = new Rig();
  readonly pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
  readonly avatar: AvatarState = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, anim: 0, riding: -1, shoes: false, character: 0, color: new Color() };
  punches = -1;
  vehicle = "";
  seat = -1;
  visible = false;
  holding = false;
}

/**
 * Other players: one sample buffer each, all rendered on one timeline behind the estimated server clock.
 * The delay is INTERP_DELAY_MS on a good connection and grows to cover how late samples actually
 * arrive (latency spikes, `?lag=`), so the buffer never runs dry. It changes slowly (time stretches by
 * at most 10%, relaxes at 2%), which is invisible, unlike extrapolation errors.
 */
export class Remotes {
  readonly all = new Map<string, Remote>();
  /** Current render delay behind the server clock (ms). */
  delay = INTERP_DELAY_MS;
  private lateness = 0; // decaying peak of (now − sample time) on arrival

  /** Called once per state patch; `now` is the estimated server time. */
  ingest(state: StateView, me: string, now: number) {
    for (const [id, p] of state.players) {
      if (id === me) continue;
      let r = this.all.get(id);
      if (!r) { r = new Remote(); this.all.set(id, r); }
      r.visible = !p.waiting && state.phase !== "Lobby";
      if (p.t > 0 && r.buffer.push(p.t, p.x, p.y, p.z, p.vx, p.vy, p.vz, p.yaw))
        this.lateness = Math.max(this.lateness, now - p.t);
      if (r.punches >= 0 && p.punches !== r.punches) r.rig.punch = 0;
      r.punches = p.punches;
      r.vehicle = p.vehicle;
      r.seat = p.seat;
      const a = r.avatar;
      a.anim = p.anim;
      a.shoes = p.shoes;
      a.character = p.character;
      a.color.setHSL(p.hue / 360, 0.75, 0.55);
    }
    for (const id of this.all.keys()) if (!state.players.has(id)) this.all.delete(id);
  }

  /** Reset buffers (new round: everyone teleported to spawn). */
  clear() {
    for (const r of this.all.values()) { r.buffer.clear(); r.punches = -1; }
  }

  /** Adapt the delay: rise quickly (10% time stretch) to the observed lateness, relax slowly (2%). */
  adapt(dt: number) {
    this.lateness = Math.max(0, this.lateness - dt * 10);
    const target = Math.max(INTERP_DELAY_MS, this.lateness + 1000 / PATCH_HZ);
    const diff = target - this.delay;
    this.delay += Math.max(-dt * 20, Math.min(dt * 100, diff));
  }

  /** Evaluate every remote at renderTime. Riders are placed by `seat` (vehicles module). */
  update(renderTime: number, seat?: (r: Remote) => boolean) {
    for (const r of this.all.values()) {
      if (!r.visible) continue;
      r.holding = r.buffer.sample(renderTime, r.pose) === HOLDING;
      const a = r.avatar, p = r.pose;
      a.riding = -1;
      if (r.vehicle && seat?.(r)) continue;
      a.x = p.x; a.y = p.y; a.z = p.z; a.yaw = p.yaw; a.vx = p.vx; a.vz = p.vz;
    }
  }

  draw(avatars: Avatars, dt: number) {
    for (const r of this.all.values()) if (r.visible && r.buffer.size) avatars.draw(r.avatar, r.rig, dt);
  }

  /** Average jitter cushion (samples ahead of the render time), for the debug overlay. */
  depth(renderTime: number) {
    let n = 0, sum = 0;
    for (const r of this.all.values()) if (r.visible && r.buffer.size) { n++; sum += r.buffer.depth(renderTime); }
    return n ? sum / n : 0;
  }
}
