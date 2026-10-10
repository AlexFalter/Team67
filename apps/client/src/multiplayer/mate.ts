import * as THREE from "three";
import * as C from "@race/shared";
import type { Network } from "./net.ts";
import type { LocalPlayer } from "./localPlayer.ts";
import { loadMateModel } from "./mateModel.ts";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";
import "./mate.css";

export class MateFeature {
  readonly ready: Promise<void>;
  readonly machine = new THREE.Group();
  readonly prize = new THREE.Group();
  private abort = new AbortController();
  private modal = document.createElement("section");
  private inventory = document.createElement("aside");
  private hint = document.createElement("div");
  private effects = document.createElement("div");
  private panel: HTMLElement;
  private card: HTMLInputElement;
  private message: HTMLElement;
  private buttons: HTMLButtonElement[];
  private pending = false;
  private pendingAt = 0;
  private lastPhase = "";
  private savedView?: { position: THREE.Vector3; quaternion: THREE.Quaternion; up: THREE.Vector3; fov: number };
  private ray = new THREE.Raycaster();
  private collectionBox: THREE.Mesh;
  private cans: THREE.Group[] = [];
  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private net: Network, private local: LocalPlayer, private canvas: HTMLCanvasElement) {
    this.machine.name = "El Tony Mate vending machine";
    this.machine.position.copy(C.mateSite(C.zurichWorld));
    this.prize.name = "Collectible Mate can"; this.prize.visible = false; this.machine.add(this.prize);
    this.collectionBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, .36, .28), new THREE.MeshBasicMaterial({ visible: false }));
    this.collectionBox.position.set(.34, .35, -.4); this.machine.add(this.collectionBox); scene.add(this.machine);
    this.ready = Promise.allSettled([loadMateModel("mate-machine", this.abort.signal), ...(["mate-can-basic", "mate-can-light", "mate-can-mint", "mate-can-ginger"] as const).map(name => loadMateModel(name, this.abort.signal))]).then(results => {
      const failure = results.find(r => r.status === "rejected");
      if (failure || this.abort.signal.aborted) {
        results.forEach(r => { if (r.status === "fulfilled") disposeMap(r.value); });
        if (failure?.status === "rejected") throw failure.reason; this.abort.signal.throwIfAborted();
      }
      const [machine, ...cans] = results.map(r => (r as PromiseFulfilledResult<THREE.Group>).value);
      this.machine.add(machine); this.cans = cans;
      cans.forEach((can, i) => { can.position.y = -.145; can.visible = i === this.state?.selected; this.prize.add(can); });
    });
    const asset = (path: string) => `${import.meta.env.BASE_URL}assets/tony-mate/${path}`;
    this.modal.id = "mate-minigame"; this.modal.hidden = true;
    this.modal.innerHTML = `<section class="mate-cabinet" role="dialog" aria-modal="true" aria-label="El Tony Mate vending machine"><p class="mate-message" role="status" aria-live="polite"></p><small class="mate-detail"></small><div class="mate-loading-track"><i></i></div><div class="mate-selections">${C.MATE_FLAVORS.map((flavor, i) => `<button type="button" class="mate-selection" data-flavor="${i}"><span>0${i + 1} · ${flavor}<small>330 ml · CHF 3.50</small></span><img src="${asset(`cans/${flavor.toLowerCase()}.png`)}" alt="${flavor} can"></button>`).join("")}</div><p class="mate-selection-required" role="status">You have to select something.</p><label class="mate-payment-slot" hidden>SWIPE CARD →<input disabled id="mate-card" type="range" min="0" max="100" step="25" value="0" aria-label="Swipe card to pay CHF 3.50"><small class="mate-card-status">Select a flavor first</small></label><div class="mate-collection-hint" hidden><b>CLICK THE CAN IN THE DISPENSER</b><small>Enter also collects your Mate.</small><button type="button" class="mate-collect-back">Back · Esc</button></div><button type="button" class="mate-close">Step away · Esc</button></section>`;
    this.panel = this.modal.querySelector<HTMLElement>(".mate-cabinet")!;
    this.card = this.modal.querySelector<HTMLInputElement>("input")!;
    this.message = this.modal.querySelector<HTMLElement>(".mate-message")!;
    this.buttons = Array.from(this.modal.querySelectorAll<HTMLButtonElement>(".mate-selection"));
    this.inventory.id = "mate-inventory"; this.inventory.hidden = true;
    this.inventory.innerHTML = `<button type="button" id="use-mate"><img src="${asset("cans/mint.png")}" alt="Mint Mate"><span>El Tony Mate <b></b><small>1 · Drink · +35% speed / 15s</small></span></button><div role="status"></div>`;
    this.hint.id = "mate-hint"; this.hint.hidden = true;
    this.effects.id = "mate-speed-effects"; this.effects.hidden = true; this.effects.setAttribute("aria-hidden", "true");
    canvas.parentElement!.append(this.modal, this.inventory, this.hint, this.effects);
    const options = { signal: this.abort.signal };
    this.buttons.forEach((button, flavor) => button.addEventListener("click", () => this.send("select", flavor), options));
    for (const button of this.modal.querySelectorAll(".mate-close, .mate-collect-back")) button.addEventListener("click", () => this.close(), options);
    this.card.addEventListener("change", () => { if (Number(this.card.value) === 100) this.send("pay"); }, options);
    this.card.addEventListener("pointerup", () => { if (Number(this.card.value) < 100) this.card.value = "0"; }, options);
    this.card.addEventListener("pointerdown", e => { if (Number(this.card.value) === 0 && e.clientX > this.card.getBoundingClientRect().left + 70) e.preventDefault(); }, options);
    this.inventory.querySelector("button")!.addEventListener("click", () => this.send("use"), options);
    window.addEventListener("keydown", e => {
      if (this.active) {
        if (e.code === "Escape") { e.preventDefault(); this.close(); }
        else if (e.code === "Enter" && this.state?.phase === "collect") { e.preventDefault(); this.send("collect"); }
        else if (e.code === "Tab") {
          const elements = Array.from(this.panel.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")).filter(element => !element.disabled && element.getClientRects().length);
          const index = elements.indexOf(document.activeElement as HTMLButtonElement);
          e.preventDefault(); elements[(index + (e.shiftKey ? -1 : 1) + elements.length) % elements.length]?.focus();
        }
      } else if (e.code === "Digit1" && !e.repeat && this.local.enabled && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); this.send("use"); }
    }, options);
    canvas.addEventListener("pointerdown", e => {
      if (!this.active || this.state?.phase !== "collect" || e.button !== 0) return;
      const rect = canvas.getBoundingClientRect(); this.ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), camera);
      if (this.ray.intersectObjects([this.prize, this.collectionBox], true).length) { e.preventDefault(); this.send("collect"); }
    }, options);
    window.addEventListener("blur", () => this.close(), options);
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.close(); }, options);
    net.onMateResult = result => {
      this.pending = false;
      if (!result.ok) this.message.textContent = result.message;
      if (result.ok && result.action === "collect") this.close(false);
    };
  }
  get active() { return !this.modal.hidden; }
  private get state() { return this.net.room?.state?.mates?.get(this.net.room.sessionId); }
  get nearby() { return this.net.canPlay && !this.local.body.vehicleId && C.nearMate(this.local.body, C.zurichWorld); }
  get canConsume() { const p = this.local.body; return !this.pending && !this.active && !p.vehicleId && p.mateCount > 0 && p.mateBoostMs <= 0 && p.knockdownUntil <= this.net.now(); }
  consume() { if (this.canConsume) this.send("use"); }
  interact() {
    if (!this.net.canPlay || this.local.body.vehicleId || !C.nearMate(this.local.body, C.zurichWorld)) return false;
    if (this.local.body.knockdownUntil > this.net.now()) return true;
    this.modal.hidden = false; this.pending = false; this.local.enabled = false; this.local.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.savedView = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), up: this.camera.up.clone(), fov: this.camera.fov };
    this.lastPhase = ""; this.update();
    (this.buttons.find(button => !button.disabled) ?? this.modal.querySelector<HTMLButtonElement>(".mate-collect-back")!).focus();
    return true;
  }
  private send(action: C.MateCommand["action"], flavor?: number) {
    if (!this.net.canPlay || this.pending || (action !== "use" && !this.active)) return;
    if (action === "use" && (this.active || this.local.body.vehicleId || !this.local.body.mateCount || this.local.body.mateBoostMs > 0)) return;
    this.pending = true; this.pendingAt = this.net.now();
    this.net.room.send("mate", { action, flavor, roundStartedAt: this.net.room.state.startedAt } satisfies C.MateCommand);
  }
  close(cancel = true) {
    if (!this.active) return;
    if (cancel && this.net.status === "Connected") this.net.room.send("mate", { action: "close", roundStartedAt: this.net.room.state.startedAt });
    this.modal.hidden = true; this.pending = false;
    if (this.savedView) { this.camera.position.copy(this.savedView.position); this.camera.quaternion.copy(this.savedView.quaternion); this.camera.up.copy(this.savedView.up); this.camera.fov = this.savedView.fov; this.camera.updateProjectionMatrix(); this.savedView = undefined; }
  }
  update() {
    const now = this.net.now(), state = this.state, p = this.local.body;
    if (this.pending && now - this.pendingAt > 5000) this.pending = false;
    if (this.active && (!this.net.canPlay || p.vehicleId || p.knockdownUntil > now || !C.nearMate(p, C.zurichWorld))) this.close();
    this.modal.querySelector<HTMLElement>(".mate-payment-slot")!.hidden = state?.phase !== "payment";
    this.modal.querySelector<HTMLElement>(".mate-selection-required")!.hidden = !!state && !["idle", "failure"].includes(state.phase);
    const physical = state?.phase === "dropping" || state?.phase === "collect";
    this.cans.forEach((can, i) => { can.visible = i === state?.selected; });
    this.prize.visible = !!physical && this.net.canPlay;
    if (physical) { const pose = C.mateCanDropPose((now - state!.dropStartedAt) / 1000); this.prize.position.set(pose.x, pose.y, pose.z); this.prize.rotation.set(pose.roll, 0, -Math.PI / 2 + pose.tilt); }
    this.hint.hidden = !this.net.canPlay || !this.local.enabled || !!p.vehicleId || !C.nearMate(p, C.zurichWorld);
    this.hint.textContent = state?.phase === "success" ? "El Tony Mate · collected" : "E · El Tony Mate vending machine";
    this.inventory.hidden = !this.net.canPlay || (!p.mateCount && !p.mateBoostMs);
    const flavor = C.MATE_FLAVORS[state?.selected ?? 2];
    if (flavor) {
      const image = this.inventory.querySelector<HTMLImageElement>("img")!;
      const source = `${import.meta.env.BASE_URL}assets/tony-mate/cans/${flavor.toLowerCase()}.png`;
      if (image.getAttribute("src") !== source) { image.src = source; image.alt = `${flavor} Mate`; }
    }
    this.inventory.querySelector("b")!.textContent = `×${p.mateCount}`;
    this.inventory.querySelector<HTMLButtonElement>("button")!.disabled = this.pending || this.active || !p.mateCount || p.mateBoostMs > 0 || !!p.vehicleId || p.knockdownUntil > now;
    this.inventory.querySelector("[role=status]")!.textContent = p.mateBoostMs > 0 ? `Mate rush · +35% · ${Math.ceil(p.mateBoostMs / 1000)}s${p.vehicleId ? " · paused while riding" : ""}` : "";
    this.effects.hidden = !this.net.canPlay || this.active || !!p.vehicleId || p.mateBoostMs <= 0 || Math.hypot(p.vx, p.vz) < .2;
    if (!this.active || !state) return;
    this.modal.dataset.phase = state.phase;
    this.buttons.forEach((button, i) => {
      const tried = !!(state.tried & (1 << i));
      const soldOut = tried && (i !== state.selected || state.phase === "failure");
      button.disabled = this.pending || !["idle", "failure"].includes(state.phase) || tried || now < state.retryAt;
      button.dataset.soldOut = String(soldOut);
      button.classList.toggle("selected", state.phase !== "idle" && i === state.selected);
      button.querySelector("small")!.textContent = soldOut ? "Sold out · try another" : "330 ml · CHF 3.50";
    });
    if (state.phase !== this.lastPhase) { this.card.value = "0"; this.lastPhase = state.phase; }
    this.card.disabled = this.pending || state.phase !== "payment";
    this.message.classList.toggle("mate-message-failure", state.phase === "failure" && !this.pending);
    this.message.textContent = this.pending ? "Please wait…" : ({ idle: "Select your Mate", payment: "Swipe to pay", loading: "Please wait", failure: "Sold out · try another", dropping: "Dispensing can", collect: "Take your can", success: "Mate acquired" } as Record<string, string>)[state.phase];
    this.modal.querySelector(".mate-detail")!.textContent = now < state.retryAt ? `Retry in ${((state.retryAt - now) / 1000).toFixed(1)}s · payment refunded` : state.phase === "payment" ? `${C.MATE_FLAVORS[state.selected]} · CHF 3.50` : physical ? "Collect from the tray below" : "";
    this.modal.querySelector<HTMLElement>(".mate-loading-track i")!.style.width = state.phase === "loading" ? `${Math.max(0, Math.min(100, (1 - (state.readyAt - now) / C.MATE_LOADING_MS) * 100))}%` : "0%";
    this.modal.querySelector(".mate-card-status")!.textContent = state.phase === "payment" ? "Drag the card all the way right" : state.phase === "failure" ? "Payment refunded" : "Select a flavor first";
    this.modal.querySelector<HTMLElement>(".mate-collection-hint")!.hidden = !physical;
    this.modal.querySelector(".mate-collection-hint b")!.textContent = state.phase === "dropping" ? "Dispensing Mate…" : "Click the can in the dispenser";
    const mobile = this.camera.aspect < .8, x = mobile ? physical ? -.3 : -.58 : 0, y = mobile && !physical ? 1.44 : 1.34;
    this.camera.fov = mobile ? 55 : 50; this.camera.up.set(0, 1, 0); this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.machine.localToWorld(new THREE.Vector3(x, y, mobile ? physical ? -3.7 : -3 : -3.5)));
    this.camera.lookAt(this.machine.localToWorld(new THREE.Vector3(x, y, -.45))); this.camera.updateMatrixWorld(true);
    const rect = this.canvas.getBoundingClientRect();
    const points = [[-.91, .56], [-.91, 2.32], [-.25, .56], [-.25, 2.32]].map(([x, y]) => this.machine.localToWorld(new THREE.Vector3(x, y, -.515)).project(this.camera));
    const xs = points.map(p => rect.left + (p.x + 1) * rect.width / 2), ys = points.map(p => rect.top + (1 - p.y) * rect.height / 2);
    Object.assign(this.panel.style, { left: `${Math.min(...xs)}px`, top: `${Math.min(...ys)}px`, width: `${Math.max(...xs) - Math.min(...xs)}px`, height: `${Math.max(...ys) - Math.min(...ys)}px` });
  }
  dispose() { this.close(); this.abort.abort(); this.net.onMateResult = undefined; this.modal.remove(); this.inventory.remove(); this.hint.remove(); this.effects.remove(); this.machine.removeFromParent(); disposeMap(this.machine); }
}
