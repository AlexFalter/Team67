import type { Client } from 'colyseus';
import type { Room } from '@colyseus/sdk';
import * as C from '@race/shared';
import { Football, Player, RaceState, RoomMember } from '../../../server/src/state';
import { enterSpectator } from '../../../server/src/spectator';
import { RoundManager } from '../../../server/src/round';
import { VehicleManager } from '../../../server/src/vehicles';
import { PubliBikes } from '../../../server/src/publiBikes';
import { MateMachine } from '../../../server/src/mate';
import { NpcEncounters } from '../../../server/src/npcs';
import { TicketMachine } from '../../../server/src/tickets';
import { EmoteChallenge } from '../../../server/src/emotes';
import { BagManager } from '../../../server/src/bags';
import { FootballManager } from '../../../server/src/football';
import { FruitManager } from '../../../server/src/fruit';
import { TrafficManager } from '../../../server/src/traffic';
import { MoodleEvents } from '../../../server/src/moodle';
import { UI_PLAYGROUND_LOCATIONS } from './uiPlaygroundLocations';

type Handler = (data: unknown) => void;
function signal<T>() {
  const listeners = new Set<(data: T) => void>();
  const subscribe = (handler: (data: T) => void) => { listeners.add(handler); return () => listeners.delete(handler); };
  subscribe.remove = (handler: (data: T) => void) => { listeners.delete(handler); };
  subscribe.emit = (value: T) => { for (const handler of listeners) handler(value); };
  subscribe.clear = () => listeners.clear();
  return subscribe;
}

/** Development transport: real gameplay managers, one local member, no sockets. */
export class OfflineRoom {
  readonly sessionId = 'ui-player';
  readonly roomId = 'OFFLINE';
  readonly state = new RaceState();
  readonly reconnection = { enabled: false };
  readonly onStateChange = signal<C.WorldState>();
  readonly onLeave = signal<void>();
  readonly onError = signal<{ message: string }>();
  private messages = new Map<string, Set<Handler>>();
  private commands = new Map<string, Handler>();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  private previousTick = Date.now();
  private vehicles: VehicleManager;
  private bikes: PubliBikes;
  private mate: MateMachine;
  private npcs: NpcEncounters;
  private tickets: TicketMachine;
  private emotes: EmoteChallenge;
  private bags: BagManager;
  private football: FootballManager;
  private fruit: FruitManager;
  private traffic: TrafficManager;
  private moodle: MoodleEvents;
  private rounds: RoundManager;
  private client: Client;

  constructor(character = 0) {
    const state = this.state, id = this.sessionId;
    Object.assign(state, { devMode: true, adminMode: true, skipIntro: true, mapTeleport: true,
      railCrashProtection: true, noCarCollisions: true, moodleEnabled: false, serverTime: Date.now() });
    // Server managers only need this sender contract; no Colyseus server runs in the browser.
    this.client = { sessionId: id, send: (type: string, data: unknown) => this.emit(type, data) } as Client;
    this.vehicles = new VehicleManager(state, C.zurichWorld, false);
    this.bikes = new PubliBikes(state, this.vehicles, C.zurichWorld, (_, message) => this.emit('vehicleResult', { ok: false, message }));
    this.mate = new MateMachine(state, C.zurichWorld);
    this.npcs = new NpcEncounters(state, C.zurichWorld, (_, point) => this.correct(point), client => this.vehicles.exit(client));
    this.tickets = new TicketMachine(state, C.zurichWorld);
    this.emotes = new EmoteChallenge(state, C.zurichWorld);
    this.bags = new BagManager(state, C.zurichWorld, (from, target, bag) => this.hit(target,
      { from, ix: bag.vx * .55, iy: 2, iz: bag.vz * .55, knockdown: true, durationMs: 3000 }), key => this.npcs.busy(key));
    this.football = new FootballManager(state, C.zurichWorld, (from, target, ball) => this.hit(target,
      { from, ix: ball.vx * .5, iy: 1.5, iz: ball.vz * .5, knockdown: true, durationMs: 1500 }), key => this.npcs.busy(key));
    this.traffic = new TrafficManager(state);
    this.moodle = new MoodleEvents(state, (_, result) => this.emit('moodleResult', result));
    this.rounds = new RoundManager(state, C.ROUND_DURATION_MS, () => {}, () => this.reset(), { leadMs: 0, durationMs: 0 });
    this.fruit = new FruitManager(state, C.zurichWorld, (_, event) => this.emit('tomatoEvent', event),
      event => this.emit('tomatoEvent', event), (key, now) => this.rounds.canPlay(key, now), key => this.npcs.busy(key));
    this.rounds.join(id, { name: 'UI playground', character });
    this.spawn(character);
    this.rounds.ready(id, true);
    this.registerCommands();
  }

  /** Confines the room adapter assertion to the transport boundary. */
  asRoom() { return this as unknown as Room<object, C.WorldState>; }
  onMessage<T>(type: string, handler: (data: T) => void) {
    const listeners = this.messages.get(type) ?? new Set<Handler>();
    const listener = handler as Handler;
    listeners.add(listener); this.messages.set(type, listeners);
    return () => { listeners.delete(listener); };
  }
  private emit(type: string, data: unknown) { if (!this.closed) for (const handler of this.messages.get(type) ?? []) handler(data); }
  private patch() { if (!this.closed) this.onStateChange.emit(this.state as C.WorldState); }
  send(type: string, data?: unknown) {
    if (this.closed) return;
    this.commands.get(type)?.(data);
    this.patch();
  }
  start() {
    if (this.closed || this.timer) return;
    this.patch();
    this.timer = setInterval(() => this.tick(), 1000 / C.SERVER_PATCH_RATE);
  }
  tick(now = Date.now()) {
    if (this.closed) return;
    const dt = Math.min(.1, Math.max(0, (now - this.previousTick) / 1000)); this.previousTick = now;
    this.state.serverTime = now;
    for (const [id, player] of this.state.players) if (id.startsWith("ui-preview-")) player.simTime = now;
    this.rounds.tick(now);
    this.bikes.tick(now); this.mate.tick(now); this.npcs.tick(now);
    if (this.state.phase === C.RoomPhase.Running) {
      this.emotes.tick(now); this.bags.tick(now); this.football.tick(now); this.fruit.tick(now); this.moodle.tick(now);
      this.vehicles.tick(now, (from, target, _x, _y, _z, ix, iy, iz, knockdown) => {
        this.hit(target, C.collisionImpact(from, ix, iy, iz, 'vehicle', knockdown));
      });
      this.traffic.tick(dt, []);
    }
    this.patch();
  }
  async leave() {
    if (this.closed) return;
    this.closed = true; clearInterval(this.timer); this.timer = undefined;
    this.onLeave.emit(); this.onLeave.clear(); this.onStateChange.clear(); this.onError.clear();
    this.messages.clear(); this.commands.clear();
  }
  private spawn(character: number) {
    this.state.players.set(this.sessionId, new Player({ ...C.raceSpawnPoint(C.zurichWorld), character,
      color: '#edf4ef', simTime: Date.now(), grounded: true }));
    this.mate.join(this.sessionId); this.npcs.join(this.sessionId);
  }
  private reset() {
    this.bikes.disconnect(this.sessionId); this.vehicles.releaseForRespawn(this.sessionId);
    this.emotes.reset(); this.bags.reset(); this.football.reset(); this.fruit.reset(); this.moodle.reset();
    for (const id of this.state.players.keys()) if (id !== this.sessionId) { this.state.players.delete(id); this.state.members.delete(id); }
    this.state.vehicles.clear(); this.state.publiBikes.clear();
    this.vehicles = new VehicleManager(this.state, C.zurichWorld, false);
    this.bikes = new PubliBikes(this.state, this.vehicles, C.zurichWorld, (_, message) => this.emit('vehicleResult', { ok: false, message }));
    this.state.mates.clear(); this.state.npcs.clear();
    this.spawn(this.state.members.get(this.sessionId)!.character);
  }
  private startRound(intro = false) {
    this.rounds.finish(Date.now(), true); this.rounds.restart(this.sessionId);
    this.state.skipIntro = !intro;
    this.rounds = new RoundManager(this.state, C.ROUND_DURATION_MS, () => {}, () => this.reset(),
      { leadMs: 0, durationMs: intro ? C.BATTLE_BUS_DURATION_MS : 0, onArrival: () => this.correct(C.raceSpawnPoint(C.zurichWorld)) });
    this.rounds.ready(this.sessionId, true);
    if (!intro) this.correct(C.raceSpawnPoint(C.zurichWorld));
  }
  private correct(point: C.GroundPoint) {
    const p = this.state.players.get(this.sessionId)!;
    Object.assign(p, point, { vx: 0, vy: 0, vz: 0, anim: 0, grounded: true, simTime: Date.now() });
    this.emit('playerCorrection', { ...point, vx: 0, vy: 0, vz: 0, grounded: true, rotY: p.rotY,
      vehicleId: p.vehicleId, vehicleKind: p.vehicleKind, seat: p.seat, knockdownUntil: 0 });
  }
  private hit(target: string, hit: C.Impulse) {
    const p = this.state.players.get(target) ?? this.state.dummies.get(target);
    if (!p || p.knockdownUntil > Date.now()) return false;
    C.applyImpulse(p, hit, Date.now());
    if (target === this.sessionId) this.emit('impulse', hit);
    this.rounds.hit(hit.from, target);
    return true;
  }
  private teleport(locationId: unknown) {
    if (!this.rounds.canPlay(this.sessionId) || this.npcs.busy(this.sessionId)) return;
    const location = UI_PLAYGROUND_LOCATIONS.find(site => site.id === locationId);
    if (!location) return;
    this.vehicles.releaseForRespawn(this.sessionId); this.bikes.disconnect(this.sessionId);
    const vehicle = location.vehicle && this.state.vehicles.get(location.vehicle);
    const target = vehicle ? (C.isRail(vehicle) ? C.railBoardingPoint(vehicle) : vehicle) : location;
    const point = C.findGround(C.zurichWorld, target.x, target.z + (location.offset ?? (vehicle ? 1.4 : 0)));
    if (!point) return;
    const p = this.state.players.get(this.sessionId)!;
    p.moodleSitUntil = 0; p.knockdownUntil = 0; p.emoteId = '';
    p.rotY = (location.facing ?? 0) + Math.PI;
    this.correct(point);
  }
  private registerCommands() {
    const s = this.state, id = this.sessionId, c = this.client;
    const register = (type: string, handler: Handler) => this.commands.set(type, handler);
    register('ping', data => this.emit('pong', { clientTime: (data as C.Ping).clientTime, serverTime: Date.now() }));
    register('move', data => {
      if (!this.rounds.canPlay(id) || this.npcs.busy(id) || !Array.isArray(data) || data.length !== 8 || !data.every(Number.isFinite)) return;
      const [x, y, z, rotY, vx, vy, vz, anim] = data;
      Object.assign(s.players.get(id)!, { x, y, z, rotY, vx, vy, vz, anim, simTime: Date.now() });
    });
    register('vehicleMove', data => this.vehicles.move(c, data));
    register('limeTailwhip', data => { if (this.rounds.canPlay(id) && !this.npcs.busy(id)) C.startLimeTailwhip(s, id, data, Date.now()); });
    register('cabinMove', data => this.vehicles.walkCabin(id, data));
    register('vehicleEnter', data => this.vehicles.enter(c, data));
    register('vehicleExit', () => {
      const vehicleId = s.players.get(id)!.vehicleId;
      this.vehicles.exit(c); if (vehicleId) this.bikes.park(vehicleId);
      const photo = this.vehicles.photoRequired(id);
      if (photo) this.emit('limePhotoRequired', { vehicleId: photo, roundStartedAt: s.startedAt });
    });
    register('limePhotoSubmit', data => {
      const request = data as { vehicleId: string; roundStartedAt: number };
      this.emit('limePhotoResult', { ok: request.roundStartedAt === s.startedAt && this.vehicles.finishParkingPhoto(id, request.vehicleId), roundStartedAt: s.startedAt });
    });
    register('bikeScanBegin', data => this.bikes.begin(c, data));
    register('bikeScanFinish', data => this.bikes.finish(c, data));
    register('bikeScanCancel', data => this.bikes.cancel(c, data));
    register('mate', data => this.mate.command(c, data));
    register('ticket', data => this.tickets.command(c, data));
    register('npc', data => this.npcs.command(c, data));
    register('npcPose', data => this.npcs.pose(c, data));
    register('emoteChallenge', data => this.emit('emoteChallengeResult', { ...this.emotes.answer(id, data, Date.now()), roundStartedAt: s.startedAt }));
    register('emote', data => this.emotes.dance(id, data, Date.now()));
    register('football', data => this.football.command(c, data, Date.now()));
    register('fruit', data => this.fruit.command(c, data, Date.now()));
    register('bag', data => this.bags.command(c, data, Date.now()));
    register('debugDummies', data => this.bags.setDummies(c, data));
    register('moodleAnswer', data => this.moodle.answer(id, data, Date.now()));
    register('moodleBoost', data => this.moodle.claim(id, data, Date.now()));
    register('moodleSettings', data => { if (typeof data === 'boolean') this.moodle.enabled(data); });
    register('carCollisionSettings', data => { if (typeof data === 'boolean') s.noCarCollisions = data; });
    register('respawn', () => { this.vehicles.releaseForRespawn(id); this.correct(C.raceSpawnPoint(C.zurichWorld)); });
    register('collectKarambit', () => { if (C.canCollectKarambit(s.players.get(id)!, C.zurichWorld)) s.players.get(id)!.karambitOwned = true; });
    register('hit', () => {
      const p = s.players.get(id)!;
      for (const [target, dummy] of s.dummies) if (C.inHitCone(p, dummy, C.zurichWorld)) this.hit(target,
        { from: id, ix: Math.sin(p.rotY) * 8, iy: 1.5, iz: Math.cos(p.rotY) * 8, knockdown: true, durationMs: C.ATTACK_KNOCKDOWN_MS });
    });
    register('ready', data => this.rounds.ready(id, data));
    register('finishRound', () => this.rounds.finish());
    register('restartRound', () => this.rounds.restart(id));
    register('spectate', data => {
      const ok = enterSpectator(s, id, data, () => this.rounds.canPlay(id), () => { this.vehicles.releaseForRespawn(id); this.bikes.disconnect(id); this.bags.leave(id); this.football.leave(id); });
      this.emit('spectateResult', { ok, roundStartedAt: s.startedAt });
    });
    register('examStart', data => {
      if (!this.rounds.beginExam(id, data)) return;
      const player = s.players.get(id), point = C.examSoundproofPosition(C.zurichWorld);
      if (!player || !point) return;
      player.examSheltered = true;
      this.correct(point);
    });
    register('examProgress', data => this.rounds.examProgress(id, data));
    register('debugTeleportToPolyterrasse', data => { this.correct(data === 'portal' ? { ...C.examPortalPosition, y: C.zurichWorld.height(C.examPortalPosition.x, C.examPortalPosition.z)! } : { ...C.examDebugPosition, y: C.zurichWorld.height(C.examDebugPosition.x, C.examDebugPosition.z)! }); });
    register('debugMapTeleport', data => {
      const point = data as { x: number; z: number };
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z) || s.players.get(id)!.vehicleId || this.npcs.busy(id)) return;
      const target = C.findGround(C.zurichWorld, point.x, point.z);
      if (target) this.correct(target);
    });
    register('uiTeleport', data => this.teleport(data));
    register('uiPlayers', () => {
      const p = s.players.get(id)!;
      for (let index = 0; index < 7; index++) {
        const point = C.findGround(C.zurichWorld, p.x + (index % 3 - 1) * 2.5, p.z - 4 - Math.floor(index / 3) * 3);
        if (!point) continue;
        const key = `ui-preview-${index}`;
        s.members.set(key, new RoomMember({ name: ['Alex', 'Ryo', 'Mia', 'Nora', 'Leo', 'Sam', 'A long player name'][index], character: index % 4, ready: true }));
        s.players.set(key, new Player({ ...point, color: '#edf4ef', character: index % 4, rotY: Math.PI, grounded: true, simTime: Date.now() }));
      }
    });
    register('uiTools', () => {
      const p = s.players.get(id)!;
      Object.assign(p, { mateCount: 5, karambitOwned: true, emotesUnlocked: true });
      if (![...s.footballs.values()].some(ball => ball.owner === id))
        s.footballs.set(`football-${id}`, new Football({ owner: id, x: p.x, y: p.y + .22, z: p.z }));
    });
    register('uiReset', () => this.startRound());
    register('uiBus', () => this.startRound(true));
    register('thankBusDriver', data => this.rounds.thankBusDriver(id, data));
    register('uiMoodle', () => {
      this.moodle.enabled(false); this.moodle.enabled(true);
      this.moodle.tick(Date.now()); this.moodle.tick(Date.now() + 1000000);
      s.moodleDeadline = Date.now() + 30000;
    });
    register('trafficEdit', data => {
      try {
        const edit = data as { network?: C.TrafficNetwork; settings?: unknown };
        if (edit.network) this.traffic.replace(C.validateTrafficNetwork(edit.network));
        if (edit.settings) this.traffic.settings(edit.settings);
        this.emit('trafficResult', { ok: true, message: 'Offline traffic updated.' });
      } catch (error) { this.emit('trafficResult', { ok: false, message: String(error) }); }
    });
  }
}
