import { CHARACTERS } from "./avatar.ts";
import { RoomPhase, finalScore, type WorldState, type RoundResult } from "@race/shared";
import type { Network } from "./net.ts";

// Final leaderboard: ETH arrivals first (bonus + exam points), then everyone else by distance left.
// Someone standing right at the entrance without entering can tie an arrival with no exam points.
export function rankedResults(results: ReadonlyMap<string, RoundResult>) {
  return [...results].sort((a, b) => finalScore(b[1]) - finalScore(a[1]) || Number(b[1].examStartedAt > 0) - Number(a[1].examStartedAt > 0) || b[1].hitsLanded - a[1].hitsLanded || a[1].name.localeCompare(b[1].name));
}

/** Leaderboard place: medals for the podium, then 4th, 5th, … 11th, 12th, 13th, 21st, … */
export function placeLabel(place: number) {
  const medal = ["🥇 1st", "🥈 2nd", "🥉 3rd"][place - 1];
  if (medal) return medal;
  const tens = place % 100, ones = place % 10;
  return `${place}${tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][ones] ?? "th"}`;
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
  private timerValue = document.querySelector<HTMLElement>("#timer-value")!;
  private timerFill = document.querySelector<HTMLElement>("#timer-fill")!;
  private timerLabel = document.querySelector<HTMLElement>("#timer-label")!;
  private codeLabel = this.root.querySelector<HTMLElement>("#room-code-label")!;
  private codeToggle = this.root.querySelector<HTMLButtonElement>("#room-code-visibility")!;
  private codeVisible = false;
  private finish = document.querySelector<HTMLButtonElement>("#finish-round")!;
  private countdownAnimation?: Animation;
  private signature = "";
  private timerRound = -1;
  private lastRemaining?: number;
  private timerCues = new Set<number>();
  private abort = new AbortController();
  private prepared = false;
  private preparationError = "";
  constructor(private net: Network, preparation: Promise<void>, unlockAudio: () => void, private timerCue: () => void = () => {}) {
    this.ready.disabled = true;
    void preparation.then(() => { if (!this.abort.signal.aborted) {
      this.prepared = true; this.ready.disabled = false;
      if (this.net.room?.state.phase === RoomPhase.Lobby) this.message.textContent = this.lobbyMessage();
    } })
      .catch(error => { if (!this.abort.signal.aborted) this.preparationError = `${String(error)} Reload to retry loading the game.`; });
    const options = { signal: this.abort.signal };
    this.codeToggle.addEventListener("click", () => { this.codeVisible = !this.codeVisible; this.updateCode(); }, options);
    this.ready.addEventListener("click", () => {
      const member = net.room?.state.members.get(net.room.sessionId);
      if (member && this.prepared && net.room.state.hostId === net.room.sessionId) { unlockAudio(); net.room.send("ready", true); }
    }, options);
    this.restart.addEventListener("click", () => net.room.send("restartRound"), options);
    this.finish.addEventListener("click", () => net.room.send("finishRound"), options);
    this.root.querySelector("#room-leave")!.addEventListener("click", () => location.reload(), options);
  }
  patch(state: WorldState, id: string) {
    const signature = JSON.stringify([state.phase, state.introComplete, state.devMode, state.adminMode, state.skipIntro, state.hostId, id,
      [...state.members].map(([key, m]) => [key, m.name, m.ready, m.spectator]),
      [...state.results].map(([key, r]) => [key, r.name, r.hitsLanded, r.hitsReceived, r.examScore, r.examStartedAt, r.distanceToEth])]);
    if (signature === this.signature) return;
    this.signature = signature;
    const member = state.members.get(id), host = state.hostId === id;
    this.root.hidden = state.phase === RoomPhase.Running && !!member && (!member.spectator||this.net.spectating);
    this.root.dataset.phase = state.phase;
    this.root.querySelector<HTMLElement>("#room-count")!.textContent = `${state.members.size} / 40 PLAYERS`;
    this.updateCode();
    this.title.textContent = state.phase === RoomPhase.Running ? "Round in progress" : state.phase === RoomPhase.Finished ? "Round finished" : "Room lobby";
    this.ready.hidden = state.phase !== RoomPhase.Lobby || !member || !host;
    this.ready.textContent = "Start match ↗";
    this.restart.hidden = state.phase !== RoomPhase.Finished || !host;
    this.finish.hidden = state.phase !== RoomPhase.Running || !state.introComplete || !host || !!member?.spectator;
    this.roster.hidden = state.phase === RoomPhase.Finished;
    this.table.hidden = state.phase !== RoomPhase.Finished;
    this.message.textContent = state.phase === RoomPhase.Lobby
      ? this.lobbyMessage()
      : state.phase === RoomPhase.Running
        ? "You joined during a round. Spectate now; you can play in the next round."
        : host ? "Everyone can see these results. Return to the lobby to play again."
          : "Everyone can see these results. Waiting for the host to return to the lobby.";
    const items = document.createDocumentFragment();
    for (const [memberId, m] of state.members) {
      const item = document.createElement("li");
      const status = state.phase === RoomPhase.Lobby ? "IN LOBBY" : m.spectator ? "SPECTATING" : "PLAYING";
      const icon = document.createElement("span"); icon.className = "roster-avatar";
      icon.textContent = ["CS", "SA", "AE", "RD"][m.character] ?? "CS";
      const name = document.createElement("span"); name.className = "roster-player"; name.textContent = m.name;
      const detail = document.createElement("small");
      detail.textContent = [memberId === id ? "YOU" : "", memberId === state.hostId ? "HOST" : "", CHARACTERS[m.character]].filter(Boolean).join(" · ");
      name.append(detail);
      const badge = document.createElement("span"); badge.className = "roster-status"; badge.textContent = status;
      badge.dataset.ready = String(state.phase === RoomPhase.Lobby);
      item.append(icon, name, badge);
      items.append(item);
    }
    this.roster.replaceChildren(items);
    if (state.phase === RoomPhase.Finished) {
      const rows = document.createDocumentFragment();
      for (const [index, [, result]] of rankedResults(state.results).entries()) {
        const row = document.createElement("tr"), reached = result.examStartedAt > 0;
        row.dataset.eth = reached ? "reached" : "missed";
        if (index < 3) row.dataset.podium = String(index + 1);
        const score = finalScore(result);
        for (const value of [placeLabel(index + 1), result.name, score > 0 ? `+${score}` : score < 0 ? `−${-score}` : "0",
          `${Math.round(result.distanceToEth)} m`, result.hitsLanded, result.hitsReceived]) {
          const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell);
        }
        rows.append(row);
      }
      this.table.tBodies[0].replaceChildren(rows);
    }
  }
  private updateCode() {
    this.codeLabel.textContent = this.codeVisible ? this.net.room?.roomId ?? "" : "••••••";
    this.codeToggle.textContent = this.codeVisible ? "Hide" : "Show";
    this.codeToggle.setAttribute("aria-label", this.codeVisible ? "Hide room code" : "Show room code");
    this.codeToggle.setAttribute("aria-pressed", String(this.codeVisible));
  }
  private lobbyMessage() {
    const state = this.net.room?.state;
    const prefix = state?.adminMode ? "Admin free roam · no time limit. " : state?.devMode ? `Dev mode${state.skipIntro ? " · bus intro skipped" : ""}. ` : "";
    return prefix + (state?.hostId === this.net.room?.sessionId
      ? "Share the room code. When you're ready, start the match for everyone."
      : "You're in. The host will start the match—every player competes solo.");
  }
  update() {
    if(this.net.spectating)this.root.hidden=true;
    if (this.net.room?.state.phase === RoomPhase.Lobby && !this.prepared)
      this.message.textContent = this.preparationError || "Loading the battle bus before you can ready up…";
    const canPlay = this.net.canPlay;
    const state = this.net.room?.state;
    this.timer.hidden = !canPlay || state?.adminMode === true;
    const remaining = canPlay ? Math.max(0, this.net.room.state.endsAt - this.net.now()) : 0;
    const finalCountdown = canPlay && remaining > 0 && remaining <= 10000;
    this.timer.dataset.final = String(finalCountdown);
    this.timer.dataset.urgent = String(canPlay && remaining <= 30000);
    const round = this.net.room?.state.startedAt ?? 0;
    if (round !== this.timerRound) { this.timerRound = round; this.timerCues.clear(); this.lastRemaining = undefined; }
    if (canPlay && !state?.adminMode) {
      const crossed = [120000, 60000, 30000].filter(t => this.lastRemaining !== undefined && this.lastRemaining > t && remaining <= t && !this.timerCues.has(t));
      crossed.forEach(t => this.timerCues.add(t));
      if (crossed.length && remaining > 0) this.timerCue();
      this.lastRemaining = remaining;
    }
    if (canPlay && !state?.adminMode) {
      const seconds = Math.ceil(remaining / 1000);
      const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      this.timerFill.style.width = `${Math.min(100, 100 * remaining / Math.max(1, this.net.room.state.endsAt - this.net.room.state.startedAt))}%`;
      this.timerLabel.textContent = finalCountdown ? "RUN! LAST SECONDS" : remaining <= 30000 ? "HURRY TO ETH" : "EXAM STARTS IN";
      if (this.timerValue.textContent !== text) {
        this.timerValue.textContent = text;
        this.timer.setAttribute("aria-label", `${seconds} seconds remaining`);
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          this.countdownAnimation?.cancel();
          this.countdownAnimation = this.timerValue.animate([{ transform: "translateY(0)", scale: "1" }, { transform: "translateY(-3px)", scale: finalCountdown ? "1.10" : "1.025", offset: .3 }, { transform: "translateY(0)", scale: "1" }],
            { duration: 240, easing: "ease-out" });
        }
      }
    }
    if (this.net.room && this.net.status.startsWith("Disconnected")) {
      this.root.hidden = false; this.title.textContent = "Disconnected";
      this.message.textContent = "Leave the room to return to the main menu.";
      this.ready.hidden = this.restart.hidden = this.finish.hidden = true;
    }
  }
  dispose() { this.abort.abort(); this.countdownAnimation?.cancel(); this.timer.hidden = true; }
}
