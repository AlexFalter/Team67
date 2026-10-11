export const PLAYER_MEDALS = {
 bagged: {title: 'Bagged', detail: 'Hit a player with an Ersti bag', icon: 'bag'},
 firstBlood: { title: 'First Blood', detail: 'First confirmed hit of the round', icon: 'skull' },
 bicycleHit: { title: 'Road Rage', detail: 'Run over a real player with a bicycle', icon: 'wheel' },
 threePlayers: { title: 'Bloodthirsty', detail: 'Punch three different players', icon: 'skull' },
 repeatOffender: { title: 'Personal Grudge', detail: 'Punch the same player three times', icon: 'skull' },
} as const;
export type PlayerMedalId = keyof typeof PLAYER_MEDALS;
export interface MedalAward { ids: PlayerMedalId[]; eventKey: string; roundStartedAt: number }
