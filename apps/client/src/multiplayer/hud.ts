import type { Network } from "./net.ts";
import { RoomPhase } from "@race/shared";
import { raceStandings, type MapPoint } from "./raceHudModel.ts";
export class Hud {
  private root: HTMLElement;
  private leaderboard = document.querySelector<HTMLElement>("#race-leaderboard")!;
  private leaders = document.querySelector<HTMLOListElement>("#race-leaders")!;
  private ownRank = document.querySelector<HTMLElement>("#race-own-rank")!;
  constructor(private element: HTMLDivElement) {
    this.root = element.parentElement!;
    element.classList.add("pixel-panel");
    this.leaderboard.classList.add("pixel-panel");
    element.hidden = true;
  }
  private elapsed = 0;
  private frames = 0;
  update(dt: number, net: Network, local: MapPoint) {
    const dev = !!net.room?.state.devMode;
    this.root.dataset.devMode = String(dev);
    const running = net.room?.state.phase === RoomPhase.Running;
    this.element.hidden = !running;
    this.leaderboard.hidden = !net.canPlay;
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < 0.25) return;
    if (running) {
      const fps = Math.round(this.frames / this.elapsed);
      this.element.textContent = `${fps} FPS · ${net.offline ? "OFFLINE" : `${net.rtt} ms ping`} · ${net.room?.state?.players?.size ?? 0} players`;
    }
    if (net.canPlay) {
      const ranked = raceStandings(net.room.state, net.room.sessionId, local);
      const rows = ranked.slice(0, 5).map((player, index) => {
        const row = document.createElement("li"); row.dataset.you = String(player.id === net.room.sessionId);
        const place = document.createElement("span"); place.className = "race-place"; place.textContent = String(index + 1).padStart(2, "0");
        const name = document.createElement("span"); name.className = "race-name"; name.textContent = player.name + (player.id === net.room.sessionId ? " · You" : "");
        const distance = document.createElement("b"); distance.textContent = `${Math.round(player.distance)} m`;
        row.append(place, name, distance); return row;
      });
      this.leaders.replaceChildren(...rows);
      const rank = ranked.findIndex(player => player.id === net.room.sessionId);
      this.ownRank.hidden = rank < 5;
      if (rank >= 5) this.ownRank.textContent = `#${rank + 1} · You · ${Math.round(ranked[rank].distance)} m to ETH`;
    }
    this.elapsed = this.frames = 0;
  }
  dispose() { this.element.hidden = this.leaderboard.hidden = true; delete this.root.dataset.devMode; }
}
