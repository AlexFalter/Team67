import * as THREE from "three";
import {PhoneAimInput} from "./phoneAimInput.ts";
import { bikePreviewCrop, bikePreviewTarget, bikePreviewFov } from "./publiBikeCamera.ts";
import * as C from "@race/shared";
import type { Network } from "./net.ts";
import type { Vehicles } from "./vehicles.ts";
import type { LocalPlayer } from "./localPlayer.ts";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";
import { randomUuid } from "./randomUuid.ts";
import "./publiBikeUi.css";

export class PubliBikeFeature {
  private abort = new AbortController();
  private station = new THREE.Group();
  private lights: THREE.InstancedMesh;
  private sign: THREE.Sprite;
  private signCanvas = document.createElement("canvas");
  private signText = "";
  private site = C.publiBikeStation(C.zurichWorld);
  private modal = document.createElement("section");
  private battery = document.createElement("aside");
  private preview: HTMLCanvasElement;
  private status: HTMLElement;
  private bar: HTMLElement;
  private held = new Set<string>();
  private request?: { bikeId: string; requestId: string; token?: string; sent: boolean; grantedAt: number; createdAt: number; sentAt?: number };
  private progress = 0;
  private steady = 0;
  private stutter = 0;
  private stuttered = false;
  private aimed = false;
  private yaw = 0.18;
  private pitch = -0.12;
  private mouse = new PhoneAimInput();
  private targetYaw = .18;
  private targetPitch = -.12;
  private lastAim = { yaw: 0.18, pitch: -0.12 };
  private savedView?: { position: THREE.Vector3; quaternion: THREE.Quaternion; up: THREE.Vector3; fov: number };
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private net: Network,
    private vehicles: Vehicles, private local: LocalPlayer, private canvas: HTMLCanvasElement, private resumeGameplay?: () => void) {
    const site = this.site;
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
    texture.magFilter = THREE.NearestFilter;
    this.sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, toneMapped: false, fog: false, depthWrite: false })); this.sign.scale.set(7.5, 1.875, 1);
    this.sign.position.set(site.center.x, C.zurichWorld.height(site.center.x, site.center.z)! + 3.3, site.center.z);
    this.station.add(this.sign); scene.add(this.station);
    this.modal.id = "publibike-scan"; this.modal.hidden = true; this.modal.setAttribute("role", "dialog");
    this.modal.setAttribute("aria-modal", "true"); this.modal.setAttribute("aria-label", "Unlock PubliBike");
    this.modal.innerHTML = `<div class="bike-phone pixel-panel"><div class="bike-phone-status" aria-hidden="true"><span>9:41</span><span>▰</span></div><h2>PubliBike <span></span></h2><div class="bike-viewfinder"><canvas width="600" height="800" aria-label="Live PubliBike QR scanner"></canvas><i></i></div><div class="bike-phone-controls"><div class="bike-scan-progress"><i></i></div><p role="status" aria-live="polite"></p></div><div class="bike-phone-home"><button type="button" aria-label="Close scanner" title="Close scanner · Esc">Close · Esc</button></div></div>`;
    this.preview = this.modal.querySelector("canvas")!;
    this.status = this.modal.querySelector("[role=status]")!; this.bar = this.modal.querySelector(".bike-scan-progress i")!;
    this.battery.id = "publi-bike-battery"; this.battery.hidden = true; this.battery.setAttribute("role", "status");
    canvas.parentElement!.append(this.modal, this.battery);
    const options = { signal: this.abort.signal };
    this.modal.querySelector("button")!.addEventListener("click", () => this.close(), options);
    const finder = this.modal.querySelector<HTMLElement>(".bike-viewfinder")!;
    // Listen across the overlay, rather than trapping input inside the phone.
    document.addEventListener("pointermove", e => {
      if (!this.active) return;
      const rect = finder.getBoundingClientRect();
      const delta=this.mouse.move(e.clientX,e.clientY,this.modal.getBoundingClientRect(),e.pointerType==="touch");
      if (delta.x || delta.y) this.aimed = true;
      this.targetYaw = THREE.MathUtils.clamp(this.targetYaw - delta.x / rect.width * 1.6, -1.3, 1.3);
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - delta.y / rect.height * 1.2, -1, 1);
    }, options);
    document.addEventListener("pointerout",e=>{if(!e.relatedTarget)this.mouse.reset();},options);
    document.addEventListener("pointercancel",()=>this.mouse.reset(),options);
    document.addEventListener("pointerup",e=>{if(e.pointerType==="touch")this.mouse.reset();},options);
    window.addEventListener("resize", () => this.mouse.reset(), options);
    window.addEventListener("keydown", e => {
      if (!this.active) return;
      if (["Escape", "KeyE"].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
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
    if (!this.net.canPlay || this.local.body.knockdownUntil > this.net.now()) return false;
    const id = this.vehicles.nearestId(this.local.body);
    if (!this.net.room.state.publiBikes.has(id) || this.local.body.vehicleId) return false;
    if (this.request) return true;
    const bike = this.net.room.state.publiBikes.get(id)!;
    if (bike.broken || bike.batteryMs <= 0) {
      this.net.onVehicleResult?.({ ok: false, message: "This bike is out of battery. Find another bike." });
      return true;
    }
    if (this.net.room.state.vehicles.get(id)?.driver || bike.reservedBy) {
      this.net.onVehicleResult?.({ ok: false, message: "This bike is occupied or being unlocked." });
      return true;
    }
    this.request = { bikeId: id, requestId: randomUuid(), sent: false, grantedAt: 0, createdAt: this.net.now() };
    this.net.room.send("bikeScanBegin", { bikeId: id, requestId: this.request.requestId }); return true;
  }
  private result(result: C.BikeUnlockResult) {
    const request = this.request;
    if (!request || result.bikeId !== request.bikeId || result.requestId !== request.requestId) return;
    this.status.textContent = result.message;
    if (!result.ok) {
      if (!request.token) { this.net.onVehicleResult?.({ ok: false, message: result.message }); this.close(false); }
      else { this.net.room.send("bikeScanCancel", request); this.net.onVehicleResult?.({ ok: false, message: result.message }); this.close(false); }
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
    this.camera.fov = bikePreviewFov(this.camera.aspect); this.camera.updateProjectionMatrix();
    this.yaw = this.targetYaw = this.lastAim.yaw = (Math.random() < .5 ? -1 : 1) * (.12 + Math.random() * .06);
    this.pitch = this.targetPitch = this.lastAim.pitch = (Math.random() < .5 ? -1 : 1) * (.035 + Math.random() * .03);
    this.mouse.reset();
    this.progress = this.steady = this.stutter = 0; this.stuttered = this.aimed = false;
  }
  close(cancel = true) {
    const wasActive = this.active;
    if (this.request && cancel && this.net.status === "Connected") this.net.room.send("bikeScanCancel", this.request);
    this.request = undefined; this.held.clear(); this.mouse.reset(); this.modal.hidden = true;
    if (this.savedView) {
      this.camera.position.copy(this.savedView.position); this.camera.quaternion.copy(this.savedView.quaternion); this.camera.up.copy(this.savedView.up);
      this.camera.fov = this.savedView.fov; this.camera.updateProjectionMatrix(); this.savedView = undefined;
    }
    if (wasActive && this.net.canPlay) {
      if (this.resumeGameplay) this.resumeGameplay();
      else { this.local.clear(); this.local.enabled = true; this.canvas.focus(); }
    }
  }
  private maintainRequest() {
    const request = this.request; if (!request) return;
    const now = this.net.now();
    if (!this.net.canPlay || this.local.body.knockdownUntil > now) { this.close(); return; }
    if (this.local.body.vehicleId) { this.close(false); return; }
    if ((!request.token && now - request.createdAt > 5000) || (request.sent && now - (request.sentAt ?? request.grantedAt) > 5000)) {
      this.net.onVehicleResult?.({ ok: false, message: "Bike scan timed out. Please try again." }); this.close(); return;
    }
    if (request.token && !request.sent && now - request.grantedAt > 500) {
      const meta = this.net.room.state.publiBikes.get(request.bikeId);
      if (meta?.reservedBy !== this.net.room.sessionId || meta.reservationUntil <= now) this.close();
    }
  }
  update(dt: number) {
    this.maintainRequest();
    const state = this.net.room?.state;
    if (state?.publiBikes) {
      const dockedBikes = new Map<number, C.PubliBikeState>();
      for (const [id, bike] of state.publiBikes) {
        if (C.publiBikeIsDocked(bike, state.vehicles.get(id), this.site.slots)) dockedBikes.set(bike.dock, bike);
      }
      for (let i = 0; i < 8; i++) {
        const docked = dockedBikes.get(i);
        this.lights.setColorAt(i, new THREE.Color(!docked ? "#efb859" : docked.broken || docked.batteryMs <= 0 ? "#ef5e58" : docked.reservedBy ? "#efb859" : "#72e3ad"));
      }
      this.lights.instanceColor!.needsUpdate = true;
      const text = `${dockedBikes.size} / ${C.PUBLI_BIKE_COUNT} BIKES AT STATION`;
      if (text !== this.signText) {
        this.signText = text; const ctx = this.signCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, 768, 192);
        ctx.fillStyle = "#071a2480"; ctx.fillRect(8, 8, 760, 184);
        ctx.fillStyle = "#102731"; ctx.fillRect(0, 0, 760, 184);
        ctx.strokeStyle = "#a82779"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 756, 180);
        ctx.fillStyle = "#ffffff12"; ctx.fillRect(4, 4, 752, 4); ctx.fillRect(4, 8, 4, 168);
        ctx.fillStyle = "#00000044"; ctx.fillRect(8, 176, 748, 4); ctx.fillRect(752, 8, 4, 168);
        ctx.textAlign = "center"; ctx.fillStyle = "#c3d5cc";
        ctx.font = "bold 42px monospace"; ctx.fillText("PUBLIBIKE STATION", 380, 61);
        ctx.font = "28px monospace"; ctx.fillText(text, 380, 108);
        ctx.fillStyle = "#a82779"; ctx.font = "24px monospace"; ctx.fillText("E TO SCAN · E TO RETURN", 380, 153);
        (this.sign.material as THREE.SpriteMaterial).map!.needsUpdate = true;
      }
    }
    const bike = state?.publiBikes?.get(this.local.body.vehicleId);
    this.battery.hidden = !this.net.canPlay || !bike;
    if (bike) this.battery.textContent = `PubliBike in use · ${Math.ceil(bike.batteryMs / 1000)}s battery`;
    const request = this.request; if (!request) return;
    if (!request.token || request.sent) return;
    const visual = this.vehicles.items.get(request.bikeId), tag = visual?.mesh.getObjectByName("PubliBike QR");
    if (!visual || !tag) { this.close(); return; }
    const dx = Number(this.held.has("KeyD") || this.held.has("ArrowRight")) - Number(this.held.has("KeyA") || this.held.has("ArrowLeft"));
    const dy = Number(this.held.has("KeyS") || this.held.has("ArrowDown")) - Number(this.held.has("KeyW") || this.held.has("ArrowUp"));
    this.targetYaw = THREE.MathUtils.clamp(this.targetYaw - dx * .65 * dt, -1.3, 1.3);
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - dy * .65 * dt, -1, 1);
    // At the browser edge, keep turning so every starting cursor position is solvable.
    const edge=this.mouse.edgeMovement(Math.min(dt,.1));
    if(edge.x||edge.y){this.aimed=true;this.targetYaw=THREE.MathUtils.clamp(this.targetYaw-edge.x,-1.3,1.3);this.targetPitch=THREE.MathUtils.clamp(this.targetPitch-edge.y,-1,1);}
    const blend = 1 - Math.exp(-18 * Math.min(dt, .1));
    this.yaw += (this.targetYaw - this.yaw) * blend; this.pitch += (this.targetPitch - this.pitch) * blend;
    this.camera.fov = bikePreviewFov(this.camera.aspect); this.camera.updateProjectionMatrix();
    visual.mesh.updateMatrixWorld(true);
    const eye = visual.mesh.localToWorld(new THREE.Vector3(-0.08, 1.4, -2.25)), target = tag.getWorldPosition(new THREE.Vector3());
    this.camera.position.copy(eye); this.camera.up.set(0, 1, 0); this.camera.lookAt(target);
    this.camera.rotateY(this.yaw); this.camera.rotateX(this.pitch); this.camera.updateMatrixWorld(true);
    const projected = target.clone().project(this.camera), point = bikePreviewTarget(projected.x, projected.y, this.camera.aspect);
    const finder = this.modal.querySelector(".bike-viewfinder")!.getBoundingClientRect();
    const aligned = this.aimed && projected.z >= -1 && projected.z <= 1 &&
      Math.abs((point.x - .5) * finder.width) < 17 && Math.abs((point.y - .5) * finder.height) < 17;
    this.modal.dataset.aligned = String(aligned);
    const moving = !!dx || !!dy || !!edge.x || !!edge.y || Math.hypot(this.yaw - this.lastAim.yaw, this.pitch - this.lastAim.pitch) > Math.max(0.001, dt * 0.04);
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
      request.sent = true; request.sentAt = this.net.now(); this.status.textContent = "Unlocking…"; this.net.room.send("bikeScanFinish", request);
    }
  }
  // MapViewer calls this immediately after its existing render; no extra renderer or loop.
  renderPreview() {
    if (!this.active) return;
    const crop = bikePreviewCrop(this.canvas.width, this.canvas.height);
    this.preview.getContext("2d")?.drawImage(this.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, this.preview.width, this.preview.height);
  }
  dispose() {
    this.close(); this.abort.abort(); this.net.onBikeUnlockResult = undefined;
    this.modal.remove(); this.battery.remove(); this.station.removeFromParent();
    this.station.traverse(o => { if (o instanceof THREE.LineSegments) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    this.station.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    disposeMap(this.station); (this.sign.material as THREE.SpriteMaterial).map?.dispose(); this.sign.material.dispose();
  }
}
