import { Client, type Room } from "@colyseus/sdk";
import type {
  Bump,
  Impulse,
  Pong,
  WorldState,
  Body,
  VehicleMove,
  VehicleResult,
} from "@race/shared";
import { CLIENT_SEND_RATE, packMove, zurichWorld } from "@race/shared";
export class Network {
  room!: Room<object, WorldState>;
  private disposed = false;
  offset = 0;
  rtt = 0;
  collisions = 0;
  status = "Connecting…";
  private timers: ReturnType<typeof setInterval>[] = [];
  private pingTimers: ReturnType<typeof setTimeout>[] = [];
  private best = Infinity;
  private pending = new Set<number>();
  vehicleMove?: () => VehicleMove | undefined;
  onVehicleResult?: (result: VehicleResult) => void;
  now() {
    return Date.now() + this.offset;
  }
  async connect(
    body: Body,
    onPatch: (state: WorldState, id: string) => void,
    onImpulse: (hit: Impulse) => void,
    onBump: (hit: Bump) => void,
  ) {
    const url = import.meta.env.DEV
      ? import.meta.env.VITE_COLYSEUS_URL || "ws://localhost:2567"
      : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
    const room = await new Client(url).joinOrCreate<WorldState>("race");
    // This prototype releases seats on disconnect and has no server reconnection grace.
    room.reconnection.enabled = false;
    if (this.disposed) {
      await room.leave().catch(() => {});
      return;
    }
    this.room = room;
    this.status = "Connected";
    this.room.onStateChange((state) => {
      if (this.disposed) return;
      const own = state.players.get(this.room.sessionId);
      if (own && (!this.initialized || own.vehicleId !== body.vehicleId)) {
        Object.assign(body, own);
        body.grounded =
          !body.vehicleId &&
          Math.abs(body.y - (zurichWorld.height(body.x, body.z) ?? Infinity)) <
            0.05;
        body.knockdownUntil = 0;
        this.initialized = true;
      }
      onPatch(state, this.room.sessionId);
    });
    this.room.onMessage<Impulse>("impulse", onImpulse);
    this.room.onMessage<VehicleResult>("vehicleResult", (result) =>
      this.onVehicleResult?.(result),
    );
    this.room.onMessage<Bump>("bump", (hit) => {
      this.collisions++;
      onBump(hit);
    });
    this.room.onMessage<Pong>("pong", (p) => {
      if (!this.pending.delete(p.clientTime)) return;
      const rtt = Date.now() - p.clientTime;
      if (rtt < this.best) {
        this.best = rtt;
        this.rtt = rtt;
        this.offset = p.serverTime - (p.clientTime + rtt / 2);
      }
    });
    this.room.onLeave(() => {
      this.initialized = false;
      this.status = "Disconnected — reload to join";
      this.stop();
    });
    this.room.onError((code, message) => {
      this.status = `Connection error ${code}: ${message}`;
    });
    this.sync();
    this.timers.push(
      setInterval(() => this.sync(), 10000),
      setInterval(() => {
        if (!this.initialized) return;
        if (body.vehicleId) {
          const move = this.vehicleMove?.();
          if (move) this.room.send("vehicleMove", move);
        } else this.room.send("move", packMove(body));
      }, 1000 / CLIENT_SEND_RATE),
    );
  }
  initialized = false;
  private sync() {
    this.best = Infinity;
    this.pending.clear();
    this.pingTimers.forEach(clearTimeout);
    this.pingTimers = [];
    for (let i = 0; i < 5; i++)
      this.pingTimers.push(
        setTimeout(() => {
          const t = Date.now();
          this.pending.add(t);
          this.room.send("ping", { clientTime: t });
        }, i * 100),
      );
  }
  stop() {
    this.timers.forEach(clearInterval);
    this.pingTimers.forEach(clearTimeout);
    this.timers = [];
    this.pingTimers = [];
  }
  dispose() {
    this.disposed = true;
    this.initialized = false;
    this.stop();
    if (this.room) void this.room.leave().catch(() => {});
  }
}
