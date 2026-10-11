import type { Client } from "colyseus";
import * as C from "@race/shared";
import { Mate, type RaceState } from "./state.ts";

// Two working selections per room; independent transactions and one reward per player.
export class MateMachine {
  private workingFlavors: Set<number>;
  private lastTick: number;
  constructor(private state: RaceState, private world: C.MovementWorld, random = Math.random, now = Date.now()) {
    const first = Math.floor(random() * C.MATE_FLAVORS.length);
    const others = C.MATE_FLAVORS.map((_, i) => i).filter(i => i !== first);
    this.workingFlavors = new Set([first, others[Math.floor(random() * others.length)]]);
    this.lastTick = now;
  }
  join(id: string) { this.state.mates.set(id, new Mate()); }
  leave(id: string) { this.state.mates.delete(id); }
  command(client: Client, data: unknown, now = Date.now()) {
    const command = data as Partial<C.MateCommand> | null;
    const p = this.state.players.get(client.sessionId), state = this.state.mates.get(client.sessionId);
    const action = typeof command?.action === "string" ? command.action : "";
    const reply = (ok: boolean, message: string) => client.send("mateResult", { action, ok, message } satisfies C.MateResult);
    const member = this.state.members.get(client.sessionId);
    if (!p || !state || !member || member.spectator || this.state.phase !== C.RoomPhase.Running ||
      !this.state.introComplete || now < this.state.startedAt || now >= this.state.endsAt ||
      command?.roundStartedAt !== this.state.startedAt) return reply(false, "Wait for the round to start.");
    if (action === "close") { if (state.phase === "payment") state.phase = "idle"; return reply(true, ""); }
    if (p.vehicleId || p.knockdownUntil > now) return reply(false, "Use Mate when on foot.");
    if (action === "use") {
      if (!p.mateCount || p.mateBoostMs > 0) return reply(false, "No Mate available to drink.");
      p.mateCount--; p.mateBoostMs = C.MATE_BOOST_MS; p.mateDrinkStartedAt = now;
      return reply(true, "Mate rush · 2× speed · 8s");
    }
    if (!C.nearMate(p, this.world)) return reply(false, "Move to the front of the vending machine.");
    this.advance(state, now);
    if (action === "select") {
      const flavor = command?.flavor;
      if (!Number.isInteger(flavor) || flavor! < 0 || flavor! >= C.MATE_FLAVORS.length ||
        !["idle", "failure"].includes(state.phase) || now < state.retryAt || (state.tried & (1 << flavor!)))
        return reply(false, "Choose an available flavor after the retry delay.");
      state.selected = flavor!; state.phase = "payment";
    } else if (action === "pay") {
      if (state.phase !== "payment") return reply(false, "Select a flavor first.");
      state.tried |= 1 << state.selected; state.attempts++;
      state.phase = "loading"; state.readyAt = now + C.MATE_LOADING_MS;
    } else if (action === "collect") {
      if (state.phase !== "collect") return reply(false, "Wait for the can to land in the tray.");
      state.phase = "success"; p.mateCount++; p.mateFlavor = state.selected;
    } else return reply(false, "Unknown vending action.");
    reply(true, action === "collect" ? "Mate added to inventory" : "");
  }
  private advance(state: C.MateState, now: number) {
    if (state.phase === "loading" && now >= state.readyAt) {
      if (this.workingFlavors.has(state.selected)) { state.phase = "dropping"; state.dropStartedAt = state.readyAt; }
      else { state.phase = "failure"; state.retryAt = state.readyAt + (state.attempts % 2 ? 1000 : 2000); }
    }
    if (state.phase === "dropping" && now >= state.dropStartedAt + C.MATE_DROP_MS) state.phase = "collect";
  }
  tick(now = Date.now()) {
    const elapsed = Math.max(0, now - this.lastTick); this.lastTick = now;
    if (this.state.phase !== C.RoomPhase.Running || !this.state.introComplete) return;
    for (const [id, state] of this.state.mates) {
      this.advance(state, Math.min(now, this.state.endsAt));
      const p = this.state.players.get(id);
      if (p && !p.vehicleId) p.mateBoostMs = Math.max(0, p.mateBoostMs - elapsed);
    }
  }
}
