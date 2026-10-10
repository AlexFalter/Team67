import * as THREE from "three";
import { BATTLE_BUS_HEADING, INTERP_DELAY_MS, RoomPhase, zurichWorld } from "@race/shared";
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
import { accelerateMapRaycasts } from "./mapRaycast.ts";
import { BattleBusIntro } from "./battleBus.ts";
import { PubliBikeFeature } from "./publiBikes.ts";
import { TransitScenery } from "./transitScenery.ts";
import { MateFeature } from "./mate.ts";
import { MenuScene } from "./MenuScene";

// MapViewer owns rendering and the loop; this instance owns gameplay cleanup.
export class MapGame {
  readonly ready: Promise<void>;
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
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement,
    hud: HTMLDivElement, hints: HTMLDivElement, map: THREE.Object3D) {
    this.transitScenery = new TransitScenery(scene, map);
    this.disposeMapRaycasts = accelerateMapRaycasts(map);
    this.remotes = new RemotePlayers(scene);
    this.vehicles = new Vehicles(scene, this.net, hints);
    this.effects = new Effects(scene);
    this.hud = new Hud(hud);
    this.bus = new BattleBusIntro(scene, camera, this.net);
    this.publiBikes = new PubliBikeFeature(scene, camera, this.net, this.vehicles, this.local, canvas);
    this.mate = new MateFeature(scene, camera, this.net, this.local, canvas);
    this.view = new PlayerView(camera, [map, this.mate.machine], zurichWorld);
    this.ready = Promise.all([this.bus.ready, this.vehicles.publiReady, this.vehicles.transitReady, this.mate.ready]).then(() => {});
    this.roomFlow = new RoomFlow(this.net, this.ready, () => this.bus.unlockAudio());
    this.controls = new GameControls(canvas, this.local, this.view, () => this.net.canPlay && !this.publiBikes.active && !this.mate.active);
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
  get focus() { return this.net.room?.state?.phase === RoomPhase.Lobby ? this.menuScene.focus : this.bus.active ? this.bus.focus : this.local.body; }
  update(elapsed: number, now: number) {
    const dt = Math.min(0.1, elapsed), renderTime = this.net.now() - INTERP_DELAY_MS;
    this.vehicles.render(renderTime, dt, "rail");
    if (this.net.canPlay) {
      this.net.frame(dt, this.local.body, () => this.local.controls(this.view.yaw));
      if (this.local.takeInteraction() && !this.mate.interact() && !this.publiBikes.interact()) this.vehicles.interact(this.local.body);
      if (this.local.body.vehicleId) this.vehicles.local(this.local.body, this.net.room.sessionId);
      else this.vehicles.stopDriving();
      pose(this.mesh, this.local.body, dt); pose(this.firstBody, this.local.body, dt, this.view.pitch);
      this.mesh.visible = this.avatarReady && this.view.perspective !== 0;
      this.firstBody.visible = this.avatarReady && this.view.perspective === 0 && this.local.body.anim !== 3;
      if (this.publiBikes.active || this.mate.active) this.mesh.visible = this.firstBody.visible = false;
      this.effects.trail(this.net.room.sessionId, this.local.body, now);
      if (!this.publiBikes.active && !this.mate.active) this.view.update(this.local.body, dt);
    }
    if (!this.net.canPlay) { this.mesh.visible = this.firstBody.visible = false; this.vehicles.stopDriving(); }
    this.roomFlow.update();
    this.vehicles.render(renderTime, dt, "other"); this.remotes.render(renderTime, this.vehicles.items, dt);
    for (const [id, remote] of this.remotes.players) this.effects.trail(id, remote.rendered, now);
    this.controls.update(dt); this.effects.update(renderTime, dt); this.hud.update(dt, this.net);
    this.vehicles.updateLabels(this.local.body, now);
    this.bus.update(dt, this.mesh, this.remotes);
    const state = this.net.room?.state;
    const inMenu = !state || state.phase === RoomPhase.Lobby;
    for (const remote of this.remotes.players.values()) remote.mesh.visible = !inMenu;
    this.menuScene.update(dt, state, this.net.room?.sessionId);
    this.publiBikes.update(dt);
    this.mate.update();
  }
  dispose() {
    this.menuScene.dispose();
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
