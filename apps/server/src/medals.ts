import type { MedalAward, PlayerMedalId } from '@race/shared';

// Called only after the room accepts a hit on a connected player who was standing.
export class PlayerMedals {
 private firstBlood = false;
 private sequence = 0;
 private hits = new Map<string, number>();
 private punches = new Map<string, Map<string, number>>();
 private bikes = new Map<string, Set<string>>();
 record(attacker: string, target: string, kind: 'punch' | 'bicycle' | 'bag', roundStartedAt: number): MedalAward | undefined {
  if (!attacker || !target || attacker === target) return;
  const ids: PlayerMedalId[] = [];
  if (!this.firstBlood) { this.firstBlood = true; ids.push('firstBlood'); }
  const count=(this.hits.get(attacker)??0)+1;this.hits.set(attacker,count);
  if(count===3)ids.push('threePlayers');
  if (kind === 'bag') {ids.push('bagged');}
  else if (kind === 'bicycle') {
   const victims = this.bikes.get(attacker) ?? new Set<string>(); this.bikes.set(attacker, victims);
   if (!victims.has(target)) { victims.add(target); ids.push('bicycleHit'); }
  } else {
   const victims = this.punches.get(attacker) ?? new Map<string, number>(); this.punches.set(attacker, victims);
   const hits = (victims.get(target) ?? 0) + 1; victims.set(target, hits);
   if (hits === 3) ids.push('repeatOffender');
  }
  return ids.length ? { ids, eventKey: `${roundStartedAt}:${++this.sequence}`, roundStartedAt } : undefined;
 }
 practiceBag(roundStartedAt:number):MedalAward {return {ids:['bagged'],eventKey:`${roundStartedAt}:${++this.sequence}:practice`,roundStartedAt};}
 leave(id: string) { this.hits.delete(id);this.punches.delete(id); this.bikes.delete(id); }
 reset() { this.firstBlood = false; this.sequence = 0; this.hits.clear();this.punches.clear(); this.bikes.clear(); }
}
