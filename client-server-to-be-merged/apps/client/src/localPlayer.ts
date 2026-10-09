import {
  createBody,
  stepMovement,
  applyImpulse,
  type Impulse,
  type Input,
} from "@race/shared";
export class LocalPlayer {
  body = createBody();
  private keys = new Set<string>();
  private jump = false;
  private interaction = false;
  private input: Input = { x: 0, z: 0, sprint: false, jump: false };
  constructor() {
    window.addEventListener("keydown", (e) => {
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))
        e.preventDefault();
      if (e.code === "Space" && !e.repeat) this.jump = true;
      if (e.code === "KeyE" && !e.repeat) this.interaction = true;
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.jump = false;
      this.interaction = false;
    });
  }
  controls(yaw: number) {
    const x = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      z = Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW"));
    this.input.x = x * Math.cos(yaw) + z * Math.sin(yaw);
    this.input.z = -x * Math.sin(yaw) + z * Math.cos(yaw);
    this.input.sprint =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    this.input.jump = this.jump;
    this.jump = false;
    return this.input;
  }
  takeInteraction() {
    const pressed = this.interaction;
    this.interaction = false;
    return pressed;
  }
  step(dt: number, yaw: number) {
    stepMovement(this.body, this.controls(yaw), dt, Date.now());
  }
  impulse(hit: Impulse) {
    if (this.body.vehicleId) return;
    applyImpulse(this.body, hit, Date.now());
  }
}
