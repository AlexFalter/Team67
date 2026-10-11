import {createFoamDart} from './foamDartModel.ts';
import * as THREE from 'three';
export function createNerfAwp(){
 const root=new THREE.Group();root.name='Nerf-colored AWP';
 const materials=new Map<string,THREE.MeshStandardMaterial>();
 const part=(size:number[],position:number[],color:string,cylinder=false)=>{let material=materials.get(color);if(!material){material=new THREE.MeshStandardMaterial({color,roughness:.65});materials.set(color,material);}const geometry=cylinder?new THREE.CylinderGeometry(size[0],size[0],size[2],10).rotateX(Math.PI/2):new THREE.BoxGeometry(...size as [number,number,number]);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position as [number,number,number]);mesh.castShadow=true;root.add(mesh);return mesh;};
 part([.18,.21,.44],[0,0,0],'#168bea');
 part([.185,.065,.39],[0,.1,-.01],'#f4f4e9');
 for(const side of [-1,1]){part([.012,.07,.19],[side*.097,.015,-.02],'#ff8422');for(let i=0;i<4;i++)part([.016,.06,.012],[side*.101,.01,-.07+i*.035],'#f4f4e9');}
 part([.13,.19,.32],[0,-.055,.34],'#ff8422');
 part([.14,.23,.045],[0,-.055,.51],'#24324b');
 part([.055,.18,.08],[0,-.15,.03],'#ff8422').rotation.x=-.25;
 const magazine=new THREE.Group();magazine.name='dart-magazine';magazine.visible=false;magazine.position.set(0,-.14,-.12);root.add(magazine);
 const shell=part([.085,.21,.12],[0,0,0],'#ff8422');root.remove(shell);magazine.add(shell);
 for(let i=0;i<3;i++){const dart=part([.035,.035,.12],[(i-1)*.026,.105,0],'#258eff');root.remove(dart);magazine.add(dart);}
 part([.09,.07,.28],[0,.01,-.33],'#ff8422');
 part([.036,0,.4],[0,.015,-.62],'#ff8422',true);
 for(const z of [-.48,-.56,-.64])part([.044,0,.025],[0,.015,z],'#f4f4e9',true);
 part([.04,0,.08],[0,.015,-.86],'#ff8422',true);
 for(const z of [-.13,.1])part([.04,.07,.035],[0,.12,z],'#24324b');
 part([.045,0,.3],[0,.18,-.015],'#168bea',true);
 part([.058,0,.055],[0,.18,-.18],'#ff8422',true);
 part([.058,0,.055],[0,.18,.15],'#ff8422',true);
 part([.052,0,.007],[0,.18,.182],'#102338',true);
 const bolt=new THREE.Group();bolt.name='priming-bolt';bolt.position.set(.095,.05,.09);root.add(bolt);
 const shaft=part([.09,.025,.025],[.045,0,0],'#f4f4e9');root.remove(shaft);bolt.add(shaft);
 const knob=part([.045,.045,.045],[.09,0,0],'#ff8422',true);root.remove(knob);bolt.add(knob);
 const boltHand=part([.08,.075,.1],[.18,.05,.09],'#c99573');boltHand.name='bolt-hand';boltHand.visible=false;
 part([.08,.11,.1],[.025,-.17,.03],'#c99573').name='trigger-hand';
 const hand=part([.08,.07,.12],[-.11,-.2,-.12],'#c99573');hand.name='reload-hand';hand.visible=false;
 part([.09,.05,.15],[0,-.04,-.34],'#168bea');
 // Exposed foam darts on the left side, within reach of the support hand.
 const carrier=new THREE.Group();carrier.name='left-dart-carrier';root.add(carrier);
 for(const y of [-.01,.09])part([.035,.02,.34],[-.11,y,-.015],'#f4f4e9');
 const sourceDart=createFoamDart();
 for(const source of sourceDart.children as THREE.Mesh[]){source.updateMatrix();const darts=new THREE.InstancedMesh(source.geometry,source.material,10);darts.name='carrier-foam-darts';
  for(let i=0;i<10;i++){const matrix=new THREE.Matrix4().compose(new THREE.Vector3(-.135-Math.floor(i/5)*.055,.045,.115-(i%5)*.065),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),new THREE.Vector3(.65,.65,.65));matrix.multiply(source.matrix);darts.setMatrixAt(i,matrix);}darts.instanceMatrix.needsUpdate=true;carrier.add(darts);
 }
 const refill=carrier.clone();refill.name='pocket-darts';refill.visible=false;root.add(refill);
 const chamber=part([.04,.025,.12],[.07,.09,.005],'#102338');chamber.name='open-chamber';
 const feeding=createFoamDart();feeding.name='chamber-dart';feeding.scale.setScalar(.65);feeding.visible=false;root.add(feeding);
 const loadingHand=part([.07,.065,.08],[-.2,.035,.115],'#c99573');loadingHand.name='loading-hand';loadingHand.visible=false;

 return root;
}
export function disposeAwp(model:THREE.Group){const materials=new Set<THREE.Material>();model.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});materials.forEach(m=>m.dispose());model.removeFromParent();}
