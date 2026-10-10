import { RoomPhase, type WorldState, type RoundResult } from "@race/shared";
import type { Network } from "./net.ts";

export function rankedResults(results: ReadonlyMap<string, RoundResult>) {
  return [...results].sort((a, b) => b[1].hitsLanded - a[1].hitsLanded || a[1].name.localeCompare(b[1].name));
}

export class RoomFlow {
  private root = document.querySelector<HTMLElement>("#room-screen")!;
  private title = this.root.querySelector<HTMLElement>("#room-title")!;
  private message = this.root.querySelector<HTMLElement>("#room-message")!;
  private roster = this.root.querySelector<HTMLElement>("#room-roster")!;
  private ready = this.root.querySelector<HTMLButtonElement>("#room-ready")!;
  private restart = this.root.querySelector<HTMLButtonElement>("#room-restart")!;
  private table = this.root.querySelector<HTMLTableElement>("#room-results")!;
  private timer = document.querySelector<HTMLElement>("#round-timer")!;
  private finish = document.querySelector<HTMLButtonElement>("#finish-round")!;
  private signature = "";
  private abort = new AbortController();
  private prepared = false;
  private preparationError = "";
  constructor(private net: Network, preparation: Promise<void>, unlockAudio: () => void) {
    this.ready.disabled = true;
    void preparation.then(() => { if (!this.abort.signal.aborted) {
      this.prepared = true; this.ready.disabled = false;
      if (this.net.room?.state.phase === RoomPhase.Lobby) this.message.textContent = "The round starts when everyone is ready.";
    } })
      .catch(error => { if (!this.abort.signal.aborted) this.preparationError = `${String(error)} Reload to retry loading the game.`; });
    const options = { signal: this.abort.signal };
    this.ready.addEventListener("click", () => {
      const member = net.room?.state.members.get(net.room.sessionId);
      if (member && this.prepared) { unlockAudio(); net.room.send("ready", !member.ready); }
    }, options);
    this.restart.addEventListener("click", () => net.room.send("restartRound"), options);
    this.finish.addEventListener("click", () => net.room.send("finishRound"), options);
    this.root.querySelector("#room-leave")!.addEventListener("click", () => location.reload(), options);
  }
  patch(state: WorldState, id: string) {
    const signature = JSON.stringify([state.phase, state.introComplete, state.devMode, state.skipIntro, state.hostId, id,
      [...state.members].map(([key, m]) => [key, m.name, m.ready, m.spectator]),
      [...state.results].map(([key, r]) => [key, r.name, r.hitsLanded, r.hitsReceived])]);
    if (signature === this.signature) return;
    this.signature = signature;
    const member = state.members.get(id), host = state.hostId === id;
    this.root.hidden = state.phase === RoomPhase.Running && !!member && !member.spectator;
    this.root.querySelector<HTMLElement>("#room-code-label")!.textContent = `ROOM ${this.net.room.roomId}`;
    this.title.textContent = state.phase === RoomPhase.Running ? "Round in progress" : state.phase === RoomPhase.Finished ? "Round finished" : "Lobby";
    this.ready.hidden = state.phase !== RoomPhase.Lobby || !member;
    this.ready.textContent = member?.ready ? "Cancel ready" : "Ready";
    this.restart.hidden = state.phase !== RoomPhase.Finished || !host;
    this.finish.hidden = state.phase !== RoomPhase.Running || !state.introComplete || !host || !!member?.spectator;
    this.roster.hidden = state.phase === RoomPhase.Finished;
    this.table.hidden = state.phase !== RoomPhase.Finished;
    this.message.textContent = state.phase === RoomPhase.Lobby
      ? state.devMode ? `Dev mode${state.skipIntro ? " · bus intro skipped" : ""}. The round starts when everyone is ready.` : "The round starts when everyone is ready."
      : state.phase === RoomPhase.Running
        ? "You joined during a round. Wait here; you can play in the next round."
        : host ? "Everyone can see these results. Return to the lobby to play again."
          : "Everyone can see these results. Waiting for the host to return to the lobby.";
    const items = document.createDocumentFragment();
    for (const [memberId, m] of state.members) {
      const item = document.createElement("li");
      const status = state.phase === RoomPhase.Lobby ? m.ready ? "Ready" : "Not ready" : m.spectator ? "Waiting" : "Playing";
      item.textContent = `${m.name}${memberId === id ? " (you)" : ""}${memberId === state.hostId ? " · host" : ""} — ${status}`;
      items.append(item);
    }
    this.roster.replaceChildren(items);
    if (state.phase === RoomPhase.Finished) {
      const rows = document.createDocumentFragment();
      for (const [, result] of rankedResults(state.results)) {
        const row = document.createElement("tr");
        for (const value of [result.name, result.hitsLanded, result.hitsReceived]) {
          const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell);
        }
        rows.append(row);
      }
      this.table.tBodies[0].replaceChildren(rows);
    }
  }
  update() {
    if (this.net.room?.state.phase === RoomPhase.Lobby && !this.prepared)
      this.message.textContent = this.preparationError || "Loading the battle bus before you can ready up…";
    this.timer.hidden = !this.net.canPlay;
    if (this.net.canPlay) {
      const seconds = Math.max(0, Math.ceil((this.net.room.state.endsAt - this.net.now()) / 1000));
      this.timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining`;
    }
    if (this.net.room && this.net.status.startsWith("Disconnected")) {
      this.root.hidden = false; this.title.textContent = "Disconnected";
      this.message.textContent = "Leave the room to return to the main menu.";
      this.ready.hidden = this.restart.hidden = this.finish.hidden = true;
    }
  }
  dispose() { this.abort.abort(); }
}
