import * as THREE from "three";
import { CAPSULE_RADIUS, CAPSULE_HEIGHT, INTERP_DELAY_MS, zurichWorld } from "@race/shared";
import { Network } from "./net";
import { LocalPlayer } from "./localPlayer";
import { RemotePlayers } from "./remotePlayers";
import { Vehicles } from "./vehicles";
import { Effects } from "./effects";
import { Hud } from "./hud";
import { avatar, pose, disposeAvatar } from "./avatar";

// Mounted by MapViewer: owns gameplay, never a second renderer or animation loop.
export class MapGame {
  private net = new Network();
  private local: LocalPlayer;
  private remotes: RemotePlayers;
  private vehicles: Vehicles;
  private effects: Effects;
  private hud: Hud;
  private mesh = avatar("#ffffff");
  private abort = new AbortController();
  private yaw = 0;
  private dragging = false;
  private disposed = false;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private distance = 10;
  constructor(
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    hud: HTMLDivElement,
    controls: HTMLDivElement,
  ) {
    this.local = new LocalPlayer(canvas);
    this.remotes = new RemotePlayers(scene);
    this.vehicles = new Vehicles(scene, this.net, controls);
    this.effects = new Effects(scene);
    this.hud = new Hud(hud);
    this.mesh.visible = false;
    scene.add(this.mesh);
    Object.assign(this.local.body, zurichWorld.spawn);
    camera.position.set(
      this.local.body.x,
      this.local.body.y + 6,
      this.local.body.z + this.distance,
    );
    canvas.tabIndex = 0;
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        canvas.focus();
        this.dragging = true;
        canvas.setPointerCapture(event.pointerId);
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener("pointerup", () => (this.dragging = false), {
      signal: this.abort.signal,
    });
    canvas.addEventListener("pointercancel", () => (this.dragging = false), {
      signal: this.abort.signal,
    });
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (this.dragging) this.yaw -= event.movementX * 0.005;
      },
      { signal: this.abort.signal },
    );
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.distance = THREE.MathUtils.clamp(
          this.distance + event.deltaY * 0.015,
          5,
          25,
        );
      },
      { signal: this.abort.signal, passive: false },
    );
    void this.net
      .connect(
        this.local.body,
        (state, id) => {
          this.vehicles.patch(state);
          this.remotes.patch(state, id);
          const p = state.players.get(id);
          if (p) {
            (
              (this.mesh.children[0] as THREE.Mesh)
                .material as THREE.MeshStandardMaterial
            ).color.set(p.color);
            this.mesh.visible = true;
          }
        },
        (hit) => this.local.impulse(hit),
        (hit) => this.effects.enqueue(hit),
      )
      .catch((error) => {
        if (!this.disposed)
          this.net.status = `Could not connect: ${error instanceof Error ? error.message : String(error)}`;
      });
  }
  update(dt: number, now: number) {
    const elapsed = Math.min(0.1, dt),
      renderTime = this.net.now() - INTERP_DELAY_MS;
    this.vehicles.render(renderTime);
    this.remotes.render(renderTime, this.vehicles.items);
    if (this.net.initialized) {
      if (this.local.takeInteraction()) this.vehicles.interact(this.local.body);
      let remaining = elapsed;
      while (remaining > 0) {
        const step = Math.min(remaining, 1 / 60);
        if (this.local.body.vehicleId)
          this.vehicles.step(
            this.local.body,
            this.local.controls(this.yaw),
            step,
            this.net.room.sessionId,
          );
        else {
          this.vehicles.stopDriving();
          this.local.step(step, this.yaw);
          const { x, z } = this.local.body;
          this.remotes.pushLocal(this.local.body, step);
          if (
            zurichWorld.blocked(
              this.local.body.x,
              this.local.body.y,
              this.local.body.z,
              CAPSULE_RADIUS,
              CAPSULE_HEIGHT,
            )
          ) {
            this.local.body.x = x;
            this.local.body.z = z;
          }
        }
        remaining -= step;
      }
      pose(this.mesh, this.local.body);
    }
    const p = this.local.body;
    this.target.set(p.x, p.y + 1, p.z);
    this.desired.set(
      p.x + Math.sin(this.yaw) * this.distance,
      p.y + 6,
      p.z + Math.cos(this.yaw) * this.distance,
    );
    // Terrain and the shared building mask keep the camera outside the map.
    this.desired.y = Math.max(
      this.desired.y,
      (zurichWorld.height(this.desired.x, this.desired.z) ?? p.y) + 2,
    );
    for (let i = 1; i <= 20; i++) {
      const t = i / 20,
        x = THREE.MathUtils.lerp(this.target.x, this.desired.x, t),
        y = THREE.MathUtils.lerp(this.target.y, this.desired.y, t),
        z = THREE.MathUtils.lerp(this.target.z, this.desired.z, t);
      if (zurichWorld.blocked(x, y, z, 0.2, 0.4)) {
        this.desired.lerpVectors(
          this.target,
          this.desired,
          Math.max(0.15, t - 0.1),
        );
        break;
      }
    }
    this.camera.position.lerp(this.desired, 1 - Math.exp(-6 * elapsed));
    this.camera.lookAt(this.target);
    this.effects.update(renderTime, elapsed);
    this.hud.update(dt, this.net);
    this.vehicles.updateLabels(p, now);
  }
  get focus() {
    return this.local.body;
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.net.dispose();
    this.local.dispose();
    this.effects.dispose();
    this.vehicles.dispose();
    this.remotes.dispose();
    disposeAvatar(this.mesh);
    this.canvas.removeAttribute("tabindex");
  }
}
