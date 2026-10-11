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
      character: typeof options.character === "number" && Number.isInteger(options.character) && options.character >= 0 && options.character < C.CHARACTER_NAMES.length ? options.character : 0,
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
  thankBusDriver(id: string, run: unknown, now = Date.now()) {
    const member = this.state.members.get(id);
    const arrivalAt = this.state.introStartedAt + (this.state.startedAt - this.state.introStartedAt) * C.BATTLE_BUS_ARRIVAL_MS / C.BATTLE_BUS_DURATION_MS;
    if (!C.inBattleBusIntro(this.state) || this.state.skipIntro || run !== this.state.introStartedAt ||
      now < this.state.introStartedAt || now >= arrivalAt ||
      !member || member.spectator || member.introSeat < 0 || !this.state.players.has(id) || member.thankedBusDriver) return;
    member.thankedBusDriver = true;
  }
  private start(now: number) {
    const members = [...this.state.members];
    if (!members.length) return;
    this.scores.clear(); this.state.results.clear();
    for (const [slot, [id, member]] of members.entries()) {
      member.introSeat = slot;
      member.thankedBusDriver = false;
      this.scores.set(id, { name: member.name, hitsLanded: 0, hitsReceived: 0, examScore: 0, examCorrect: 0, examCompleted: false, examStartedAt: 0, distanceToEth: 0 });
    }
    this.state.phase = C.RoomPhase.Running;
    this.state.introStartedAt = now + (this.intro.leadMs ?? C.BATTLE_BUS_LEAD_MS);
    this.state.startedAt = this.state.introStartedAt + (this.intro.durationMs ?? C.BATTLE_BUS_DURATION_MS);
    // A finite sentinel keeps existing feature deadline guards and schema serialization valid.
    this.state.endsAt = this.state.adminMode ? Number.MAX_SAFE_INTEGER : this.state.startedAt + this.duration; this.state.finishedAt = 0;
    this.state.introComplete = false; this.state.scooterArrivalAt = 0;
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
  beginExam(id: string, roundStartedAt: unknown, now = Date.now()) {
    const result = this.scores.get(id), player = this.state.players.get(id);
    if (roundStartedAt !== this.state.startedAt || !this.canPlay(id, now) || !result || result.examStartedAt || !player || player.vehicleId || !C.insideExamPortal(player)) return false;
    result.examStartedAt = now;
    return true;
  }
  examProgress(id: string, data: unknown, now = Date.now()) {
    if (!data || typeof data !== 'object' || this.state.phase !== C.RoomPhase.Running || !this.state.introComplete ||
      now < this.state.startedAt || now >= this.state.endsAt || !this.state.members.has(id)) return;
    const progress = data as C.ExamProgress, result = this.scores.get(id);
    if (!result?.examStartedAt || result.examCompleted || progress.roundStartedAt !== this.state.startedAt ||
      typeof progress.completed !== 'boolean' || !Number.isSafeInteger(progress.score) || !Number.isSafeInteger(progress.correct) ||
      progress.correct < result.examCorrect || progress.correct > C.EXAM_BUILDING_COUNT || progress.correct > result.examCorrect + 1 ||
      progress.score < result.examScore || progress.score > progress.correct * 1000 || progress.score < progress.correct * 50 || progress.score % 50 !== 0) return;
    const gained = progress.score - result.examScore;
    if (progress.correct === result.examCorrect ? gained !== 0 : gained < 50 || gained > 1000) return;
    result.examScore = progress.score; result.examCorrect = progress.correct; result.examCompleted = progress.completed;
  }
  tick(now = Date.now()) {
    if (this.state.phase === C.RoomPhase.Running && !this.state.introComplete && now >= this.state.startedAt) this.completeIntro();
    if (this.state.phase === C.RoomPhase.Running && !this.state.adminMode && now >= this.state.endsAt) this.finish(now);
  }
  finish(now = Date.now(), empty = false) {
    if (this.state.phase !== C.RoomPhase.Running || (!empty && (!this.state.introComplete || now < this.state.startedAt))) return;
    this.state.phase = C.RoomPhase.Finished; this.state.finishedAt = now;
    for (const [id, score] of this.scores) {
      if (score.examStartedAt) score.examCompleted = true;
      // Players who left have no position any more: count them from the bus drop-off, where they started.
      else score.distanceToEth = Math.round(C.distanceToEth(this.state.players.get(id) ?? C.BATTLE_BUS_START));
      this.state.results.set(id, new RoundResult(score));
    }
  }
  restart(id: string) {
    if (this.state.phase !== C.RoomPhase.Finished || id !== this.state.hostId) return;
    this.state.phase = C.RoomPhase.Lobby;
    this.state.startedAt = this.state.endsAt = this.state.finishedAt = 0;
    this.state.introStartedAt = 0; this.state.introComplete = false; this.state.scooterArrivalAt = 0;
    this.scores.clear(); this.state.results.clear();
    for (const member of this.state.members.values()) { member.ready = false; member.spectator = false; member.introSeat = -1; member.thankedBusDriver = false; }
    this.onReset();
  }
}
