import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import * as C from '../packages/shared/src/index.ts';
import {PlayerView} from '../apps/client/src/multiplayer/view.ts';

const angle=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
test('both Polybahn lanes have continuous positions and velocities through every rail knot',()=>{
 for(const lane of [-1.25,1.25]){
  const v=C.createVehicle(C.POLYBAHN_KIND);v.railLane=lane;
  const sample=(d:number)=>{v.railDistance=d;const f=C.railFrame(v);return new Vector3(f.x,f.y,f.z);};
  let previous=C.railFrame(v);
  for(let d=.02;d<C.polybahnPath.length;d+=.02){
   v.railDistance=d;const f=C.railFrame(v);
   assert(Math.hypot(f.x-previous.x,f.y-previous.y,f.z-previous.z)<.024,'no position snap');
   assert(Math.abs(angle(f.rotY,previous.rotY))<.005,'no heading snap');previous=f;
  }
  for(const d of C.polybahnPath.distances.slice(1,-1)){
   const a=sample(d-.001),b=sample(d),c=sample(d+.001);
   const before=b.clone().sub(a).multiplyScalar(1000),after=c.clone().sub(b).multiplyScalar(1000);
   assert(before.distanceTo(after)<.006,'velocity is continuous across track nodes');
  }
 }
});
test('passing loop keeps both cabins separated without a midpoint speed change',()=>{
 const up=C.createVehicle(C.POLYBAHN_KIND),down=C.createVehicle(C.POLYBAHN_KIND);
 up.railLane=-1.25;down.railLane=1.25;down.railReverse=true;
 const duration=C.railTripDuration(up),middle=duration/2;
 const sample=(v:typeof up,t:number)=>{C.railMotion(v,t);return v.railDistance;};
 for(const v of [up,down]){
  const a=sample(v,middle-1),b=sample(v,middle),c=sample(v,middle+1);
  assert(Math.abs((b-a)-(c-b))<.00001,'smooth midpoint speed');
  assert(Math.abs(b-C.polybahnMeetingDistance)<1e-8);
  assert.equal(sample(v,0),v.railReverse?C.polybahnPath.length:0);
  assert(Math.abs(sample(v,duration)-(v.railReverse?0:C.polybahnPath.length))<1e-8);
 }
 C.railMotion(up,middle);C.railMotion(down,middle);
 assert(Math.hypot(up.x-down.x,up.z-down.z)>3,'cabins still clear at loop');
});
test('seated first-person look stays at the head and clears the lower window sill',()=>{
 const camera=new PerspectiveCamera(72),view=new PlayerView(camera,[]),p=C.createBody();
 p.vehicleId='polybahn-1';p.vehicleKind=C.POLYBAHN_KIND;p.y=.2135;
 const frame={rotY:Math.PI/2,pitch:-.22};
 for(let i=0;i<120;i++)view.update(p,1/60,frame);
 const eye=camera.position.clone();assert(eye.y>1.55,'eyes clear the sill');
 view.look(1000,-200);view.update(p,1/60,frame);
 assert(camera.position.distanceTo(eye)<1e-8,'turning cannot push the head through glass');
 assert(Math.abs(camera.rotation.z)<1e-8);assert.equal(camera.fov,72);
});
