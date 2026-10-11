import {
  createBody,
  type Input,
} from "@race/shared";
export class LocalPlayer {
  body = createBody();
  enabled = false;
  private keys = new Set<string>();
  private boostHeld = false;
  private jump = false;
  private slide = false;
  private interaction = false;
  private hit = false;
  private input: Input = { x: 0, z: 0, sprint: false, jump: false };
  private abort = new AbortController();
  constructor() {
    window.addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyC"].includes(e.code))
        e.preventDefault();
      if (e.code === "Space" && !e.repeat) this.jump = true;
      if (e.code === "KeyC" && !e.repeat) this.slide = true;
      if (e.code === "KeyE" && !e.repeat) this.interaction = true;
      this.keys.add(e.code);
    }, { signal: this.abort.signal });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code), { signal: this.abort.signal });
    window.addEventListener("blur", () => this.clear(), { signal: this.abort.signal });
  }
  clear() {
    this.boostHeld = false; this.keys.clear(); this.slide = this.jump = this.interaction = this.hit = false;
  }
  /** Preserve the movement key that supplied a fresh cursor-capture gesture. */
  resumeMovement(keys: ReadonlySet<string>) {
    if (!this.enabled) return;
    for (const code of keys)
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(code)) this.keys.add(code);
  }
  dispose() { this.abort.abort(); this.enabled = false; this.clear(); }
  punch() { if (this.enabled) this.hit = true; }
  requestInteraction() { if (this.enabled) this.interaction = true; }
  requestSlide() { if (this.enabled) this.slide = true; }
  holdBoost(held: boolean) { this.boostHeld = held && this.enabled; }
  get sprinting() { return this.boostHeld || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"); }
  /** Movement keys are held (used to tell a wall bump from simply letting go). */
  get pushing() { return this.enabled && ["KeyW", "KeyA", "KeyS", "KeyD"].some(code => this.keys.has(code)); }
  controls(yaw: number) {
    if (!this.enabled) this.clear();
    const direction = keyboardMovement(this.keys, yaw);
    this.input.x = direction.x; this.input.z = direction.z;
    this.input.sprint = this.sprinting;
    this.input.slide = this.slide; this.slide = false;
    this.input.jump = this.jump;
    this.jump = false;
    this.input.hit = this.hit;
    this.hit = false;
    this.input.aim = this.enabled;
    this.input.facing = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    return this.input;
  }
  takeInteraction() {
    const pressed = this.interaction;
    this.interaction = false;
    return pressed;
  }
}

export function keyboardMovement(keys: ReadonlySet<string>, yaw: number) {
  const x = Number(keys.has("KeyD")) - Number(keys.has("KeyA")), z = Number(keys.has("KeyS")) - Number(keys.has("KeyW"));
  const length = Math.max(1, Math.hypot(x, z));
  return { x: (x * Math.cos(yaw) + z * Math.sin(yaw)) / length, z: (-x * Math.sin(yaw) + z * Math.cos(yaw)) / length };
}
