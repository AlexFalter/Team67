export type AwpSound='fire'|'bolt-up'|'bolt-back'|'bolt-forward'|'bolt-down'|'mag-out'|'mag-in';
export type AwpAudioAction='bolt'|'reload';
const cues:Record<AwpAudioAction,{at:number;sound:AwpSound}[]>={
 bolt:[{at:.14,sound:'bolt-up'},{at:.392,sound:'bolt-back'},{at:.98,sound:'mag-in'},{at:1.05,sound:'bolt-forward'},{at:1.204,sound:'bolt-down'}],
 reload:[{at:.12,sound:'mag-out'},{at:.88,sound:'mag-in'},{at:1.35,sound:'bolt-back'},{at:1.55,sound:'bolt-forward'},{at:1.7,sound:'bolt-down'}],
};
export function awpAudioCues(action:AwpAudioAction,previous:number,elapsed:number){return cues[action].filter(cue=>cue.at>previous&&cue.at<=elapsed).map(cue=>cue.sound);}
