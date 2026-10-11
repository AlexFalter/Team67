import * as THREE from 'three';
import { examPortalPosition } from '@race/shared';

/** Scene entity, never attached to the replaceable map geometry. */
export class ExamPortal {
  readonly root = new THREE.Group();
  private ring: THREE.Mesh;
  private orb: THREE.Mesh;
  private halo: THREE.Sprite;
  constructor(scene: THREE.Scene) {
    this.root.name = 'Campusless portal · Polyterrasse';
    this.root.position.set(examPortalPosition.x, examPortalPosition.y + 0.12, examPortalPosition.z);
    const gold = new THREE.MeshBasicMaterial({ color: '#ffe071', toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.09, 6, 48), gold);
    this.ring.rotation.x = -Math.PI / 2;
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), gold);
    this.orb.position.y = 1.7;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#fff6c1'); gradient.addColorStop(0.15, '#ffe071bb'); gradient.addColorStop(1, '#ffe07100');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: '#ffdf64', transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.halo.position.y = 1.7; this.halo.scale.set(6, 6, 1);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({
      color: '#ffe071', transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    disk.rotation.x = -Math.PI / 2;
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 128;
    const label = labelCanvas.getContext('2d')!;
    label.fillStyle = '#15202aee'; label.fillRect(0, 0, 512, 128);
    label.textAlign = 'center'; label.fillStyle = '#ffe071'; label.font = 'bold 34px system-ui'; label.fillText('EXAM MODE', 256, 49);
    label.fillStyle = '#fff'; label.font = '22px system-ui'; label.fillText('Enter the final challenge', 256, 93);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), depthWrite: false, toneMapped: false }));
    sign.position.y = 4.1; sign.scale.set(6.4, 1.6, 1);
    this.root.add(disk, this.ring, this.orb, this.halo, sign); scene.add(this.root);
  }
  update(now: number) {
    const t = now / 1000;
    this.orb.position.y = this.halo.position.y = 1.7 + Math.sin(t * 2) * 0.2;
    this.orb.rotation.set(t * 0.4, t * 0.7, 0);
    this.ring.scale.setScalar(1 + Math.sin(t * 2) * 0.035);
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.75 + Math.sin(t * 2) * 0.15;
  }
  dispose() {
    this.root.removeFromParent();
    const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); }
      if (object instanceof THREE.Sprite) materials.add(object.material);
    });
    for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); }
    for (const texture of textures) texture.dispose();
  }
}
