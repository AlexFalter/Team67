import {awpAudioCues,type AwpSound,type AwpAudioAction} from './awpSoundCues.ts';
const sounds:AwpSound[]=['fire','bolt-up','bolt-back','bolt-forward','bolt-down','mag-out','mag-in'];
export class AwpSounds {
 readonly ready:Promise<void>;private abort=new AbortController();private disposed=false;
 private buffers=new Map<AwpSound,AudioBuffer>();private voices=new Set<AudioBufferSourceNode>();
 private clocks=new Map<AwpAudioAction,{id:number;elapsed:number}>();
 constructor(private context:()=>AudioContext){this.ready=Promise.all(sounds.map(async sound=>{const response=await fetch(sound==='fire'?'/audio/awp/nerf-fire.mp3':`/audio/awp/bo3-${sound}.mp3`,{signal:this.abort.signal});if(!response.ok)throw Error(`Could not load AWP sound: ${sound}`);const buffer=await this.context().decodeAudioData(await response.arrayBuffer());if(!this.disposed)this.buffers.set(sound,buffer);})).then(()=>{}).catch(error=>{if(!this.disposed)throw error;});}
 update(action:AwpAudioAction,id:number,elapsed:number,enabled:boolean){
  const old=this.clocks.get(action),previous=old?.id===id?old.elapsed:Math.max(-.001,elapsed-.12);
  this.clocks.set(action,{id,elapsed});if(!enabled||!Number.isFinite(elapsed)){this.stop();return;}
  for(const sound of awpAudioCues(action,previous,elapsed))this.play(sound);
 }
 fire(){const ctx=this.context();if(ctx.state==='running')this.play('fire');else void ctx.resume().then(()=>this.play('fire')).catch(()=>{});}
 private play(sound:AwpSound){const ctx=this.context(),buffer=this.buffers.get(sound);if(!buffer||ctx.state!=='running'||this.disposed)return;
  const voice=ctx.createBufferSource(),gain=ctx.createGain();voice.buffer=buffer;gain.gain.value=sound==='fire'?.65:.32;voice.connect(gain);gain.connect(ctx.destination);this.voices.add(voice);voice.onended=()=>{this.voices.delete(voice);voice.disconnect();gain.disconnect();};voice.start();
 }
 stop(){for(const voice of this.voices)voice.stop();this.voices.clear();}
 reset(){this.stop();this.clocks.clear();}
 dispose(){this.disposed=true;this.abort.abort();this.reset();this.buffers.clear();}
}
