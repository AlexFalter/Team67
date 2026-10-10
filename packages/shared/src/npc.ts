import layout from "./npc-layout.json" with { type: "json" };
import type { GroundPoint } from "./world.ts";
export const NPC_LAYOUT = layout;
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
