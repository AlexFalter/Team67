import {
  createBody,
  type Input,
} from "@race/shared";
export class LocalPlayer {
  body = createBody();
  enabled = false;
  private keys = new Set<string>();
  private jump = false;
  private interaction = false;
  private shoes = false;
  private hit = false;
  private banana = false;
  private thrown = false;
  private input: Input = { x: 0, z: 0, sprint: false, jump: false };
  private abort = new AbortController();
  constructor() {
    window.addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))
        e.preventDefault();
      if (e.code === "Space" && !e.repeat) this.jump = true;
      if (e.code === "KeyE" && !e.repeat) this.interaction = true;
      if (e.code === "KeyR" && !e.repeat) this.shoes = true;
      if (e.code === "KeyF" && !e.repeat) this.hit = true;
      if (["KeyB", "KeyG"].includes(e.code) && !e.repeat) { this.banana = true; this.thrown = e.code === "KeyG"; }
      this.keys.add(e.code);
    }, { signal: this.abort.signal });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code), { signal: this.abort.signal });
    window.addEventListener("blur", () => this.clear(), { signal: this.abort.signal });
  }
  clear() {
    this.keys.clear(); this.jump = this.interaction = this.shoes = this.hit = this.banana = this.thrown = false;
  }
  dispose() { this.abort.abort(); this.enabled = false; this.clear(); }
  punch() { if (this.enabled) this.hit = true; }
  controls(yaw: number) {
    if (!this.enabled) this.clear();
    const direction = keyboardMovement(this.keys, yaw);
    this.input.x = direction.x; this.input.z = direction.z;
    this.input.sprint =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    this.input.jump = this.jump;
    this.jump = false;
    this.input.toggleShoes = this.shoes;
    this.shoes = false;
    this.input.hit = this.hit;
    this.hit = false;
    this.input.banana = this.banana;
    this.input.throwBanana = this.thrown;
    this.input.aim = this.enabled;
    this.input.facing = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    this.banana = false;
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
