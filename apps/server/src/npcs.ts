import type { Client } from "colyseus";
import * as C from "@race/shared";
import { Npc, type RaceState } from "./state.ts";

// Encounters are personal. Only the server grants travel and one-use rewards.
export class NpcEncounters {
  private reports = new Map<string, number>();
  private carReports = new Map<string, number>();
  constructor(private state: RaceState, private world: C.MovementWorld,
    private correct: (id: string, point: C.GroundPoint) => void,
    private exitVehicle?: (client: Client) => void) {}
  join(id: string) { this.state.npcs.set(id, new Npc()); }
  leave(id: string) { this.state.npcs.delete(id); this.reports.delete(id); this.carReports.delete(id); }
  busy(id: string) { return !!this.state.npcs.get(id)?.kind; }
  command(client: Client, data: unknown, now = Date.now()) {
    const cmd = data as Partial<C.NpcCommand> | null, id = client.sessionId;
    const p = this.state.players.get(id), npc = this.state.npcs.get(id), member = this.state.members.get(id);
    if (!cmd || !["einstein", "limousine", "property"].includes(cmd.kind ?? "") ||
      !["solve", "begin", "finish", "cancel"].includes(cmd.action ?? "")) return;
    const reply = (ok: boolean, message = "", target?: C.GroundPoint) => client.send("npcResult", {
      action: cmd.action!, kind: cmd.kind!, ok, message, target, roundStartedAt: this.state.startedAt,
    } satisfies C.NpcResult);
    if (!p || !npc || !member || member.spectator || this.world.name !== "zurich" ||
      this.state.phase !== C.RoomPhase.Running || !this.state.introComplete || now < this.state.startedAt ||
      now >= this.state.endsAt || cmd.roundStartedAt !== this.state.startedAt) return reply(false, "Wait for the current round.");
    if (cmd.action === "cancel") {
      if (npc.kind === cmd.kind) { npc.kind = ""; npc.limoVisible = false; this.correct(id, p); }
      return reply(true);
    }
    if (cmd.action === "finish") {
      const minDuration = npc.kind === "einstein" ? 4500 : npc.kind === "property" ? 8400 : 8000;
      if (npc.kind !== cmd.kind || now < npc.startedAt + minDuration) return reply(false, "The encounter is still running.");
      const target = { x: npc.targetX, y: npc.targetY, z: npc.targetZ };
      npc.kind = ""; npc.limoVisible = false; this.correct(id, target); return reply(true, "", target);
    }
    let boundaryVehicle = false;
    if (cmd.action === 'begin' && cmd.kind === 'property' && p.vehicleId && !npc.kind && p.knockdownUntil <= now) {
      const bounds = C.npcBounds(this.world), vehicle = this.state.vehicles.get(p.vehicleId);
      if (vehicle && !C.isPassengerVehicle(vehicle) && Math.min(p.x-bounds.minX,bounds.maxX-p.x,p.z-bounds.minZ,bounds.maxZ-p.z) <= 13)
        { this.exitVehicle?.(client); boundaryVehicle = !p.vehicleId; }
    }
    if (npc.kind || p.vehicleId || p.knockdownUntil > now) return reply(false, "Step away from your vehicle first.");
    const near = (point: number[], range: number) => Math.hypot(p.x-point[0],p.y-point[1],p.z-point[2]) <= range;
    if (cmd.action === "solve") {
      if (cmd.kind !== "limousine" || !near(C.NPC_LAYOUT.interview.laptop, 3) || typeof cmd.answer !== "string" || !/^3$/.test(cmd.answer.trim())) return reply(false, "Complete the laptop challenge first.");
      npc.limoSolved = true; return reply(true);
    }
    let target: C.GroundPoint | undefined;
    if (cmd.kind === "einstein") {
      const site = C.NPC_LAYOUT.einstein.site, actor = C.NPC_LAYOUT.einstein.position;
      if (npc.teleportUsed || (!near(site, 3.2) && !near(actor, 3.3))) return reply(false, "The teleporter has one charge per round. Move closer to Einstein.");
      const candidates = C.NPC_LAYOUT.destinations.map(stop => C.findGround(this.world,stop.point[0],stop.point[1]))
        .filter((point): point is C.GroundPoint => !!point && Math.hypot(point.x-p.x,point.z-p.z)>30 &&
          point.y <= site[1]+14 && Math.hypot(point.x-C.NPC_LAYOUT.goal[0],point.z-C.NPC_LAYOUT.goal[1])>=180);
      target = candidates[Math.floor(Math.random()*candidates.length)];
      if (!target) return reply(false, "No safe destination is available.");
      npc.teleportUsed = true;
    } else if (cmd.kind === "limousine") {
      if (!npc.limoSolved || npc.limoUsed || !near(C.NPC_LAYOUT.interview.pickup, 9.5)) return reply(false, "Complete the challenge and meet your limousine.");
      const landing = C.NPC_LAYOUT.interview.landing;
      target = C.findGround(this.world,landing[0]+4,landing[2]);
      npc.limoUsed = true;
    } else {
      const b = C.npcBounds(this.world);
      if (!boundaryVehicle && Math.min(p.x-b.minX,b.maxX-p.x,p.z-b.minZ,b.maxZ-p.z)>13) return reply(false, "You are already on public property.");
      target = C.propertyReturnPoint(this.world, p);
    }
    if (!target) return reply(false, "No safe landing is available.");
    npc.kind = cmd.kind!; npc.startedAt = now;
    npc.targetX = target.x; npc.targetY = target.y; npc.targetZ = target.z;
    p.vx = p.vy = p.vz = 0; this.reports.set(id, now);
    reply(true, "", target);
  }
  pose(client: Client, data: unknown, now = Date.now()) {
    const id=client.sessionId, npc=this.state.npcs.get(id),p=this.state.players.get(id);
    const pose=data as {roundStartedAt?:unknown;car?:unknown;player?:unknown}|null;
    if (!p || !npc?.limoSolved || npc.limoUsed&&npc.kind!=="limousine" || this.state.phase !== C.RoomPhase.Running || !this.state.introComplete || now<this.state.startedAt || now>=this.state.endsAt || pose?.roundStartedAt!==this.state.startedAt) return;
    const car=pose?.car;
    if(!Array.isArray(car)||car.length!==5||!car.every(Number.isFinite))return;
    const [cx,cy,cz,yaw,pitch]=car,carElapsed=Math.min(1,(now-(this.carReports.get(id)??now))/1000);
    const carRoute=npc.kind==='limousine'?C.NPC_LAYOUT.interview.samples:[...C.NPC_LAYOUT.interview.samples,...C.NPC_LAYOUT.interview.approachSamples];
    if(!carRoute.some(point=>Math.hypot(point[0]-cx,point[2]-cz)<8)||Math.abs(cy-(this.world.height(cx,cz)??Infinity))>1)return;
    if(npc.limoVisible&&Math.hypot(cx-npc.limoX,cz-npc.limoZ)>50*carElapsed+1)return;
    Object.assign(npc,{limoVisible:true,limoX:cx,limoY:cy,limoZ:cz,limoYaw:yaw,limoPitch:pitch});this.carReports.set(id,now);
    if(npc.kind!=="limousine")return;
    const player=pose.player;if(!Array.isArray(player)||player.length!==4||!player.every(Number.isFinite))return;
    const [x,y,z,rotY]=player,elapsed=Math.min(1,(now-(this.reports.get(id)??now))/1000);
    if (Math.hypot(x-p.x,z-p.z)>30*elapsed+1 || !C.NPC_LAYOUT.interview.samples.some(point=>Math.hypot(point[0]-x,point[2]-z)<12) || Math.abs(y-(this.world.height(x,z)??Infinity))>6) return;
    Object.assign(p,{x,y,z,rotY,anim:0,vx:0,vy:0,vz:0,simTime:now});this.reports.set(id,now);
  }
  tick(now = Date.now()) {
    if (!this.state.scooterArrivalAt && this.state.phase === C.RoomPhase.Running && this.state.introComplete && now>=this.state.startedAt && now<this.state.endsAt) {
      const [x,z]=C.NPC_LAYOUT.scooter.ridePoints.at(-1)!,y=this.world.height(x,z);
      if(y!==undefined&&[...this.state.players].some(([id,p])=>this.state.members.has(id)&&!this.state.members.get(id)!.spectator&&Math.hypot(p.x-x,p.z-z)<C.NPC_LAYOUT.scooter.triggerDistance&&Math.abs(p.y-y)<3))this.state.scooterArrivalAt=now;
    }
    for (const [id, npc] of this.state.npcs) if (npc.kind && (this.state.phase !== C.RoomPhase.Running || now-npc.startedAt>90000)) {
      npc.kind=""; npc.limoVisible=false;const p=this.state.players.get(id);if(p)this.correct(id,p);
    }
  }
}
