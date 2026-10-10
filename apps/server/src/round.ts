import * as C from "@race/shared";
import { RoomMember, RoundResult, type RaceState } from "./state.ts";

// Membership survives the round; gameplay entities exist only for participants.
export class RoundManager {
  private scores = new Map<string, C.RoundResult>();
  constructor(private state: RaceState, private duration = C.ROUND_DURATION_MS,
    private onStart = () => {}, private onReset = () => {}) {}

  join(id: string, options: { name?: unknown; character?: unknown }) {
    const member = new RoomMember({
      name: C.playerName(options.name),
      character: options.character === 1 || options.character === 2 ? options.character : 0,
      spectator: this.state.phase !== C.RoomPhase.Lobby,
    });
    this.state.members.set(id, member);
    if (!this.state.hostId) this.state.hostId = id;
    return member;
  }
  leave(id: string, now = Date.now()) {
    this.state.members.delete(id);
    if (this.state.hostId === id) this.state.hostId = this.state.members.keys().next().value ?? "";
    if (this.state.phase === C.RoomPhase.Lobby) this.startIfReady(now);
    else if (this.state.phase === C.RoomPhase.Running &&
      ![...this.state.members.values()].some(member => !member.spectator)) this.finish(now);
  }
  ready(id: string, ready: unknown, now = Date.now()) {
    const member = this.state.members.get(id);
    if (this.state.phase !== C.RoomPhase.Lobby || !member || member.spectator || typeof ready !== "boolean") return;
    member.ready = ready;
    this.startIfReady(now);
  }
  private startIfReady(now: number) {
    const members = [...this.state.members];
    if (!members.length || members.some(([, member]) => member.spectator || !member.ready)) return;
    this.scores.clear(); this.state.results.clear();
    for (const [id, member] of members) this.scores.set(id, { name: member.name, hitsLanded: 0, hitsReceived: 0 });
    this.state.phase = C.RoomPhase.Running;
    this.state.startedAt = now; this.state.endsAt = now + this.duration; this.state.finishedAt = 0;
    this.onStart();
  }
  canPlay(id: string, now = Date.now()) {
    return this.state.phase === C.RoomPhase.Running && now < this.state.endsAt && this.scores.has(id) && this.state.players.has(id);
  }
  hit(from: string, target: string) {
    if (this.state.phase !== C.RoomPhase.Running || from === target) return;
    const victim = this.scores.get(target);
    if (!victim) return;
    victim.hitsReceived++;
    const attacker = this.scores.get(from);
    if (attacker) attacker.hitsLanded++;
  }
  tick(now = Date.now()) {
    if (this.state.phase === C.RoomPhase.Running && now >= this.state.endsAt) this.finish(now);
  }
  finish(now = Date.now()) {
    if (this.state.phase !== C.RoomPhase.Running) return;
    this.state.phase = C.RoomPhase.Finished; this.state.finishedAt = now;
    for (const [id, score] of this.scores) this.state.results.set(id, new RoundResult(score));
  }
  restart(id: string) {
    if (this.state.phase !== C.RoomPhase.Finished || id !== this.state.hostId) return;
    this.state.phase = C.RoomPhase.Lobby;
    this.state.startedAt = this.state.endsAt = this.state.finishedAt = 0;
    this.scores.clear(); this.state.results.clear();
    for (const member of this.state.members.values()) { member.ready = false; member.spectator = false; }
    this.onReset();
  }
}
