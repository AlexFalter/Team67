import * as THREE from 'three';
import {avatar, disposeAvatar} from './avatar.ts';

// A cinematic body uses the same character and shared geometry as normal play.
// Read the appearance when the scene starts: the lobby selection can change
// after NPC scenery has already loaded.
export function createFlightAvatar(appearance: () => {color: string; character: number}) {
  let player: THREE.Group | undefined, selected = '';
  return {
    start(parent: THREE.Object3D) {
      const {color, character} = appearance(), key = `${character}:${color}`;
      if (!player || key !== selected) {
        if (player) disposeAvatar(player);
        player = avatar(color, character); selected = key; parent.add(player);
      }
      player.visible = true;
      return player;
    },
    pose(progress: number, deployed: boolean, firstPerson: boolean) {
      if (!player) return;
      player.getObjectByName('head')!.visible = !firstPerson;
      const reach = deployed ? -2.6 : -.8 - Math.sin(progress * Math.PI) * .7;
      for (const side of ['left', 'right']) {
        player.getObjectByName(`${side}-arm`)!.rotation.set(reach, 0, side === 'left' ? -.12 : .12);
        player.getObjectByName(`${side}-elbow`)!.rotation.set(deployed ? -.35 : -.2, 0, 0);
        player.getObjectByName(`${side}-leg`)!.rotation.set(Math.sin(progress * Math.PI) * .35, 0, 0);
        player.getObjectByName(`${side}-knee`)!.rotation.set(deployed ? .2 : .1, 0, 0);
      }
    },
    land(progress: number, firstPerson: boolean) {
      if (!player) return;
      this.pose(0, false, firstPerson);
      const settle = THREE.MathUtils.smoothstep(progress, 0, 1), bend = Math.sin(progress * Math.PI);
      for (const side of ['left', 'right']) {
        player.getObjectByName(`${side}-arm`)!.rotation.x = -.8 * (1-settle);
        player.getObjectByName(`${side}-elbow`)!.rotation.x = -.2 * (1-settle);
        player.getObjectByName(`${side}-leg`)!.rotation.x = -.25 * bend;
        player.getObjectByName(`${side}-knee`)!.rotation.x = .5 * bend;
      }
      player.position.y -= .08 * bend;
    },
    reset() { if (player) { player.visible = false; player.getObjectByName('head')!.visible = true; } },
    dispose() { if (player) disposeAvatar(player); player = undefined; selected = ''; },
  };
}
