import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Faces local -Z, matching the game's movement heading. All animation pivots
// remain separate; visual geometry stays inside the player's compact silhouette.
export function createStudent() {
  const player = new THREE.Group();
  player.userData.npcRig = true;
  const limbs = [], knees = [], elbows = [];
  const materials = new Map();
  const material = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .82 }));
    return materials.get(color);
  };
  const add = (parent, geometry, color, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };
  const box = (parent, color, x, y, z, w, h, d, radius = .04) =>
    add(parent, new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)), color, x, y, z);
  const skin = '#bd8869', cream = '#f4e7cc', pants = '#284b60', rust = '#cf633d';
  box(player, cream, 0, 1.13, 0, .48, .54, .29, .075);
  add(player, new THREE.CylinderGeometry(.065, .07, .13, 8), skin, 0, 1.43, 0);
  box(player, skin, 0, 1.59, -.015, .29, .33, .285, .085);
  // A fitted hair cap and one swept fringe avoid the old floating block hair.
  const hair = add(player, new THREE.SphereGeometry(.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#302e2a', 0, 1.65, -.005);
  hair.scale.set(1, .91, 1.02);
  const fringe = box(player, '#302e2a', -.035, 1.716, -.135, .23, .065, .06, .02);
  fringe.rotation.z = -.12;
  for (const side of [-1, 1]) {
    add(player, new THREE.SphereGeometry(.018, 6, 4), '#202d32', side * .062, 1.61, -.158);
  }
  add(player, new THREE.SphereGeometry(.025, 6, 4), skin, 0, 1.57, -.168);
  box(player, rust, 0, 1.13, .205, .39, .47, .19, .06);
  box(player, '#a9432d', 0, 1.035, .315, .28, .19, .06, .025);
  for (const side of [-1, 1]) {
    box(player, '#a9432d', side * .174, 1.16, -.151, .045, .43, .03, .012);
    const arm = new THREE.Group();
    arm.position.set(side * .292, 1.32, 0);
    player.add(arm);
    box(arm, cream, 0, -.09, 0, .15, .24, .18, .045);
    const elbow=new THREE.Group();elbow.position.y=-.2;arm.add(elbow);add(elbow,new THREE.CapsuleGeometry(.059,.12,3,8),skin,0,-.1,0);add(elbow,new THREE.SphereGeometry(.071,8,6),skin,0,-.225,-.01);elbows.push(elbow);
    limbs.push(arm);
    const leg = new THREE.Group();
    leg.position.set(side * .135, .9, 0);
    player.add(leg);
    box(leg,pants,0,-.18,0,.19,.36,.225,.045);const knee=new THREE.Group();knee.position.y=-.36;leg.add(knee);box(knee,pants,0,-.18,0,.175,.36,.21,.04);box(knee,'#f0eee5',0,-.425,-.045,.205,.145,.325,.04);box(knee,'#52666d',0,-.495,-.045,.215,.045,.335,.015);knees.push(knee);
    limbs.push(leg);
  }
  return { player, limbs, knees, elbows };
}
