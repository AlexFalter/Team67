import type { Network } from "./net.ts";
export class Hud {
  private element = document.querySelector<HTMLDivElement>("#hud")!;
  private elapsed = 0;
  private frames = 0;
  update(dt: number, net: Network) {
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < 0.25) return;
    this.element.textContent = `${net.status}\nFPS ${Math.round(this.frames / this.elapsed)} · ping ${net.rtt} ms\nClock offset ${net.offset.toFixed(0)} ms\nPlayers ${net.room?.state?.players?.size ?? 0} · collisions ${net.collisions}`;
    this.elapsed = this.frames = 0;
  }
}
