export const PLAYER_MEDALS = {
 droneReady: {title:"Drone Ready",detail:"Land five Nerf AWP hits on players or debug mannequins",icon:"scope"},
 sharpshooter: {title:'Sharpshooter',detail:'Land a Nerf AWP headshot',icon:'scope'},
 longShot: {title:'Long Shot',detail:'Hit a player from at least 30 metres',icon:'scope'},
 bagged: {title: 'Bagged', detail: 'Hit a player with an Ersti bag', icon: 'bag'},
 firstBlood: { title: 'First Blood', detail: 'First confirmed hit of the round', icon: 'skull' },
 bicycleHit: { title: 'Road Rage', detail: 'Run over a real player with a bicycle', icon: 'wheel' },
 threePlayers: { title: 'Bloodthirsty', detail: 'Land three confirmed hits on players', icon: 'skull' },
 repeatOffender: { title: 'Personal Grudge', detail: 'Punch the same player three times', icon: 'skull' },
} as const;
export type PlayerMedalId = keyof typeof PLAYER_MEDALS;
export interface MedalAward { ids: PlayerMedalId[]; eventKey: string; roundStartedAt: number }
