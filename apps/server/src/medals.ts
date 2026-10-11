import type { MedalAward, PlayerMedalId } from '@race/shared';

// Called only after the room accepts a hit on a connected player who was standing.
export class PlayerMedals {
 private firstBlood = false;
 private sequence = 0;
 private punches = new Map<string, Map<string, number>>();
 private bikes = new Map<string, Set<string>>();
 record(attacker: string, target: string, kind: 'punch' | 'bicycle', roundStartedAt: number): MedalAward | undefined {
  if (!attacker || !target || attacker === target) return;
  const ids: PlayerMedalId[] = [];
  if (!this.firstBlood) { this.firstBlood = true; ids.push('firstBlood'); }
  if (kind === 'bicycle') {
   const victims = this.bikes.get(attacker) ?? new Set<string>(); this.bikes.set(attacker, victims);
   if (!victims.has(target)) { victims.add(target); ids.push('bicycleHit'); }
  } else {
   const victims = this.punches.get(attacker) ?? new Map<string, number>(); this.punches.set(attacker, victims);
   const distinct = victims.size, hits = (victims.get(target) ?? 0) + 1; victims.set(target, hits);
   if (distinct < 3 && victims.size === 3) ids.push('threePlayers');
   if (hits === 3) ids.push('repeatOffender');
  }
  return ids.length ? { ids, eventKey: `${roundStartedAt}:${++this.sequence}`, roundStartedAt } : undefined;
 }
 leave(id: string) { this.punches.delete(id); this.bikes.delete(id); }
 reset() { this.firstBlood = false; this.sequence = 0; this.punches.clear(); this.bikes.clear(); }
}
