import * as C from "@race/shared";

// Recorded sound effects ported from the mini-games-2 branch (vehicle-audio.js and
// medal-sound.js), wired to main's multiplayer state instead of the single-player world.
// Samples are decoded once into one AudioContext; engine and rail beds loop seamlessly.

const BASE = `${import.meta.env.BASE_URL}audio/`;
type Sample = "bus-engine" | "car-engine" | "rail-running" | "vehicle-door" | "footstep-left"
  | "footstep-right" | "collision-thud" | "bo3-medal-earned";
const SAMPLES: Sample[] = ["bus-engine", "car-engine", "rail-running", "vehicle-door", "footstep-left",
  "footstep-right", "collision-thud", "bo3-medal-earned"];
const STORAGE_KEY = "race-to-eth-sound-settings";
export type EffectKind = "step" | "jump" | "land" | "collision" | "door" | "crash" | "canDrop" | "shutter";

/** One looping engine/rail bed, keyed by vehicle id. */
export interface LoopSource {
  /** Omitted for vehicles that only produce one-shots (PubliBike crashes). */
  sample?: "bus-engine" | "car-engine" | "rail-running";
  active: boolean;
  /** Motors idle quietly when stopped; rail beds are silent when stopped. */
  motor: boolean;
  speed: number;
  x: number;
  z: number;
  aboard: boolean;
  door?: boolean;
  crashed?: boolean;
}
interface Voice { gain: GainNode; source: AudioBufferSourceNode | null; target: number }

export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private buffers = new Map<Sample, AudioBuffer>();
  private loading = new Set<Sample>();
  private voices = new Map<string, Voice>();
  private previous = new Map<string, LoopSource & { audible: boolean }>();
  private shots = new Set<AudioScheduledSourceNode>();
  private cooldowns = new Map<string, number>();
  private abort = new AbortController();
  private paused = false;
  private stepAge = 0;
  private stepSide = 0;
  private contact = false;
  private lastGrounded = true;
  private lastVy = 0;
  private lastSpeed = 0;
  /** "Movement and vehicle sounds" and "Medal sounds", as in the mini-games-2 settings. */
  settings = { vehicleSounds: true, medalSounds: true };

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      for (const key of Object.keys(this.settings) as (keyof GameAudio["settings"])[])
        if (typeof saved?.[key] === "boolean") this.settings[key] = saved[key];
    } catch { /* Storage can be unavailable; defaults stay on. */ }
    // Resume inside a real input gesture so later effects are allowed to play.
    const unlock = () => this.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true, signal: this.abort.signal });
    window.addEventListener("keydown", unlock, { capture: true, signal: this.abort.signal });
  }

  setSetting(key: keyof GameAudio["settings"], value: boolean) {
    this.settings[key] = value;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (key === "vehicleSounds" && !value) this.silence();
  }

  unlock() {
    if (this.abort.signal.aborted) return;
    if (!this.context) {
      const context = this.context = new AudioContext();
      this.master = context.createGain(); this.master.gain.value = 0.65; this.master.connect(context.destination);
      this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      for (const name of SAMPLES) this.load(name);
    }
    void this.context.resume().catch(() => {});
  }

  private load(name: Sample) {
    if (this.loading.has(name) || !this.context) return;
    this.loading.add(name);
    const context = this.context;
    void fetch(`${BASE}${name}.mp3`).then(r => { if (!r.ok) throw Error(String(r.status)); return r.arrayBuffer(); })
      .then(data => context.decodeAudioData(data)).then(buffer => { this.buffers.set(name, buffer); })
      .catch(() => { this.loading.delete(name); });
  }

  private get running() { return this.context?.state === "running" && !this.paused && !document.hidden; }

  private play(name: Sample, level: number, { cooldown = 0.6, key = name as string, rate = 1, out }: { cooldown?: number; key?: string; rate?: number; out?: AudioNode } = {}) {
    const context = this.context, buffer = this.buffers.get(name);
    if (!context || !buffer || level <= 0.001) return;
    const now = context.currentTime;
    if (now - (this.cooldowns.get(key) ?? -Infinity) < cooldown) return;
    this.cooldowns.set(key, now);
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = rate; gain.gain.value = level;
    source.connect(gain); gain.connect(out ?? this.master!);
    this.shots.add(source);
    source.onended = () => { this.shots.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  /** One-shot movement/vehicle effects; mirrors vehicle-audio.js effect(). */
  effect(kind: EffectKind, intensity = 1) {
    if (!this.settings.vehicleSounds || !this.running) return;
    const context = this.context!, master = this.master!;
    if (kind === "step") { this.play(this.stepSide++ % 2 ? "footstep-right" : "footstep-left", intensity, { cooldown: 0.08, key: "step" }); return; }
    if (kind === "collision" || kind === "land") { this.play("collision-thud", Math.min(0.65, intensity), { cooldown: 0.3, key: kind }); return; }
    if (kind === "jump") { this.play("footstep-left", 0.12, { cooldown: 0.15, key: kind }); return; }
    if (kind === "door") { this.play("vehicle-door", 0.18 * intensity); return; }
    const now = context.currentTime;
    if (kind === "canDrop") {
      // Short aluminium clack with a quieter second contact as the can settles.
      for (const [delay, level] of [[0, 0.13], [0.075, 0.045]]) {
        const g = context.createGain(); g.connect(master);
        g.gain.setValueAtTime(level, now + delay); g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.18);
        const n = context.createBufferSource(), f = context.createBiquadFilter();
        n.buffer = this.noise!; f.type = "highpass"; f.frequency.value = 900; n.connect(f); f.connect(g);
        this.track(n, () => { n.disconnect(); f.disconnect(); }); n.start(now + delay); n.stop(now + delay + 0.025);
        for (const frequency of [730, 1430, 2870]) {
          const o = context.createOscillator(); o.type = "triangle"; o.frequency.value = frequency; o.connect(g);
          this.track(o, () => o.disconnect()); o.start(now + delay); o.stop(now + delay + 0.19);
        }
        setTimeout(() => g.disconnect(), 350);
      }
      return;
    }
    // Remaining synthesized noise bursts: crash and camera shutter.
    const duration = kind === "shutter" ? 0.09 : 0.45, g = context.createGain();
    g.connect(master); g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.09 * intensity, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const n = context.createBufferSource(), f = context.createBiquadFilter();
    n.buffer = this.noise!; f.type = "bandpass"; f.frequency.value = kind === "crash" ? 180 : 2200; f.Q.value = 1;
    n.connect(f); f.connect(g); this.track(n, () => { n.disconnect(); f.disconnect(); g.disconnect(); });
    n.start(); n.stop(now + duration + 0.02);
  }
  private track(node: AudioScheduledSourceNode, cleanup: () => void) {
    this.shots.add(node);
    node.onended = () => { this.shots.delete(node); cleanup(); };
  }

  /** Positional bump (punch landed, vehicle run-over): the recorded thud, fading with distance. */
  bump(listener: { x: number; z: number }, at: { x: number; z: number }) {
    const proximity = Math.max(0, 1 - Math.hypot(listener.x - at.x, listener.z - at.z) / 40) ** 2;
    if (proximity > 0.02) this.effect("collision", 0.45 * proximity);
  }

  /** The BO3 "medal earned" sting, independent of the movement/vehicle switch. */
  medal() {
    if (!this.settings.medalSounds || !this.context) return;
    void this.context.resume().then(() => {
      if (this.context?.state === "running") this.play("bo3-medal-earned", 0.45, { cooldown: 0.4, out: this.context.destination });
    }).catch(() => {});
  }

  /** Local player footsteps, jump take-off, landing and wall bumps. */
  movement(dt: number, body: C.Body, pushing: boolean, now: number) {
    const speed = Math.hypot(body.vx, body.vz), down = now < body.knockdownUntil;
    const onFoot = !body.vehicleId && !down;
    if (onFoot) {
      if (this.lastGrounded && !body.grounded && body.vy > 2) this.effect("jump");
      if (!this.lastGrounded && body.grounded && -this.lastVy > 3) { this.stepAge = 0; this.effect("land", 0.2 + Math.min(-this.lastVy / 30, 0.35)); }
      // Footsteps: one recorded step per stride, alternating feet.
      if (body.grounded && speed >= 0.5) {
        const sprint = speed > C.WALK_SPEED + 0.5, stride = sprint ? 3 : 2.3;
        this.stepAge += Math.max(0, dt) * speed;
        if (this.stepAge >= stride) { this.stepAge %= stride; this.effect("step", sprint ? 0.42 : 0.3); }
      } else this.stepAge = 0;
      // Running into a wall zeroes the blocked velocity: a sudden stop while still pushing.
      const touching = body.grounded && pushing && this.lastSpeed > 2.5 && speed < this.lastSpeed * 0.5;
      if (touching && !this.contact) this.effect("collision", 0.2 + Math.min(this.lastSpeed / 35, 0.4));
      this.contact = touching || (this.contact && pushing && speed < 1);
    } else { this.stepAge = 0; this.contact = false; }
    this.lastGrounded = body.vehicleId ? true : body.grounded; this.lastVy = body.vy; this.lastSpeed = speed;
  }

  /** Engine, rail and door sounds for every vehicle near the listener. */
  update(sources: Map<string, LoopSource>, listener: { x: number; z: number }, { paused = false, duck = false } = {}) {
    if (!this.context) return;
    this.paused = paused || document.hidden;
    if (this.paused) for (const shot of this.shots) { try { shot.stop(); } catch { /* already stopped */ } }
    const now = this.context.currentTime;
    // Missing vehicles must not leave an old loop running.
    for (const [key, voice] of this.voices) if (!sources.has(key)) { this.stop(voice); this.voices.delete(key); this.previous.delete(key); }
    for (const [key, s] of sources) {
      const voice = this.voice(key), old = this.previous.get(key);
      const distance = Math.hypot(listener.x - s.x, listener.z - s.z);
      const proximity = s.aboard ? 1 : Math.max(0, 1 - distance / 30) ** 2;
      const audible = this.settings.vehicleSounds && !this.paused && s.active && !s.crashed;
      const moving = Math.abs(s.speed) > 0.1;
      const level = s.motor ? (moving ? 0.23 : 0.12) : moving ? 0.17 : 0;
      const target = audible && s.sample ? proximity * (duck ? 0.3 : 1) * level : 0;
      if (target > 0.001 && s.sample && this.buffers.has(s.sample)) {
        voice.target = target;
        if (!voice.source) {
          const source = this.context.createBufferSource();
          source.buffer = this.buffers.get(s.sample)!; source.loop = true; source.connect(voice.gain);
          voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(0, now);
          source.start(); voice.source = source;
        }
        voice.gain.gain.setTargetAtTime(target, now, 0.15);
      } else this.stop(voice);
      // Do not replay transitions accumulated while paused or muted.
      if (audible && proximity > 0.1 && old?.audible && s.door !== undefined && s.door !== old.door)
        this.play("vehicle-door", 0.18 * proximity * (duck ? 0.3 : 1), { key: `door:${key}` });
      if (s.crashed && old && !old.crashed && this.settings.vehicleSounds && !this.paused && proximity > 0.1) this.effect("crash", Math.max(0.4, proximity));
      this.previous.set(key, { ...s, audible });
    }
  }
  private voice(key: string) {
    let voice = this.voices.get(key);
    if (!voice) {
      const gain = this.context!.createGain(); gain.gain.value = 0; gain.connect(this.master!);
      voice = { gain, source: null, target: 0 }; this.voices.set(key, voice);
    }
    return voice;
  }
  private stop(voice: Voice, immediate = false) {
    voice.target = 0;
    if (!this.context) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setTargetAtTime(0, now, 0.035);
    if (voice.source) {
      const source = voice.source; voice.source = null;
      source.stop(immediate ? now : now + 0.18); source.onended = () => source.disconnect();
    }
  }
  private silence() {
    for (const voice of this.voices.values()) this.stop(voice, true);
    for (const shot of this.shots) { try { shot.stop(); } catch { /* already stopped */ } }
    this.previous.clear();
  }
  dispose() {
    this.abort.abort(); this.silence(); this.voices.clear();
    void this.context?.close().catch(() => {});
  }
}
