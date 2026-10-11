import "./busIntroUi.css";
import * as THREE from "three";
import * as C from "@race/shared";
import type { Network } from "./net.ts";
import type { RemotePlayers } from "./remotePlayers.ts";
import { pose, disposeAvatar } from "./avatar.ts";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";
import { loadBattleBusModel } from "./battleBusModel.ts";
import { busCurve, busFlightProgress, busParkingHeading, busPathPose, battleBusPaths } from "./battleBusPath";

import { BusRideControls } from "./busRideControls.ts";
import { ActivityFeed } from "./activityFeed.ts";

export class BattleBusIntro {
  readonly ready: Promise<void>;
  private ride = new BusRideControls();
  private feed = new ActivityFeed();
  private rideRun = 0;
  private firstPersonRun = 0;
  private bannerKey = "";
  private bannerAnimation?: Animation;
  private abort = new AbortController();
  private model?: Awaited<ReturnType<typeof loadBattleBusModel>>;
  private overlay = document.querySelector<HTMLElement>("#battle-bus-intro")!;
  private startBanner = document.querySelector<HTMLElement>("#round-start-banner")!;
  private audio = new Audio(`${import.meta.env.BASE_URL}audio/fortnite-battle-bus.mp3`);
  private audioStarted = 0;
  private body = C.createBody();
  private start = new THREE.Vector3(C.BATTLE_BUS_START.x, C.zurichWorld.height(C.BATTLE_BUS_START.x, C.BATTLE_BUS_START.z)!, C.BATTLE_BUS_START.z);
  private heading = C.BATTLE_BUS_HEADING + Math.PI;
  private right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  private forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  private door = this.start.clone().addScaledVector(this.right, -2.7);
  private inside = this.door.clone().addScaledVector(this.right, -0.85);
  private origin = new THREE.Vector3(C.BATTLE_BUS_LANDING.x, C.BATTLE_BUS_LANDING.y, C.BATTLE_BUS_LANDING.z);
  private entry: THREE.Curve<THREE.Vector3>;
  private departure: THREE.Curve<THREE.Vector3>;
  private dropoffs = C.battleBusDropoffs(C.zurichWorld, 40);

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private net: Network, private canvas: HTMLCanvasElement, sensitivity: () => number, private enterFirstPerson = () => {}) {
    const syncRide = () => {
      const run = this.net.room?.state.introStartedAt ?? 0;
      if (run !== this.rideRun) { this.rideRun = run; this.ride.begin(run); this.feed.clear(); }
    };
    canvas.addEventListener("mousemove", e => {
      if (!this.active || document.querySelector<HTMLElement>("#pause")?.hidden===false) return;
      syncRide();
      const elapsed = C.battleBusElapsed(this.net.room.state, this.net.now());
      if (elapsed >= 1.2 && elapsed < 7) this.ride.look(e.movementX, e.movementY, sensitivity());
    }, { signal: this.abort.signal });
    window.addEventListener("keydown", e => {
      if (e.code !== "Space" || e.repeat || !this.active || document.querySelector<HTMLElement>("#pause")?.hidden===false) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable=true]")) return;
      const state = this.net.room.state;
      if (this.net.now() < state.introStartedAt || C.battleBusElapsed(state, this.net.now()) >= 7) return;
      e.preventDefault(); syncRide();
      if (this.ride.thank()) {
        this.net.room.send("thankBusDriver", state.introStartedAt);
      }
    }, { signal: this.abort.signal });
    const paths = battleBusPaths(this.origin);
    this.entry = busCurve(paths.arrival); this.departure = busCurve(paths.departure);
    this.heading = busParkingHeading(paths, C.BATTLE_BUS_HEADING + Math.PI);
    this.right.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    // Door and passenger exit anchors rotate with the cabin; parking stays fixed.
    this.door.copy(this.origin).addScaledVector(this.right, 1.35).addScaledVector(this.forward, 2.6);
    this.inside.copy(this.door).addScaledVector(this.right, -.85);
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
    const u = busFlightProgress(elapsed);
    const curve = reverse ? this.departure : this.entry;
    const pose = busPathPose(curve, u, this.heading, reverse);
    bus.position.copy(pose.position); bus.quaternion.copy(pose.quaternion);
    bus.updateMatrixWorld(true);
  }
  update(dt: number, local: THREE.Group, remotes: RemotePlayers, firstBody: THREE.Group) {
    const active = this.active, model = this.model, state = this.net.room?.state;
    const sinceArrival = state ? this.net.now() - state.startedAt : -1;
    const elapsed = state ? C.battleBusElapsed(state, this.net.now()) : 0;
    const timing = C.battleBusTiming(state?.introPassengerCount ?? 40);
    const countdown = active ? C.battleBusCountdown(state!.introPassengerCount ?? 40, elapsed * 1000) : 0;
    const go = this.net.canPlay && state?.introComplete && sinceArrival >= 0 && sinceArrival < 1500;
    this.showBanner(countdown ? String(countdown) : go ? "GET TO HG!" : "", state?.introStartedAt ?? 0);
    this.overlay.hidden = !active || elapsed * 1000 >= timing.exitEndMs;
    if (active && this.rideRun !== state!.introStartedAt) {
      this.rideRun = state!.introStartedAt; this.ride.begin(this.rideRun); this.feed.clear(); this.canvas.focus();
    }
    if (state && !state.skipIntro && (go || (active && elapsed * 1000 >= timing.countdownAtMs)) && this.firstPersonRun !== state.introStartedAt) {
      this.firstPersonRun = state.introStartedAt; this.enterFirstPerson();
    }
    this.feed.updateBusDriverThanks(state, this.net.now());
    if (!model) return;
    if (!active) {
      this.audio.pause();
      const age = state ? (this.net.now() - state.startedAt) / 1000 : -1;
      model.bus.visible = !!state && !state.skipIntro && state.phase === C.RoomPhase.Running && state.introComplete && age >= 0 && age < 6;
      if (model.bus.visible) { model.setDoor(0); this.entryPose(age / 6, true); }
      return;
    }
    model.bus.visible = true;
    if (this.net.now() >= state!.introStartedAt && this.audioStarted !== state!.introStartedAt) {
      this.audioStarted = state!.introStartedAt;
      if (elapsed < 7) { this.audio.currentTime = elapsed; void this.audio.play().catch(() => {}); }
    }
    this.renderIntro(dt, state!.players, state!.members,
      id => id === this.net.room.sessionId ? local : remotes.players.get(id)?.mesh,
      this.net.room.sessionId, elapsed, this.net.now(), timing, firstBody);
    this.overlay.dataset.thanked = String(this.ride.hasThanked);
    this.overlay.textContent = this.net.now() < state!.introStartedAt ? "Match started. The battle bus is departing…"
      : elapsed < 7 ? `Look around · ${this.ride.hasThanked ? "Driver thanked!" : "[SPACE] Thank the bus driver"}` : "Disembarking together…";
  }
  private renderIntro(dt: number, players: Iterable<[string, C.PlayerState]>,
    members: ReadonlyMap<string, Pick<C.RoomMember, "introSeat" | "spectator">>,
    meshFor: (id: string) => THREE.Group | undefined, localId: string, elapsed: number, now: number, timing: ReturnType<typeof C.battleBusTiming>, firstBody: THREE.Group) {
    const model = this.model!, exitTime = elapsed - 7;
    let localBody: C.PlayerState | undefined;
    model.bus.visible = true;
    if (elapsed < 7) this.entryPose(elapsed / 7);
    else { model.bus.position.copy(this.origin); model.bus.rotation.set(0, this.heading, 0); model.bus.updateMatrixWorld(true); this.audio.pause(); }
    const cameraBlend = THREE.MathUtils.smootherstep(elapsed * 1000, timing.exitEndMs, timing.countdownAtMs);
    this.camera.fov = THREE.MathUtils.lerp(60, 82, cameraBlend);
    this.camera.updateProjectionMatrix();
    model.setDoor(THREE.MathUtils.smoothstep(exitTime, 0.05, 0.45) * (1 - cameraBlend));
    for (const [id, player] of players) {
      const member = members.get(id), mesh = meshFor(id);
      if (!member || member.spectator || member.introSeat < 0 || !mesh) continue;
      const seat = C.battleBusSeat(member.introSeat), destination = this.dropoffs[member.introSeat];
      C.snapshot(player, this.body);
      this.body.vx = this.body.vy = this.body.vz = 0; this.body.anim = 0; this.body.grounded = true;
      this.body.simTime = now; this.body.knockdownUntil = this.body.attackReadyAt = 0;
      const begin = C.battleBusExitStartMs(member.introSeat) / 1000;
      const walking = exitTime >= begin;
      const position = model.bus.localToWorld(new THREE.Vector3(seat.x, seat.y, seat.z));
      if (walking) {
        const t = THREE.MathUtils.clamp((exitTime - begin) / (C.BATTLE_BUS_EXIT_WALK_MS / 1000), 0, 1);
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
      if (cameraBlend > 0) {
        const turn = Math.atan2(Math.sin(C.BATTLE_BUS_HEADING + Math.PI - this.body.rotY), Math.cos(C.BATTLE_BUS_HEADING + Math.PI - this.body.rotY));
        mesh.rotation.y = this.body.rotY + turn * cameraBlend;
      }
      mesh.visible = id !== localId || elapsed < 1.2 || (walking && cameraBlend < 0.65);
      if (id === localId && cameraBlend === 1) {
        localBody = { ...this.body, rotY: C.BATTLE_BUS_HEADING + Math.PI };
      }
    }
    if (elapsed < 1.2) {
      this.camera.position.copy(model.bus.localToWorld(new THREE.Vector3(12, 5, 9)));
      this.camera.up.set(0, 1, 0); this.camera.lookAt(model.bus.localToWorld(new THREE.Vector3(0, 1.3, 0)));
    } else if (elapsed < 7) {
      const seat = C.battleBusSeat(members.get(localId)!.introSeat);
      this.camera.position.copy(model.bus.localToWorld(new THREE.Vector3(seat.x, seat.eyeY, seat.z)));
      this.camera.up.set(0, 1, 0).applyQuaternion(model.bus.quaternion);
      this.ride.begin(this.rideRun);
      this.camera.quaternion.copy(this.ride.orientation(model.bus.quaternion));
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(this.start).addScaledVector(this.right, 6.5).addScaledVector(this.forward, 6);
      this.camera.position.y = this.start.y + 3.7;
      this.camera.lookAt(this.door.clone().lerp(this.start, THREE.MathUtils.smoothstep(exitTime, 0.55, 2.35) * 0.65).add(new THREE.Vector3(0, 1.3, 0)));
      const destination = this.dropoffs[members.get(localId)!.introSeat];
      // Match PlayerView's standing eye and forward head offset exactly, so
      // releasing gameplay does not snap the camera or rotate the horizon.
      const eye = new THREE.Vector3(destination.x - Math.sin(C.BATTLE_BUS_HEADING) * 0.15,
        destination.y + 1.6, destination.z - Math.cos(C.BATTLE_BUS_HEADING) * 0.15);
      const gaze = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, C.BATTLE_BUS_HEADING, 0, "YXZ"));
      this.camera.position.lerp(eye, cameraBlend);
      this.camera.quaternion.slerp(gaze, cameraBlend);
    }
    // First-person arms read the camera's Euler pitch: use the same rotation
    // order as PlayerView before posing them, after the camera has settled.
    this.camera.rotation.reorder("YXZ");
    if (localBody) { pose(firstBody, localBody, dt, 0, this.camera); firstBody.visible = true; }
  }
  private showBanner(text: string, run: number) {
    this.startBanner.hidden = !text;
    const key = `${run}:${text}`;
    if (key === this.bannerKey) return;
    this.bannerKey = key; this.bannerAnimation?.cancel();
    this.startBanner.textContent = text;
    this.startBanner.dataset.phase = text === "GET TO HG!" ? "go" : "countdown";
    if (!text || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.bannerAnimation = this.startBanner.animate([
      { opacity: 0, transform: "translate(-50%, -50%) scale(1.3)" },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.2 },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.75 },
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.92)" },
    ], { duration: text === "GET TO HG!" ? 1500 : 1000, easing: "ease-out", fill: "forwards" });
  }
  dispose() {
    this.bannerAnimation?.cancel();
    this.startBanner.hidden = true;
    this.abort.abort(); this.feed.dispose(); this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.overlay.hidden = true;
    if (this.model) { disposeAvatar(this.model.driver); disposeMap(this.model.bus); this.model.bus.removeFromParent(); }
  }
}
