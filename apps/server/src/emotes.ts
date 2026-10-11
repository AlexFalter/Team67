import { MICHAEL_CHALLENGE, normalizeDanceAnswer, canUseEmote, NPC_LAYOUT, RoomPhase } from '@race/shared';
import type { RaceState } from './state.ts';
import type { MovementWorld } from '@race/shared';

export class EmoteChallenge {
  private progress = new Map<string, { round: number; step: number; x:number;y:number;z:number;startedAt:number }>();
  constructor(private state: RaceState, private world?:MovementWorld) {}
  answer(id: string, data: unknown, now: number) {
    const p = this.state.players.get(id), d = data as { answer?: unknown; roundStartedAt?: unknown; begin?: unknown } | null;
    const invalid = !p || !d || d.roundStartedAt !== this.state.startedAt || this.state.phase !== RoomPhase.Running || !this.state.introComplete || p.vehicleId || p.knockdownUntil > now || p.moodleSitUntil > now;
    if (invalid) return { ok: false, step: 0, unlocked: false, reason:"The conversation ended. Talk to Michael again." };
    if (p.emotesUnlocked) return { ok: true, step: MICHAEL_CHALLENGE.length, unlocked: true };
    let progress = this.progress.get(id);
    if (!progress || progress.round !== this.state.startedAt || d.begin === true) {
      const height=this.world?.height(p.x,p.z)??NPC_LAYOUT.michaelJackson.height;
      if(Math.hypot(p.x-NPC_LAYOUT.michaelJackson.anchor[0],p.z-NPC_LAYOUT.michaelJackson.anchor[1])>12||Math.abs(p.y-height)>3)return {ok:false,step:0,unlocked:false,reason:"Walk up to Michael to start talking."};
      progress = { round: this.state.startedAt, step: 0, x:p.x,y:p.y,z:p.z,startedAt:now }; this.progress.set(id, progress);
    }
    if(Math.hypot(p.x-progress.x,p.y-progress.y,p.z-progress.z)>2||now-progress.startedAt>120000){this.progress.delete(id);return {ok:false,step:0,unlocked:false,reason:"The conversation ended. Talk to Michael again."};}
    if (d.begin === true) return { ok: true, step: 0, unlocked: false };
    if (typeof d.answer !== 'string' || d.answer.length > 80 || normalizeDanceAnswer(d.answer) !== MICHAEL_CHALLENGE[progress.step]?.answer)
      return { ok: false, step: progress.step, unlocked: false, reason:"Say the line shown above." };
    progress.step++;
    p.emotesUnlocked = progress.step === MICHAEL_CHALLENGE.length;
    return { ok: true, step: progress.step, unlocked: p.emotesUnlocked };
  }
  dance(id: string, data: unknown, now: number) {
    const p = this.state.players.get(id), d = data as { id?: unknown; roundStartedAt?: unknown } | null;
    if (!p || !d || d.roundStartedAt !== this.state.startedAt) return false;
    if (d.id === '') { p.emoteId = ''; p.emoteStartedAt = 0; return true; }
    if (this.state.phase !== RoomPhase.Running || !this.state.introComplete || !p.grounded || p.vehicleId || p.knockdownUntil > now || p.moodleSitUntil > now || Math.hypot(p.vx, p.vz) > .3 || typeof d.id !== 'string' || !canUseEmote(d.id, p.emotesUnlocked)) return false;
    p.emoteId = d.id; p.emoteStartedAt = now; return true;
  }
  tick(now: number) {
    for (const p of this.state.players.values()) if (p.emoteId && (!p.grounded || p.vehicleId || p.knockdownUntil > now || p.moodleSitUntil > now || Math.hypot(p.vx, p.vz) > .3 || this.state.phase !== RoomPhase.Running)) { p.emoteId = ''; p.emoteStartedAt = 0; }
  }
  leave(id: string) { this.progress.delete(id); }
  reset() { this.progress.clear(); }
}
