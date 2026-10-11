import { CAPSULE_HEIGHT } from "./constants.ts";
import layout from "./npc-layout.json" with { type: "json" };
import type { GroundPoint, MovementWorld } from "./world.ts";
import { polybahnPlatforms } from './transit.ts';
export const NPC_LAYOUT = layout;
// The story boundary follows the current route and encounters, not the much
// larger map export. Rail passengers remain exempt while aboard.
export function npcBounds(world: MovementWorld) {
  if (world.name !== 'zurich') return { ...world.bounds };
  const points = [world.spawn, ...world.route, ...polybahnPlatforms,
    ...NPC_LAYOUT.interview.points.map(([x,z]) => ({x,z})),
    {x:NPC_LAYOUT.goal[0],z:NPC_LAYOUT.goal[1]},
    {x:NPC_LAYOUT.einstein.site[0],z:NPC_LAYOUT.einstein.site[2]}];
  return { minX:Math.max(world.bounds.minX,Math.min(...points.map(p=>p.x))-55),
    maxX:Math.min(world.bounds.maxX,Math.max(...points.map(p=>p.x))+55),
    minZ:Math.max(world.bounds.minZ,Math.min(...points.map(p=>p.z))-55),
    maxZ:Math.min(world.bounds.maxZ,Math.max(...points.map(p=>p.z))+55) };
}
// Return just beyond the danger strip, preserving the player's location along the border.
export function propertyReturnPoint(world: MovementWorld, position: GroundPoint): GroundPoint | undefined {
  const b = npcBounds(world), safeMargin = 16;
  const x = Math.max(b.minX + safeMargin, Math.min(b.maxX - safeMargin, position.x));
  const z = Math.max(b.minZ + safeMargin, Math.min(b.maxZ - safeMargin, position.z));
  for (let ring = 0; ring <= 6; ring++) for (let i = 0; i < (ring ? 16 : 1); i++) {
    const angle = i / 16 * Math.PI * 2, px = x + Math.cos(angle) * ring, pz = z + Math.sin(angle) * ring;
    if (Math.min(px-b.minX,b.maxX-px,pz-b.minZ,b.maxZ-pz) < 14) continue;
    const y = world.height(px,pz);
    if (y !== undefined && !world.blocked(px,y,pz,.5,CAPSULE_HEIGHT)) return {x:px,y,z:pz};
  }
  return undefined;
}

export type NpcTravelKind = "einstein" | "limousine" | "property";
export interface NpcCommand {
  action: "solve" | "begin" | "finish" | "cancel";
  kind: NpcTravelKind;
  roundStartedAt: number;
  answer?: string;
}
export interface NpcResult {
  action: NpcCommand["action"];
  kind: NpcTravelKind;
  ok: boolean;
  message: string;
  roundStartedAt: number;
  target?: GroundPoint;
}
export interface NpcState {
  ticketCount: number;
  ticketReadyAt: number;
  polybahnTicketed: boolean;
  limoVisible: boolean;
  limoX: number;
  limoY: number;
  limoZ: number;
  limoYaw: number;
  limoPitch: number;
  kind: string;
  startedAt: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  teleportUsed: boolean;
  limoSolved: boolean;
  limoUsed: boolean;
}
