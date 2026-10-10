import { Client, type Room } from "@colyseus/sdk";
import { PING, PONG, type Phase } from "@race/shared";
import { Clock } from "./clock";
import { lagFromUrl, simulateLag } from "./lag";

// Mirrors apps/server/src/state.ts (decoded by reflection; no schema classes on the client).
export interface PlayerView {
  name: string; character: number; hue: number; ready: boolean; waiting: boolean;
  x: number; y: number; z: number; yaw: number; vx: number; vy: number; vz: number; t: number;
  anim: number; shoes: boolean; punches: number; downUntil: number; vehicle: string; seat: number;
}
export interface VehicleView {
  kind: number; x: number; y: number; z: number; yaw: number; vx: number; vz: number; t: number;
  driver: string; dir: number; departAt: number; tripStart: number; fallenUntil: number;
}
export interface ResultView { name: string; hits: number; taken: number }
export interface StateView {
  phase: Phase; host: string; endsAt: number; trafficStart: number;
  players: Map<string, PlayerView>; vehicles: Map<string, VehicleView>; results: ResultView[];
}

export interface Selection { mode: "create" | "join"; code: string; name: string; character: number }

function serverUrl() {
  if (import.meta.env.DEV) return import.meta.env.VITE_COLYSEUS_URL || `ws://${location.hostname}:2567`;
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`; // same origin in production
}

/** One Colyseus connection: room, clock sync and (optionally) simulated bad network. */
export class Net {
  readonly clock = new Clock();
  closed = false;
  private closeListeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  private constructor(readonly room: Room<object, StateView>) {
    const lag = lagFromUrl();
    if (lag) simulateLag(room, lag);
    room.onMessage<[number, number]>(PONG, ([sent, server]) => this.clock.sample(sent, server));
    room.onLeave(() => { this.closed = true; this.stop(); this.closeListeners.forEach(l => l()); });
    // Burst of pings to converge quickly, then one per second.
    for (let i = 0; i < 5; i++) this.timers.push(setTimeout(() => this.ping(), i * 120));
    this.timers.push(setInterval(() => this.ping(), 1000));
  }

  static async connect(s: Selection) {
    const client = new Client(serverUrl()), options = { name: s.name, character: s.character };
    const room = s.mode === "create"
      ? await client.create<StateView>("game", { ...options, code: s.code })
      : await client.joinById<StateView>(s.code, options);
    room.reconnection.enabled = false; // seats are released on disconnect; rejoin instead
    return new Net(room);
  }

  onClosed(listener: () => void) {
    this.closeListeners.add(listener);
    return () => { this.closeListeners.delete(listener); };
  }

  get id() { return this.room.sessionId; }
  get state() { return this.room.state; }

  send(type: string, payload?: unknown) {
    if (!this.closed) this.room.send(type, payload);
  }

  private ping() {
    this.send(PING, performance.now());
  }

  private stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  dispose() {
    this.stop();
    if (!this.closed) void this.room.leave().catch(() => {});
    this.closed = true;
  }
}
