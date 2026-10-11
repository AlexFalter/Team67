import type { Body } from "@race/shared";

type Position = Pick<Body, "x" | "y" | "z" | "vehicleId">;

/** Watch coordinates during active gameplay, ignoring small collision jitter. */
export class StuckDetector {
  private anchor?: Position;
  private since = 0;
  private lastFrame = 0;

  update(position: Position, now: number, eligible: boolean) {
    const interrupted = now < this.lastFrame || now - this.lastFrame > 1000;
    this.lastFrame = now;
    if (!eligible || interrupted || !this.anchor || position.vehicleId !== this.anchor.vehicleId ||
        Math.hypot(position.x - this.anchor.x, position.y - this.anchor.y, position.z - this.anchor.z) >= .3) {
      this.anchor = { ...position }; this.since = now;
      return false;
    }
    return now - this.since >= 5000;
  }
}

export class StuckHint {
  private detector = new StuckDetector();
  private element = document.createElement("div");

  constructor(parent: HTMLElement) {
    this.element.className = "stuck-hint";
    this.element.hidden = true;
    this.element.setAttribute("role", "status");
    this.element.textContent = "Stuck? Press Esc and choose ‘Respawn at bus drop-off’ in the pause menu.";
    parent.append(this.element);
  }

  update(position: Position, now: number, eligible: boolean) {
    this.element.hidden = !this.detector.update(position, now, eligible);
  }

  dispose() { this.element.remove(); }
}
