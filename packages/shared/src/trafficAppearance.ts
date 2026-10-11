export type TrafficCarKind = 0 | 1 | 2;

export const TRAFFIC_PALETTES = [
  ['#969da5', '#182d48', '#eeeee7', '#b72b32', '#3074bb'],
  ['#e6ff19', '#ff7315', '#16f2e5'],
  ['#325b36', '#8b292e'],
] as const;

export function randomTrafficAppearance(random = Math.random) {
  const choice = random();
  const kind: TrafficCarKind = choice < 0.8 ? 0 : choice < 0.9 ? 1 : 2;
  const color = Math.min(TRAFFIC_PALETTES[kind].length - 1, Math.floor(random() * TRAFFIC_PALETTES[kind].length));
  return { kind, color };
}
