// Dialogue and IDs are shared by the challenge UI and authoritative room rules.
export const EMOTE_IDS = ['floss', 'orange-justice', 'take-the-l', 'dance-moves', 'dab', 'robot'] as const;
export const STARTER_EMOTE_IDS = ['dance-moves', 'orange-justice'] as const;
export function canUseEmote(id: string, unlocked: boolean) {
  return EMOTE_IDS.some(emote => emote === id) && (unlocked || STARTER_EMOTE_IDS.some(emote => emote === id));
}
export const MICHAEL_CHALLENGE = [
  { prompt: 'First, give me a “hee-hee”. Type it below.', answer: 'hee hee' },
  { prompt: 'One more line: “I wanna dance”. Say it back.', answer: 'i wanna dance' },
] as const;
export function normalizeDanceAnswer(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
