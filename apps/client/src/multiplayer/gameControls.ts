import {CaptureRecovery,resumeKey} from "./captureRecovery.ts";
import { ActionHud, type ContextAction, type WeaponAction } from "./actionHud.ts";
import { LocalPlayer } from "./localPlayer.ts";
import { PlayerView, PERSPECTIVES } from "./view.ts";

export class GameControls {
  externalCapture?: () => boolean;
  externalMenuReady?: () => boolean;
  private menu = document.querySelector<HTMLElement>("#pause")!;
  private available = false;
  private crosshair = document.querySelector<HTMLElement>("#crosshair")!;
  private abort = new AbortController();
  private captured = false;
  private capturePending = false;
  private recaptureOnInput = false;
  private capturePrompt = document.createElement("span");
  private recovery?: CaptureRecovery;
  private resumeKeys = new Set<string>();
  private discardMouseDelta = false;
  private releasePauseAt = 0;
  private playgroundPaused = false;
  private interactionEscapeHeld = false;
  private interactionInputPending = false;
  private actions: ActionHud;
  constructor(private canvas: HTMLCanvasElement, private local: LocalPlayer, private view: PlayerView, private ready: () => boolean, private suspended: () => boolean = () => false, now: () => number = () => Date.now(), context: () => ContextAction[] = () => [], weapon: () => WeaponAction | undefined = () => undefined, respawn: () => void = () => {}) {
    const options = { signal: this.abort.signal };
    canvas.tabIndex = 0;
    this.capturePrompt.className="capture-continue pixel-panel";this.capturePrompt.style.pointerEvents="none";this.capturePrompt.textContent="Press WASD or Enter to continue";this.capturePrompt.hidden=true;canvas.parentElement!.append(this.capturePrompt);
    this.actions = new ActionHud(local, now, () => canvas.focus(), context, weapon);
    document.querySelector("#respawn")!.addEventListener("click", () => { if (ready() && !this.suspended()) { local.clear(); respawn(); } }, options);
    document.querySelector("#resume")!.addEventListener("click", () => void this.resume(), options);
    document.querySelector("#perspective")!.addEventListener("click", () => { view.cycle(); this.update(); }, options);
    document.querySelector<HTMLInputElement>("#bob")!.addEventListener("change", e => { view.bob = (e.target as HTMLInputElement).checked; }, options);
    document.querySelector<HTMLInputElement>("#sensitivity")!.addEventListener("input", e => { view.sensitivity = Number((e.target as HTMLInputElement).value) / 10000; }, options);
    canvas.addEventListener("click", () => { if (local.enabled && this.captured) {const equipped=weapon();if(equipped){if(equipped.enabled)equipped.run();}else local.punch();} else void this.resume(); }, options);
    document.addEventListener("mousemove", e => {
      if (this.suspended() || !local.enabled || !document.hasFocus() || (document.pointerLockElement !== canvas)) return;
      if(this.discardMouseDelta){this.discardMouseDelta=false;return;}
      view.look(e.movementX, e.movementY);

    }, options);
    canvas.addEventListener("wheel", e => { if (local.enabled) e.preventDefault(); }, { passive: false, signal: this.abort.signal });
    document.addEventListener("pointerlockchange", () => {
      if(this.externalCapture?.()){
        const released=this.captured&&document.pointerLockElement!==canvas;
        this.recovery?.cancel();this.capturePending=false;this.captured=document.pointerLockElement===canvas;
        if(released&&!this.interactionInputPending&&this.externalMenuReady?.()&&this.menu.hidden){this.releasePauseAt=Date.now();this.pause();}return;
      }
      if(document.pointerLockElement===canvas)this.cursor.changed();
      else {this.recovery?.changed();this.syncPointerLock();}
    }, options);
    document.addEventListener("pointerlockerror", () => this.recovery?.failed(), options);
    window.addEventListener("keyup", e => {
      this.resumeKeys.delete(e.code);
      if(e.code==='Escape') {
        this.releasePauseAt=0;
        this.interactionEscapeHeld = false;
      }
    }, options);
    window.addEventListener("blur", () => { if (local.enabled||this.capturePending) {this.pause();this.recaptureOnInput=true;} }, options);
    document.addEventListener("visibilitychange",()=>{if(document.hidden&&(local.enabled||this.capturePending)){this.pause();this.recaptureOnInput=true;}},options);
    window.addEventListener("keydown", e => {
      if(e.defaultPrevented)return;
      if (e.code === "Escape" && e.repeat && this.interactionEscapeHeld) { e.preventDefault(); return; }
      if(!this.menu.hidden&&this.externalMenuReady?.()&&!this.suspended()&&!e.repeat&&resumeKey(e.code)&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)&&!(e.target instanceof HTMLSelectElement)&&!(e.target instanceof HTMLElement&&e.target.isContentEditable)){e.preventDefault();void this.resume();return;}
      if(e.code==='Escape'&&this.externalMenuReady?.()&&!this.suspended()){
        e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)this.escape();return;
      }
      if (e.code === "Escape" && document.pointerLockElement === canvas && (!ready() || this.suspended())) {
        document.exitPointerLock(); return;
      }
      if (!ready() || this.suspended()) return;
      if(this.recaptureOnInput&&!e.repeat&&resumeKey(e.code)&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)&&!(e.target instanceof HTMLSelectElement)&&!(e.target instanceof HTMLElement&&e.target.isContentEditable)){e.preventDefault();this.resumeKeys.add(e.code);void this.resume();return;}
      if (e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if(e.repeat)return; this.escape(); }
      if (local.enabled && e.code === "KeyF") { e.preventDefault(); if (!e.repeat) view.cycle(); this.update(); }
    }, {...options,capture:true});
  }
  dispose() { this.capturePrompt.remove();this.actions.dispose(); this.abort.abort(); this.recovery?.cancel(); this.local.enabled = false; if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  private syncPointerLock() {
    const captured = document.pointerLockElement === this.canvas;
    const released = this.captured && !captured;
    this.captured = captured;
    if (captured) {
      this.capturePending=false;this.recaptureOnInput=false;this.discardMouseDelta=true;
      if(this.ready()&&!this.suspended()){this.available=true;this.local.enabled=true;this.menu.hidden=true;this.local.resumeMovement?.(this.resumeKeys??new Set());this.canvas.focus();this.update();}
    }
    // A captured cursor released during gameplay is Escape, even before the
    // first mouse movement after an interaction. Intentional releases clear
    // capture ownership or make gameplay unavailable before releasing it.
    if (released && !this.interactionEscapeHeld && !this.interactionInputPending && this.menu.hidden && this.ready() && !this.suspended()){this.releasePauseAt=Date.now();this.pause();}
  }
  resumeAfterInteraction() {this.restoreGameplay();}
  restoreGameplay() {
    if (this.interactionEscapeHeld || this.interactionInputPending) {
      this.local.enabled = false; this.local.clear(); this.recaptureOnInput = true;
      return;
    }
    if (this.playgroundPaused) return;
    if (!this.ready() || this.suspended() || !document.hasFocus()) return;
    this.available=true;this.recaptureOnInput=true;
    this.captured = document.pointerLockElement === this.canvas;
    this.menu.hidden = true; this.local.clear();
    this.local.enabled = this.captured; this.canvas.focus(); this.update();
    return this.captureCursor();
  }
  private get cursor() {
    return this.recovery??=new CaptureRecovery({
      locked:()=>document.pointerLockElement===this.canvas,
      allowed:()=>!this.abort.signal.aborted&&this.ready()&&!this.suspended()&&this.menu.hidden===true,
      focused:()=>document.hasFocus()&&!document.hidden,
      request:()=>{this.capturePending=true;this.update();return this.canvas.requestPointerLock();},
      release:()=>document.exitPointerLock(),
      captured:()=>{this.capturePending=false;this.syncPointerLock();},
      waiting:()=>this.fallback(),
    });
  }
  private fallback() {
    this.capturePending=false;this.captured=false;
    if(this.abort.signal.aborted||!this.ready()||this.suspended()||!document.hasFocus())return;
    this.local.enabled=false;this.local.clear();this.menu.hidden=true;this.recaptureOnInput=true;this.update();
  }
  async resume() {
    this.interactionInputPending = false;
    this.playgroundPaused = false;
    if(this.externalMenuReady?.()&&!this.suspended()&&document.hasFocus()){
      this.menu.hidden=true;this.local.enabled=false;this.local.clear();this.canvas.focus();
      if(this.externalCapture?.())try{await this.canvas.requestPointerLock();}catch{/* Ride look also supports an uncaptured cursor. */}
      if(!this.menu.hidden&&document.pointerLockElement===this.canvas)document.exitPointerLock();
      this.update();return;
    }
    if (!this.ready()||this.suspended()||!document.hasFocus()) return;
    this.menu.hidden = true; this.local.clear(); this.local.enabled = document.pointerLockElement===this.canvas; this.canvas.focus(); this.update();
    this.menu.querySelector<HTMLElement>("[role=status]")!.textContent = "";
    await this.captureCursor();
  }
  private async captureCursor() { await this.cursor.resume(); }
  escape() {
    // Some browsers deliver Escape after its pointer-lock release event.
    // Keep that single press from immediately closing the menu it just opened.
    if(!this.menu.hidden&&this.releasePauseAt&&Date.now()-this.releasePauseAt<120){this.releasePauseAt=0;return;}
    this.releasePauseAt=0;this.toggleMenu();
  }
  toggleMenu() {
    if (this.menu.hidden) this.pause();
    else void this.resume();
  }
  pause() {
    this.recovery?.cancel();this.resumeKeys?.clear();this.capturePending=false;this.recaptureOnInput=true;
    this.local.enabled = false; this.local.clear(); this.menu.hidden = !(this.ready()||this.externalMenuReady?.());
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.update(); if (!this.menu.hidden) document.querySelector<HTMLButtonElement>("#resume")!.focus();
  }
  holdPlaygroundMenu() { this.playgroundPaused = true; this.pause(); }
  holdInteractionEscape() {
    this.interactionEscapeHeld = true;
    this.interactionInputPending = true;
    this.recaptureOnInput = true;
    this.recovery?.cancel(); this.capturePending = false;
  }
  suspendForMap() {this.suspendForInteraction();this.menu.hidden=true;}
  suspendForInteraction() {
    this.recovery?.cancel();this.resumeKeys?.clear();this.capturePending=false;
    this.captured = false; this.local.enabled = false; this.local.clear();
    this.crosshair.hidden = true;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  update(dt = 0) {
    // Keep the frame callback signature; mouse-look is driven only by captured input.
    void dt;
    const available=this.ready()&&!this.suspended();
    const returned=available&&!this.available;this.available=available;
    if(returned&&this.menu.hidden)this.restoreGameplay();
    if(!this.interactionEscapeHeld&&!this.interactionInputPending&&(this.ready()||(this.externalCapture?.()&&this.externalMenuReady?.()))&&!this.suspended()&&this.captured&&!this.capturePending&&this.menu.hidden&&document.pointerLockElement!==this.canvas){
      // The frame may observe Escape before pointerlockchange is delivered.
      this.captured=false;this.releasePauseAt=Date.now();this.pause();
    }
    if(this.ready()&&!this.suspended()&&this.local.enabled&&!this.capturePending&&!this.captured&&document.pointerLockElement!==this.canvas){this.local.enabled=false;this.local.clear();this.recaptureOnInput=true;}
    this.capturePrompt.hidden=!this.recaptureOnInput||!this.ready()||this.suspended()||!this.menu.hidden||this.capturePending||this.local.enabled;
    this.actions?.update(this.ready() && !this.suspended() && this.local.enabled && this.menu.hidden === true);
    if (this.ready() && this.suspended()) {
      this.local.clear();
      this.crosshair.hidden = true;
      return;
    }
    if (!this.ready()) {
      if(this.capturePending){this.recovery?.cancel();this.resumeKeys?.clear();this.capturePending=false;}
      this.local.enabled = false; this.local.clear(); if(!this.externalMenuReady?.()&&!this.playgroundPaused)this.menu.hidden = true;

      // An encounter can open before its host's syncLock runs. Hand off
      // capture here too, before releasing it or receiving a queued event.
      if (!this.externalCapture?.()) this.suspendForInteraction();
    }

    this.crosshair.hidden = !this.ready() || !this.local.enabled || this.view.perspective !== 0;
    document.querySelector<HTMLButtonElement>("#perspective")!.textContent = `View: ${PERSPECTIVES[this.view.perspective]}`;
  }
}

// Retained for integrations that explicitly choose uncaptured edge-look.
export function edgeTurn(x: number, y: number, width: number, height: number) {
  const edge = (n: number, size: number) => n < 30 ? -Math.min(1, (30 - n) / 30) : n > size - 30 ? Math.min(1, (n - size + 30) / 30) : 0;
  return { x: edge(x, width), y: edge(y, height) };
}
