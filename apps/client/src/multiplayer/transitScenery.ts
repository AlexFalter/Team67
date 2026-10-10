import * as THREE from "three";
import * as C from "@race/shared";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
  private originals = new Map<THREE.Mesh, THREE.BufferGeometry>();
  constructor(scene: THREE.Scene, map: THREE.Object3D) {
    this.root.name = "Tram and Polybahn tracks"; scene.add(this.root);
    map.updateMatrixWorld(true);
    const corridor = new THREE.Box3().setFromPoints(C.polybahnPassages.flatMap(s => [new THREE.Vector3(s.a.x, s.a.y - .5, s.a.z), new THREE.Vector3(s.b.x, s.b.y + 4.4, s.b.z)])).expandByScalar(4);
    map.traverse(o => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      o.geometry.computeBoundingBox();
      if (!o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld).intersectsBox(corridor)) return;
      const world = o.geometry.clone().applyMatrix4(o.matrixWorld), clipped = carveTransitPassages(world); world.dispose();
      if (!clipped.removed) { clipped.geometry.dispose(); return; }
      this.originals.set(o, o.geometry); o.geometry = clipped.geometry.applyMatrix4(o.matrixWorld.clone().invert());
    });
    const rails: THREE.BufferGeometry[] = [], floors: THREE.BufferGeometry[] = [];
    const rod = (a: THREE.Vector3, b: THREE.Vector3) => {
      const delta = b.clone().sub(a), geometry = new THREE.CylinderGeometry(.035, .035, delta.length(), 6);
      const matrix = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()), new THREE.Vector3(1, 1, 1));
      rails.push(geometry.applyMatrix4(matrix));
    };
    for (const kind of [C.TRAM_KIND, C.POLYBAHN_KIND]) {
      const v = C.createVehicle(kind), path = C.railPath(v);
      for (const lane of kind === C.TRAM_KIND ? [0] : [-1.25, 1.25]) {
        v.railLane = lane;
        for (let d = 0; d < path.length; d += 2) for (const side of [-.5, .5]) {
          v.railDistance = d; const a = C.railFrame(v);
          v.railDistance = Math.min(path.length, d + 2); const b = C.railFrame(v);
          rod(new THREE.Vector3(a.x + Math.cos(a.rotY) * side, a.y + .07, a.z - Math.sin(a.rotY) * side), new THREE.Vector3(b.x + Math.cos(b.rotY) * side, b.y + .07, b.z - Math.sin(b.rotY) * side));
        }
      }
    }
    for (const s of C.polybahnPassages) {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz), steps = Math.ceil(length), vertices: number[] = [];
      const point = (u: number, side: number) => {
        const x = s.a.x + dx * u - dz / length * s.width * side, z = s.a.z + dz * u + dx / length * s.width * side;
        return [x, (C.passageFloor(x, z) ?? s.a.y + (s.b.y - s.a.y) * u) + .015, z];
      };
      for (let i = 0; i < steps; i++) {
        const a = point(i / steps, -1), b = point(i / steps, 1), c = point((i + 1) / steps, -1), d = point((i + 1) / steps, 1);
        vertices.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
      const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals(); floors.push(geometry);
    }
    for (const [parts, color] of [[rails, "#6d7579"], [floors, "#8d9390"]] as const) {
      const mesh = new THREE.Mesh(mergeGeometries([...parts])!, new THREE.MeshStandardMaterial({ color, roughness: .95, side: THREE.DoubleSide })); this.root.add(mesh); parts.forEach(g => g.dispose());
    }
    const tram = C.createVehicle(C.TRAM_KIND);
    for (const distance of [14, C.tramPath.length]) { tram.railDistance = distance; this.station(C.railBoardingPoint(tram), distance === 14 ? "TRAM 6 · CENTRAL" : "TRAM 6 · ETH", "#135aa0"); }
    C.polybahnPlatforms.forEach((p, i) => this.station(p, i ? "POLYBAHN · POLYTERRASSE" : "POLYBAHN · CENTRAL", "#9f1d2f"));
  }
  private station(p: C.GroundPoint, text: string, color: string) {
    const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 128); ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 34px Arial"; ctx.fillText(text, 384, 52); ctx.font = "27px Arial"; ctx.fillText("E TO BOARD · SHARED DEPARTURE", 384, 104);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 5 / 6), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })); sign.position.set(p.x, p.y + 3.5, p.z); this.root.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 3.2, 6), new THREE.MeshStandardMaterial({ color: "#8997a1" })); pole.position.set(p.x, p.y + 1.6, p.z); this.root.add(pole);
  }
  dispose() {
    for (const [mesh, original] of this.originals) { mesh.geometry.dispose(); mesh.geometry = original; }
    this.originals.clear(); disposeMap(this.root); this.root.removeFromParent();
  }
}
