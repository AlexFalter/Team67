import * as THREE from 'three';
import type { TrafficNetwork, TrafficPoint } from '@race/shared';

type Triangle = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; denominator: number };
/** Asphalt lookup for authoring and visual grounding; simulation uses only exported coordinates. */
export class TrafficRoadSurface {
  private static maps = new WeakMap<THREE.Object3D, TrafficRoadSurface>();
  static forMap(map: THREE.Object3D): TrafficRoadSurface {
    let surface = this.maps.get(map);
    if (!surface) { surface = new TrafficRoadSurface(map); this.maps.set(map, surface); }
    return surface;
  }
  private cells = new Map<string, Triangle[]>();
  constructor(map: THREE.Object3D, materialNames: readonly string[] = ['G_Road']) {
    map.updateWorldMatrix(true, true);
    map.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some(m => materialNames.includes(m.name))) return;
      const geometry = object.geometry, positions = geometry.attributes.position, index = geometry.index;
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index?.count ?? positions.count, materialIndex: 0 }];
      for (const group of groups) {
        if (!materialNames.includes(materials[group.materialIndex ?? 0]?.name)) continue;
        for (let i = group.start; i < group.start + group.count; i += 3) {
          const [a,b,c] = [0,1,2].map(offset => new THREE.Vector3().fromBufferAttribute(positions,index ? index.getX(i+offset) : i+offset).applyMatrix4(object.matrixWorld));
          const denominator = (b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
          if (Math.abs(denominator)<0.001) continue;
          const triangle = {a,b,c,denominator};
          for(let z=Math.floor(Math.min(a.z,b.z,c.z)/32);z<=Math.floor(Math.max(a.z,b.z,c.z)/32);z++)
            for(let x=Math.floor(Math.min(a.x,b.x,c.x)/32);x<=Math.floor(Math.max(a.x,b.x,c.x)/32);x++) {
              const key=`${x}:${z}`, cell=this.cells.get(key) ?? []; cell.push(triangle); this.cells.set(key,cell);
            }
        }
      }
    });
  }
  height(x:number,z:number,nearY:number):number|undefined {
    let result:number|undefined;
    for(const {a,b,c,denominator} of this.cells.get(`${Math.floor(x/32)}:${Math.floor(z/32)}`) ?? []) {
      const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/denominator;
      const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/denominator;
      if(u < -0.00001 || v < -0.00001 || u+v > 1.00001) continue;
      const y=u*a.y+v*b.y+(1-u-v)*c.y;
      if(result===undefined || Math.abs(y-nearY)<Math.abs(result-nearY)) result=y;
    }
    return result;
  }
  /** Store a conservative curb offset in JSON, leaving the runtime independent of asphalt geometry. */
  placeLanes(network: TrafficNetwork): TrafficNetwork {
    const nodes=new Map(network.nodes.map(n=>[n.id,n]));
    return {...network,roads:network.roads.map(road=> {
      const lanes=road.lanes ?? 1;
      const side=road.oneWay && lanes===1 && (road.laneOffset ?? 0)<0 ? -1 : 1;
      const a=nodes.get(road.from)!,b=nodes.get(road.to)!,length=Math.hypot(b.x-a.x,b.z-a.z);
      const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
      let halfWidth=14;
      // Avoid the widened intersection mouths, but inspect every two metres between them.
      const trim=Math.min(8,length*0.2),steps=Math.max(1,Math.ceil((length-2*trim)/2));
      for(let i=0;i<=steps;i++) {
        const t=(trim+(length-2*trim)*i/steps)/length,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
        if(this.height(x,z,y)===undefined) {halfWidth=0;break;}
        for(const sign of road.oneWay && lanes===1 ? [side] : [-1,1]) for(let d=0.5;d<=14;d+=0.5) {
          const h=this.height(x+nx*d*sign,z+nz*d*sign,y);
          if(h===undefined || Math.abs(h-y)>2) {halfWidth=Math.min(halfWidth,d-0.5);break;}
        }
      }
      // Cars are 1.9 m wide: put their centers 1.1 m inside the measured asphalt.
      // One-way lanes span both curbs; bidirectional roads add lanes outwards.
      const minimum=road.oneWay ? (lanes-1)*network.laneWidth/2 : network.laneWidth/2;
      const extra=road.oneWay ? 0 : (lanes-1)*network.laneWidth;
      const laneOffset=Math.max(minimum,Math.min(12,halfWidth-1.1-extra));
      return {...road,laneOffset:laneOffset*side};
    })};
  }
  snap(point:TrafficPoint,tangent?:{x:number;z:number}):TrafficPoint|undefined {
    let {x,z}=point, y=this.height(x,z,point.y);
    if(y===undefined) {
      // Forgive an approximate stroke up to four metres beside the asphalt.
      search: for(let radius=0.5;radius<=4;radius+=0.5) for(let angle=0;angle<16;angle++) {
        const nx=point.x+Math.cos(angle*Math.PI/8)*radius,nz=point.z+Math.sin(angle*Math.PI/8)*radius,ny=this.height(nx,nz,point.y);
        if(ny!==undefined && Math.abs(ny-point.y)<3) {x=nx;z=nz;y=ny;break search;}
      }
    }
    if(y===undefined || Math.abs(y-point.y)>3) return;
    const length=tangent ? Math.hypot(tangent.x,tangent.z) : 0;
    if(tangent && length>0.1) {
      const nx=-tangent.z/length,nz=tangent.x/length;
      const edge=(sign:number)=> {
        for(let d=0.5;d<=20;d+=0.5) {
          const h=this.height(x+nx*d*sign,z+nz*d*sign,y!);
          if(h===undefined || Math.abs(h-y!)>2) return d-0.25;
        }
        return undefined;
      };
      const left=edge(-1),right=edge(1);
      // At broad intersections preserve the drawn direction instead of jumping across the junction.
      if(left!==undefined && right!==undefined && left+right<=28) {
        const shift=(right-left)/2;
        x+=nx*shift;z+=nz*shift;y=this.height(x,z,y) ?? y;
      }
    }
    return {x,y,z};
  }
}
