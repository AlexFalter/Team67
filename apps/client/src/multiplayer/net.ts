import type { Selection } from "./lobby.ts";
import type { Input, PlayerCorrection } from "@race/shared";
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
import { stepCabin, POLYBAHN_KIND, CLIENT_SEND_RATE, packMove, respawn, zurichWorld, snapshot, stepPlayer, applyImpulse, CART_MIN_HIT_SPEED, RoomPhase } from "@race/shared";
export class Network {
  room!: Room<object, WorldState>;
  private disposed = false;
  private phase = "";
  private introComplete = false;
  offset = 0;
  rtt = 0;
  collisions = 0;
  status = "Connecting…";
  private timers: ReturnType<typeof setInterval>[] = [];
  private pingTimers: ReturnType<typeof setTimeout>[] = [];
  private best = Infinity;
  private pending = new Set<number>();
  vehicleMove?: () => VehicleMove | undefined;
  onMoodleResult?: (data:{id:number;passed:boolean;course:string;roundStartedAt:number})=>void;
  onLimePhotoRequired?: (vehicleId:string)=>void;
  onLimePhotoResult?: (ok:boolean)=>void;
  onMedal?: (award: import("@race/shared").MedalAward) => void;
  onVehicleResult?: (result: VehicleResult) => void;
  onBikeUnlockResult?: (result: import("@race/shared").BikeUnlockResult) => void;
  onMateResult?: (result: import("@race/shared").MateResult) => void;
  onNpcResult?: (result: import("@race/shared").NpcResult) => void;
  onTicketResult?: (result: import('@race/shared').TicketResult) => void;
  onBagResult?: (data:{ok:boolean;action:string;message:string;roundStartedAt:number})=>void;
  onEmoteChallengeResult?: (data:{ok:boolean;step:number;unlocked:boolean;reason?:string;roundStartedAt:number})=>void;
  private emoteUnlockRound?: number;
  get emotesUnlocked() { return !!this.room && (this.room.state.players.get(this.room.sessionId)?.emotesUnlocked === true || this.emoteUnlockRound === this.room.state.startedAt); }
  onMapTeleport?: (data:{from:{x:number;y:number;z:number};target:{x:number;y:number;z:number};roundStartedAt:number})=>void;
  private spectatorRound?:number;
  onSpectate?:()=>void;
  get spectating(){return !!this.room&&this.room.state.phase===RoomPhase.Running&&this.spectatorRound===this.room.state.startedAt;}
  requestSpectate(){if(this.canPlay)this.room.send("spectate",{roundStartedAt:this.room.state.startedAt});}
  npcPaused = false;
  now() {
    return Date.now() + this.offset;
  }
  beginExam(body: Body) {
    if (!this.canPlay) return;
    this.room.send("move", packMove(body));
    this.room.send("examStart", this.room.state.startedAt);
  }
  reportExamProgress(progress: import("@race/shared").ExamScore) {
    if (!this.initialized || !this.room) return;
    this.room.send("examProgress", { ...progress, roundStartedAt: this.room.state.startedAt } satisfies import("@race/shared").ExamProgress);
  }
  async connect(
    body: Body,
    onPatch: (state: WorldState, id: string) => void,
    onBump: (hit: Bump) => void,
    selection: Selection,
  ) {
    const url = import.meta.env.DEV
      ? import.meta.env.VITE_COLYSEUS_URL || `ws://${location.hostname}:2567`
      : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
    const client = new Client(url);
    const room = selection.mode === "create"
      ? await client.create<WorldState>("race", { code: selection.code, character: selection.character, name: selection.name, devMode: selection.devMode, adminMode: selection.adminMode, moodleEnabled: selection.moodleEnabled, noCarCollisions: selection.noCarCollisions, mapTeleport:selection.mapTeleport, skipIntro: selection.skipIntro, goldPubliBikes: selection.goldPubliBikes, railCrashProtection: selection.railCrashProtection })
      : await client.joinById<WorldState>(selection.code, { character: selection.character, name: selection.name });
    // This prototype releases seats on disconnect and has no server reconnection grace.
    room.reconnection.enabled = false;
    if (this.disposed) {
      await room.leave().catch(() => {});
      return;
    }
    this.spectatorRound=undefined;
    this.emoteUnlockRound = undefined;
    this.room = room;
    this.status = "Connected";
    this.room.onStateChange((state) => {
      if (this.disposed) return;
      const own = state.players.get(this.room.sessionId);
      if (own && (!this.initialized || (!this.introComplete && state.introComplete) || own.vehicleId !== body.vehicleId || (own.vehicleId && own.seat !== body.seat) ||
        (this.phase !== state.phase && state.phase !== RoomPhase.Finished))) {
        if (!this.initialized) this.offset = state.serverTime - Date.now();
        snapshot(own, body);
        body.grounded =
          !body.vehicleId &&
          Math.abs(body.y - (zurichWorld.height(body.x, body.z) ?? Infinity)) <
            0.05;
        body.simTime = this.now();
        this.initialized = true;
      }
      if (own) {
        body.bagId=own.bagId; body.karambitOwned=own.karambitOwned;
        body.mateCount = own.mateCount; body.mateBoostMs = own.mateBoostMs;
        body.mateFlavor = own.mateFlavor; body.mateDrinkStartedAt = own.mateDrinkStartedAt;
        body.attackReadyAt = Math.max(body.attackReadyAt, own.attackReadyAt);
        body.moodleSitUntil=own.moodleSitUntil??0;
        body.knockdownUntil = Math.max(body.knockdownUntil, own.knockdownUntil);
        if ((own.impactStartedAt ?? 0) > (body.impactStartedAt ?? 0)) {
          body.impactStartedAt = own.impactStartedAt; body.impactX = own.impactX;
          body.impactZ = own.impactZ; body.impactStrength = own.impactStrength;
        }
      }
      this.phase = state.phase;
      this.introComplete = state.introComplete;
      onPatch(state, this.room.sessionId);
    });
    this.room.onMessage<{ok:boolean;roundStartedAt:number}>('spectateResult',data=>{if(data.ok&&data.roundStartedAt===this.room.state.startedAt){this.spectatorRound=data.roundStartedAt;this.onSpectate?.();}});
    this.room.onMessage<{from:{x:number;y:number;z:number};target:{x:number;y:number;z:number};roundStartedAt:number}>('mapTeleportResult',data=>{if(data.roundStartedAt===this.room.state.startedAt)this.onMapTeleport?.(data);});
    this.room.onMessage<{ok:boolean;action:string;message:string;roundStartedAt:number}>('bagResult',data=>{if(data.roundStartedAt===this.room.state.startedAt)this.onBagResult?.(data);});
    this.room.onMessage<{ok:boolean;step:number;unlocked:boolean;reason?:string;roundStartedAt:number}>('emoteChallengeResult',data=>{if(data.roundStartedAt!==this.room.state.startedAt)return;if(data.ok&&data.unlocked)this.emoteUnlockRound=data.roundStartedAt;this.onEmoteChallengeResult?.(data);});
    this.room.onMessage<{id:number;passed:boolean;course:string;roundStartedAt:number}>('moodleResult',data=>{if(data.roundStartedAt===this.room.state.startedAt)this.onMoodleResult?.(data);});
    this.room.onMessage<PlayerCorrection>("playerCorrection", correction => {
      Object.assign(body, correction);
    });
    this.room.onMessage<PlayerCorrection>('respawned', correction => {
      respawn(body, zurichWorld); Object.assign(body, correction); body.anim = 0;
    });
    this.room.onMessage<Impulse>("impulse", hit => applyImpulse(body, hit, this.now()));
    this.room.onMessage<import("@race/shared").MedalAward>("medal", award => {
      if (award.roundStartedAt === this.room.state.startedAt) this.onMedal?.(award);
    });
    this.room.onMessage<{vehicleId:string;roundStartedAt:number}>("limePhotoRequired",data=>{if(data.roundStartedAt===this.room.state.startedAt)this.onLimePhotoRequired?.(data.vehicleId);});
    this.room.onMessage<{ok:boolean;roundStartedAt:number}>("limePhotoResult",data=>{if(data.roundStartedAt===this.room.state.startedAt)this.onLimePhotoResult?.(data.ok);});
    this.room.onMessage<VehicleResult>("vehicleResult", (result) =>
      this.onVehicleResult?.(result),
    );
    this.room.onMessage<import("@race/shared").BikeUnlockResult>("bikeUnlockResult", result => this.onBikeUnlockResult?.(result));
    this.room.onMessage<import("@race/shared").MateResult>("mateResult", result => this.onMateResult?.(result));
    this.room.onMessage<import("@race/shared").NpcResult>("npcResult", result => this.onNpcResult?.(result));
    this.room.onMessage<import('@race/shared').TicketResult>('ticketResult', result => this.onTicketResult?.(result));
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
        if (!this.canPlay || this.npcPaused) return;
        if (body.vehicleId) {
          if (body.vehicleKind === POLYBAHN_KIND && body.cabinStanding)
            this.room.send("cabinMove", [body.vehicleId, body.cabinX, body.cabinZ, body.cabinYaw, body.anim]);
          const move = this.vehicleMove?.();
          if (move) this.room.send("vehicleMove", move);
        } else this.room.send("move", packMove(body));
      }, 1000 / CLIENT_SEND_RATE),
    );
  }
  // Gameplay stays in the feature's shared step; main's transport sends reports.
  frame(dt: number, body: Body, controls: () => Input) {
    if (!this.canPlay || this.npcPaused) return;
    const cmd = controls();
    let remaining = Math.min(0.1, dt), first = true, impact = 0;
    // Cooldowns use main's synchronized clock, including after a background tab.
    body.simTime = this.now() - remaining * 1000;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      impact = Math.max(impact, stepPlayer(body, first ? cmd : { ...cmd, slide: false, jump: false, hit: false }, step, zurichWorld) ?? 0);
      first = false; remaining -= step;
    }
    const cabin = this.room.state.vehicles.get(body.vehicleId);
    if (cabin?.kind === POLYBAHN_KIND) stepCabin(body, cmd, Math.min(.1, dt), cabin);
    // Report pose before actions so the server uses the current facing/position.
    if (cmd.hit || impact >= CART_MIN_HIT_SPEED) {
      if (body.vehicleId) this.room.send("vehicleMove", [body.vehicleId, body.x, body.z, body.rotY, body.vx, body.vz]);
      else this.room.send("move", packMove(body));
      if (cmd.hit) this.room.send("hit", cmd.karambit ? {karambit:true} : undefined);
      if (body.vehicleKind === 2 && impact >= CART_MIN_HIT_SPEED) this.room.send("bikeCrash");
    }
  }
  get canPlay() {
    return this.initialized && this.room?.state?.phase === RoomPhase.Running && this.room.state.introComplete &&
      this.now() >= this.room.state.startedAt && this.now() < this.room.state.endsAt &&
      !!this.room.state.players.get(this.room.sessionId) && !!this.room.state.members.get(this.room.sessionId) &&
      !this.room.state.members.get(this.room.sessionId)!.spectator;
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
