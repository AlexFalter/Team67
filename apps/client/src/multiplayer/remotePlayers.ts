import { limeTailwhipPose } from "@race/shared";
import * as THREE from "three";
import {
  type PlayerState,
  type WorldState,
  type VehicleState,
  seatPosition, cabinPosition, POLYBAHN_KIND,
  snapshot,
  createBody,
  passengerYaw,
} from "@race/shared";
import { decoratePlayer } from "./playerIdentity.ts";
import { avatar, pose, alignCabinAvatar, disposeAvatar } from "./avatar.ts";
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
      decoratePlayer(r.mesh, state.members.get(id)?.name ?? "Player", true);
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
        examSheltered: p.examSheltered,
        vehicleId: p.vehicleId,
        seat: p.seat,
        cabinStanding: p.cabinStanding, cabinX: p.cabinX, cabinZ: p.cabinZ, cabinYaw: p.cabinYaw,
        grounded: p.grounded,
        groundTime: p.groundTime,
        jumpUntil: p.jumpUntil,
        knockdownUntil: p.knockdownUntil,
        impactStartedAt: p.impactStartedAt, impactX: p.impactX, impactZ: p.impactZ, impactStrength: p.impactStrength,
        simTime: p.simTime,
        vehicleKind: p.vehicleKind,
        attackReadyAt: p.attackReadyAt,
        mateCount: p.mateCount,
        mateBoostMs: p.mateBoostMs, mateFlavor: p.mateFlavor, mateDrinkStartedAt: p.mateDrinkStartedAt,
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
      p.attackReadyAt = (f < 1 ? a : b).attackReadyAt;
      p.simTime = a.simTime + (b.simTime - a.simTime) * f;
      const membership = f < 1 ? a : b;
      p.mateBoostMs = membership.mateBoostMs; p.mateFlavor = membership.mateFlavor; p.mateDrinkStartedAt = membership.mateDrinkStartedAt;
      p.vehicleId = membership.vehicleId;
      p.seat = membership.seat;
      p.cabinStanding = membership.cabinStanding;
      p.cabinX = (a.cabinX ?? 0) + ((b.cabinX ?? 0) - (a.cabinX ?? 0)) * f;
      p.cabinZ = (a.cabinZ ?? 0) + ((b.cabinZ ?? 0) - (a.cabinZ ?? 0)) * f;
      p.cabinYaw = (a.cabinYaw ?? 0) + Math.atan2(Math.sin((b.cabinYaw ?? 0)-(a.cabinYaw ?? 0)), Math.cos((b.cabinYaw ?? 0)-(a.cabinYaw ?? 0))) * f;
      p.vehicleKind = membership.vehicleKind;
      p.grounded = membership.grounded;
      p.knockdownUntil = membership.knockdownUntil;
      p.impactStartedAt = membership.impactStartedAt; p.impactX = membership.impactX;
      p.impactZ = membership.impactZ; p.impactStrength = membership.impactStrength;
      p.examSheltered = membership.examSheltered;
      const vehicle = vehicles?.get(p.vehicleId);
      if (vehicle && p.cabinStanding && vehicle.rendered.kind === POLYBAHN_KIND) {
        cabinPosition(vehicle.rendered, p);
      } else if (vehicle) {
        seatPosition(vehicle.rendered, p.seat, p);
        p.rotY = passengerYaw(vehicle.rendered, p.seat);
        p.anim = 0;
      }
      pose(r.mesh, p, dt);
      alignCabinAvatar(r.mesh, p, vehicle?.rendered);
      r.mesh.position.y += limeTailwhipPose(vehicle?.rendered, t).height;
      r.mesh.visible = !membership.examSheltered;
    }
  }
  dispose() { for (const r of this.players.values()) disposeAvatar(r.mesh); this.players.clear(); }
}
