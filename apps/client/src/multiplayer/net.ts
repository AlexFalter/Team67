import { Client, Predict, type Room, type Reconciler, type InputHandle } from "@colyseus/sdk";
import * as C from "@race/shared";
import type { Schema } from "@colyseus/schema";
import type { Selection } from "./lobby.ts";

export class Network {
  room!: Room<object, C.WorldState & Schema>;
  predict!: Predict;
  private input!: InputHandle<C.MoveInput>;
  private me?: Reconciler<C.PlayerState, C.Input>;
  private own?: C.PlayerState;
  private disposed = false;
  initialized = false;
  status = "Connecting…";
  collisions = 0;
  onVehicleResult?: (result: C.VehicleResult) => void;
  get rtt() { return Math.round(this.room?.clock.rtt() ?? 0); }
  now() {
    return this.room?.clock.renderNow() ?? 0;
  }
  async connect(body: C.Body, onPatch: (state: C.WorldState, id: string) => void,
    onBump: (hit: C.Bump) => void, selection: Selection) {
    const url = import.meta.env.DEV
      ? import.meta.env.VITE_COLYSEUS_URL || `ws://${location.hostname}:2567`
      : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
    const client = new Client(url);
    const room = selection.mode === "create"
      ? await client.create<C.WorldState & Schema>("race", { code: selection.code, character: selection.character })
      : await client.joinById<C.WorldState & Schema>(selection.code, { character: selection.character });
    room.reconnection.enabled = false;
    if (this.disposed) { await room.leave().catch(() => {}); return; }
    this.room = room;
    // The wire state is a Schema; shared gameplay types deliberately stay plain.
    this.predict = Predict.get(this.room, { delay: C.INTERP_DELAY_MS });
    this.input = this.room.input({ type: C.MoveInput, allowRewind: (cmd) => cmd.hit });
    if (!this.input.tickRate) throw new Error("Server must advertise a fixed timestep.");
    this.room.onStateChange((state) => {
      if (this.disposed) return;
      const own = state.players.get(this.room.sessionId);
      if (own && !this.me) {
        this.own = own;
        this.me = this.predict.reconciler(own, {
          input: this.input,
          step: (ctx, p, cmd) => C.stepPlayer(p, cmd, ctx.dt, C.zurichWorld),
          smoothMs: 80,
        });
        C.snapshot(own, body);
        this.initialized = true;
        this.status = "Connected";
      }
      onPatch(state, this.room.sessionId);
    });
    this.room.onMessage<C.VehicleResult>("vehicleResult", (result) => this.onVehicleResult?.(result));
    this.room.onMessage<C.Bump>("bump", (hit) => { this.collisions++; onBump(hit); });
    this.room.onLeave(() => { this.status = "Disconnected — reload to join"; this.stop(); });
    this.room.onError((code, message) => { this.status = `Connection error ${code}: ${message}`; });
  }
  frame(now: number, body: C.Body, controls: () => C.Input) {
    if (!this.me || !this.own) return;
    const n = this.predict.tick(now);
    for (let i = 0; i < n; i++) {
      Object.assign(this.input.data, controls());
      this.input.send();
    }
    Object.assign(body, this.me.state);
    for (const key of ["x", "y", "z", "rotY"] as const) body[key] = this.predict.value(this.own, key);
  }
  dispose() { this.disposed = true; this.stop(); if (this.room) void this.room.leave().catch(() => {}); }
  stop() { this.initialized = false; this.predict?.dispose(); }
}
