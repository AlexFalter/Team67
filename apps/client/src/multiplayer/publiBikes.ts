import * as THREE from "three";
import * as C from "@race/shared";
import type { Network } from "./net.ts";
import type { Vehicles } from "./vehicles.ts";
import type { LocalPlayer } from "./localPlayer.ts";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";

export class PubliBikeFeature {
  private abort = new AbortController();
  private station = new THREE.Group();
  private lights: THREE.InstancedMesh;
  private sign: THREE.Sprite;
  private signCanvas = document.createElement("canvas");
  private signText = "";
  private modal = document.createElement("section");
  private battery = document.createElement("aside");
  private status: HTMLElement;
  private bar: HTMLElement;
  private held = new Set<string>();
  private request?: { bikeId: string; requestId: string; token?: string; sent: boolean; grantedAt: number };
  private progress = 0;
  private steady = 0;
  private stutter = 0;
  private stuttered = false;
  private aimed = false;
  private yaw = 0.18;
  private pitch = -0.12;
  private drag?: { x: number; y: number };
  private lastAim = { yaw: 0.18, pitch: -0.12 };
  private savedView?: { position: THREE.Vector3; quaternion: THREE.Quaternion; up: THREE.Vector3; fov: number };
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private net: Network,
    private vehicles: Vehicles, private local: LocalPlayer, private canvas: HTMLCanvasElement) {
    const site = C.publiBikeStation(C.zurichWorld);
    this.station.name = "PubliBike station";
    const pink = new THREE.MeshStandardMaterial({ color: "#a82779" }), metal = new THREE.MeshStandardMaterial({ color: "#50606b" });
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.35, 0.38), pink);
    column.position.set(site.slots[0].x - 1.75, site.slots[0].y + 1.18, site.slots[0].z); this.station.add(column);
    const dock = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.08, 0.5), metal, 8);
    this.lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial(), 8);
    const lines: THREE.Vector3[] = [], transform = new THREE.Object3D();
    site.slots.forEach((slot, i) => {
      transform.position.set(slot.x, slot.y + 0.04, slot.z - 1.15); transform.rotation.y = site.heading; transform.updateMatrix(); dock.setMatrixAt(i, transform.matrix);
      transform.position.set(slot.x + 0.17, slot.y + 0.1, slot.z - 1.15); transform.updateMatrix(); this.lights.setMatrixAt(i, transform.matrix);
      const points = [[-0.55, -1.75], [0.55, -1.75], [0.55, 1.75], [-0.55, 1.75], [-0.55, -1.75]];
      for (let j = 0; j < 4; j++) for (const [x, z] of [points[j], points[j + 1]]) lines.push(new THREE.Vector3(x, 0.035, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), site.heading).add(new THREE.Vector3(slot.x, slot.y, slot.z)));
    });
    this.station.add(dock, this.lights, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: "#df73b8" })));
    this.signCanvas.width = 768; this.signCanvas.height = 192;
    const texture = new THREE.CanvasTexture(this.signCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })); this.sign.scale.set(7.5, 1.875, 1);
    this.sign.position.set(site.center.x, C.zurichWorld.height(site.center.x, site.center.z)! + 3.3, site.center.z);
    this.station.add(this.sign); scene.add(this.station);
    this.modal.id = "publibike-scan"; this.modal.hidden = true; this.modal.setAttribute("role", "dialog");
    this.modal.setAttribute("aria-modal", "true"); this.modal.setAttribute("aria-label", "Unlock PubliBike");
    this.modal.innerHTML = `<div class="bike-phone"><h2>PubliBike <span></span></h2><div class="bike-viewfinder"><i></i></div><div class="bike-scan-progress"><i></i></div><p role="status" aria-live="polite"></p><p>Drag to aim · WASD / arrows · hold still</p><button type="button">Put phone away</button></div>`;
    this.status = this.modal.querySelector("[role=status]")!; this.bar = this.modal.querySelector(".bike-scan-progress i")!;
    this.battery.id = "publi-bike-battery"; this.battery.hidden = true; this.battery.setAttribute("role", "status");
    canvas.parentElement!.append(this.modal, this.battery);
    const options = { signal: this.abort.signal };
    this.modal.querySelector("button")!.addEventListener("click", () => this.close(), options);
    this.modal.addEventListener("pointerdown", e => { if (e.target instanceof HTMLButtonElement) return; this.drag = { x: e.clientX, y: e.clientY }; this.aimed = true; this.modal.setPointerCapture(e.pointerId); }, options);
    this.modal.addEventListener("pointermove", e => {
      if (!this.drag) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.003; this.pitch -= (e.clientY - this.drag.y) * 0.003;
      this.drag = { x: e.clientX, y: e.clientY };
    }, options);
    this.modal.addEventListener("pointerup", () => { this.drag = undefined; }, options);
    window.addEventListener("keydown", e => {
      if (!this.active) return;
      if (["Escape", "KeyE"].includes(e.code)) { e.preventDefault(); this.close(); return; }
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) { e.preventDefault(); this.held.add(e.code); this.aimed = true; }
      if (e.code === "Tab") { e.preventDefault(); this.modal.querySelector<HTMLButtonElement>("button")!.focus(); }
    }, options);
    window.addEventListener("keyup", e => this.held.delete(e.code), options);
    window.addEventListener("blur", () => { if (this.request) this.close(); }, options);
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.request) this.close(); }, options);
    net.onBikeUnlockResult = result => this.result(result);
  }
  get active() { return !this.modal.hidden; }
  interact() {
    const id = this.vehicles.nearestId(this.local.body);
    if (!this.net.room.state.publiBikes.has(id) || this.local.body.vehicleId) return false;
    if (this.request) return true;
    const bike = this.net.room.state.publiBikes.get(id)!;
    if (this.net.room.state.vehicles.get(id)?.driver || bike.reservedBy) {
      this.net.onVehicleResult?.({ ok: false, message: "This bike is occupied or being unlocked." });
      return true;
    }
    this.request = { bikeId: id, requestId: crypto.randomUUID(), sent: false, grantedAt: 0 };
    this.net.room.send("bikeScanBegin", { bikeId: id, requestId: this.request.requestId }); return true;
  }
  private result(result: C.BikeUnlockResult) {
    const request = this.request;
    if (!request || result.bikeId !== request.bikeId || result.requestId !== request.requestId) return;
    this.status.textContent = result.message;
    if (!result.ok) {
      if (!request.token) { this.net.onVehicleResult?.({ ok: false, message: result.message }); this.close(false); }
      else { this.net.room.send("bikeScanCancel", request); request.sent = true; }
      return;
    }
    if (!result.token) { this.close(false); return; }
    if (request.token) return;
    if (!this.net.canPlay || this.local.body.vehicleId || this.local.body.knockdownUntil > this.net.now()) { this.close(); return; }
    request.token = result.token; request.grantedAt = this.net.now();
    this.modal.hidden = false; this.local.enabled = false; this.local.clear();
    this.modal.querySelector("h2 span")!.textContent = request.bikeId.split("-")[1].padStart(2, "0");
    this.bar.style.width = "0%";
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.modal.querySelector<HTMLButtonElement>("button")!.focus();
    this.savedView = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), up: this.camera.up.clone(), fov: this.camera.fov };
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
    this.yaw = this.lastAim.yaw = 0.18; this.pitch = this.lastAim.pitch = -0.12;
    this.progress = this.steady = this.stutter = 0; this.stuttered = this.aimed = false;
  }
  close(cancel = true) {
    if (this.request && cancel && this.net.status === "Connected") this.net.room.send("bikeScanCancel", this.request);
    this.request = undefined; this.held.clear(); this.drag = undefined; this.modal.hidden = true;
    if (this.savedView) {
      this.camera.position.copy(this.savedView.position); this.camera.quaternion.copy(this.savedView.quaternion); this.camera.up.copy(this.savedView.up);
      this.camera.fov = this.savedView.fov; this.camera.updateProjectionMatrix(); this.savedView = undefined;
    }
  }
  update(dt: number) {
    const state = this.net.room?.state;
    if (state?.publiBikes) {
      let available = 0;
      for (let i = 0; i < 8; i++) {
        const docked = [...state.publiBikes.values()].find(b => b.dock === i);
        this.lights.setColorAt(i, new THREE.Color(!docked ? "#efb859" : docked.broken ? "#ef5e58" : docked.reservedBy ? "#efb859" : "#72e3ad"));
      }
      this.lights.instanceColor!.needsUpdate = true;
      for (const b of state.publiBikes.values()) if (!b.broken && !b.reservedBy && b.dock >= 0) available++;
      const text = `${available} / 8 BIKES AVAILABLE`;
      if (text !== this.signText) {
        this.signText = text; const ctx = this.signCanvas.getContext("2d")!;
        ctx.fillStyle = "#92246c"; ctx.fillRect(0, 0, 768, 192); ctx.fillStyle = "white"; ctx.textAlign = "center";
        ctx.font = "bold 52px Arial"; ctx.fillText("PubliBike station", 384, 65); ctx.font = "30px Arial"; ctx.fillText(text, 384, 112);
        ctx.font = "26px Arial"; ctx.fillText("E TO SCAN · E TO RETURN", 384, 160); (this.sign.material as THREE.SpriteMaterial).map!.needsUpdate = true;
      }
    }
    const bike = state?.publiBikes?.get(this.local.body.vehicleId);
    this.battery.hidden = !this.net.canPlay || !bike;
    if (bike) this.battery.textContent = `PUBLIBIKE BATTERY · ${(bike.batteryMs / 1000).toFixed(1)}s`;
    const request = this.request; if (!request) return;
    if (!this.net.canPlay || this.local.body.knockdownUntil > this.net.now()) { this.close(); return; }
    if (!request.token || request.sent) return;
    const meta = state!.publiBikes.get(request.bikeId);
    // Wait for the first reservation patch after the grant message.
    if (this.net.now() - request.grantedAt > 500 && (meta?.reservedBy !== this.net.room.sessionId || meta.reservationUntil <= this.net.now())) { this.close(); return; }
    const visual = this.vehicles.items.get(request.bikeId), tag = visual?.mesh.getObjectByName("PubliBike QR");
    if (!visual || !tag) { this.close(); return; }
    const dx = Number(this.held.has("KeyD") || this.held.has("ArrowRight")) - Number(this.held.has("KeyA") || this.held.has("ArrowLeft"));
    const dy = Number(this.held.has("KeyS") || this.held.has("ArrowDown")) - Number(this.held.has("KeyW") || this.held.has("ArrowUp"));
    this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.65 * dt, -1.3, 1.3); this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.65 * dt, -1, 1);
    visual.mesh.updateMatrixWorld(true);
    const eye = visual.mesh.localToWorld(new THREE.Vector3(-0.08, 1.4, -2.25)), target = tag.getWorldPosition(new THREE.Vector3());
    this.camera.position.copy(eye); this.camera.up.set(0, 1, 0); this.camera.lookAt(target);
    this.camera.rotateY(this.yaw); this.camera.rotateX(this.pitch); this.camera.updateMatrixWorld(true);
    const projected = target.clone().project(this.camera), rect = this.canvas.getBoundingClientRect();
    const finder = this.modal.querySelector(".bike-viewfinder")!.getBoundingClientRect();
    const aligned = this.aimed && Math.abs(rect.left + (projected.x + 1) * rect.width / 2 - finder.left - finder.width / 2) < 22 &&
      Math.abs(rect.top + (1 - projected.y) * rect.height / 2 - finder.top - finder.height / 2) < 22;
    const moving = !!dx || !!dy || Math.hypot(this.yaw - this.lastAim.yaw, this.pitch - this.lastAim.pitch) > Math.max(0.001, dt * 0.04);
    this.lastAim = { yaw: this.yaw, pitch: this.pitch };
    if (!aligned || moving) { this.steady = 0; this.progress = Math.max(0, this.progress - dt * 1.5); this.status.textContent = aligned ? "Hold still." : "Center the rear QR code."; }
    else if ((this.steady += dt) < 0.3) this.status.textContent = "Hold still.";
    else if (this.stutter > 0) { this.stutter = Math.max(0, this.stutter - dt); this.status.textContent = "Connecting…"; }
    else {
      this.progress = Math.min(1, this.progress + dt / 1.25); this.status.textContent = "Scanning…";
      if (this.progress >= 0.45 && !this.stuttered) { this.stuttered = true; this.stutter = 0.5; }
    }
    this.bar.style.width = `${this.progress * 100}%`;
    if (this.progress >= 1 && this.net.now() - request.grantedAt >= C.PUBLI_BIKE_SCAN_MS) {
      request.sent = true; this.status.textContent = "Unlocking…"; this.net.room.send("bikeScanFinish", request);
    }
  }
  dispose() {
    this.close(); this.abort.abort(); this.net.onBikeUnlockResult = undefined;
    this.modal.remove(); this.battery.remove(); this.station.removeFromParent();
    this.station.traverse(o => { if (o instanceof THREE.LineSegments) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    this.station.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    disposeMap(this.station); (this.sign.material as THREE.SpriteMaterial).map?.dispose(); this.sign.material.dispose();
  }
}
