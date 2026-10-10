import * as THREE from "three";
import { BATTLE_BUS_HEADING, INTERP_DELAY_MS, zurichWorld, examSecondsRemaining, RoomPhase } from "@race/shared";
import { Network } from "./net.ts";
import { LocalPlayer } from "./localPlayer.ts";
import { RemotePlayers } from "./remotePlayers.ts";
import { Vehicles } from "./vehicles.ts";
import { Effects } from "./effects.ts";
import { Hud } from "./hud.ts";
import { avatar, pose, disposeAvatar } from "./avatar.ts";
import { PlayerView } from "./view.ts";
import { GameControls } from "./gameControls.ts";
import { lobby } from "./lobby.ts";
import { RoomFlow } from "./roomFlow.ts";
import { ExamSequence, type ExamSession } from "../exam/ExamSequence";
import { accelerateMapRaycasts } from "./mapRaycast.ts";
import { BattleBusIntro } from "./battleBus.ts";
import { PubliBikeFeature } from "./publiBikes.ts";
import { TransitScenery } from "./transitScenery.ts";

// MapViewer owns rendering and the loop; this instance owns gameplay cleanup.
export class MapGame {
  private exam: ExamSequence;
  private net = new Network();
  private local = new LocalPlayer();
  private remotes: RemotePlayers;
  private vehicles: Vehicles;
  private effects: Effects;
  private hud: Hud;
  private view: PlayerView;
  private disposeMapRaycasts: () => void;
  private controls: GameControls;
  private roomFlow: RoomFlow;
  private closeLobby: () => void;
  private mesh = avatar("#ffffff");
  private firstBody = avatar("#ffffff", 0, true);
  private avatarReady = false;
  private bus: BattleBusIntro;
  private publiBikes: PubliBikeFeature;
  private introStartedAt = 0;
  private transitScenery: TransitScenery;
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement,
    hud: HTMLDivElement, hints: HTMLDivElement, map: THREE.Object3D, onExamChange: (session: ExamSession) => void = () => {}) {
    this.exam = new ExamSequence(scene, camera, onExamChange);
    this.transitScenery = new TransitScenery(scene, map);
    this.disposeMapRaycasts = accelerateMapRaycasts(map);
    this.remotes = new RemotePlayers(scene);
    this.vehicles = new Vehicles(scene, this.net, hints);
    this.effects = new Effects(scene);
    this.hud = new Hud(hud);
    this.view = new PlayerView(camera, [map], zurichWorld);
    this.bus = new BattleBusIntro(scene, camera, this.net);
    this.publiBikes = new PubliBikeFeature(scene, camera, this.net, this.vehicles, this.local, canvas);
    this.roomFlow = new RoomFlow(this.net, Promise.all([this.bus.ready, this.vehicles.publiReady, this.vehicles.transitReady]).then(() => {}), () => this.bus.unlockAudio());
    this.controls = new GameControls(canvas, this.local, this.view, () => this.net.canPlay && !this.exam.active && !this.publiBikes.active);
    Object.assign(this.local.body, zurichWorld.spawn);
    camera.near = 0.05;
    camera.position.set(zurichWorld.spawn.x, zurichWorld.spawn.y + 1.6, zurichWorld.spawn.z);
    scene.add(this.mesh, this.firstBody);
    this.mesh.visible = this.firstBody.visible = false;
    this.closeLobby = lobby(selection => this.net.connect(this.local.body, (state, id) => {
      if (state.introStartedAt && this.introStartedAt !== state.introStartedAt) {
        this.introStartedAt = state.introStartedAt;
        this.view.yaw = BATTLE_BUS_HEADING; this.view.pitch = 0;
      }
      if (state.introComplete) camera.up.set(0, 1, 0);
      this.roomFlow.patch(state, id);
      this.vehicles.patch(state); this.remotes.patch(state, id);
      const p = state.players.get(id);
      if (p && !this.avatarReady) {
        disposeAvatar(this.mesh); disposeAvatar(this.firstBody);
        this.mesh = avatar(p.color, p.character); this.firstBody = avatar(p.color, p.character, true);
        scene.add(this.mesh, this.firstBody); this.avatarReady = true;
      }
    }, hit => this.effects.enqueue(hit), selection));
  }
  get examScreenVisible() { return this.exam.screenVisible; }
  get focus() { return this.bus.active ? this.bus.focus : this.local.body; }
  update(elapsed: number, now: number) {
    const dt = Math.min(0.1, elapsed), renderTime = this.net.now() - INTERP_DELAY_MS;
    const state = this.net.room?.state;
    const remaining = state?.phase === RoomPhase.Running ? examSecondsRemaining(state.endsAt, this.net.now()) : 0;
    // The exam never starts while the Publibike phone is open; riding a bike is blocked by vehicleId.
    this.exam.update(this.local.body, this.net.canPlay, this.local.enabled && !this.publiBikes.active, state?.startedAt ?? 0, remaining, now);
    this.vehicles.render(renderTime, dt, "rail");
    if (this.net.canPlay && !this.exam.active) {
      this.net.frame(dt, this.local.body, () => this.local.controls(this.view.yaw));
      if (this.local.takeInteraction() && !this.publiBikes.interact()) this.vehicles.interact(this.local.body);
      if (this.local.body.vehicleId) this.vehicles.local(this.local.body, this.net.room.sessionId);
      else this.vehicles.stopDriving();
      pose(this.mesh, this.local.body, dt); pose(this.firstBody, this.local.body, dt, this.view.pitch);
      this.mesh.visible = this.avatarReady && this.view.perspective !== 0;
      this.firstBody.visible = this.avatarReady && this.view.perspective === 0 && this.local.body.anim !== 3;
      if (this.publiBikes.active) this.mesh.visible = this.firstBody.visible = false;
      this.effects.trail(this.net.room.sessionId, this.local.body, now);
      if (!this.publiBikes.active) this.view.update(this.local.body, dt);
    }
    if (!this.net.canPlay || this.exam.active) { this.mesh.visible = this.firstBody.visible = false; this.vehicles.stopDriving(); }
    this.roomFlow.update();
    this.vehicles.render(renderTime, dt, "other"); this.remotes.render(renderTime, this.vehicles.items, dt);
    for (const [id, remote] of this.remotes.players) this.effects.trail(id, remote.rendered, now);
    this.controls.update(dt); this.effects.update(renderTime, dt); this.hud.update(dt, this.net);
    this.vehicles.updateLabels(this.local.body, now);
    this.bus.update(dt, this.mesh, this.remotes);
    this.publiBikes.update(dt);
  }
  skipExamTransition() { this.exam.skipTransition(); }
  completeExam(score: number) { this.exam.complete(score); }
  returnFromExam() { this.exam.returnToWorld(); }
  debugTeleportToTerrace(enterPortal = false) {
    if (!import.meta.env.DEV || !this.net.canPlay || this.exam.active) return;
    this.local.clear(); this.local.body.vx = this.local.body.vy = this.local.body.vz = 0;
    this.view.yaw = this.view.pitch = 0;
    if (enterPortal) void this.controls.resume();
    this.net.room.send("debugTeleportToPolyterrasse", enterPortal ? "portal" : "terrace");
  }
  dispose() {
    this.exam.dispose();
    this.publiBikes.dispose();
    this.bus.dispose();
    this.disposeMapRaycasts();
    this.transitScenery.dispose();
    this.closeLobby(); this.roomFlow.dispose(); this.controls.dispose(); this.local.dispose(); this.net.dispose();
    this.effects.dispose(); this.vehicles.dispose(); this.remotes.dispose();
    disposeAvatar(this.mesh); disposeAvatar(this.firstBody); this.canvas.removeAttribute("tabindex");
  }
}
