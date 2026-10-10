import * as THREE from "three";
import * as C from "@race/shared";
import type { Network } from "./net.ts";
import type { RemotePlayers } from "./remotePlayers.ts";
import { pose, disposeAvatar } from "./avatar.ts";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";
import { loadBattleBusModel } from "./battleBusModel.ts";

import { BusRideControls } from "./busRideControls.ts";
import { ActivityFeed } from "./activityFeed.ts";

export class BattleBusIntro {
  readonly ready: Promise<void>;
  private ride = new BusRideControls();
  private feed = new ActivityFeed();
  private rideRun = 0;
  private abort = new AbortController();
  private model?: Awaited<ReturnType<typeof loadBattleBusModel>>;
  private overlay = document.querySelector<HTMLElement>("#battle-bus-intro")!;
  private audio = new Audio(`${import.meta.env.BASE_URL}audio/fortnite-battle-bus.mp3`);
  private audioStarted = 0;
  private body = C.createBody();
  private start = new THREE.Vector3(C.BATTLE_BUS_START.x, C.zurichWorld.height(C.BATTLE_BUS_START.x, C.BATTLE_BUS_START.z)!, C.BATTLE_BUS_START.z);
  private heading = C.BATTLE_BUS_HEADING + Math.PI;
  private right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  private forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  private door = this.start.clone().addScaledVector(this.right, -2.7);
  private inside = this.door.clone().addScaledVector(this.right, -0.85);
  private origin = this.door.clone().addScaledVector(this.right, -1.35).addScaledVector(this.forward, -2.6);
  private entry: THREE.CubicBezierCurve3;
  private departure: THREE.CubicBezierCurve3;
  private dropoffs = C.battleBusDropoffs(C.zurichWorld, 40);

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private net: Network, private canvas: HTMLCanvasElement, sensitivity: () => number) {
    const syncRide = () => {
      const run = this.net.room?.state.introStartedAt ?? 0;
      if (run !== this.rideRun) { this.rideRun = run; this.ride.begin(run); this.feed.clear(); }
    };
    canvas.addEventListener("mousemove", e => {
      if (!this.active) return;
      syncRide();
      const elapsed = C.battleBusElapsed(this.net.room.state, this.net.now());
      if (elapsed >= 1.2 && elapsed < 7) this.ride.look(e.movementX, e.movementY, sensitivity());
    }, { signal: this.abort.signal });
    window.addEventListener("keydown", e => {
      if (e.code !== "Space" || e.repeat || !this.active) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable=true]")) return;
      const state = this.net.room.state;
      if (this.net.now() < state.introStartedAt || C.battleBusElapsed(state, this.net.now()) >= 7) return;
      e.preventDefault(); syncRide();
      if (this.ride.thank()) {
        const name = state.members.get(this.net.room.sessionId)?.name || "You";
        this.feed.add(`${name} thanked the bus driver.`);
      }
    }, { signal: this.abort.signal });
    this.origin.y = C.zurichWorld.height(this.origin.x, this.origin.z) ?? this.start.y;
    const bounds = C.zurichWorld.bounds;
    let distance = 100;
    while (distance < 2000) {
      const p = this.origin.clone().addScaledVector(this.forward, -distance);
      if (p.x < bounds.minX - 80 || p.x > bounds.maxX + 80 || p.z < bounds.minZ - 80 || p.z > bounds.maxZ + 80) break;
      distance += 20;
    }
    const from = this.origin.clone().addScaledVector(this.forward, -distance); from.y += 85;
    this.entry = new THREE.CubicBezierCurve3(from, from.clone().addScaledVector(this.forward, distance * 0.42),
      this.origin.clone().addScaledVector(this.forward, -28), this.origin.clone());
    this.entry.arcLengthDivisions = 768;
    const to = this.origin.clone().addScaledVector(this.forward, distance); to.y += 85;
    this.departure = new THREE.CubicBezierCurve3(this.origin.clone(), this.origin.clone().addScaledVector(this.forward, 28),
      to.clone().addScaledVector(this.forward, -distance * 0.42), to);
    this.departure.arcLengthDivisions = 768;
    this.audio.preload = "auto"; this.audio.volume = 0.55;
    this.ready = loadBattleBusModel(this.abort.signal).then(model => {
      if (this.abort.signal.aborted) {
        disposeAvatar(model.driver); disposeMap(model.bus); return;
      }
      this.model = model; model.bus.visible = false; this.scene.add(model.bus);
    });
  }
  get active() {
    const state = this.net.room?.state, member = state?.members?.get(this.net.room.sessionId);
    return this.net.initialized && this.net.status === "Connected" && !!state && C.inBattleBusIntro(state) && !!member && !member.spectator;
  }
  get focus() { return this.model?.bus.position ?? this.start; }
  // Called within the Ready button gesture to unlock audio before the server's start.
  unlockAudio() {
    this.audio.muted = true;
    void this.audio.play().then(() => { this.audio.pause(); this.audio.currentTime = 0; this.audio.muted = false; }).catch(() => { this.audio.muted = false; });
  }
  private entryPose(elapsed: number, reverse = false) {
    const bus = this.model!.bus;
    const u = THREE.MathUtils.smoothstep(elapsed, 0, 1);
    const curve = reverse ? this.departure : this.entry;
    bus.position.copy(curve.getPointAt(u));
    const forward = curve.getTangentAt(u).normalize();
    const back = forward.clone().negate(), right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
    const up = back.clone().cross(right).normalize();
    bus.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
    bus.updateMatrixWorld(true);
  }
  update(dt: number, local: THREE.Group, remotes: RemotePlayers) {
    const active = this.active, model = this.model, state = this.net.room?.state;
    this.overlay.hidden = !active;
    if (active && this.rideRun !== state!.introStartedAt) {
      this.rideRun = state!.introStartedAt; this.ride.begin(this.rideRun); this.feed.clear(); this.canvas.focus();
    }
    if (!model) return;
    if (!active) {
      this.audio.pause();
      const age = state ? (this.net.now() - state.startedAt) / 1000 : -1;
      model.bus.visible = !!state && !state.skipIntro && state.phase === C.RoomPhase.Running && state.introComplete && age >= 0 && age < 6;
      if (model.bus.visible) { model.setDoor(0); this.entryPose(age / 6, true); }
      return;
    }
    const elapsed = C.battleBusElapsed(state!, this.net.now()), exitTime = elapsed - 7;
    model.bus.visible = true;
    if (this.net.now() >= state!.introStartedAt && this.audioStarted !== state!.introStartedAt) {
      this.audioStarted = state!.introStartedAt;
      if (elapsed < 7) { this.audio.currentTime = elapsed; void this.audio.play().catch(() => {}); }
    }
    if (elapsed < 7) this.entryPose(elapsed / 7);
    else { model.bus.position.copy(this.origin); model.bus.rotation.set(0, this.heading, 0); model.bus.updateMatrixWorld(true); this.audio.pause(); }
    model.setDoor(THREE.MathUtils.smoothstep(exitTime, 0.25, 1) * (1 - THREE.MathUtils.smoothstep(exitTime, 5.65, 6.3)));
    for (const [id, player] of state!.players) {
      const member = state!.members.get(id), mesh = id === this.net.room.sessionId ? local : remotes.players.get(id)?.mesh;
      if (!member || member.spectator || member.introSeat < 0 || !mesh) continue;
      const seat = C.battleBusSeat(member.introSeat), destination = this.dropoffs[member.introSeat];
      C.snapshot(player, this.body);
      this.body.vx = this.body.vy = this.body.vz = 0; this.body.anim = 0; this.body.grounded = true;
      this.body.simTime = this.net.now(); this.body.knockdownUntil = this.body.attackReadyAt = 0;
      const begin = member.introSeat === 0 ? 3.8 : 1.05 + (member.introSeat - 1) / 39 * 2.7;
      const walking = exitTime >= begin;
      const position = model.bus.localToWorld(new THREE.Vector3(seat.x, seat.y, seat.z));
      if (walking) {
        const t = THREE.MathUtils.clamp((exitTime - begin) / 1.8, 0, 1);
        const out = THREE.MathUtils.smoothstep(t, 0, 0.6), along = THREE.MathUtils.smoothstep(t, 0.6, 1);
        position.copy(this.inside).lerp(this.door.clone().addScaledVector(this.right, 1.35), out)
          .lerp(new THREE.Vector3(destination.x, destination.y, destination.z), along);
        position.y = THREE.MathUtils.lerp(this.origin.y + 0.78, C.zurichWorld.height(position.x, position.z) ?? destination.y,
          THREE.MathUtils.smoothstep(out, 0.42, 0.85));
        this.body.rotY = t < 0.6 ? this.heading + Math.PI / 2 : Math.atan2(destination.x - this.door.x, destination.z - this.door.z);
        if (t < 1) { this.body.vx = Math.sin(this.body.rotY) * 1.8; this.body.vz = Math.cos(this.body.rotY) * 1.8; }
      } else this.body.rotY = this.heading + Math.PI;
      Object.assign(this.body, { x: position.x, y: position.y, z: position.z,
        vehicleId: !walking && seat.seated ? "battle-bus-intro" : "", vehicleKind: !walking && seat.seated ? 1 : -1 });
      pose(mesh, this.body, dt);
      if (!walking) mesh.quaternion.copy(model.bus.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      mesh.visible = id !== this.net.room.sessionId || elapsed < 1.2 || walking;
    }
    if (elapsed < 1.2) {
      this.camera.position.copy(model.bus.localToWorld(new THREE.Vector3(12, 5, 9)));
      this.camera.up.set(0, 1, 0); this.camera.lookAt(model.bus.localToWorld(new THREE.Vector3(0, 1.3, 0)));
    } else if (elapsed < 7) {
      const seat = C.battleBusSeat(state!.members.get(this.net.room.sessionId)!.introSeat);
      this.camera.position.copy(model.bus.localToWorld(new THREE.Vector3(seat.x, seat.eyeY, seat.z)));
      this.camera.up.set(0, 1, 0).applyQuaternion(model.bus.quaternion);
      this.ride.begin(state!.introStartedAt);
      this.camera.quaternion.copy(this.ride.orientation(model.bus.quaternion));
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(this.start).addScaledVector(this.right, 6.5).addScaledVector(this.forward, 6);
      this.camera.position.y = this.start.y + 3.7;
      this.camera.lookAt(this.door.clone().lerp(this.start, THREE.MathUtils.smoothstep(exitTime, 3.8, 5.6) * 0.65).add(new THREE.Vector3(0, 1.3, 0)));
    }
    this.overlay.textContent = this.net.now() < state!.introStartedAt ? "Match started. The battle bus is departing…"
      : elapsed < 7 ? `Mouse / trackpad: look around · ${this.ride.hasThanked ? "Driver thanked!" : "Space: thank the bus driver"}` : "Disembarking together…";
  }
  dispose() {
    this.abort.abort(); this.feed.dispose(); this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.overlay.hidden = true;
    if (this.model) { disposeAvatar(this.model.driver); disposeMap(this.model.bus); this.model.bus.removeFromParent(); }
  }
}
