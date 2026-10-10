/** Plain DOM HUD. Written by the game loop at most 10 times a second; React never re-renders for it. */
export class Hud {
  readonly crosshair: HTMLElement;
  readonly timer: HTMLElement;
  readonly prompt: HTMLElement;
  readonly toast: HTMLElement;
  readonly status: HTMLElement;
  readonly debug: HTMLElement;
  private toastUntil = 0;
  private text = new Map<HTMLElement, string>();

  constructor(private root: HTMLElement) {
    const el = (name: string, text = "") => {
      const e = document.createElement("div");
      e.className = `hud-${name}`;
      e.textContent = text;
      e.hidden = !text;
      root.append(e);
      return e;
    };
    this.crosshair = el("crosshair", "+");
    this.timer = el("timer");
    this.prompt = el("prompt");
    this.toast = el("toast");
    this.status = el("status");
    this.debug = el("debug");
  }

  /** Only touches the DOM when the text actually changes. */
  set(e: HTMLElement, text: string) {
    if (this.text.get(e) === text) return;
    this.text.set(e, text);
    e.textContent = text;
    if (e !== this.debug) e.hidden = !text;
  }

  notice(text: string, ms = 2500) {
    this.toastUntil = performance.now() + ms;
    this.set(this.toast, text);
  }

  tick(now: number) {
    if (this.toastUntil && now > this.toastUntil) { this.toastUntil = 0; this.set(this.toast, ""); }
  }

  dispose() {
    this.root.replaceChildren();
  }
}
