import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TrafficCarKind } from '@race/shared';

export interface TrafficWheel { x: number; z: number; radius: number; width: number }
export interface TrafficModel {
  paint: THREE.BufferGeometry;
  details: THREE.BufferGeometry;
  tire: THREE.BufferGeometry;
  wheels: TrafficWheel[];
}
type Rotation = [number, number, number];

class Parts {
  private geometries: THREE.BufferGeometry[] = [];
  add(geometry: THREE.BufferGeometry, color = '#ffffff', positionX = 0, positionY = 0, positionZ = 0, rotation: Rotation = [0, 0, 0]) {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
    geometry.translate(positionX, positionY, positionZ);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const colors = new Float32Array(flat.attributes.position.count * 3);
    const tint = new THREE.Color(color);
    for (let vertex = 0; vertex < flat.attributes.position.count; vertex++) tint.toArray(colors, vertex * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometries.push(flat);
  }
  box(width: number, height: number, depth: number, positionX: number, positionY: number, positionZ: number, color = '#ffffff', rotation?: Rotation) {
    this.add(new THREE.BoxGeometry(width, height, depth), color, positionX, positionY, positionZ, rotation);
  }
  cylinder(radius: number, length: number, segments: number, positionX: number, positionY: number, positionZ: number, color: string, rotation?: Rotation) {
    this.add(new THREE.CylinderGeometry(radius, radius, length, segments), color, positionX, positionY, positionZ, rotation);
  }
  hull(width: number, roofWidth: number, height: number, depth: number, roofDepth: number, roofShift: number,
    positionX: number, positionY: number, positionZ: number, color = '#ffffff') {
    const geometry = new THREE.BoxGeometry(width, height, depth), positions = geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      if (positions.getY(vertex) > 0) positions.setXYZ(vertex,
        positions.getX(vertex) * roofWidth / width, positions.getY(vertex), positions.getZ(vertex) * roofDepth / depth + roofShift);
    }
    geometry.computeVertexNormals();
    this.add(geometry, color, positionX, positionY, positionZ);
  }
  finish() {
    const geometry = mergeGeometries(this.geometries)!;
    for (const part of this.geometries) part.dispose();
    geometry.computeBoundingBox();
    return geometry;
  }
}

function wheelGeometry(kind: TrafficCarKind) {
  const wheel = new Parts();
  const farming = kind === 2;
  wheel.cylinder(farming ? .94 : 1, 1, farming ? 12 : 10, 0, 0, 0, '#22272a', [0, 0, Math.PI / 2]);
  wheel.cylinder(.64, 1.025, 10, 0, 0, 0, '#11191f', [0, 0, Math.PI / 2]);
  wheel.cylinder(farming ? .56 : .57, 1.055, 10, 0, 0, 0, farming ? '#d3c6a2' : '#59636c', [0, 0, Math.PI / 2]);
  if (farming) {
    for (let tread = 0; tread < 12; tread++) {
      const angle = tread / 12 * Math.PI * 2;
      for (const side of [-1, 1]) wheel.box(.46, .09, .22, side * .24, Math.cos(angle) * .95, Math.sin(angle) * .95,
        tread % 2 ? '#303639' : '#282e30', [angle, side * .35, 0]);
    }
  } else {
    for (let spoke = 0; spoke < 5; spoke++) {
      const angle = spoke / 5 * Math.PI * 2;
      wheel.box(1.07, .12, .42, 0, Math.sin(angle) * .3, Math.cos(angle) * .3, '#c3cbd0', [-angle, 0, 0]);
    }
  }
  wheel.cylinder(.2, 1.09, 8, 0, 0, 0, farming ? '#535546' : '#858f96', [0, 0, Math.PI / 2]);
  return wheel.finish();
}

function sedan(paint: Parts, details: Parts) {
  paint.hull(1.82, 1.9, .52, 4.35, 4.04, -.03, 0, .73, 0);
  paint.box(1.78, .15, 3.94, 0, .43, 0, '#c6cbd0');
  paint.hull(1.76, 1.68, .13, 1.14, 1.02, -.04, 0, 1.04, 1.35);
  paint.box(1.74, .1, .92, 0, 1.03, -1.6);
  details.hull(1.65, 1.33, .64, 2.46, 1.65, -.13, 0, 1.4, -.16, '#6c8998');
  paint.hull(1.36, 1.32, .09, 1.77, 1.7, -.015, 0, 1.76, -.29);
  details.box(1.78, .14, .17, 0, .55, 2.12, '#343d43');
  details.box(1.78, .13, .15, 0, .53, -2.13, '#343d43');
  details.box(.78, .19, .035, 0, .8, 2.17, '#17252c');
  for (let slat = 0; slat < 3; slat++) details.box(.73, .018, .04, 0, .74 + slat * .055, 2.19, '#8d969a');
  details.box(.33, .1, .045, 0, .59, 2.215, '#e2e4db');
  details.box(.33, .12, .045, 0, .72, -2.19, '#e2e4db');
  details.box(.035, .028, 1.1, 0, 1.79, -.29, '#313d42');
  for (const side of [-1, 1]) {
    details.box(.48, .17, .05, side * .62, .88, 2.12, '#e4eddb');
    details.box(.09, .12, .055, side * .865, .87, 2.13, '#e3a45b');
    details.box(.45, .16, .055, side * .65, .88, -2.12, '#b83234');
    details.box(.16, .065, .062, side * .65, .865, -2.14, '#f7c6a4');
    details.box(.045, .66, .075, side * .749, 1.4, -.24, '#293b43', [0, 0, side * .245]);
    details.box(.032, .025, 2.26, side * .86, 1.09, -.17, '#28383e');
    details.box(.033, .3, .024, side * .952, .81, -.26, '#68747b');
    for (const door of [-.95, .35]) details.box(.04, .045, .18, side * .953, .96, door, '#c2c9c9');
    paint.box(.23, .12, .3, side * 1.04, 1.22, .64);
    details.box(.03, .075, .2, side * 1.16, 1.22, .64, '#718e99');
    details.box(.025, .035, .65, side * .805, 1.53, .2, '#b3c5ca', [0, 0, side * .18]);
  }
  details.cylinder(.055, .16, 6, -.56, .4, -2.13, '#939b9e', [Math.PI / 2, 0, 0]);
}

function sports(paint: Parts, details: Parts) {
  paint.hull(1.78, 1.96, .39, 4.4, 3.95, -.06, 0, .56, 0);
  paint.hull(1.91, 1.74, .18, 1.66, 1.38, -.13, 0, .81, 1.04);
  paint.hull(1.9, 1.8, .17, 1.15, .99, .01, 0, .81, -1.44);
  details.hull(1.55, 1.22, .43, 2.15, 1.14, -.2, 0, 1.09, -.25, '#344b59');
  paint.hull(1.26, 1.22, .075, 1.27, 1.22, -.015, 0, 1.34, -.47);
  details.box(1.91, .07, .25, 0, .29, 2.04, '#1c252a');
  details.box(1.87, .15, .14, 0, .38, -2.13, '#1c252a');
  details.box(.59, .15, .09, 0, .46, 2.16, '#172128');
  details.box(1.38, .065, .09, 0, .81, -2.03, '#da3344');
  details.box(.32, .12, .045, 0, .61, -2.15, '#d4d9ce');
  paint.box(1.93, .065, .34, 0, 1.02, -1.91);
  details.box(.09, .22, .1, -.61, .89, -1.93, '#27313b');
  details.box(.09, .22, .1, .61, .89, -1.93, '#27313b');
  for (const side of [-1, 1]) {
    paint.box(.17, .16, 2.65, side * .9, .36, -.05, '#b9c1c6');
    details.box(.39, .2, .055, side * .66, .48, 2.085, '#19262d');
    for (let lamp = 0; lamp < 3; lamp++) details.box(.085, .055, .045, side * (.57 + lamp * .115), .78, 1.9,
      '#e7f8f2', [0, side * -.19, 0]);
    paint.box(.045, .06, .78, side * .54, .9, 1.18, '#dce0e3', [.07, side * .11, 0]);
    details.box(.025, .25, .6, side * .99, .69, -.44, '#1a272f', [0, side * -.15, 0]);
    for (let vent = 0; vent < 3; vent++) details.box(.027, .17, .032, side * 1.005, .7, -.62 + vent * .15,
      '#687580', [0, side * -.15, .16]);
    details.box(.03, .23, .022, side * .975, .67, .48, '#48545d');
    details.box(.04, .035, .17, side * .975, .85, -.07, '#42515a');
    paint.box(.23, .09, .24, side * 1.035, 1.03, .54);
    details.box(.025, .055, .15, side * 1.155, 1.03, .54, '#6b8492');
    details.cylinder(.095, .18, 8, side * .6, .4, -2.16, '#a1aeb5', [Math.PI / 2, 0, 0]);
    details.cylinder(.065, .19, 8, side * .6, .4, -2.17, '#162027', [Math.PI / 2, 0, 0]);
  }
  for (let fin = 0; fin < 5; fin++) details.box(.04, .13, .35, -.55 + fin * .275, .27, -1.99, '#19252d');
  for (let louver = 0; louver < 5; louver++) details.box(1.15, .025, .055, 0, .93, -1.09 - louver * .13, '#283640');
}

function tractor(paint: Parts, details: Parts) {
  details.box(.84, .2, 3.7, 0, .48, .1, '#303933');
  paint.hull(.98, .85, .64, 2.15, 1.89, -.1, 0, 1.14, .75);
  paint.box(.96, .065, 1.85, 0, 1.49, .72, '#d1d7c3');
  details.box(.69, .52, .06, 0, 1.12, 1.84, '#182720');
  for (let slat = 0; slat < 7; slat++) details.box(.025, .45, .075, -.27 + slat * .09, 1.13, 1.88, '#6f796c');
  details.box(1.16, .19, .28, 0, .68, 1.92, '#555d54');
  details.box(.83, .11, .025, 0, 1.45, 1.89, '#e9e8d3');
  paint.box(1.05, .19, 1.54, 0, .97, -1.01);
  details.hull(1.13, 1.04, 1.11, 1.56, 1.39, .03, 0, 1.89, -1.01, '#72948e');
  paint.hull(1.32, 1.27, .14, 1.75, 1.64, 0, 0, 2.52, -1.01);
  details.box(.48, .48, .1, 0, 1.7, -1.59, '#283b31');
  details.box(.48, .12, .42, 0, 1.45, -1.36, '#283b31');
  details.cylinder(.16, .05, 8, 0, 1.68, -.54, '#253b30', [.75, 0, 0]);
  details.cylinder(.075, 1.16, 8, .39, 1.91, .15, '#333b38');
  details.box(.18, .055, .17, .43, 2.51, .15, '#4c5650');
  details.cylinder(.075, .54, 6, -.38, 1.72, .1, '#495447');
  details.box(.22, .065, .24, -.38, 2.02, .1, '#28382d');
  details.cylinder(.13, .09, 8, 0, 2.64, -1.33, '#434c3d');
  details.cylinder(.105, .16, 8, 0, 2.76, -1.33, '#eea535');
  details.box(.42, .12, .35, 0, .47, -1.99, '#697363');
  details.box(.12, .19, .35, 0, .59, -2.04, '#303f34');
  for (const side of [-1, 1]) {
    paint.box(.42, .15, 1.67, side * .92, 1.52, -1.12);
    paint.box(.33, .3, .11, side * .92, 1.36, -.24, '#c0c7b4');
    details.box(.07, 1.11, .08, side * .57, 1.89, -.27, '#304d3b');
    details.box(.07, 1.11, .08, side * .57, 1.89, -1.73, '#304d3b');
    details.box(.08, .055, 1.45, side * .59, 1.51, -1.01, '#304d3b');
    details.box(.065, .04, .2, side * .6, 1.8, -.72, '#d0d1b9');
    details.box(.28, .09, .055, side * .39, 2.43, -.13, '#e2e9d8');
    details.box(.19, .13, .065, side * .91, 1.47, -1.97, '#bd3930');
    details.box(.08, .08, .07, side * 1.035, 1.47, -1.97, '#efa74f');
    details.box(.38, .075, .51, side * .74, .77, -.2, '#7e8777');
    details.box(.3, .075, .42, side * .82, .54, -.15, '#596554');
    details.box(.025, .1, 1.1, side * .5, 1.18, .77, '#d3c7a1');
    for (let vent = 0; vent < 5; vent++) details.box(.027, .17, .034, side * .505, 1.31, .36 + vent * .15, '#2b3f2d');
  }
}

export function createTrafficModel(kind: TrafficCarKind): TrafficModel {
  const paint = new Parts(), details = new Parts();
  if (kind === 0) sedan(paint, details);
  else if (kind === 1) sports(paint, details);
  else tractor(paint, details);
  const wheels = [-1, 1].flatMap(side => kind === 2
    ? [{ x: side * .94, z: -1.12, radius: .72, width: .43 }, { x: side * .79, z: 1.43, radius: .43, width: .27 }]
    : [{ x: side * .98, z: -1.4, radius: .35, width: .23 }, { x: side * .98, z: 1.4, radius: .35, width: .23 }]);
  return { paint: paint.finish(), details: details.finish(), tire: wheelGeometry(kind), wheels };
}
