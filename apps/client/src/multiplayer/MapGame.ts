import * as THREE from "three";
import { INTERP_DELAY_MS, zurichWorld } from "@race/shared";
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

// MapViewer owns rendering and the loop; this instance owns gameplay cleanup.
export class MapGame {
  private net = new Network();
  private local = new LocalPlayer();
  private remotes: RemotePlayers;
  private vehicles: Vehicles;
  private effects: Effects;
  private hud: Hud;
  private view: PlayerView;
  private controls: GameControls;
  private roomFlow: RoomFlow;
  private closeLobby: () => void;
  private mesh = avatar("#ffffff");
  private firstBody = avatar("#ffffff", 0, true);
  private avatarReady = false;
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement,
    hud: HTMLDivElement, hints: HTMLDivElement, map: THREE.Object3D) {
    this.remotes = new RemotePlayers(scene);
    this.vehicles = new Vehicles(scene, this.net, hints);
    this.effects = new Effects(scene);
    this.hud = new Hud(hud);
    this.view = new PlayerView(camera, [map], zurichWorld);
    this.roomFlow = new RoomFlow(this.net);
    this.controls = new GameControls(canvas, this.local, this.view, () => this.net.canPlay);
    Object.assign(this.local.body, zurichWorld.spawn);
    camera.near = 0.05;
    camera.position.set(zurichWorld.spawn.x, zurichWorld.spawn.y + 1.6, zurichWorld.spawn.z);
    scene.add(this.mesh, this.firstBody);
    this.mesh.visible = this.firstBody.visible = false;
    this.closeLobby = lobby(selection => this.net.connect(this.local.body, (state, id) => {
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
  get focus() { return this.local.body; }
  update(elapsed: number, now: number) {
    const dt = Math.min(0.1, elapsed), renderTime = this.net.now() - INTERP_DELAY_MS;
    if (this.net.canPlay) {
      this.net.frame(dt, this.local.body, () => this.local.controls(this.view.yaw));
      if (this.local.takeInteraction()) this.vehicles.interact(this.local.body);
      if (this.local.body.vehicleId) this.vehicles.local(this.local.body, this.net.room.sessionId);
      else this.vehicles.stopDriving();
      pose(this.mesh, this.local.body, dt); pose(this.firstBody, this.local.body, dt, this.view.pitch);
      this.mesh.visible = this.avatarReady && this.view.perspective !== 0;
      this.firstBody.visible = this.avatarReady && this.view.perspective === 0 && this.local.body.anim !== 3;
      this.effects.trail(this.net.room.sessionId, this.local.body, now);
      this.view.update(this.local.body, dt);
    }
    if (!this.net.canPlay) { this.mesh.visible = this.firstBody.visible = false; this.vehicles.stopDriving(); }
    this.roomFlow.update();
    this.vehicles.render(renderTime, dt); this.remotes.render(renderTime, this.vehicles.items, dt);
    for (const [id, remote] of this.remotes.players) this.effects.trail(id, remote.rendered, now);
    this.controls.update(dt); this.effects.update(renderTime, dt); this.hud.update(dt, this.net);
    this.vehicles.updateLabels(this.local.body, now);
  }
  dispose() {
    this.closeLobby(); this.roomFlow.dispose(); this.controls.dispose(); this.local.dispose(); this.net.dispose();
    this.effects.dispose(); this.vehicles.dispose(); this.remotes.dispose();
    disposeAvatar(this.mesh); disposeAvatar(this.firstBody); this.canvas.removeAttribute("tabindex");
  }
}
