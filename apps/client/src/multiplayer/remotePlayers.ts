import * as THREE from "three";
import {
  type PlayerState,
  type WorldState,
  type VehicleState,
  seatPosition,
  snapshot,
  createBody,
  passengerYaw,
} from "@race/shared";
import { avatar, pose, disposeAvatar } from "./avatar.ts";
interface Snapshot extends PlayerState {
  t: number;
}
interface Remote {
  mesh: THREE.Group;
  snapshots: Snapshot[];
  rendered: PlayerState;
}
export class RemotePlayers {
  players = new Map<string, Remote>();
  constructor(private scene: THREE.Scene) {}
  patch(state: WorldState, localId: string) {
    for (const [id, p] of state.players) {
      if (id === localId) continue;
      let r = this.players.get(id);
      if (!r) {
        r = { mesh: avatar(p.color, p.character), snapshots: [], rendered: snapshot(p, createBody()) };
        this.players.set(id, r);
        this.scene.add(r.mesh);
      }
      const s: Snapshot = {
        x: p.x,
        y: p.y,
        z: p.z,
        rotY: p.rotY,
        vx: p.vx,
        vy: p.vy,
        vz: p.vz,
        anim: p.anim,
        color: p.color,
        character: p.character,
        vehicleId: p.vehicleId,
        seat: p.seat,
        grounded: p.grounded,
        groundTime: p.groundTime,
        jumpUntil: p.jumpUntil,
        knockdownUntil: p.knockdownUntil,
        simTime: p.simTime,
        vehicleKind: p.vehicleKind,
        shoes: p.shoes,
        attackReadyAt: p.attackReadyAt,
        mateCount: p.mateCount,
        mateBoostMs: p.mateBoostMs,
        t: state.serverTime,
      };
      if (r.snapshots.at(-1)?.t === s.t)
        r.snapshots[r.snapshots.length - 1] = s;
      else r.snapshots.push(s);
      while (r.snapshots.length > 2 && r.snapshots[1].t < s.t - 1000)
        r.snapshots.shift();
    }
    for (const [id, r] of this.players)
      if (!state.players.has(id)) {
        disposeAvatar(r.mesh);
        this.players.delete(id);
      }
  }
  render(
    t: number,
    vehicles?: ReadonlyMap<string, { rendered: VehicleState }>,
    dt = 1 / 60,
  ) {
    for (const r of this.players.values()) {
      const ss = r.snapshots;
      let a = ss[0],
        b = a;
      for (let i = 1; i < ss.length; i++) {
        b = ss[i];
        if (b.t >= t) break;
        a = b;
      }
      const f =
        a === b ? 0 : THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
      const p = r.rendered;
      for (const key of ["x", "y", "z", "vx", "vy", "vz"] as const)
        p[key] = a[key] + (b[key] - a[key]) * f;
      p.rotY =
        a.rotY +
        Math.atan2(Math.sin(b.rotY - a.rotY), Math.cos(b.rotY - a.rotY)) * f;
      p.anim = f < 0.5 ? a.anim : b.anim;
      p.shoes = (f < 1 ? a : b).shoes;
      p.attackReadyAt = (f < 1 ? a : b).attackReadyAt;
      p.simTime = a.simTime + (b.simTime - a.simTime) * f;
      const membership = f < 1 ? a : b;
      p.vehicleId = membership.vehicleId;
      p.seat = membership.seat;
      p.vehicleKind = membership.vehicleKind;
      p.grounded = membership.grounded;
      p.knockdownUntil = membership.knockdownUntil;
      const vehicle = vehicles?.get(p.vehicleId);
      if (vehicle) {
        seatPosition(vehicle.rendered, p.seat, p);
        p.rotY = passengerYaw(vehicle.rendered, p.seat);
        p.anim = 0;
      }
      pose(r.mesh, p, dt);
    }
  }
  dispose() { for (const r of this.players.values()) disposeAvatar(r.mesh); this.players.clear(); }
}
