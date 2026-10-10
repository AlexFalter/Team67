import { buildings, type Building } from './buildings';

export const difficulties = ['easy', 'medium', 'hard', 'og'] as const;
export const revealScores = [1000, 800, 600, 400, 200, 100] as const;
// Enough columns to preserve the silhouette from the first reveal.
export const pixelColumns = [32, 48, 72, 112, 192, 0] as const;
export function createDeck(): Building[] {
  return difficulties.flatMap(difficulty => {
    const pool = buildings.filter(b => b.difficulty === difficulty);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  });
}
export function pointsFor(step: number, mistakes: number) {
  return Math.max(50, revealScores[step] - mistakes * 100);
}

/** Positive whole seconds, up to one day; invalid debug values use 30 seconds. */
export function readDuration(search: string) {
  const value = new URLSearchParams(search).get('time');
  if (!value || !/^\d+$/.test(value)) return 30;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86400 ? seconds : 30;
}
