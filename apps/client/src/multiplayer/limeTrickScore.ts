import { LIME_TAILWHIP_ENABLED } from "@race/shared";

/** Display-only trick feedback; no points are added to the race score. */
export class LimeTrickScore {
  private element = document.createElement("div");
  private lastTrick = 0;
  private round = 0;
  private until = 0;
  private chain = 0;
  private chainUntil = 0;
  private multiplier = document.createElement("b");
  private animation?: Animation;

  constructor(parent: HTMLElement) {
    this.element.className = "lime-trick-score";
    this.element.hidden = true;
    this.element.setAttribute("role", "status");
    const name = document.createElement("span"), points = document.createElement("strong");
    name.textContent = "Tailwhip"; points.textContent = "+180";
    this.multiplier.className = "lime-trick-multiplier";
    this.multiplier.hidden = true;
    this.element.append(name, points, this.multiplier);
    parent.append(this.element);
  }

  update(startedAt: number, now: number, round: number, visible: boolean) {
    if (round !== this.round) {
      this.round = round; this.lastTrick = 0; this.until = 0;
      this.chain = 0; this.chainUntil = 0;
    }
    if (!visible || !LIME_TAILWHIP_ENABLED) {
      this.lastTrick = Math.max(this.lastTrick, startedAt);
      this.until = 0; this.chain = 0; this.chainUntil = 0; this.element.hidden = true;
      return;
    }
    const age = now - startedAt;
    if (startedAt > this.lastTrick && age >= 0) {
      this.lastTrick = startedAt;
      // Do not replay old tricks after reconnecting or returning from a background tab.
      if (age < 1000) {
        this.chain = startedAt <= this.chainUntil ? this.chain + 1 : 1;
        this.chainUntil = startedAt + 3000;
        this.multiplier.textContent = `×${this.chain}`;
        this.multiplier.hidden = this.chain < 2;
        this.until = now + 2000;
        this.element.hidden = false;
        this.animation?.cancel();
        this.animation = this.element.animate([
          {opacity: 0, transform: "translate(-50%, 12px) rotate(-6deg) scale(.75)", offset: 0},
          {opacity: 1, transform: "translate(-50%, 0) rotate(-6deg) scale(1.08)", offset: .12},
          {opacity: 1, transform: "translate(-50%, 0) rotate(-6deg) scale(1)", offset: .7},
          {opacity: 0, transform: "translate(-50%, -20px) rotate(-6deg) scale(1)", offset: 1},
        ], {duration: 2000, easing: "ease-out"});
      }
    }
    this.element.hidden = now >= this.until;
  }

  dispose() { this.animation?.cancel(); this.element.remove(); }
}
