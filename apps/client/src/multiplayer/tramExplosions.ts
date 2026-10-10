import * as THREE from 'three';
import * as C from '@race/shared';

// Deterministic, instanced bursts follow the shared crash clock, including late joiners.
export class TramExplosions extends THREE.Group {
 private fire=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending}),54);
 private smoke=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:.3,depthWrite:false,color:'#373b40'}),36);
 private sparks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:'#ffe4a3',depthWrite:false}),72);
 private dummy=new THREE.Object3D();
 private color=new THREE.Color();
 constructor(){super();this.name='Tram crash explosions';this.add(this.fire,this.smoke,this.sparks);for(const mesh of [this.fire,this.smoke,this.sparks])mesh.frustumCulled=false;this.visible=false;}
 // Geometry/materials are released by the owning vehicle's disposeMap traversal.
 dispose(){for(const mesh of [this.fire,this.smoke,this.sparks])mesh.dispose();}
 update(v:C.VehicleState){
  this.visible=!!v.derailStartedAt&&v.derailAge>0&&v.derailAge<8&&[0,1,2].some(part=>C.tramDerailFrame(v,part).grounded);
  if(!this.visible)return;
  const root=C.railFrame(v);
  for(let part=0;part<3;part++){
   const landing=C.tramDerailFrame(v,part).landedAt;
   const age=v.derailAge-landing;
   const origin=C.tramDerailFrame({...v,derailAge:landing},part);
   for(const [mesh,count,lifetime] of [[this.fire,18,1.2],[this.smoke,12,7],[this.sparks,24,1.5]] as const){
    for(let i=0;i<count;i++){
     const slot=part*count+i,angle=i*2.39996+part,seed=((i*37+part*17)%101)/101;
     const t=Math.max(0,age),u=Math.min(1,t/lifetime),active=age>=0&&age<lifetime;
     const smoke=mesh===this.smoke,spark=mesh===this.sparks;
     const radial=smoke?.3+t*.18:spark?t*(2.5+seed*3):Math.sin(u*Math.PI)*(.5+seed*1.8);
     this.dummy.position.set(origin.x-root.x+Math.cos(angle)*radial,origin.y-root.y+.7+(smoke?t*(.65+seed*.4):spark?t*(3+seed*3)-3*t*t:Math.sin(u*Math.PI)*(1+seed)),origin.z-root.z+Math.sin(angle)*radial);
     const scale=!active?0:smoke?(1+t*.35)*Math.min(1,(1-u)*4):spark?.045*(1-u):Math.sin(u*Math.PI)*(.45+seed*.75);
     this.dummy.scale.setScalar(scale);this.dummy.rotation.set(seed*3,t,angle);this.dummy.updateMatrix();mesh.setMatrixAt(slot,this.dummy.matrix);
     if(mesh===this.fire){this.color.setHSL(.12*(1-u),1,.5+.35*(1-u));mesh.setColorAt(slot,this.color);}
    }
   }
  }
  for(const mesh of [this.fire,this.smoke,this.sparks])mesh.instanceMatrix.needsUpdate=true;
  if(this.fire.instanceColor)this.fire.instanceColor.needsUpdate=true;
 }
}
