import * as C from "@race/shared";
import { RoomMember, RoundResult, type RaceState } from "./state.ts";

// Membership survives the round; gameplay entities exist only for participants.
export class RoundManager {
  private scores = new Map<string, C.RoundResult>();
  constructor(private state: RaceState, private duration = C.ROUND_DURATION_MS,
    private onStart = () => {}, private onReset = () => {},
    private intro: { durationMs?: number; leadMs?: number; onArrival?: () => void } = {}) {}

  join(id: string, options: { name?: unknown; character?: unknown }) {
    const member = new RoomMember({
      name: C.playerName(options.name),
      character: options.character === 1 || options.character === 2 || options.character === 3 ? options.character : 0,
      spectator: this.state.phase !== C.RoomPhase.Lobby,
    });
    this.state.members.set(id, member);
    if (!this.state.hostId) this.state.hostId = id;
    return member;
  }
  leave(id: string, now = Date.now()) {
    this.state.members.delete(id);
    if (this.state.hostId === id) this.state.hostId = this.state.members.keys().next().value ?? "";
    if (this.state.phase === C.RoomPhase.Running &&
      ![...this.state.members.values()].some(member => !member.spectator)) this.finish(now, true);
  }
  ready(id: string, ready: unknown, now = Date.now()) {
    const member = this.state.members.get(id);
    if (this.state.phase !== C.RoomPhase.Lobby || !member || member.spectator || typeof ready !== "boolean") return;
    member.ready = ready;
    if (id === this.state.hostId && ready) this.start(now);
  }
  private start(now: number) {
    const members = [...this.state.members];
    if (!members.length) return;
    this.scores.clear(); this.state.results.clear();
    for (const [slot, [id, member]] of members.entries()) {
      member.introSeat = slot;
      this.scores.set(id, { name: member.name, hitsLanded: 0, hitsReceived: 0 });
    }
    this.state.phase = C.RoomPhase.Running;
    this.state.introStartedAt = now + (this.intro.leadMs ?? C.BATTLE_BUS_LEAD_MS);
    this.state.startedAt = this.state.introStartedAt + (this.intro.durationMs ?? C.BATTLE_BUS_DURATION_MS);
    this.state.endsAt = this.state.startedAt + this.duration; this.state.finishedAt = 0;
    this.state.introComplete = false;
    this.onStart();
    if (now >= this.state.startedAt) this.completeIntro();
  }
  private completeIntro() {
    this.intro.onArrival?.();
    this.state.introComplete = true;
  }
  canPlay(id: string, now = Date.now()) {
    return this.state.phase === C.RoomPhase.Running && this.state.introComplete && now >= this.state.startedAt &&
      now < this.state.endsAt && this.scores.has(id) && this.state.players.has(id);
  }
  hit(from: string, target: string) {
    if (this.state.phase !== C.RoomPhase.Running || !this.state.introComplete || from === target) return;
    const victim = this.scores.get(target);
    if (!victim) return;
    victim.hitsReceived++;
    const attacker = this.scores.get(from);
    if (attacker) attacker.hitsLanded++;
  }
  tick(now = Date.now()) {
    if (this.state.phase === C.RoomPhase.Running && !this.state.introComplete && now >= this.state.startedAt) this.completeIntro();
    if (this.state.phase === C.RoomPhase.Running && now >= this.state.endsAt) this.finish(now);
  }
  finish(now = Date.now(), empty = false) {
    if (this.state.phase !== C.RoomPhase.Running || (!empty && (!this.state.introComplete || now < this.state.startedAt))) return;
    this.state.phase = C.RoomPhase.Finished; this.state.finishedAt = now;
    for (const [id, score] of this.scores) this.state.results.set(id, new RoundResult(score));
  }
  restart(id: string) {
    if (this.state.phase !== C.RoomPhase.Finished || id !== this.state.hostId) return;
    this.state.phase = C.RoomPhase.Lobby;
    this.state.startedAt = this.state.endsAt = this.state.finishedAt = 0;
    this.state.introStartedAt = 0; this.state.introComplete = false;
    this.scores.clear(); this.state.results.clear();
    for (const member of this.state.members.values()) { member.ready = false; member.spectator = false; member.introSeat = -1; }
    this.onReset();
  }
}
