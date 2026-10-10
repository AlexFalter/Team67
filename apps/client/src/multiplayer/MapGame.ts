import * as THREE from "three";
import { BATTLE_BUS_HEADING, INTERP_DELAY_MS, IDLE_INPUT, zurichWorld, isRail, railFrame, railSeat, tramDerailFrame, examSecondsRemaining, RoomPhase } from "@race/shared";
import { Network } from "./net.ts";
import { LocalPlayer } from "./localPlayer.ts";
import { RemotePlayers } from "./remotePlayers.ts";
import { Vehicles } from "./vehicles.ts";
import { Effects } from "./effects.ts";
import { Hud } from "./hud.ts";
import { avatar, pose, disposeAvatar, firstPersonBodyVisible } from "./avatar.ts";
import { PlayerView } from "./view.ts";
import { GameControls } from "./gameControls.ts";
import { lobby } from "./lobby.ts";
import { RoomFlow } from "./roomFlow.ts";
import { accelerateMapRaycasts } from "./mapRaycast.ts";
import { BattleBusIntro } from "./battleBus.ts";
import { PubliBikeFeature } from "./publiBikes.ts";
import { TransitScenery } from "./transitScenery.ts";
import { ExamSequence, type ExamSession } from "../exam/ExamSequence";
import { MateFeature } from "./mate.ts";
import { MenuScene } from "./MenuScene";
import { NpcFeature } from "../npcPrototype/host.js";

// MapViewer owns rendering and the loop; this instance owns gameplay cleanup.
export class MapGame {
  readonly ready: Promise<void>;
  private exam: ExamSequence;
  private derailVehicle="";
  private derailUntil=0;
  private derailRun=0;
  private explosionEvents=new Set<string>();
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
  private mate: MateFeature;
  private menuScene: MenuScene;
  private npcs: NpcFeature;
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement,
    hud: HTMLDivElement, hints: HTMLDivElement, map: THREE.Object3D, capture: () => void, onExamChange: (session: ExamSession) => void = () => {}) {
    this.exam = new ExamSequence(scene, camera, onExamChange);
    this.transitScenery = new TransitScenery(scene, map);
    this.disposeMapRaycasts = accelerateMapRaycasts(map);
    this.remotes = new RemotePlayers(scene);
    this.vehicles = new Vehicles(scene, this.net, hints);
    this.effects = new Effects(scene);
    this.hud = new Hud(hud);
    this.publiBikes = new PubliBikeFeature(scene, camera, this.net, this.vehicles, this.local, canvas);
    this.mate = new MateFeature(scene, camera, this.net, this.local, canvas);
    this.npcs = new NpcFeature(scene, camera, this.net, this.local, this.vehicles, canvas, map, capture);
    this.view = new PlayerView(camera, [map, this.mate.machine], zurichWorld);
    this.bus = new BattleBusIntro(scene, camera, this.net, canvas, () => this.view.sensitivity);
    this.ready = Promise.all([this.bus.ready, this.vehicles.publiReady, this.vehicles.transitReady, this.mate.ready, this.npcs.ready]).then(() => {});
    this.roomFlow = new RoomFlow(this.net, this.ready, () => this.bus.unlockAudio());
    this.controls = new GameControls(canvas, this.local, this.view, () => this.net.canPlay && !this.exam.active && !this.publiBikes.active && !this.mate.active && !this.npcs.active, () => this.net.now()<this.derailUntil);
    Object.assign(this.local.body, zurichWorld.spawn);
    camera.near = 0.05;
    camera.position.set(zurichWorld.spawn.x, zurichWorld.spawn.y + 1.6, zurichWorld.spawn.z);
    this.menuScene = new MenuScene(scene, camera);
    scene.add(this.mesh, this.firstBody);
    this.mesh.visible = this.firstBody.visible = false;
    this.closeLobby = lobby(selection => {
      this.bus.unlockAudio();
      return this.net.connect(this.local.body, (state, id) => {
        if (state.introStartedAt && this.introStartedAt !== state.introStartedAt) {
          this.introStartedAt = state.introStartedAt;
          this.derailVehicle="";this.derailUntil=this.derailRun=0;this.explosionEvents.clear();
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
      }, hit => this.effects.enqueue(hit), selection);
    });
  }
  get examScreenVisible() { return this.exam.screenVisible; }
  get focus() { return this.net.room?.state?.phase === RoomPhase.Lobby ? this.menuScene.focus : this.bus.active ? this.bus.focus : this.local.body; }
  update(elapsed: number, now: number) {
    const dt = Math.min(0.1, elapsed), renderTime = this.net.now() - INTERP_DELAY_MS;
    const state = this.net.room?.state;
    const remaining = state?.phase === RoomPhase.Running ? examSecondsRemaining(state.endsAt, this.net.now()) : 0;
    // Encounters keep camera ownership until they finish; vehicles also block exam entry.
    this.exam.update(this.local.body, this.net.canPlay, this.local.enabled && !this.publiBikes.active && !this.mate.active && !this.npcs.active && this.net.now()>=this.derailUntil, state?.startedAt ?? 0, remaining, now);
    this.vehicles.render(renderTime, dt, "rail");
    this.transitScenery.update(state?.vehicles?.values() ?? [], this.net.now(), this.net.canPlay);
    const riding=this.vehicles.items.get(this.local.body.vehicleId)?.latest;
    if(riding?.derailStartedAt&&this.derailRun!==riding.derailStartedAt){
      this.derailRun=riding.derailStartedAt;this.derailVehicle=this.local.body.vehicleId;this.derailUntil=riding.derailStartedAt+3200;
    }
    if (this.net.canPlay && !this.exam.active) {
      this.net.frame(dt, this.local.body, () => this.net.now()<this.derailUntil?IDLE_INPUT:this.local.controls(this.view.yaw));
      if (this.net.now()>=this.derailUntil && this.local.takeInteraction() && !this.npcs.active && !this.npcs.interact() && !this.mate.interact() && !this.publiBikes.interact()) this.vehicles.interact(this.local.body);
      if (this.local.body.vehicleId) this.vehicles.local(this.local.body, this.net.room.sessionId);
      else this.vehicles.stopDriving();
      pose(this.mesh, this.local.body, dt); pose(this.firstBody, this.local.body, dt, this.view.pitch);
      this.mesh.visible = this.avatarReady && this.view.perspective !== 0;
      this.firstBody.visible = this.avatarReady && firstPersonBodyVisible(this.local.body, this.view.perspective);
      if (this.publiBikes.active || this.mate.active || this.npcs.hideAvatar) this.mesh.visible = this.firstBody.visible = false;
      this.effects.trail(this.net.room.sessionId, this.local.body, now);
      if (!this.publiBikes.active && !this.mate.active && !this.npcs.active) {
        const vehicle = this.vehicles.items.get(this.local.body.vehicleId)?.rendered;
        this.view.update(this.local.body, dt, vehicle && isRail(vehicle) ? railFrame(vehicle, railSeat(vehicle, this.local.body.seat).part) : undefined);
      }
    }
    if (!this.net.canPlay || this.exam.active) { this.mesh.visible = this.firstBody.visible = false; this.vehicles.stopDriving(); }
    this.roomFlow.update();
    this.vehicles.render(renderTime, dt, "other"); this.remotes.render(renderTime, this.vehicles.items, dt);
    for (const [id, remote] of this.remotes.players) {
      remote.mesh.visible = this.net.room?.state.npcs?.get(id)?.kind !== "limousine";
      this.effects.trail(id, remote.rendered, now);
    }
    this.controls.update(dt); this.effects.update(renderTime, dt); this.hud.update(dt, this.net);
    this.vehicles.updateLabels(this.local.body, now);
    this.bus.update(dt, this.mesh, this.remotes);
    const inMenu = !state || state.phase === RoomPhase.Lobby;
    if (inMenu) for (const remote of this.remotes.players.values()) remote.mesh.visible = false;
    this.menuScene.update(dt, state, this.net.room?.sessionId);
    this.publiBikes.update(dt);
    this.mate.update();
    this.npcs.update(dt, this.net.canPlay && !this.exam.active && this.local.enabled && !this.publiBikes.active && !this.mate.active && this.net.now()>=this.derailUntil);
    for(const [id,visual] of this.vehicles.items){
      const v=visual.rendered;if(!v.derailStartedAt)continue;
      for(let part=0;part<3;part++){
        const key=`${id}:${v.derailStartedAt}:${part}`,age=(renderTime-v.derailStartedAt)/1000;
        const landing=tramDerailFrame(v,part).landedAt;
        if(age>=landing&&age<landing+1&&!this.explosionEvents.has(key)){
          this.explosionEvents.add(key);this.effects.explosion(visual.railCars?.[part]?.getWorldPosition(new THREE.Vector3())??v,this.local.body);
        }
      }
    }
    if(this.net.now()<this.derailUntil){
      const car=this.vehicles.items.get(this.derailVehicle)?.railCars?.[0];
      if(car){
        const target=car.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1.4,0));
        this.camera.up.set(0,1,0);this.camera.position.copy(target).add(new THREE.Vector3(13,8,12));this.camera.lookAt(target);this.camera.updateMatrixWorld(true);
        this.firstBody.visible=false;this.mesh.visible=this.avatarReady;
      }
    }
  }
  skipExamTransition() { this.exam.skipTransition(); }
  completeExam(score: number) { this.exam.complete(score); }
  returnFromExam() { this.exam.returnToWorld(); }
  debugTeleportToTerrace(enterPortal = false) {
    if (!import.meta.env.DEV || !this.net.canPlay || this.exam.active || this.mate.active || this.publiBikes.active || this.npcs.active || this.net.now()<this.derailUntil) return;
    this.local.clear(); this.local.body.vx = this.local.body.vy = this.local.body.vz = 0;
    this.view.yaw = this.view.pitch = 0;
    if (enterPortal) void this.controls.resume();
    this.net.room.send("debugTeleportToPolyterrasse", enterPortal ? "portal" : "terrace");
  }
  afterRender() { this.publiBikes.renderPreview(); this.npcs.afterRender(); }
  dispose() {
    this.menuScene.dispose();
    this.exam.dispose();
    this.npcs.dispose();
    this.mate.dispose();
    this.publiBikes.dispose();
    this.bus.dispose();
    this.disposeMapRaycasts();
    this.transitScenery.dispose();
    this.closeLobby(); this.roomFlow.dispose(); this.controls.dispose(); this.local.dispose(); this.net.dispose();
    this.effects.dispose(); this.vehicles.dispose(); this.remotes.dispose();
    disposeAvatar(this.mesh); disposeAvatar(this.firstBody); this.canvas.removeAttribute("tabindex");
  }
}
