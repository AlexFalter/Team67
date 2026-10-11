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
  private previewScene = new THREE.Scene();
  private previewCamera = new THREE.OrthographicCamera(-1.5, 1.5, 2.05, -.15, .1, 30);
  private previewContext: CanvasRenderingContext2D | null;
  private previewTarget = new THREE.WebGLRenderTarget(1, 1);
  private previewPixels = new Uint8Array(4);
  private previewImage?: ImageData;
  private previewModels = CHARACTERS.map((_, character) => avatar("#d7f87a", character));
  private previewBody = createBody();
  private previewStage = document.querySelector<HTMLCanvasElement>("#character-stage")!;
  private characterField = document.querySelector<HTMLInputElement>("#character")!;
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    scene.add(this.group);
    this.ring = new THREE.Mesh(this.ringGeometry, this.material);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.set(208, 50.88, 145);
    this.group.add(this.ring); this.group.visible = false;
    this.preview.add(...this.previewModels);
    const pedestal = new THREE.Mesh(this.padGeometry, this.material);
    pedestal.rotation.x = -Math.PI / 2; pedestal.position.y = -.015;
    this.preview.add(pedestal); this.preview.visible = false;
    this.previewScene.background = new THREE.Color("#102731");
    this.previewTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.previewScene.add(this.preview, new THREE.HemisphereLight("#f1f8e9", "#526f7b", 2.5));
    const light = new THREE.DirectionalLight("#fff3d4", 3);
    light.position.set(-3, 5, 4);
    this.previewScene.add(light);
    this.previewCamera.position.set(0, 0, 10);
    this.previewCamera.lookAt(0, 0, 0);
    this.previewContext = this.previewStage.getContext("2d");
  }
  private updatePreview(dt: number) {
    const selected = Number(this.characterField.value);
    this.previewBody.simTime = this.elapsed * 1000;
    this.previewBody.rotY = -.25;
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
  /** Uses the owner's renderer/loop, then copies into the card's clipped DOM canvas. */
  renderPreview(renderer: THREE.WebGLRenderer) {
    const context = this.previewContext;
    if (!this.preview.visible || !context || this.previewStage.closest<HTMLElement>("#lobby")?.hidden) return;
    const stage = this.previewStage.getBoundingClientRect();
    const viewport = renderer.domElement.getBoundingClientRect();
    if (!stage.width || !stage.height || stage.bottom <= viewport.top || stage.top >= viewport.bottom) return;
    const density = renderer.getPixelRatio();
    const width = Math.max(1, Math.round(stage.width * density));
    const height = Math.max(1, Math.round(stage.height * density));
    if (this.previewTarget.width !== width || this.previewTarget.height !== height || !this.previewImage) {
      this.previewStage.width = width; this.previewStage.height = height;
      this.previewTarget.setSize(width, height);
      this.previewPixels = new Uint8Array(width * height * 4);
      this.previewImage = context.createImageData(width, height);
    }
    const halfWidth = 1.1 * stage.width / stage.height;
    this.previewCamera.left = -halfWidth; this.previewCamera.right = halfWidth;
    this.previewCamera.updateProjectionMatrix();
    const savedViewport = renderer.getViewport(new THREE.Vector4());
    const savedScissor = renderer.getScissor(new THREE.Vector4());
    const savedScissorTest = renderer.getScissorTest();
    const savedTarget = renderer.getRenderTarget();
    try {
      // Render into a dedicated texture, independent of the city framebuffer
      // and the stage's fractional CSS position or scroll offset.
      renderer.setRenderTarget(this.previewTarget);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.render(this.previewScene, this.previewCamera);
      renderer.readRenderTargetPixels(this.previewTarget, 0, 0, width, height, this.previewPixels);
      const stride = width * 4;
      // WebGL reads from the bottom left; ImageData starts at the top left.
      for (let row = 0; row < height; row++) {
        const source = (height - row - 1) * stride;
        this.previewImage.data.set(this.previewPixels.subarray(source, source + stride), row * stride);
      }
      context.putImageData(this.previewImage, 0, 0);
    } finally {
      renderer.setRenderTarget(savedTarget);
      renderer.setViewport(savedViewport); renderer.setScissor(savedScissor);
      renderer.setScissorTest(savedScissorTest);
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
    this.previewScene.clear();
    this.previewTarget.dispose();
    this.previewImage = undefined;
    this.previewPixels = new Uint8Array(0);
    this.clearActors(); this.group.removeFromParent();
    this.ringGeometry.dispose(); this.padGeometry.dispose(); this.material.dispose();
  }
}
