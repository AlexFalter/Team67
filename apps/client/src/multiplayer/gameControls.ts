import { ActionHud, type ContextAction } from "./actionHud.ts";
import { LocalPlayer } from "./localPlayer.ts";
import { PlayerView, PERSPECTIVES } from "./view.ts";

export class GameControls {
  private menu = document.querySelector<HTMLElement>("#pause")!;
  private play = document.querySelector<HTMLButtonElement>("#play")!;
  private crosshair = document.querySelector<HTMLElement>("#crosshair")!;
  private abort = new AbortController();
  private captured = false;
  private captureNeeded = false;
  private resumeAttempt = 0;
  private discardMouseDelta = false;
  private actions: ActionHud;
  private edge = { x: 0, y: 0 };
  constructor(private canvas: HTMLCanvasElement, private local: LocalPlayer, private view: PlayerView, private ready: () => boolean, private suspended: () => boolean = () => false, now: () => number = () => Date.now(), context: () => ContextAction[] = () => [], respawn: () => void = () => {}) {
    const options = { signal: this.abort.signal };
    canvas.tabIndex = 0;
    this.actions = new ActionHud(local, now, () => canvas.focus(), context);
    this.play.addEventListener("click", () => void this.resume(), options);
    document.querySelector("#resume")!.addEventListener("click", () => void this.resume(), options);
    document.querySelector("#respawn")!.addEventListener("click", () => { if (ready() && !this.suspended()) { local.clear(); respawn(); } }, options);
    document.querySelector("#perspective")!.addEventListener("click", () => { view.cycle(); this.update(); }, options);
    document.querySelector<HTMLInputElement>("#bob")!.addEventListener("change", e => { view.bob = (e.target as HTMLInputElement).checked; }, options);
    document.querySelector<HTMLInputElement>("#sensitivity")!.addEventListener("input", e => { view.sensitivity = Number((e.target as HTMLInputElement).value) / 10000; }, options);
    canvas.addEventListener("click", () => { if (local.enabled && this.captured) local.punch(); else void this.resume(); }, options);
    document.addEventListener("mousemove", e => {
      if (this.suspended() || !local.enabled || !document.hasFocus() || (!this.captured && e.target !== canvas)) return;
      if(this.discardMouseDelta){this.discardMouseDelta=false;return;}
      view.look(e.movementX, e.movementY);
      const rect = canvas.getBoundingClientRect();
      this.edge = edgeTurn(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    }, options);
    canvas.addEventListener("mouseleave", () => { this.edge = { x: 0, y: 0 }; }, options);
    canvas.addEventListener("wheel", e => { if (local.enabled) e.preventDefault(); }, { passive: false, signal: this.abort.signal });
    document.addEventListener("pointerlockchange", () => {
      if(document.pointerLockElement===canvas&&(!local.enabled||!ready()||this.suspended()||!document.hasFocus())){document.exitPointerLock();return;}
      this.syncPointerLock();
    }, options);
    document.addEventListener("pointerlockerror", () => this.fallback(), options);
    window.addEventListener("blur", () => { if (local.enabled) this.pause(); }, options);
    window.addEventListener("keydown", e => {
      if (e.code === "Escape" && document.pointerLockElement === canvas && (!ready() || this.suspended())) {
        document.exitPointerLock(); return;
      }
      if (!ready() || this.suspended()) return;
      if (e.code === "Escape") { e.preventDefault(); if (this.menu.hidden) this.pause(); else if (!e.repeat) void this.resume(); }
      if (local.enabled && ["F5", "KeyV"].includes(e.code)) { e.preventDefault(); if (!e.repeat) view.cycle(); this.update(); }
    }, options);
  }
  dispose() { this.actions.dispose(); this.abort.abort(); this.resumeAttempt++; this.local.enabled = false; if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  private syncPointerLock() {
    const captured = document.pointerLockElement === this.canvas;
    const released = this.captured && !captured;
    this.captured = captured;
    if (captured) {this.captureNeeded = false;this.discardMouseDelta=true;}
    // Scanner/map releases are intentional; they must not leave a pause overlay
    // behind when an asynchronous pointerlockchange arrives after dismissal.
    if (released && this.local.enabled && this.ready() && !this.suspended()) this.pause();
  }
  resumeAfterInteraction() {this.restoreGameplay();}
  restoreGameplay() {
    if (!this.ready() || this.suspended() || !document.hasFocus()) return;
    this.captured = document.pointerLockElement === this.canvas;
    this.menu.hidden = true; this.local.clear(); this.edge = { x: 0, y: 0 };
    this.local.enabled = true; this.canvas.focus(); this.update();
    void this.captureCursor();
  }
  private fallback() {
    if (this.abort.signal.aborted) return;
    if(!this.ready()||this.suspended()||!document.hasFocus())return;
    this.captureNeeded = false;
    this.update();
    this.menu.querySelector<HTMLElement>("[role=status]")!.textContent = "Your browser rejected cursor capture. Move over the game to look; holding at an edge keeps turning.";
  }
  async resume() {
    if (!this.ready()||this.suspended()||!document.hasFocus()) return;
    this.menu.hidden = true; this.local.clear(); this.edge = { x: 0, y: 0 }; this.local.enabled = true; this.canvas.focus(); this.update();
    this.menu.querySelector<HTMLElement>("[role=status]")!.textContent = "";
    await this.captureCursor();
  }
  private async captureCursor() {
    if (document.pointerLockElement === this.canvas || !this.ready() || this.suspended()) return;
    this.captureNeeded = false;
    const attempt=++this.resumeAttempt;
    try { await this.canvas.requestPointerLock(); } catch { if(attempt===this.resumeAttempt)this.fallback(); }
  }
  pause() {
    this.resumeAttempt++;
    this.local.enabled = false; this.local.clear(); this.menu.hidden = !this.ready();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.update(); if (this.ready()) document.querySelector<HTMLButtonElement>("#resume")!.focus();
  }
  suspendForMap() {
    this.captured = false; this.local.enabled = false; this.local.clear(); this.edge = { x: 0, y: 0 };
    this.menu.hidden = this.play.hidden = this.crosshair.hidden = true;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  update(dt = 0) {
    this.actions?.update(this.ready() && !this.suspended() && this.local.enabled && this.menu.hidden === true);
    if (this.ready() && this.suspended()) {
      this.local.clear(); this.edge = { x: 0, y: 0 };
      this.play.hidden = this.crosshair.hidden = true;
      return;
    }
    if (!this.ready()) {
      this.local.enabled = false; this.local.clear(); this.menu.hidden = true;
      this.edge = { x: 0, y: 0 };
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
    if (this.local.enabled && !this.captured) this.view.look(this.edge.x * dt * 520, this.edge.y * dt * 520);
    this.play.hidden = !this.ready() || (this.local.enabled && !this.captureNeeded) || !this.menu.hidden;
    this.crosshair.hidden = !this.ready() || !this.local.enabled || this.view.perspective !== 0;
    document.querySelector<HTMLButtonElement>("#perspective")!.textContent = `View: ${PERSPECTIVES[this.view.perspective]}`;
  }
}

export function edgeTurn(x: number, y: number, width: number, height: number) {
  const edge = (n: number, size: number) => n < 30 ? -Math.min(1, (30 - n) / 30) : n > size - 30 ? Math.min(1, (n - size + 30) / 30) : 0;
  return { x: edge(x, width), y: edge(y, height) };
}
