// Distance uses the player's position, so third-person camera zoom never changes loudness.
export function dialogueVolume(listener,speaker,{volume=.75,near=3,far=24}={}){
 if(!listener||!speaker)return volume;
 const distance=Math.hypot(listener.x-speaker.x,(listener.y??0)-(speaker.y??0),listener.z-speaker.z);
 const fade=Math.max(0,Math.min(1,(far-distance)/(far-near)));
 return volume*fade*fade;
}
export function updateDialogueVolume(audio,listener,speaker,{dt=0,muted=false,...options}={}){
 const target=muted?0:dialogueVolume(listener,speaker,options);
 audio.volume=muted||dt<=0?target:target+(audio.volume-target)*Math.exp(-10*Math.min(dt,.2));
 return audio.volume;
}
