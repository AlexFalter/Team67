export const PLAYER_MEDALS = {
 secretDiscovered: {title:"Secret discovered",detail:"Become the hunter",icon:"scope",secret:true},
 catWhisperer: {title:"Secret discovered",detail:"Cat Whisperer · Earn the bench cat’s trust",icon:"paw",secret:true},
 fareDodger: {title:"Secret discovered",detail:"Fare Dodger · A ride without a ticket",icon:"wheel",secret:true},
 financeBro: {title:"Secret discovered",detail:"Exit Liquidity · Survive the finance pitch",icon:"bag",secret:true},
 drunkDriving: {title:"Secret discovered",detail:"Drunk Driving · Trust the tram driver",icon:"wheel",secret:true},
 internshipSecured: {title:"Secret discovered",detail:"Internship secured?",icon:"bag",secret:true},
 moonwalkDiploma: {title:"Secret discovered",detail:"Moonwalk Diploma · Unlock Michael’s emote wheel",icon:"star",secret:true},
 touristPhotographer: {title:"Secret discovered",detail:"拍照留念",icon:"camera",secret:true},
 footballReward: {title:"Secret discovered",detail:"Hol ihn raus",icon:"star",secret:true},
 frankfurtSouvenir: {title:"Secret discovered",detail:"Frankfurt Souvenir · Collect the karambit",icon:"knife",secret:true},
 ticketCollected: {title:"Secret discovered",detail:"Swiss Bureaucracy · Finally collect your ticket",icon:"bag",secret:true},
 relativity: {title:"Secret discovered",detail:"Applied Relativity · Take Einstein’s shortcut",icon:"scope",secret:true},
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
