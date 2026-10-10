import { Vector3 } from "three";
import { DT, copyBody, createBody, createInput, step, type Body, type World } from "@race/shared";
import type { Input } from "./input";

const CORRECTION_TAU = 0.05; // s; a correction is ~95% blended out after 150 ms

/**
 * Fixed 60 Hz simulation of the local player with render interpolation between the last two ticks.
 * The local player is never interpolated toward network data and never snaps: server corrections move
 * the simulation at once but leave a render offset that decays to zero.
 */
export class LocalPlayer {
  readonly body: Body;
  private prev: Body;
  private input = createInput();
  private acc = 0;
  /** Interpolated, correction-offset position to draw and to put the camera on. */
  readonly render = new Vector3();
  private offset = new Vector3();
  /** Called after every tick (separation against other players etc.). */
  afterTick?: (body: Body) => void;
  /** Ticks with a landing since the last frame, with the impact speed. */
  landedSpeed = 0;

  constructor(private world: World, x: number, y: number, z: number) {
    this.body = createBody(x, y, z);
    this.prev = createBody(x, y, z);
    this.render.set(x, y, z);
  }

  frame(dt: number, input: Input | undefined) {
    this.acc += dt;
    this.landedSpeed = 0;
    while (this.acc >= DT) {
      copyBody(this.body, this.prev);
      if (input) input.fill(this.input);
      else { this.input.forward = this.input.right = 0; this.input.jump = this.input.sprint = false; }
      const vy = this.body.vy;
      step(this.body, this.input, DT, this.world);
      if (this.body.landed) this.landedSpeed = Math.max(this.landedSpeed, -vy);
      this.afterTick?.(this.body);
      this.acc -= DT;
    }
    const a = this.acc / DT, p = this.prev, b = this.body;
    const decay = Math.exp(-dt / CORRECTION_TAU);
    this.offset.multiplyScalar(decay);
    this.render.set(p.x + (b.x - p.x) * a, p.y + (b.y - p.y) * a, p.z + (b.z - p.z) * a).add(this.offset);
  }

  /** Move the simulation to an authoritative position without a visible jump. */
  correct(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    this.offset.set(this.render.x - x, this.render.y - y, this.render.z - z);
    if (this.offset.lengthSq() > 25 * 25) this.offset.set(0, 0, 0); // teleports cut instead of gliding
    this.place(x, y, z);
    const b = this.body;
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.grounded = Math.abs(y - this.world.height(x, z)) < 0.05 && vy <= 0;
    copyBody(b, this.prev);
  }

  /** Hard placement, no blending (spawn, entering a seat). */
  place(x: number, y: number, z: number) {
    const b = this.body;
    b.x = x; b.y = y; b.z = z;
    b.vx = b.vy = b.vz = 0;
    b.grounded = true;
    b.airTime = 0;
    copyBody(b, this.prev);
  }

  /** Render position = simulation while seated; clears blending. */
  snapRender() {
    this.offset.set(0, 0, 0);
    this.render.set(this.body.x, this.body.y, this.body.z);
  }
}
