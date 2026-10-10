import * as THREE from "three";
import * as C from "@race/shared";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRailGeometry } from "./railGeometry.ts";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";

// Prototype passage clipping, restricted to the funicular corridor. All mesh
// attributes survive clipping; the original city geometry is restored on exit.
export function carveTransitPassages(source: THREE.BufferGeometry) {
  const g = source.index ? source.toNonIndexed() : source.clone(), attrs = Object.entries(g.attributes);
  const output: Record<string, number[]> = Object.fromEntries(attrs.map(([key]) => [key, []]));
  const volumes = C.polybahnPassages.map(s => {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length, slope = (s.b.y - s.a.y) / length;
    const along = (v: number[]) => (v[0] - s.a.x) * ux + (v[2] - s.a.z) * uz;
    const across = (v: number[]) => -(v[0] - s.a.x) * uz + (v[2] - s.a.z) * ux;
    return {
      bounds: new THREE.Box3(new THREE.Vector3(Math.min(s.a.x, s.b.x) - s.width, Math.min(s.a.y, s.b.y) - .5, Math.min(s.a.z, s.b.z) - s.width), new THREE.Vector3(Math.max(s.a.x, s.b.x) + s.width, Math.max(s.a.y, s.b.y) + 4.4, Math.max(s.a.z, s.b.z) + s.width)),
      planes: [(v: number[]) => s.width - across(v), (v: number[]) => s.width + across(v), (v: number[]) => along(v) + .2, (v: number[]) => length + .2 - along(v), (v: number[]) => v[1] - s.a.y - slope * along(v) + .35, (v: number[]) => 4.4 - v[1] + s.a.y + slope * along(v)],
    };
  });
  type Vertex = Record<string, number[]>;
  function split(poly: Vertex[], plane: (p: number[]) => number) {
    const inside: Vertex[] = [], outside: Vertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = plane(a.position), db = plane(b.position);
      (da >= 0 ? inside : outside).push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db), cross = Object.fromEntries(attrs.map(([key]) => [key, a[key].map((v, j) => v + (b[key][j] - v) * t)]));
        inside.push(cross); outside.push(cross);
      }
    }
    return { inside, outside };
  }
  const result = new THREE.BufferGeometry(); let emitted = 0, removed = 0;
  const position = g.attributes.position, bounds = new THREE.Box3();
  for (const group of g.groups.length ? g.groups : [{ start: 0, count: position.count, materialIndex: 0 }]) {
    const start = emitted;
    for (let i = group.start; i < group.start + group.count; i += 3) {
      bounds.makeEmpty(); for (let j = 0; j < 3; j++) bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, i + j));
      const candidates = volumes.filter(v => v.bounds.intersectsBox(bounds));
      if (!candidates.length) {
        for (let j = 0; j < 3; j++) for (const [key, a] of attrs) for (let c = 0; c < a.itemSize; c++) output[key].push(a.getComponent(i + j, c));
        emitted += 3; continue;
      }
      let polygons: Vertex[][] = [Array.from({ length: 3 }, (_, j) => Object.fromEntries(attrs.map(([key, a]) => [key, Array.from({ length: a.itemSize }, (_, c) => a.getComponent(i + j, c))])))];
      for (const v of candidates) {
        const next: Vertex[][] = [];
        for (const poly of polygons) {
          let remaining = poly;
          for (const plane of v.planes) {
            if (remaining.length < 3) break;
            const { inside, outside } = split(remaining, plane); if (outside.length >= 3) next.push(outside); remaining = inside;
          }
          if (remaining.length >= 3) removed++;
        }
        polygons = next;
      }
      for (const poly of polygons) for (let j = 1; j < poly.length - 1; j++) {
        for (const vertex of [poly[0], poly[j], poly[j + 1]]) for (const [key] of attrs) output[key].push(...vertex[key]);
        emitted += 3;
      }
    }
    result.addGroup(start, emitted - start, group.materialIndex);
  }
  for (const [key, a] of attrs) result.setAttribute(key, new THREE.Float32BufferAttribute(output[key], a.itemSize, a.normalized));
  result.computeBoundingBox(); result.computeBoundingSphere(); g.dispose();
  return { geometry: result, removed };
}
export class TransitScenery {
  private root = new THREE.Group();
  private boardingSigns: { kind: number; distance: number; objects: THREE.Object3D[] }[] = [];
  private originals = new Map<THREE.Mesh, THREE.BufferGeometry>();
  constructor(scene: THREE.Scene, map: THREE.Object3D) {
    this.root.name = "Tram and Polybahn tracks"; scene.add(this.root);
    // The current map already contains the Polybahn bridge, rails and station halls.
    // Keep those authored surfaces intact rather than carving the old prototype corridor.
    map.updateMatrixWorld(true);
    // Smooth only the metal rail surfaces on the authored funicular bridge.
    // Buildings, sleepers and the bridge structure keep their original vertices.
    map.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      const source=object.geometry,position=source.attributes.position,index=source.index;
      const vertices=new Set<number>();
      for(const group of source.groups.length?source.groups:[{start:0,count:index?.count??position.count,materialIndex:0}]){
        if(materials[group.materialIndex??0]?.name!=='G_Metal')continue;
        for(let n=group.start;n<group.start+group.count;n++)vertices.add(index?index.getX(n):n);
      }
      let geometry:THREE.BufferGeometry|undefined;
      const inverse=object.matrixWorld.clone().invert(),point=new THREE.Vector3(),v=C.createVehicle(C.POLYBAHN_KIND);
      for(const i of vertices){
        point.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld);
        if(point.x<20||point.x>174||point.z<73||point.z>116)continue;
        const points=C.polybahnPath.points;
        let k=0;while(k<points.length-2&&points[k+1].x<point.x)k++;
        const a=points[k],b=points[k+1],t=(point.x-a.x)/(b.x-a.x);
        const center={x:point.x,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
        if(Math.abs(point.y-center.y)>.22)continue;
        v.railDistance=C.polybahnPath.distances[k]+(C.polybahnPath.distances[k+1]-C.polybahnPath.distances[k])*t;
        v.railLane=0;const frame=C.railFrame(v);
        // A rail is a narrow strip at either gauge edge of either passing lane.
        let closest=Infinity;
        for(const lane of [-1.25,1.25]){
          v.railLane=lane;const laneFrame=C.railFrame(v);
          for(const side of [-.5,.5])closest=Math.min(closest,Math.abs(point.z-(laneFrame.z-Math.sin(laneFrame.rotY)*side)));
        }
        if(closest>.22)continue;
        if(!geometry)geometry=source.clone() as THREE.BufferGeometry;
        point.add(new THREE.Vector3(frame.x-center.x,frame.y-center.y,frame.z-center.z)).applyMatrix4(inverse);
        geometry!.attributes.position.setXYZ(i,point.x,point.y,point.z);
      }
      if(geometry){geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();this.originals.set(object,source);object.geometry=geometry;}
    });
    const rails: THREE.BufferGeometry[] = [];
    for(const kind of [C.TRAM_KIND,C.POLYBAHN_KIND]){
      const v=C.createVehicle(kind),route=C.railPath(v);
      // The bridge's authored rails remain; smoothly join their lower hall extension.
      const end=kind===C.TRAM_KIND?route.length:6;
      // Polybahn: start at the deck edge; before it the route hangs above the Central hall floor.
      const start=kind===C.TRAM_KIND?0:C.POLYBAHN_TRACK_START;
      for(const side of [-.5,.5])rails.push(createRailGeometry(d=>{v.railDistance=d;return C.railFrame(v);},start,end,side,kind===C.TRAM_KIND?.07:-.035));
    }
    const poly = C.createVehicle(C.POLYBAHN_KIND);
    for (const [parts, color] of [[rails, "#6d7579"]] as const) {
      const mesh = new THREE.Mesh(mergeGeometries([...parts])!, new THREE.MeshStandardMaterial({ color, roughness: .95, side: THREE.DoubleSide })); this.root.add(mesh); parts.forEach(g => g.dispose());
    }
    const tram = C.createVehicle(C.TRAM_KIND);
    for (const distance of [C.TRAM_START_DISTANCE, C.tramPath.length]) { tram.railDistance = distance; this.station(C.railBoardingPoint(tram), distance === C.TRAM_START_DISTANCE ? "TRAM 6 · CENTRAL" : "TRAM 6 · ETH", "#135aa0", C.railFrame(tram, 1), distance); }
    for (const distance of [C.POLYBAHN_START_DISTANCE, C.polybahnPath.length]) {
      poly.railDistance = distance;
      this.station(C.railBoardingPoint(poly), distance === C.polybahnPath.length ? "POLYBAHN · POLYTERRASSE" : "POLYBAHN · CENTRAL", "#9f1d2f", C.railFrame(poly), distance, true);
    }
  }
  private station(p: C.GroundPoint, text: string, color: string, track: C.GroundPoint, distance: number, inside = false) {
    const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 128); ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 34px Arial"; ctx.fillText(text, 384, 52); ctx.font = "27px Arial"; ctx.fillText("E TO BOARD · SHARED DEPARTURE", 384, 104);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    // Face the street approach. Separate faces keep text readable from behind.
    const heading = Math.atan2(p.x - track.x, p.z - track.z);
    const panel = new THREE.Group(); panel.position.set(p.x, p.y + (inside ? 2.6 : 3.5), p.z); panel.rotation.y = heading;
    panel.name = `${text} boarding sign`;
    const geometry = new THREE.PlaneGeometry(inside ? 2.5 : 5, inside ? 2.5 / 6 : 5 / 6);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    for (const back of [false, true]) {
      const face = new THREE.Mesh(geometry, material);
      face.position.z = back ? -.015 : .015; face.rotation.y = back ? Math.PI : 0;
      panel.add(face);
    }
    this.root.add(panel);
    const sign = { kind: inside ? C.POLYBAHN_KIND : C.TRAM_KIND, distance, objects: [panel] as THREE.Object3D[] };
    panel.visible = false;
    this.boardingSigns.push(sign);
    // The cabin owns the moving, server-matched Polybahn boarding circle.
    if (inside) return;
    // A matching boarding circle sits behind the sign, toward the cabin.
    const x = p.x - Math.sin(heading) * .9, z = p.z - Math.cos(heading) * .9;
    const ground = C.zurichWorld.height(x, z) ?? p.y;
    const ring = new THREE.RingGeometry(.85, 1.1, 64).rotateX(-Math.PI / 2);
    const vertices = ring.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      vertices.setY(i, (C.zurichWorld.height(x + vertices.getX(i), z + vertices.getZ(i)) ?? ground) - ground);
    }
    ring.computeBoundingSphere();
    const marker = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    marker.name = `${text} boarding circle`;
    marker.position.set(x, ground + .045, z);
    this.root.add(marker);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 3.2, 6), new THREE.MeshStandardMaterial({ color: "#8997a1" })); pole.position.set(p.x, p.y + 1.6, p.z); this.root.add(pole);
    marker.visible = pole.visible = false;
    sign.objects.push(marker, pole);
  }
  update(vehicles: Iterable<C.VehicleState>, now: number, canPlay: boolean) {
    const rides = [...vehicles];
    for (const sign of this.boardingSigns) {
      const visible = canPlay && rides.some(v => v.kind === sign.kind && !v.traveling && !v.derailStartedAt &&
        Math.abs(v.railDistance - sign.distance) < .5 && (!v.departureAt || now < v.departureAt));
      for (const object of sign.objects) object.visible = visible;
    }
  }
  dispose() {
    for (const [mesh, original] of this.originals) { mesh.geometry.dispose(); mesh.geometry = original; }
    this.originals.clear(); disposeMap(this.root); this.root.removeFromParent();
  }
}
