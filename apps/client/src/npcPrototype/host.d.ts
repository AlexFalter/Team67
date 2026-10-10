import type * as THREE from "three";
import type { Network } from "../multiplayer/net.ts";
import type { LocalPlayer } from "../multiplayer/localPlayer.ts";
import type { Vehicles } from "../multiplayer/vehicles.ts";
export class NpcFeature {
  mapMarkers(): { label: string; x: number; z: number }[];
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, net: Network,
    local: LocalPlayer, vehicles: Vehicles, canvas: HTMLCanvasElement, map: THREE.Object3D,
    capture: () => void);
  readonly ready: Promise<void>;
  readonly root: THREE.Group;
  readonly active: boolean;
  readonly hideAvatar: boolean;
  onMedal: (id: string) => void;
  interact(): boolean;
  update(dt: number, available: boolean): void;
  afterRender(): void;
  dispose(): void;
}
