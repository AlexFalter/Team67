import {AwpFeature} from './weapons/AwpFeature.ts';
import {FruitFeature} from './fruit/FruitFeature.ts';
import { StuckHint } from "./stuckHint.ts";
import { LimeTrickScore } from "./limeTrickScore.ts";
import {FootballFeature} from './football.ts';
import {BagFeature} from './bags/BagFeature.ts';
import {Spectator} from './spectator.ts';
import {EmoteFeature} from './emotes/EmoteFeature.ts';
import type { ContextAction } from "./actionHud.ts";
import {CollisionDebug} from "./collisionDebug.ts";
import { DeveloperCoordinates } from "./developerCoordinates.ts";
import {createMedals} from "./medals/medals.js";
import {PLAYER_MEDALS} from "@race/shared";
import { decoratePlayer } from "./playerIdentity.ts";
import * as THREE from "three";
import * as C from "@race/shared";
import { BATTLE_BUS_HEADING, INTERP_DELAY_MS, IDLE_INPUT, zurichWorld, isRail, railFrame, railSeat, tramDerailFrame, examSecondsRemaining, RoomPhase } from "@race/shared";
import { BridgeCows } from "./bridgeCows.ts";
import { TrafficRenderer } from "./traffic.ts";
import { TrafficRoadSurface } from "./trafficRoadSurface.ts";
import { TrafficEditor } from "./trafficEditor.ts";
import { Network } from "./net.ts";
import { LocalPlayer } from "./localPlayer.ts";
import { RemotePlayers } from "./remotePlayers.ts";
import { Vehicles } from "./vehicles.ts";
import { Effects } from "./effects.ts";
import { Hud } from "./hud.ts";
import { RaceMap } from "./raceMap.ts";
import { avatar, pose, alignCabinAvatar, disposeAvatar, firstPersonBodyVisible } from "./avatar.ts";
import { PlayerView } from "./view.ts";
import { GameControls } from "./gameControls.ts";
import { lobby } from "./lobby.ts";
import { RoomFlow } from "./roomFlow.ts";
import { accelerateMapRaycasts } from "./mapRaycast.ts";
import { BattleBusIntro } from "./battleBus.ts";
import { PubliBikeFeature } from "./publiBikes.ts";
import { TransitScenery } from "./transitScenery.ts";
import { ExamSequence, type ExamSession } from "../exam/ExamSequence";
import { MateFeature } from "./mate.ts";
import { MenuScene } from "./MenuScene";
import { NpcFeature } from "../npcPrototype/host.js";
import { GameAudio, type LoopSource } from "./gameAudio.ts";
import { Drowning } from "./drowning.ts";

// MapViewer owns rendering and the loop; this instance owns gameplay cleanup.
export class MapGame {
  readonly ready: Promise<void>;
  private exam: ExamSequence;
  private derailVehicle="";
  private derailUntil=0;
  private derailRun=0;
  private explosionEvents=new Set<string>();
  private net = new Network();
  private traffic: TrafficRenderer;
  private cows: BridgeCows;
  private trafficEditor?: TrafficEditor;
  private local = new LocalPlayer();
  private remotes: RemotePlayers;
  private medals: ReturnType<typeof createMedals>;
  private medalRound = 0;
  private vehicles: Vehicles;
  private effects: Effects;
  private hud: Hud;
  private trickScore: LimeTrickScore;
  private stuckHint: StuckHint;
  private maps: RaceMap;
  private coordinates: DeveloperCoordinates;
  private collisions: CollisionDebug;
  private view: PlayerView;
  private disposeMapRaycasts: () => void;
  private controls: GameControls;
  private roomFlow: RoomFlow;
  private closeLobby: () => void;
  private mesh = avatar("#ffffff");
  private firstBody = avatar("#ffffff", 0, true);
  private avatarReady = false;
  private bus: BattleBusIntro;
  private publiBikes: PubliBikeFeature;
  private introStartedAt = 0;
  private transitScenery: TransitScenery;
  private mate: MateFeature;
  private menuScene: MenuScene;
  private npcs: NpcFeature;
  private emotes: EmoteFeature;
  private spectator:Spectator;
  private football:FootballFeature;
  private bags: BagFeature;
  private fruit:FruitFeature;
  private awp:AwpFeature;
  private audio = new GameAudio();
  private drowning: Drowning;
  private audioSources = new Map<string, LoopSource>();
  private limoTrack = new Map<string, { x: number; z: number; speed: number }>();
  private lastCanDrop = 0;
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private canvas: HTMLCanvasElement,
    hud: HTMLDivElement, hints: HTMLDivElement, map: THREE.Object3D, capture: () => void, onExamChange: (session: ExamSession) => void = () => {}) {
    this.medals = createMedals({root: canvas.parentElement!, definitions: PLAYER_MEDALS});
    this.net.onMedal = award => this.medals.awardMany(award.ids, award.eventKey);
    this.cows = new BridgeCows(scene, this.audio);
    this.traffic = new TrafficRenderer(scene, TrafficRoadSurface.forMap(map));
    this.exam = new ExamSequence(scene, camera, onExamChange);
    this.transitScenery = new TransitScenery(scene, map);
    this.disposeMapRaycasts = accelerateMapRaycasts(map);
    this.remotes = new RemotePlayers(scene);
    this.vehicles = new Vehicles(scene, this.net, hints);
    this.effects = new Effects(scene, bump => this.audio.bump(this.listener, bump));
    this.hud = new Hud(hud);
    this.trickScore = new LimeTrickScore(canvas.parentElement!);
    this.stuckHint = new StuckHint(canvas.parentElement!);
    this.drowning = new Drowning(hud.parentElement ?? document.body, () => this.net.room.send('respawn'));
    this.coordinates = new DeveloperCoordinates(canvas.parentElement!);
    this.collisions = new CollisionDebug(scene,this.net,canvas.parentElement!);
    this.publiBikes = new PubliBikeFeature(scene, camera, this.net, this.vehicles, this.local, canvas, () => this.controls.restoreGameplay());
    this.mate = new MateFeature(scene, camera, this.net, this.local, canvas);
    this.view = new PlayerView(camera, [map, this.mate.machine], zurichWorld);
    this.bags=new BagFeature(scene,camera,this.net,this.local,this.view,canvas.parentElement!,()=>this.net.canPlay&&!this.exam.active&&!this.publiBikes.active&&!this.mate.active&&!this.npcs?.active&&!this.emotes?.opened&&!this.maps?.active,()=>{if(this.npcs?.karambit?.occupiesHands())this.npcs.karambit.toggle();});
    this.fruit=new FruitFeature(scene,camera,this.net,this.local,()=>this.net.canPlay&&!this.exam.active&&!this.publiBikes.active&&!this.mate.active&&!this.npcs?.active&&!this.emotes?.opened&&!this.maps?.active&&!!document.querySelector<HTMLElement>('#pause')?.hidden,()=>{this.awp?.holster();this.football?.holster();if(this.npcs?.karambit?.occupiesHands())this.npcs.karambit.toggle();});
    // Camera shutter from mini-games-2 when a photo is taken.
    this.npcs = new NpcFeature(scene, camera, this.net, this.local, this.vehicles, canvas, map, () => { this.audio.effect("shutter"); return capture(); });
    this.football=new FootballFeature(scene,camera,this.net,this.local,()=>!this.npcs.active&&!this.exam.active&&!this.publiBikes.active&&!this.mate.active&&!this.emotes?.opened&&!this.maps?.active&&document.querySelector<HTMLElement>('#pause')?.hidden!==false,()=>{this.awp?.holster();if(this.npcs.karambit?.occupiesHands())this.npcs.karambit.toggle();});
    this.awp=new AwpFeature(scene,camera,this.net,this.local,()=>!this.npcs.active&&!this.exam.active&&!this.publiBikes.active&&!this.mate.active&&!this.emotes?.opened&&!this.maps?.active&&!this.trafficEditor?.active&&this.net.now()>=this.derailUntil&&document.querySelector<HTMLElement>('#pause')?.hidden!==false,()=>{this.view.perspective=0;this.fruit.holster();this.football.holster();if(this.npcs.karambit?.occupiesHands())this.npcs.karambit.toggle();},id=>id===this.net.room?.sessionId?this.mesh:this.remotes.players.get(id)?.mesh??this.bags.avatarFor(id));
    this.npcs.onFootballReward=()=>this.football.grant();
    this.medals.setSoundEnabled(this.audio.settings.medalSounds);
    for (const [selector, key] of [["#vehicle-sounds", "vehicleSounds"], ["#medal-sounds", "medalSounds"]] as const) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (!input) continue;
      input.checked = this.audio.settings[key];
      input.onchange = () => {this.audio.setSetting(key, input.checked);if(key==="medalSounds")this.medals.setSoundEnabled(input.checked);};
    }
    this.npcs.playerView = this.view;
    scene.add(camera);
    this.bus = new BattleBusIntro(scene, camera, this.net, canvas, () => this.view.sensitivity);
    this.ready = Promise.all([this.bus.ready, this.vehicles.publiReady, this.vehicles.transitReady, this.mate.ready, this.npcs.ready, this.cows.ready, this.bags.ready,this.fruit.ready,this.awp.ready]).then(() => {});
    this.roomFlow = new RoomFlow(this.net, this.ready, () => this.bus.unlockAudio(), () => this.audio.effect("timer"));
    this.controls = new GameControls(canvas, this.local, this.view, () => this.net.canPlay && !this.trafficEditor?.active && !this.emotes?.opened && !this.exam.active && !this.publiBikes.active && !this.mate.active && !this.npcs.active, () => this.net.now()<this.derailUntil || !!this.maps?.active || (this.local.body.moodleSitUntil??0)>this.net.now(), () => this.net.now(), () => this.contextActions(), () => {if(this.awp.occupiesHands)return {kind:"awp",enabled:this.awp.canFire,run:()=>this.awp.fire()};if(this.fruit.occupiesHands)return {kind:"tomato",enabled:this.fruit.canThrow,run:()=>this.fruit.throw()};if(this.bags.occupiesHands)return {kind:"bag",enabled:this.bags.canThrow,run:()=>this.bags.throwBag()};if(this.football.occupiesHands)return {kind:"football",enabled:this.football.canKick,run:()=>this.football.kick()};const knife=this.npcs.karambit;return knife?.occupiesHands()&&!this.local.body.vehicleId&&this.view.perspective===0?{enabled:this.npcs.canUseKarambit()&&knife.state().phase!=='attack'&&this.local.body.attackReadyAt<=this.net.now(),run:()=>this.npcs.attackKarambit()}:undefined;}, () => this.net.room.send('respawn'));
    this.emotes=new EmoteFeature(this.net,this.local,this.view,canvas.parentElement!,()=>this.net.canPlay&&!this.exam.active&&!this.publiBikes.active&&!this.mate.active&&!this.npcs.active&&!this.maps?.active&&this.net.now()>=this.derailUntil&&!!document.querySelector<HTMLElement>('#pause')?.hidden,()=>this.controls.resumeAfterInteraction());
    this.spectator=new Spectator(this.net,camera,canvas,()=>{this.controls.suspendForMap();this.exam.returnToExam();},()=>{void this.controls.resume();});
    this.net.onSpectate=()=>{this.maps.closeForTeleport();this.local.enabled=false;this.local.clear();this.exam.spectate();this.controls.suspendForMap();};
    this.maps = new RaceMap(this.net, () => ({ ...this.local.body, enabled: this.local.enabled }),
      () => [...this.npcs.mapMarkers(), { ...this.mate.machine.position, label: "El Tony Mate" },{x:C.AWP_RACK.approach[0],y:C.AWP_RACK.approach[1],z:C.AWP_RACK.approach[2],label:"Nerf AWP"}],
      () => !!this.net.canPlay && !this.trafficEditor?.active && !this.exam.active && !this.publiBikes.active && !this.mate.active && !this.npcs.active && this.net.now() >= this.derailUntil && !!document.querySelector<HTMLElement>("#pause")!.hidden,
      () => this.controls.suspendForMap(), () => void this.controls.resume());
    this.net.onMapTeleport=({from,target})=>{this.maps.closeForTeleport();this.local.clear();this.npcs.playMapTeleport(from,target);};
    this.npcs.externalPhoneBusy=()=>this.exam.active||this.publiBikes.active||this.mate.active||!document.querySelector<HTMLElement>("#pause")?.hidden;
    this.npcs.onResume=()=>this.controls.resumeAfterInteraction();
    this.npcs.onSuspend=()=>this.controls.suspendForInteraction();
    this.controls.externalCapture=()=>this.npcs.rideMouseCapture||this.spectator.captureActive;
    this.controls.externalMenuReady=()=>this.bus.active||(this.net.canPlay&&this.npcs.pauseAvailable)||(this.net.spectating&&this.exam.spectating);
    const spawn = C.raceSpawnPoint(zurichWorld);
    Object.assign(this.local.body, spawn);
    camera.near = 0.05;
    camera.position.set(spawn.x, spawn.y + 1.6, spawn.z);
    this.menuScene = new MenuScene(scene, camera);
    scene.add(this.mesh, this.firstBody);
    this.mesh.visible = this.firstBody.visible = false;
    this.closeLobby = lobby(selection => {
      this.bus.unlockAudio();
      return this.net.connect(this.local.body, (state, id) => {
        if (state.startedAt !== this.medalRound) {this.medalRound = state.startedAt; this.medals.reset();}
        if (state.introStartedAt && this.introStartedAt !== state.introStartedAt) {
          this.introStartedAt = state.introStartedAt;
          this.derailVehicle="";this.derailUntil=this.derailRun=0;this.explosionEvents.clear();
          this.view.yaw = BATTLE_BUS_HEADING; this.view.pitch = 0;
        }
        if (state.introComplete) camera.up.set(0, 1, 0);
        this.traffic.patch(state);
        if (import.meta.env.DEV && state.devMode && state.hostId === id && !this.trafficEditor) {
          this.trafficEditor = new TrafficEditor(scene, camera, canvas, map);
          this.trafficEditor.bind(this.net.room);
        }
        this.trafficEditor?.patch(state);
        this.roomFlow.patch(state, id);
        this.vehicles.patch(state); this.remotes.patch(state, id);
        const p = state.players.get(id);
        if (p && !this.avatarReady) {
          disposeAvatar(this.mesh); disposeAvatar(this.firstBody);
          this.mesh = avatar(p.color, p.character); this.firstBody = avatar(p.color, p.character, true);
          scene.add(this.mesh, this.firstBody); this.avatarReady = true;
        }
        if (p && this.avatarReady) decoratePlayer(this.mesh, state.members.get(id)?.name ?? "Player");
      }, hit => { this.effects.enqueue(hit, this.net.room.sessionId); }, selection);
    });
  }
  stopAfterFailure(){this.local.enabled=false;this.local.clear();this.net.dispose();}
  get examScreenVisible() { return this.exam.screenVisible; }
  get focus() { return this.net.room?.state?.phase === RoomPhase.Lobby ? this.menuScene.focus : this.bus.active ? this.bus.focus : this.local.body; }
  private contextActions(): ContextAction[] {
    if (this.npcs.active) return [];
    const p = this.local.body, actions: ContextAction[] = [];
    const npcPrompt = this.npcs.interactionPrompt;
    const nearId = this.vehicles.nearestId(p), near = this.vehicles.items.get(nearId)?.latest;
    const nearbyBike = this.net.room?.state.publiBikes?.get(nearId);
    const icon = npcPrompt?.icon ?? (p.vehicleId ? "leave" : this.mate.nearby ? "mate" : this.vehicles.interactionKind(p));
    const label = npcPrompt?.label ?? (p.vehicleId ? "Leave vehicle" : this.mate.nearby ? "Use Mate machine" : near?.kind === C.LIME_KIND ? "Ride Lime scooter" : icon === "bike" ? (nearbyBike ? nearbyBike.broken || nearbyBike.batteryMs <= 0 ? "This PubliBike seems broken" : "Unlock PubliBike" : "Ride bike") : near && C.isRail(near) ? `Enter ${C.transitName(near)}` : "Enter vehicle");
    if(this.awp.nearby)actions.push({icon:"awp",key:"E",label:"Pick up Nerf AWP",enabled:this.awp.eligible,run:()=>this.local.requestInteraction()});
    else if(this.fruit.nearby)actions.push({icon:"mate",key:"E",label:this.fruit.remaining===0?"No tomatoes left":this.fruit.count>=5?"Tomato inventory full":`Take tomatoes (${this.fruit.remaining} left)`,enabled:this.fruit.canTake,run:()=>this.local.requestInteraction()});
    else if(this.football.nearby)actions.push({icon:"football",key:"E",label:"Pick up football",enabled:this.football.available,run:()=>this.local.requestInteraction()});
    else if(this.bags.nearby)actions.push({icon:"bag",key:"E",label:"Pick up Ersti bag",enabled:p.knockdownUntil<=this.net.now(),run:()=>this.local.requestInteraction()});
    else if (icon) actions.push({ icon, key: "E", label, enabled: p.knockdownUntil <= this.net.now(), run: () => this.local.requestInteraction() });
    if(this.awp.owned)actions.push({icon:"awp",key:"6",label:this.awp.occupiesHands?"Holster Nerf AWP":"Equip Nerf AWP",enabled:this.awp.available,run:()=>this.awp.toggle()});
    if(this.awp.occupiesHands){actions.push({icon:"awp",key:"F",label:"Zoom / unzoom",enabled:this.awp.canZoom,run:()=>this.awp.toggleScope()});actions.push({icon:"equip",key:"R",label:"Reload darts",enabled:this.awp.canReload,run:()=>this.awp.reload()});}
    if(this.fruit.count>0)actions.push({icon:"bag",key:"5",label:this.fruit.occupiesHands?"Holster tomato":"Equip tomato",enabled:!p.bagId&&!p.vehicleId,run:()=>this.fruit.toggle()});
    const scooter = this.vehicles.items.get(p.vehicleId)?.latest;
    if (C.LIME_TAILWHIP_ENABLED && scooter?.kind === C.LIME_KIND && scooter.driver === this.net.room?.sessionId)
      actions.push({icon:"scooter",key:"Space",label:"Tailwhip",enabled:p.knockdownUntil<=this.net.now() && this.net.now()>=(scooter.tailwhipStartedAt || 0)+C.LIME_TAILWHIP_COOLDOWN_MS,run:()=>this.local.requestJump()});
    if (p.mateCount > 0) actions.push({ icon: "mate", key: "1", label: "Drink Mate", enabled: this.mate.canConsume, run: () => this.mate.consume() });
    const knife = this.npcs.karambit;
    if (knife?.owns() && !p.bagId) {
      const enabled = this.npcs.canUseKarambit(), equipped = knife.occupiesHands();
      actions.push({ icon: "knife", key: "3", label: equipped ? "Holster Karambit" : "Equip Karambit", enabled, run: () => {this.football.holster();this.npcs.toggleKarambit();} });
      if (equipped && this.view.perspective === 0 && !p.vehicleId) {
        const ready = enabled && knife.state().phase !== "attack" && p.attackReadyAt <= this.net.now();
        actions.push({ icon: "knife", key: "Q", label: "Slash", enabled: ready, run: () => this.npcs.attackKarambit() });
      }
    }
    if(this.football.owns)actions.push({icon:"football",key:"4",label:this.football.occupiesHands?"Put away football":"Equip football",enabled:this.football.available,run:()=>this.football.toggle()});
    if(this.emotes)actions.push({icon:"emote",key:"B",label:"Emote wheel",enabled:this.emotes.available,run:()=>this.emotes.open()});
    return actions;
  }
  update(elapsed: number, now: number) {
    const dt = Math.min(0.1, elapsed), renderTime = this.net.now() - INTERP_DELAY_MS;
    const state = this.net.room?.state;
    if(this.football.occupiesHands||this.npcs.karambit?.occupiesHands()||this.local.body.bagId)this.fruit.holster();
    if(this.fruit.occupiesHands||this.football.occupiesHands||this.npcs.karambit?.occupiesHands())this.awp.holster();
    this.awp.update(dt);
    if(this.awp.occupiesHands)this.view.perspective=0;
    this.fruit.update();
    this.cows.update(this.net.now(), this.camera.position, this.net.canPlay && !this.exam.active);
    this.traffic.render(renderTime);
    this.trafficEditor?.update();
    if (this.trafficEditor?.active) {
      this.stuckHint.update(this.local.body, now, false);
      this.controls.update(dt);
      this.vehicles.stopDriving();
      this.mesh.visible = this.firstBody.visible = false;
      this.vehicles.render(renderTime, dt); this.remotes.render(renderTime, this.vehicles.items, dt);
      return;
    }
    const remaining = state?.phase === RoomPhase.Running ? examSecondsRemaining(state.endsAt, this.net.now()) : 0;
    if(this.exam.spectating&&!this.net.spectating)this.exam.returnToWorld();
    const examWasActive = this.exam.active;
    // Encounters keep camera ownership until they finish; vehicles also block exam entry.
    this.exam.update(this.local.body, (this.net.canPlay||this.net.spectating) && !state?.adminMode, this.local.enabled && !this.publiBikes.active && !this.mate.active && !this.npcs.active && !this.emotes.opened && this.net.now()>=this.derailUntil, state?.startedAt ?? 0, remaining, now);
    if (!examWasActive && this.exam.active) { this.net.beginExam(this.local.body); this.controls.suspendForMap(); }
    this.vehicles.render(renderTime, dt, "rail");
    this.transitScenery.update(state?.vehicles?.values() ?? [], this.net.now(), this.net.canPlay);
    this.view.setVehicle(this.local.body.vehicleId, this.local.body.rotY);
    const riding=this.vehicles.items.get(this.local.body.vehicleId)?.latest;
    if(riding?.derailStartedAt&&this.derailRun!==riding.derailStartedAt){
      this.derailRun=riding.derailStartedAt;this.derailVehicle=this.local.body.vehicleId;this.derailUntil=riding.derailStartedAt+3200;
    }
    if (this.net.canPlay && !this.exam.active) {
      // Water kills players on foot: 10 s timeout with the meme music, then the same respawn as the Respawn button.
      const drowned = this.drowning.update(this.local.body, this.net.now(),
        !this.publiBikes.active && !this.mate.active && !this.npcs.active && !this.npcs.ridingVehicle && this.net.now() >= this.derailUntil);
      this.net.frame(dt, this.local.body, () => drowned || this.net.now()<this.derailUntil || this.npcs.ridingVehicle || (this.local.body.moodleSitUntil??0)>this.net.now()?IDLE_INPUT:this.local.controls(this.view.yaw));
      if (drowned) this.local.takeInteraction();
      else if ((this.local.body.moodleSitUntil??0)<=this.net.now() && this.net.now()>=this.derailUntil && this.local.takeInteraction() && !this.npcs.active && !this.awp.interact() && !this.fruit.interact() && !this.football.interact() && !this.bags.interact() && !this.npcs.interact() && !this.mate.interact() && !this.publiBikes.interact()) this.vehicles.interact(this.local.body);
      if (this.local.body.vehicleId) this.vehicles.local(this.local.body, this.net.room.sessionId);
      else this.vehicles.stopDriving();
      this.mate.equip(this.mesh, this.local.body.mateFlavor ?? 2);
      this.mate.equip(this.firstBody, this.local.body.mateFlavor ?? 2);
      const knifeEquipped = !!this.npcs.karambit?.occupiesHands();
      pose(this.mesh, this.local.body, dt, 0, undefined, knifeEquipped);
      const cabin = this.vehicles.items.get(this.local.body.vehicleId)?.rendered;
      const railPhone=this.npcs.phoneOpen&&!!cabin&&isRail(cabin);
      alignCabinAvatar(this.mesh, this.local.body, cabin);
      this.mesh.visible = this.avatarReady && this.view.perspective !== 0;
      this.firstBody.visible = this.avatarReady && firstPersonBodyVisible(this.local.body, this.view.perspective);
      if(this.view.perspective===0&&(this.awp.occupiesHands||this.npcs.karambit?.occupiesHands()||this.bags.occupiesHands)&&!this.local.body.vehicleId)this.firstBody.visible=false;
      if (this.publiBikes.active || this.mate.active || (this.npcs.hideAvatar&&!railPhone)) this.mesh.visible = this.firstBody.visible = false;
      this.effects.trail(this.net.room.sessionId, this.local.body, now);
      const trickVehicle = this.vehicles.items.get(this.local.body.vehicleId);
      const trickHeight = C.limeTailwhipPose(trickVehicle?.latest,
        trickVehicle?.latest.driver === this.net.room.sessionId ? this.net.now() : renderTime).height;
      this.mesh.position.y += trickHeight;
      if (!this.publiBikes.active && !this.mate.active && (!this.npcs.active||railPhone)) {
        const vehicle = this.vehicles.items.get(this.local.body.vehicleId)?.rendered;
        // A phone freezes input, while the passenger camera still follows the moving cabin.
        this.view.update(this.local.body, dt, vehicle && isRail(vehicle) ? railFrame(vehicle, railSeat(vehicle, this.local.body.seat).part) : undefined);
        this.view.camera.position.y += trickHeight;
        this.awp.applyCamera();
      }
      pose(this.firstBody, trickHeight ? {...this.local.body, y: this.local.body.y + trickHeight} : this.local.body, dt, this.view.pitch, this.view.camera, knifeEquipped);
      if((this.local.body.moodleSitUntil??0)>this.net.now()&&!this.npcs.active){this.mesh.visible=this.avatarReady;this.firstBody.visible=false;const p=this.local.body;this.view.camera.position.set(p.x+Math.sin(this.view.yaw)*3.6,p.y+1.7,p.z+Math.cos(this.view.yaw)*3.6);this.view.camera.lookAt(p.x,p.y+.55,p.z);}
    }
    if (!this.net.canPlay || this.exam.active) { this.drowning.cancel(); this.mesh.visible = this.firstBody.visible = false; this.vehicles.stopDriving(); }
    this.effects.speed(this.local.body, this.view.camera, dt, this.net.canPlay && !this.exam.active && !this.publiBikes.active && !this.mate.active && !this.npcs.active && (this.view.perspective === 0 || !!this.local.body.vehicleId));
    this.roomFlow.update();
    this.vehicles.render(renderTime, dt, "other"); this.remotes.render(renderTime, this.vehicles.items, dt);
    for (const [id, remote] of this.remotes.players) {
      this.mate.equip(remote.mesh, remote.rendered.mateFlavor ?? 2);
      const npc=this.net.room?.state.npcs?.get(id);remote.mesh.visible = npc?.kind !== "limousine" || npc.parachuting===true;
      this.effects.trail(id, remote.rendered, now);
    }
    this.emotes.update(dt,this.mesh,this.remotes.players);
    if(this.npcs.karambit?.occupiesHands())this.football.holster();
    this.football.update(dt);
    this.bags.update(dt,this.mesh,this.remotes.players);
    const scoreVehicle = this.vehicles.items.get(this.local.body.vehicleId)?.latest;
    this.stuckHint.update(this.local.body, now,
      this.net.canPlay && !this.exam.active && !this.npcs.active && !this.mate.active &&
      !this.publiBikes.active && !this.maps.active && !this.emotes.opened && !this.controlsPaused &&
      !this.drowning.active(this.net.now()) && this.net.now() >= this.derailUntil &&
      this.net.now() >= this.local.body.knockdownUntil && this.net.now() >= (this.local.body.moodleSitUntil ?? 0) &&
      (!this.local.body.vehicleId || scoreVehicle?.driver === this.net.room?.sessionId));
    this.trickScore.update(scoreVehicle?.tailwhipStartedAt ?? 0, this.net.now(), state?.startedAt ?? 0,
      this.net.canPlay && !this.exam.active && !this.npcs.active && !this.mate.active && !this.publiBikes.active &&
      scoreVehicle?.kind === C.LIME_KIND && scoreVehicle.driver === this.net.room?.sessionId && !this.controlsPaused);
    this.medals.update(dt,{visible:this.net.canPlay&&!this.exam.active&&!this.npcs.active&&!this.mate.active&&!this.publiBikes.active});
    this.controls.update(dt); this.effects.update(renderTime, dt); this.hud.update(dt, this.net, this.local.body);
    this.maps.update(dt, this.net.canPlay && !this.exam.active && !this.publiBikes.active && !this.mate.active && !this.npcs.active && this.net.now() >= this.derailUntil);
    this.coordinates.update(this.local.body, state?.devMode === true, this.net.canPlay);
    this.collisions.update(this.local.body);
    this.vehicles.updateLabels(this.local.body, now);
    this.bus.update(dt, this.mesh, this.remotes);
    const inMenu = !state || state.phase === RoomPhase.Lobby;
    if (inMenu) for (const remote of this.remotes.players.values()) remote.mesh.visible = false;
    this.menuScene.update(dt, state, this.net.room?.sessionId);
    this.publiBikes.update(dt);
    this.mate.update();
    this.npcs.update(dt, this.net.canPlay && !this.exam.active && this.local.enabled && !this.publiBikes.active && !this.mate.active && this.net.now()>=this.derailUntil);
    for (const [id, bike] of state?.publiBikes ?? []) {
      const at = this.vehicles.items.get(id)?.rendered;
      if (at) this.effects.battery(id, bike.batteryMs, at, now);
    }
    for(const [id,visual] of this.vehicles.items){
      const v=visual.rendered;if(!v.derailStartedAt)continue;
      for(let part=0;part<3;part++){
        const key=`${id}:${v.derailStartedAt}:${part}`,age=(renderTime-v.derailStartedAt)/1000;
        const landing=tramDerailFrame(v,part).landedAt;
        if(age>=landing&&age<landing+1&&!this.explosionEvents.has(key)){
          this.explosionEvents.add(key);this.effects.explosion(visual.railCars?.[part]?.getWorldPosition(new THREE.Vector3())??v,this.local.body);
        }
      }
    }
    if(this.net.now()<this.derailUntil){
      const car=this.vehicles.items.get(this.derailVehicle)?.railCars?.[0];
      if(car){
        const target=car.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1.4,0));
        this.camera.up.set(0,1,0);this.camera.position.copy(target).add(new THREE.Vector3(13,8,12));this.camera.lookAt(target);this.camera.updateMatrixWorld(true);
        this.firstBody.visible=false;this.mesh.visible=this.avatarReady;
      }
    }
    this.spectator.update(dt,this.remotes.players,this.exam.spectating);
    this.updateAudio(dt, renderTime);
  }
  private get listener() { return this.net.spectating?this.camera.position:this.local.body; }
  private updateAudio(dt: number, renderTime: number) {
    const state = this.net.room?.state, id = this.net.room?.sessionId, body = this.local.body, sources = this.audioSources;
    const playing = (this.net.canPlay && !this.exam.active) || this.bus.active || this.net.spectating;
    sources.clear();
    if (state && playing) {
      const clock = state.phase === RoomPhase.Finished ? state.finishedAt : renderTime;
      for (const [key, visual] of this.vehicles.items) {
        const v = visual.rendered, latest = visual.latest, aboard = body.vehicleId === key;
        const speed = Math.hypot(v.vx, v.vz), x = v.x, z = v.z;
        if (v.kind === 0) sources.set(key, { sample: "car-engine", motor: true, active: !!latest.driver, speed, x, z, aboard });
        else if (v.kind === 3) sources.set(key, { sample: "car-engine", motor: true, active: speed > 0.3, speed, x, z, aboard });
        else if (v.kind === 1) sources.set(key, { sample: "bus-engine", motor: true, active: latest.traveling || latest.departureAt > 0,
          speed: latest.traveling ? speed : 0, x, z, aboard, door: !latest.traveling });
        else if (C.isRail(v)) {
          // Same door timing as the Polybahn door animation in vehicles.ts.
          const open = !latest.traveling ? (latest.departureAt ? (latest.departureAt + C.TRANSIT_DOOR_MS - clock) / C.TRANSIT_DOOR_MS : 1)
            : clock < latest.tripStartedAt ? (latest.tripStartedAt - clock) / C.TRANSIT_DOOR_MS
            : (clock - (latest.arrivalAt - C.TRANSIT_DOOR_MS)) / C.TRANSIT_DOOR_MS;
          const frame = C.railFrame(v);
          // A derailed tram goes quiet; main's explosion effect provides the crash sound.
          sources.set(key, { sample: "rail-running", motor: false, active: !v.derailStartedAt, speed: latest.traveling ? speed : 0, x: frame.x, z: frame.z, aboard, door: open > 0.5 });
        } else if (v.kind === 2) sources.set(key, { motor: false, active: true, speed: 0, x, z, aboard, crashed: latest.fallenUntil > this.net.now() });
      }
      // Interview helicopter rotor loop follows replicated aircraft positions.
      for (const [owner, npc] of state.npcs ?? []) {
        if (!npc.limoVisible) { this.limoTrack.delete(owner); continue; }
        const last = this.limoTrack.get(owner), moved = last && dt > 0 ? Math.hypot(npc.limoX - last.x, npc.limoZ - last.z) / dt : 0;
        const speed = last ? last.speed + (moved - last.speed) * Math.min(1, dt * 4) : 0;
        this.limoTrack.set(owner, { x: npc.limoX, z: npc.limoZ, speed });
        sources.set(`limo:${owner}`, { sample: "helicopter-rotor", motor: true, active: true, speed, x: npc.limoX, y: npc.limoY, z: npc.limoZ, aboard: owner === id && npc.kind === "limousine" && !npc.parachuting && Math.abs(body.y-npc.limoY)<3 });
      }
      // Mate can landing in the dispenser (the can lands after 0.28 s of its drop pose).
      const mate = id ? state.mates?.get(id) : undefined;
      if (mate && (mate.phase === "dropping" || mate.phase === "collect") && mate.dropStartedAt !== this.lastCanDrop && this.net.now() - mate.dropStartedAt >= 280) {
        this.lastCanDrop = mate.dropStartedAt; this.audio.effect("canDrop");
      }
    }
    const listener = this.bus.active ? this.bus.focus : this.listener;
    this.audio.update(sources, listener, { paused: !playing || this.controlsPaused, duck: this.npcs.active || this.mate.active || this.publiBikes.active });
    if (this.net.canPlay && !this.exam.active && !this.npcs.active) this.audio.movement(dt, body, this.local.pushing, this.net.now());
  }
  private get controlsPaused() { return !document.querySelector<HTMLElement>("#pause")?.hidden; }
  spectate(){if(this.net.spectating)this.exam.spectate();else if(this.exam.active)this.net.requestSpectate();}
  skipExamTransition() { this.exam.skipTransition(); }
  completeExam(score: number) { this.exam.complete(score); }
  reportExamProgress(progress: import("@race/shared").ExamScore) { this.net.reportExamProgress(progress); }
  returnFromExam() { if(this.net.spectating){this.exam.spectate();return;}this.exam.returnToWorld(); this.controls.restoreGameplay(); }
  debugTeleportToTerrace(enterPortal = false) {
    if (!import.meta.env.DEV || !this.net.room?.state.devMode || !this.net.canPlay || this.maps.active || this.exam.active || this.mate.active || this.publiBikes.active || this.npcs.active || this.net.now()<this.derailUntil) return;
    this.local.clear(); this.local.body.vx = this.local.body.vy = this.local.body.vz = 0;
    this.view.yaw = this.view.pitch = 0;
    if (enterPortal) void this.controls.resume();
    this.net.room.send("debugTeleportToPolyterrasse", enterPortal ? "portal" : "terrace");
  }
  renderMenuPreview(renderer: THREE.WebGLRenderer) { this.menuScene.renderPreview(renderer); }
  afterRender() { this.publiBikes.renderPreview(); this.npcs.afterRender(); }
  dispose() {
    this.spectator.dispose();this.net.onSpectate=undefined;
    this.maps.dispose(); this.hud.dispose(); this.trickScore.dispose(); this.stuckHint.dispose();
    this.coordinates.dispose(); this.collisions.dispose();
    this.cows.dispose(); this.trafficEditor?.dispose(); this.traffic.dispose();
    this.menuScene.dispose();
    this.medals.destroy(); this.net.onMedal = undefined;
    this.exam.dispose();
    this.awp.dispose();this.fruit.dispose();this.football.dispose();this.bags.dispose();this.emotes.dispose();this.npcs.dispose();
    this.audio.dispose();
    this.drowning.dispose();
    this.mate.dispose();
    this.publiBikes.dispose();
    this.bus.dispose();
    this.disposeMapRaycasts();
    this.transitScenery.dispose();
    this.closeLobby(); this.roomFlow.dispose(); this.controls.dispose(); this.local.dispose(); this.net.dispose();
    this.effects.dispose(); this.vehicles.dispose(); this.remotes.dispose();
    disposeAvatar(this.mesh); disposeAvatar(this.firstBody); this.canvas.removeAttribute("tabindex");
  }
}
