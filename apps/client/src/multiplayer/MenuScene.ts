import * as THREE from "three";
import { createBody, RoomPhase, zurichWorld, type WorldState } from "@race/shared";
import { avatar, disposeAvatar, pose, CHARACTERS } from "./avatar";

// Presentation only: lobby avatars never grant movement or gameplay membership.
export class MenuScene {
  readonly focus = { x: 208, y: 50.7, z: 145 };
  private group = new THREE.Group();
  private signature = "";
  private actors: { mesh: THREE.Group; body: ReturnType<typeof createBody>; label: HTMLElement }[] = [];
  private labels = document.querySelector<HTMLElement>("#squad-labels")!;
  private ringGeometry = new THREE.RingGeometry(8.9, 9, 80);
  private padGeometry = new THREE.CircleGeometry(.7, 32);
  private material = new THREE.MeshBasicMaterial({ color: "#d7f87a", transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false });
  private target = new THREE.Vector3();
  private position = new THREE.Vector3();
  private projected = new THREE.Vector3();
  private ring: THREE.Mesh;
  private active = false;
  private elapsed = 0;
  private preview = new THREE.Group();
  private previewBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: "#102731", fog: false, toneMapped: false }),
  );
  private previewModels = CHARACTERS.map((_, character) => avatar("#d7f87a", character));
  private previewBody = createBody();
  private previewStage = document.querySelector<HTMLElement>("#character-stage")!;
  private characterField = document.querySelector<HTMLInputElement>("#character")!;
  private viewport = document.querySelector<HTMLElement>(".map-viewer")!;
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    scene.add(this.group);
    this.ring = new THREE.Mesh(this.ringGeometry, this.material);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.set(208, 50.88, 145);
    this.group.add(this.ring); this.group.visible = false;
    this.preview.add(...this.previewModels);
    const pedestal = new THREE.Mesh(this.padGeometry, this.material);
    pedestal.rotation.x = -Math.PI / 2; pedestal.position.y = -.015;
    this.preview.add(pedestal); this.preview.visible = false;
    scene.add(this.preview);
    this.previewBackdrop.visible = false;
    scene.add(this.previewBackdrop);
  }
  private updatePreview(dt: number) {
    const stage = this.previewStage.getBoundingClientRect();
    const viewport = this.viewport.getBoundingClientRect();
    if (!stage.width || !stage.height) { this.preview.visible = this.previewBackdrop.visible = false; return; }
    this.preview.visible = true;
    this.previewBackdrop.visible = true;
    const selected = Number(this.characterField.value);
    const distance = 12;
    const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const modelHeight = 2 * halfHeight * stage.height / viewport.height * .84;
    const x = ((stage.left + stage.width / 2 - viewport.left) / viewport.width * 2 - 1) * halfHeight * this.camera.aspect;
    const y = (1 - (stage.top + stage.height / 2 - viewport.top) / viewport.height * 2) * halfHeight - modelHeight / 2;
    this.camera.updateMatrixWorld();
    this.preview.position.set(x, y, -distance).applyMatrix4(this.camera.matrixWorld);
    this.preview.quaternion.copy(this.camera.quaternion);
    this.preview.scale.setScalar(modelHeight / 1.8);
    // A camera-facing opaque stage keeps the city out of the character window.
    const picker = this.previewStage.parentElement!.getBoundingClientRect();
    const card = this.previewStage.closest("form")!.getBoundingClientRect();
    const backdropDistance = 14;
    const backdropHalfHeight = backdropDistance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const backdropX = ((card.left + card.width / 2 - viewport.left) / viewport.width * 2 - 1) * backdropHalfHeight * this.camera.aspect;
    const backdropY = (1 - (picker.top + picker.height / 2 - viewport.top) / viewport.height * 2) * backdropHalfHeight;
    this.previewBackdrop.position.set(backdropX, backdropY, -backdropDistance).applyMatrix4(this.camera.matrixWorld);
    this.previewBackdrop.quaternion.copy(this.camera.quaternion);
    this.previewBackdrop.scale.set(2 * backdropHalfHeight * this.camera.aspect * (card.width - 2) / viewport.width, 2 * backdropHalfHeight * picker.height / viewport.height, 1);
    this.previewBody.simTime = this.elapsed * 1000;
    this.previewBody.rotY = -.25 + Math.sin(this.elapsed * .6) * .12;
    this.previewBody.grounded = true;
    for (const [index, mesh] of this.previewModels.entries()) {
      mesh.visible = index === selected;
      if (mesh.visible) pose(mesh, this.previewBody, dt);
    }
  }
  update(dt: number, state?: WorldState, localId?: string) {
    const staging = state?.phase === RoomPhase.Lobby;
    const visible = !state || staging;
    this.preview.visible = !state;
    this.previewBackdrop.visible = !state;
    this.group.visible = !!staging;
    if (!visible) {
      if (this.active) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
      this.active = false; return;
    }
    if (!this.active) { this.camera.fov = staging ? 45 : 31; this.camera.up.set(0, 1, 0); this.camera.updateProjectionMatrix(); }
    this.active = true;
    this.elapsed += dt;
    if (staging) {
      if (this.camera.fov !== 45) { this.camera.fov = 45; this.camera.updateProjectionMatrix(); }
      const signature = JSON.stringify([state.hostId, localId, [...state.members].map(([id, m]) => [id, m.name, m.character])]);
      if (signature !== this.signature) {
        this.signature = signature; this.clearActors();
        const members = [...state.members];
        // Put the local player first for a stable lineup.
        members.sort(([a], [b]) => a === localId ? -1 : b === localId ? 1 : 0);
        const columns = Math.min(members.length, 8, Math.ceil(Math.sqrt(members.length * 1.25)));
        const rows = Math.ceil(members.length / columns);
        const spacing = Math.min(9, 42 / Math.max(1, columns - 1, rows - 1));
        const radius = Math.max(12, Math.hypot((columns - 1) * spacing / 2, (rows - 1) * spacing / 2) + 3);
        const facing = Math.atan2(208 - 130.45, 145 - 103.85);
        const forwardX = Math.sin(facing), forwardZ = Math.cos(facing);
        this.ring.scale.setScalar(radius / 9);
        this.ring.position.z = 145;
        for (const [i, [id, member]] of members.entries()) {
          const col = i % columns, row = Math.floor(i / columns);
          // Align the wider formation with the camera so rows stay distinct.
          const across = (col - (columns - 1) / 2) * spacing;
          const depth = (row - (rows - 1) / 2) * spacing;
          const x = 208 - forwardZ * across + forwardX * depth;
          const z = 145 + forwardX * across + forwardZ * depth;
          const body = Object.assign(createBody(), { x, y: (zurichWorld.height(x, z) ?? 50.7) + .05, z, grounded: true });
          const mesh = avatar(id === state.hostId ? "#d7f87a" : "#90c9da", member.character);
          const pad = new THREE.Mesh(this.padGeometry, this.material); pad.rotation.x = -Math.PI / 2;
          pad.position.set(x, body.y + .035, z); mesh.userData.menuPad = pad;
          const label = document.createElement("div"); label.className = "squad-label";
          label.append(document.createTextNode(member.name));
          const detail = document.createElement("small"); detail.textContent = id === state.hostId ? "HOST" : id === localId ? "YOU" : "PLAYER"; label.append(detail);
          this.labels.append(label); this.group.add(mesh, pad); this.actors.push({ mesh, body, label });
        }
      }
      this.position.set(130.45, 76.62, 103.85);
      this.target.set(211.96, 51.9, 145);
      this.camera.position.copy(this.position); this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      const { width, height } = this.labels.getBoundingClientRect();
      for (const actor of this.actors) {
        actor.body.rotY = Math.atan2(this.camera.position.x - actor.body.x, this.camera.position.z - actor.body.z);
        actor.body.simTime = this.elapsed * 1000; pose(actor.mesh, actor.body, dt);
        this.projected.set(actor.body.x, actor.body.y + 2.05, actor.body.z).project(this.camera);
        actor.label.style.left = `${(this.projected.x * .5 + .5) * width}px`;
        actor.label.style.top = `${(-this.projected.y * .5 + .5) * height}px`;
        actor.label.hidden = this.projected.z > 1 || this.projected.z < -1;
      }
    } else {
      this.camera.position.set(-870.05, 262.31, 850.88);
      this.camera.lookAt(240, 40, 160);
      this.updatePreview(dt);
    }
  }
  private clearActors() {
    for (const actor of this.actors) {
      (actor.mesh.userData.menuPad as THREE.Mesh).removeFromParent();
      disposeAvatar(actor.mesh); actor.label.remove();
    }
    this.actors = [];
  }
  dispose() {
    for (const mesh of this.previewModels) disposeAvatar(mesh);
    this.preview.removeFromParent();
    this.previewBackdrop.removeFromParent();
    this.previewBackdrop.geometry.dispose(); this.previewBackdrop.material.dispose();
    this.clearActors(); this.group.removeFromParent();
    this.ringGeometry.dispose(); this.padGeometry.dispose(); this.material.dispose();
  }
}
