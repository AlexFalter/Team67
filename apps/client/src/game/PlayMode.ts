import { Color } from "three";
import { EYE_HEIGHT, PUNCH_COOLDOWN_MS, animOf, zurichWorld, spawnPoint } from "@race/shared";
import type { Engine, Mode } from "../engine/Engine";
import { Avatars, Rig, type AvatarState } from "./avatars";
import { CameraRig, FAR, VIEWS } from "./camera";
import { Hud } from "./hud";
import { Input } from "./input";
import { LocalPlayer } from "./LocalPlayer";

export interface Settings { sensitivity: number; bob: boolean }

/** Playing on the map: local controller, camera, avatars, HUD. */
export class PlayMode implements Mode {
  readonly input: Input;
  readonly hud: Hud;
  readonly camera: CameraRig;
  readonly avatars: Avatars;
  readonly local: LocalPlayer;
  private rig = new Rig();
  private me: AvatarState = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, anim: 0, riding: -1, shoes: false, character: 0, color: new Color("#ffcc33") };
  private nextPunch = 0;
  private hudTime = 0;
  private eye = EYE_HEIGHT;

  constructor(private engine: Engine, hudRoot: HTMLElement, settings: Settings, onLock: (locked: boolean) => void) {
    const world = zurichWorld, spawn = spawnPoint(world);
    this.input = new Input(engine.renderer.domElement);
    this.input.onLockChange = onLock;
    this.hud = new Hud(hudRoot);
    this.camera = new CameraRig(engine.camera, engine.colliders, world);
    engine.setFog(FAR * 0.3, FAR);
    this.avatars = new Avatars(engine.scene);
    this.local = new LocalPlayer(world, spawn.x, spawn.y, spawn.z);
    this.apply(settings);
    if (import.meta.env.DEV) (window as unknown as { play?: PlayMode }).play = this; // test hook
  }

  apply(settings: Settings) {
    this.input.sensitivity = settings.sensitivity;
    this.camera.bob = settings.bob;
  }

  frame(dt: number, now: number) {
    const { input, local, hud } = this;
    if (input.cycleView) { input.cycleView = false; this.camera.cycle(); hud.notice(VIEWS[this.camera.view], 1200); }
    if (input.toggleDebug) { input.toggleDebug = false; hud.debug.hidden = !hud.debug.hidden; }
    if (input.shoes) { input.shoes = false; local.body.shoes = !local.body.shoes; hud.notice(local.body.shoes ? "Running shoes on" : "Running shoes off", 1200); }
    if (input.punch) {
      input.punch = false;
      if (now >= this.nextPunch && local.body.down <= 0) { this.nextPunch = now + PUNCH_COOLDOWN_MS; this.rig.punch = 0; }
    }
    input.interact = false;

    local.frame(dt, input.locked ? input : undefined);
    const b = local.body, r = local.render;
    if (local.landedSpeed > 0) this.camera.land(local.landedSpeed);
    this.eye += ((b.down > 0 ? 0.45 : EYE_HEIGHT) - this.eye) * (1 - Math.exp(-10 * dt));
    this.camera.update(r.x, r.y, r.z, this.eye, input.yaw, input.pitch, b.grounded ? Math.hypot(b.vx, b.vz) : 0, dt);
    this.engine.focus.copy(r);

    const me = this.me;
    me.x = r.x; me.y = r.y; me.z = r.z; me.yaw = input.yaw;
    me.vx = b.vx; me.vz = b.vz; me.anim = animOf(b); me.shoes = b.shoes;
    this.avatars.begin();
    this.avatars.draw(me, this.rig, dt, this.camera.view === 0 ? this.engine.camera : undefined);
    this.avatars.end();

    hud.crosshair.hidden = this.camera.view !== 0 || !input.locked;
    hud.tick(now);
    if (now - this.hudTime > 100) {
      this.hudTime = now;
      hud.set(hud.status, [b.shoes ? "Shoes" : "", b.down > 0 ? `Knocked down ${b.down.toFixed(1)} s` : "", now < this.nextPunch ? "Punch recharging" : ""].filter(Boolean).join(" · "));
      if (!hud.debug.hidden) {
        const s = this.engine.stats;
        hud.set(hud.debug, `${s.fps.toFixed(0)} fps · ${s.cpuMs.toFixed(1)} ms cpu\n${s.calls} calls · ${(s.triangles / 1e6).toFixed(2)} M tris\npos ${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.z.toFixed(1)} · ${Math.hypot(b.vx, b.vz).toFixed(1)} m/s`);
      }
    }
  }

  dispose() {
    this.input.dispose();
    this.avatars.dispose();
    this.hud.dispose();
  }
}
