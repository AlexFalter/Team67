import { LocalPlayer } from "./localPlayer.ts";
import { PlayerView, PERSPECTIVES } from "./view.ts";

export class GameControls {
  private menu = document.querySelector<HTMLElement>("#pause")!;
  private play = document.querySelector<HTMLButtonElement>("#play")!;
  private crosshair = document.querySelector<HTMLElement>("#crosshair")!;
  private abort = new AbortController();
  private captured = false;
  private edge = { x: 0, y: 0 };
  constructor(private canvas: HTMLCanvasElement, private local: LocalPlayer, private view: PlayerView, private ready: () => boolean) {
    const options = { signal: this.abort.signal };
    canvas.tabIndex = 0;
    this.play.addEventListener("click", () => void this.resume(), options);
    document.querySelector("#resume")!.addEventListener("click", () => void this.resume(), options);
    document.querySelector("#perspective")!.addEventListener("click", () => { view.cycle(); this.update(); }, options);
    document.querySelector<HTMLInputElement>("#bob")!.addEventListener("change", e => { view.bob = (e.target as HTMLInputElement).checked; }, options);
    document.querySelector<HTMLInputElement>("#sensitivity")!.addEventListener("input", e => { view.sensitivity = Number((e.target as HTMLInputElement).value) / 10000; }, options);
    canvas.addEventListener("click", () => { if (local.enabled) local.punch(); else void this.resume(); }, options);
    document.addEventListener("mousemove", e => {
      if (!local.enabled || (!this.captured && e.target !== canvas)) return;
      view.look(e.movementX, e.movementY);
      const rect = canvas.getBoundingClientRect();
      this.edge = edgeTurn(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    }, options);
    canvas.addEventListener("mouseleave", () => { this.edge = { x: 0, y: 0 }; }, options);
    canvas.addEventListener("wheel", e => { if (local.enabled) e.preventDefault(); }, { passive: false, signal: this.abort.signal });
    document.addEventListener("pointerlockchange", () => {
      const captured = document.pointerLockElement === canvas;
      if (this.captured && !captured) this.pause();
      this.captured = captured;
    }, options);
    document.addEventListener("pointerlockerror", () => this.fallback(), options);
    window.addEventListener("blur", () => { if (local.enabled) this.pause(); }, options);
    window.addEventListener("keydown", e => {
      if (!ready()) return;
      if (e.code === "Escape") { e.preventDefault(); if (this.menu.hidden) this.pause(); else if (!e.repeat) void this.resume(); }
      if (local.enabled && ["F5", "KeyV"].includes(e.code)) { e.preventDefault(); if (!e.repeat) view.cycle(); this.update(); }
    }, options);
  }
  dispose() { this.abort.abort(); this.local.enabled = false; if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  private fallback() {
    if (this.abort.signal.aborted) return;
    this.menu.querySelector<HTMLElement>("[role=status]")!.textContent = "Your browser rejected cursor capture. Move over the game to look; holding at an edge keeps turning.";
  }
  async resume() {
    if (!this.ready()) return;
    this.menu.hidden = true; this.local.clear(); this.edge = { x: 0, y: 0 }; this.local.enabled = true; this.canvas.focus(); this.update();
    this.menu.querySelector<HTMLElement>("[role=status]")!.textContent = "";
    try { await this.canvas.requestPointerLock(); } catch { this.fallback(); }
  }
  pause() {
    this.local.enabled = false; this.local.clear(); this.menu.hidden = !this.ready();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.update(); if (this.ready()) document.querySelector<HTMLButtonElement>("#resume")!.focus();
  }
  update(dt = 0) {
    if (!this.ready()) {
      this.local.enabled = false; this.local.clear(); this.menu.hidden = true;
      this.edge = { x: 0, y: 0 };
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
    if (this.local.enabled && !this.captured) this.view.look(this.edge.x * dt * 520, this.edge.y * dt * 520);
    this.play.hidden = !this.ready() || this.local.enabled || !this.menu.hidden;
    this.crosshair.hidden = !this.ready() || !this.local.enabled || this.view.perspective !== 0;
    document.querySelector<HTMLButtonElement>("#perspective")!.textContent = `View: ${PERSPECTIVES[this.view.perspective]}`;
  }
}

export function edgeTurn(x: number, y: number, width: number, height: number) {
  const edge = (n: number, size: number) => n < 30 ? -Math.min(1, (30 - n) / 30) : n > size - 30 ? Math.min(1, (n - size + 30) / 30) : 0;
  return { x: edge(x, width), y: edge(y, height) };
}
