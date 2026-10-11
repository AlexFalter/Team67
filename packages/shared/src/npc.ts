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
  facing?: number;
}

/** Face away from the closest edge after the boundary encounter. */
export function propertyReturnFacing(world: MovementWorld, position: Pick<GroundPoint, 'x' | 'z'>): number {
  const b = npcBounds(world);
  const edges = [
    { distance: position.x - b.minX, x: 1, z: 0 },
    { distance: b.maxX - position.x, x: -1, z: 0 },
    { distance: position.z - b.minZ, x: 0, z: 1 },
    { distance: b.maxZ - position.z, x: 0, z: -1 },
  ];
  const edge = edges.reduce((nearest, next) => next.distance < nearest.distance ? next : nearest);
  return Math.atan2(edge.x, edge.z);
}

export function approachingPropertyBoundary(world: MovementWorld, position: Pick<GroundPoint, 'x' | 'z'> & { vx: number; vz: number }): boolean {
  const b = npcBounds(world), facing = propertyReturnFacing(world, position);
  return Math.min(position.x-b.minX,b.maxX-position.x,position.z-b.minZ,b.maxZ-position.z) <= 12 &&
    position.vx * Math.sin(facing) + position.vz * Math.cos(facing) < -.1;
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
