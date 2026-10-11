const MUSIC = ['floss', 'orange-justice', 'take-the-l', 'dance-moves', 'robot'];
export interface EmoteSound { player: string; id: string; startedAt: number; x: number; y: number; z: number }
interface Voice { id: string; startedAt: number; source: AudioBufferSourceNode; gain: GainNode }

/** Music follows each dancer, using the replicated start time on every client. */
export class EmoteAudio {
 private context?: AudioContext;
 private buffers = new Map<string, AudioBuffer>();
 private voices = new Map<string, Voice>();
 private abort = new AbortController();
 constructor() {
  const unlock = () => {
   if (!this.context) {
    const context = this.context = new AudioContext();
    for (const id of MUSIC) void fetch(`${import.meta.env.BASE_URL}audio/emotes/${id}.mp3`)
     .then(r => { if (!r.ok) throw Error(String(r.status)); return r.arrayBuffer(); })
     .then(data => context.decodeAudioData(data)).then(buffer => { if (!this.abort.signal.aborted) this.buffers.set(id, buffer); })
     .catch(() => {});
   }
   void this.context.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { capture: true, signal: this.abort.signal });
  window.addEventListener('keydown', unlock, { capture: true, signal: this.abort.signal });
 }
 update(sounds: EmoteSound[], listener: {x:number;y:number;z:number}, now:number) {
  const context = this.context;
  if (!context) return;
  const active = new Set<string>();
  if (context.state === 'running' && !document.hidden) for (const sound of sounds) {
   const proximity = Math.max(0, 1 - Math.hypot(sound.x-listener.x, sound.y-listener.y, sound.z-listener.z)/25);
   const buffer = this.buffers.get(sound.id);
   if (!buffer || !proximity) continue;
   active.add(sound.player);
   let voice = this.voices.get(sound.player);
   if (voice && (voice.id !== sound.id || voice.startedAt !== sound.startedAt)) { this.stop(sound.player); voice = undefined; }
   if (!voice) {
    const gain = context.createGain(); gain.gain.value = 0; gain.connect(context.destination);
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = true; source.connect(gain);
    source.start(0, (Math.max(0, now-sound.startedAt)/1000)%buffer.duration);
    voice = {id:sound.id,startedAt:sound.startedAt,source,gain}; this.voices.set(sound.player,voice);
   }
   voice.gain.gain.setTargetAtTime(.3*proximity*proximity,context.currentTime,.08);
  }
  for (const player of this.voices.keys()) if (!active.has(player)) this.stop(player);
 }
 private stop(player:string) {
  const voice = this.voices.get(player); if (!voice) return;
  voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect(); this.voices.delete(player);
 }
 dispose() { this.abort.abort(); for (const player of this.voices.keys()) this.stop(player); this.buffers.clear(); void this.context?.close().catch(() => {}); }
}
