import type { Input as StepInput } from "@race/shared";

const LOOK_LIMIT = Math.PI / 2 - 0.01;

/**
 * Keyboard + raw pointer-lock mouse. Look is applied in the mousemove handler itself (no smoothing),
 * so the next rendered frame always uses the newest yaw/pitch. Keys only count while the pointer is locked.
 */
export class Input {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  locked = false;
  onLockChange?: (locked: boolean) => void;
  // One-shot actions, consumed by whoever handles them.
  punch = false;
  interact = false;
  shoes = false;
  cycleView = false;
  toggleDebug = false;
  private keys = new Set<string>();
  private jumpLatch = false;
  private abort = new AbortController();

  constructor(private canvas: HTMLCanvasElement) {
    const signal = this.abort.signal;
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.clear();
      this.onLockChange?.(this.locked);
    }, { signal });
    document.addEventListener("mousemove", e => {
      if (!this.locked) return;
      // Some browsers emit one huge bogus delta right after locking.
      if (Math.abs(e.movementX) > 800 || Math.abs(e.movementY) > 800) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, this.pitch - e.movementY * this.sensitivity));
    }, { signal });
    canvas.addEventListener("mousedown", e => { if (this.locked && e.button === 0) this.punch = true; }, { signal });
    window.addEventListener("keydown", e => {
      if (e.code === "F3" || e.code === "Backquote") { e.preventDefault(); this.toggleDebug = true; }
      if (!this.locked) return;
      if (e.code === "F5" || e.code === "Space" || e.code === "Tab") e.preventDefault();
      if (!e.repeat) {
        if (e.code === "Space") this.jumpLatch = true;
        if (e.code === "KeyF") this.punch = true;
        if (e.code === "KeyE") this.interact = true;
        if (e.code === "KeyR") this.shoes = true;
        if (e.code === "KeyV" || e.code === "F5") this.cycleView = true;
      }
      this.keys.add(e.code);
    }, { signal });
    window.addEventListener("keyup", e => this.keys.delete(e.code), { signal });
    window.addEventListener("blur", () => this.clear(), { signal });
  }

  async lock() {
    try {
      // Raw, unaccelerated deltas where supported (Chrome); plain lock elsewhere.
      await this.canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try { await this.canvas.requestPointerLock(); } catch { /* user must click again */ }
    }
  }

  unlock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Fill one sim tick of input. The jump press is latched until a tick has seen it. */
  fill(out: StepInput) {
    const k = this.keys;
    out.forward = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    out.right = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    out.sprint = k.has("ShiftLeft") || k.has("ShiftRight");
    out.jump = k.has("Space") || this.jumpLatch;
    out.yaw = this.yaw;
    this.jumpLatch = false;
  }

  clear() {
    this.keys.clear();
    this.jumpLatch = this.punch = this.interact = this.shoes = this.cycleView = false;
  }

  dispose() {
    this.abort.abort();
    this.unlock();
  }
}
