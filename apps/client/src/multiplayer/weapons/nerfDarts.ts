import * as THREE from 'three';
import type {AwpShot} from '@race/shared';
import {disposeAwp} from './awpModel.ts';
import {createFoamDart} from './foamDartModel.ts';
export {createFoamDart} from './foamDartModel.ts';
interface Dart {model:THREE.Group;start:THREE.Vector3;end:THREE.Vector3;age:number;duration:number;shot:AwpShot;attached:boolean}
export class NerfDarts {
 private darts:Dart[]=[];
 constructor(private scene:THREE.Scene,private getAvatar:(id:string)=>THREE.Group|undefined){}
 launch(shot:AwpShot,start=shot.start){
  const a=new THREE.Vector3(...start as [number,number,number]),b=new THREE.Vector3(...shot.end as [number,number,number]),model=createFoamDart();model.position.copy(a);model.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),b.clone().sub(a).normalize());this.scene.add(model);
  this.darts.push({model,start:a,end:b,age:0,duration:Math.max(.08,Math.min(.4,a.distanceTo(b)/80)),shot,attached:false});
  while(this.darts.length>48)disposeAwp(this.darts.shift()!.model);
 }
 update(dt:number){
  for(let i=this.darts.length-1;i>=0;i--){const d=this.darts[i];d.age+=dt;
   if(!d.attached){d.model.position.lerpVectors(d.start,d.end,Math.min(1,d.age/d.duration));
    if(d.age>=d.duration){const attachment=d.shot.attachment,avatar=d.shot.hit?this.getAvatar(d.shot.target):undefined,anchor=avatar?.getObjectByName(attachment?.part==='head'?'head':'chest');
     if(anchor&&attachment){anchor.add(d.model);const offset=new THREE.Vector3(...attachment.offset as [number,number,number]),direction=new THREE.Vector3(...attachment.direction as [number,number,number]).normalize();
      // Foam protrudes outwards; the orange suction cup touches the surface.
      if(attachment.part==='head'){offset.x=THREE.MathUtils.clamp(offset.x,-.2,.2);offset.y=THREE.MathUtils.clamp(offset.y,-.16,.2);offset.z=THREE.MathUtils.clamp(offset.z,-.2,.22);}
      d.model.position.copy(offset).addScaledVector(direction,-.112);d.model.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);d.attached=true;
     }else d.attached=true;
    }
   }
   const exists=!d.shot.target||!!this.getAvatar(d.shot.target);
   if(d.age>(d.shot.hit?25:1.5)||!exists){disposeAwp(d.model);this.darts.splice(i,1);}
  }
 }
 clear(){for(const d of this.darts)disposeAwp(d.model);this.darts=[];}
 dispose(){this.clear();}
}
