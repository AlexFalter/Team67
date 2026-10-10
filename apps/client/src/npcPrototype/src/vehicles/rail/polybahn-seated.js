// Keep hips and the underside of each thigh on the wooden seat, not inside it.
export const BENCH_TOP = 1.001;
export const CABIN_FLOOR = .54;
export const AISLE_LIMIT = .22;
export function seatPassenger(rig, x, z) {
 const actor=rig.player;
 actor.position.set(x, BENCH_TOP-(.9-.1125)*actor.scale.y, z);
 for(let i=0;i<2;i++) {
  rig.limbs[i*2+1].rotation.set(Math.PI/2,0,0);
  // The bench is deeper than the standing rig's thigh. Put the knees beyond
  // its front edge before letting the lower legs hang down.
  const reach=(Math.abs(x)-.34)/(.36*actor.scale.y);
  const thigh=rig.limbs[i*2+1].children[0];
  thigh.scale.y=reach;thigh.position.y=-.18*reach;
  rig.knees[i].position.y=-.36*reach;
  rig.knees[i].rotation.set(-Math.PI/2,0,0);
  // Shorter NPC rigs still need their soles to reach the cabin floor.
  rig.knees[i].scale.y=(BENCH_TOP+.1125*actor.scale.y-CABIN_FLOOR)/(.5175*actor.scale.y);
 }
 return actor.position.y;
}
