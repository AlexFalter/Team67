import type * as THREE from "three";
import type { Network } from "../multiplayer/net.ts";
import type { LocalPlayer } from "../multiplayer/localPlayer.ts";
import type { Vehicles } from "../multiplayer/vehicles.ts";
export class NpcFeature {
  playMapTeleport(from:{x:number;y:number;z:number},target:{x:number;y:number;z:number}):void;
  mapMarkers(): { label: string; x: number; z: number }[];
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, net: Network,
    local: LocalPlayer, vehicles: Vehicles, canvas: HTMLCanvasElement, map: THREE.Object3D,
    capture: () => void);
  externalPhoneBusy?:()=>boolean;
  onFootballReward?:()=>void;
  onMedal?: (id: string) => void;
  onResume?: () => void;
  onSuspend?: () => void;
  playerView?: import("../multiplayer/view.ts").PlayerView;
  karambit?: { occupiesHands(): boolean; owns(): boolean; toggle(): boolean; inspect(): boolean; attack(): boolean; state(): {phase: string} };
  readonly ready: Promise<void>;
  readonly root: THREE.Group;
  readonly active: boolean;
  readonly hideAvatar: boolean;
  readonly interactionPrompt: { icon: "person" | "polybahn" | "cart" | "computer"; label: string } | null;
  readonly nearbyInteraction: boolean;
  readonly ridingVehicle: boolean;
  readonly ridePose: { id: string; x: number; y: number; z: number; rotY: number } | null;
  readonly pauseAvailable: boolean;
  readonly canOpenPhone: boolean;
  readonly phoneOpen: boolean;
  readonly rideMouseCapture: boolean;
  readonly nearbyTicket: boolean;
  interact(): boolean;
  update(dt: number, available: boolean): void;
  afterRender(): void;
  dispose(): void;
}
