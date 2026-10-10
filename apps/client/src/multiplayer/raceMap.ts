import { examPortalPosition, isRideable, npcBounds, polybahnPath, tramPath, zurichWorld } from "@race/shared";
import data from "./city-map-data.json";
import type { Network } from "./net.ts";
import type { MapPoint, MapProjection } from "./raceHudModel.ts";
import { distanceToEth, projectPoint, zoomMap } from "./raceHudModel.ts";

export type EncounterMarker = MapPoint & { label: string };
const help = "Scroll to zoom · Drag to pan · + / − zoom · F fit all · C find me";
// Adapted from mini-games-2's map-controls and encounter-map. Drawn by MapGame's
// existing loop; the cartography uses the native LV95 origin and is cached once.
export class RaceMap {
  active = false;
  private root = document.querySelector<HTMLElement>("#city-map")!;
  private radar = document.querySelector<HTMLElement>("#race-radar")!;
  private mini = document.querySelector<HTMLCanvasElement>("#race-minimap")!;
  private canvas = document.querySelector<HTMLCanvasElement>("#city-map-canvas")!;
  private readout = document.querySelector<HTMLElement>("#map-readout")!;
  private zoomReadout = document.querySelector<HTMLOutputElement>("#map-zoom")!;
  private open = document.querySelector<HTMLButtonElement>("#open-city-map")!;
  private close = document.querySelector<HTMLButtonElement>("#close-city-map")!;
  private abort = new AbortController();
  private observer: ResizeObserver;
  private elapsed = 0;
  private zoom = 1;
  private projection?: MapProjection;
  private drag?: { id: number; x: number; y: number; view: MapProjection };
  private previousFocus?: HTMLElement;
  private resumeAfterClose = false;
  private chart = document.createElement("canvas");
  private bounds = npcBounds(zurichWorld);
  constructor(private net: Network, private player: () => MapPoint & { rotY: number; enabled: boolean },
    private encounters: () => EncounterMarker[], private available: () => boolean,
    private suspend: () => void, private resume: () => void) {
    this.makeChart();
    const options = { signal: this.abort.signal };
    this.open.addEventListener("click", () => this.show(), options);
    this.close.addEventListener("click", () => this.hide(), options);
    this.root.querySelector<HTMLElement>(".map-tools")!.addEventListener("click", event => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.map;
      if (action === "in") this.scale(1.4);
      if (action === "out") this.scale(1 / 1.4);
      if (action === "fit") this.fit();
      if (action === "player") this.findMe();
    }, options);
    this.canvas.addEventListener("wheel", event => {
      event.preventDefault(); const p = this.cursor(event);
      this.scale(Math.exp(-Math.max(-240, Math.min(240, event.deltaY)) * .002), p.x, p.y);
    }, { ...options, passive: false });
    this.canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !this.projection) return;
      const p = this.cursor(event); this.drag = { id: event.pointerId, ...p, view: { ...this.projection } };
      this.canvas.setPointerCapture(event.pointerId);
    }, options);
    this.canvas.addEventListener("pointermove", event => {
      const p = this.cursor(event), view = this.projection;
      if (!view) return;
      if (this.drag?.id === event.pointerId) {
        view.x = this.drag.view.x - (p.x - this.drag.x) / view.scale;
        view.z = this.drag.view.z - (p.y - this.drag.y) / view.scale; this.drawFull();
      } else {
        const marker = this.markers().map(m => ({ m, p: projectPoint(m, view) }))
          .find(m => Math.hypot(m.p.x - p.x, m.p.y - p.y) < 18);
        this.readout.textContent = marker?.m.label ?? help;
      }
    }, options);
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const)
      this.canvas.addEventListener(name, () => { this.drag = undefined; }, options);
    // Capture before the movement handlers so map shortcuts never punch or slide.
    window.addEventListener("keydown", event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || (event.target as HTMLElement)?.isContentEditable) return;
      if (!this.active) {
        if (event.code !== "KeyM" || event.repeat || !this.available()) return;
        event.preventDefault(); event.stopImmediatePropagation(); this.show(); return;
      }
      if (event.code === "Tab") {
        const buttons = [...this.root.querySelectorAll<HTMLButtonElement>("button")];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      } else if (["KeyM", "Escape"].includes(event.code)) { if (!event.repeat) this.hide(); }
      else if (["Equal", "NumpadAdd"].includes(event.code)) this.scale(1.4);
      else if (["Minus", "NumpadSubtract"].includes(event.code)) this.scale(1 / 1.4);
      else if (event.code === "KeyF") this.fit();
      else if (event.code === "KeyC") this.findMe();
      else if (this.projection && event.code.startsWith("Arrow")) {
        this.projection.x += (event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0) * 70 / this.projection.scale;
        this.projection.z += (event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0) * 70 / this.projection.scale; this.drawFull();
      }
      event.preventDefault(); event.stopImmediatePropagation();
    }, { ...options, capture: true });
    this.observer = new ResizeObserver(() => { if (this.active) this.drawFull(); }); this.observer.observe(this.canvas);
  }
  private cursor(event: MouseEvent) { const r = this.canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  private show() {
    if (!this.available() || this.active) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.resumeAfterClose = this.player().enabled;
    this.active = true; this.suspend(); this.root.hidden = false;
    this.fit(); this.close.focus();
  }
  private hide(restore = true) {
    if (!this.active) return;
    this.active = false; this.root.hidden = true; this.drag = undefined;
    if (restore && this.available()) {
      if (this.resumeAfterClose) this.resume();
      else this.previousFocus?.focus();
    }
  }
  private fit() { this.zoom = 1; this.projection = undefined; this.drawFull(); }
  private findMe() { if (!this.projection) return; const p = this.player(); this.projection.x = p.x; this.projection.z = p.z; this.scale(Math.max(3, this.zoom) / this.zoom); }
  private scale(factor: number, x?: number, y?: number) {
    if (!this.projection) return;
    const zoom = Math.max(1, Math.min(12, this.zoom * factor));
    this.projection = zoomMap(this.projection, zoom / this.zoom, x, y); this.zoom = zoom; this.drawFull();
  }
  private makeChart() {
    const b = zurichWorld.bounds; this.chart.width = b.maxX - b.minX; this.chart.height = b.maxZ - b.minZ;
    const ctx = this.chart.getContext("2d")!;
    ctx.fillStyle = "#233d3f"; ctx.fillRect(0, 0, this.chart.width, this.chart.height);
    ctx.translate(-b.minX, -b.minZ); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const path = (points: number[][]) => { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); };
    for (const water of data.water) { path(water); ctx.closePath(); ctx.fillStyle = "#366c7b"; ctx.fill(); }
    for (const road of data.streets) { path(road.points); ctx.strokeStyle = "#73928c"; ctx.lineWidth = road.width; ctx.stroke(); }
  }
  private markers(): EncounterMarker[] {
    const live = [...(this.net.room?.state.vehicles.values() ?? [])].filter(v => isRideable(v) && !v.derailStartedAt)
      .map(v => ({ x: v.x, z: v.z, label: v.kind === 6 ? "Polybahn" : v.kind === 5 ? "Tram" : v.kind === 2 ? "PubliBike" : "Ride" }));
    return [...this.encounters(), ...live];
  }
  private size(canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect(), width = Math.max(1, r.width), height = Math.max(1, r.height), dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, width, height };
  }
  private drawFull() {
    if (!this.active) return;
    const { width, height } = this.size(this.canvas), b = this.bounds;
    const base = Math.min((width - 60) / (b.maxX - b.minX), (height - 60) / (b.maxZ - b.minZ));
    const center = this.projection ?? { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    this.projection = { ...center, width, height, scale: Math.max(.01, base) * this.zoom };
    this.zoomReadout.value = `${Math.round(this.zoom * 100)}%`; this.draw(this.canvas, this.projection, true);
  }
  private draw(canvas: HTMLCanvasElement, view: MapProjection, full: boolean) {
    const { ctx, width, height } = this.size(canvas), b = zurichWorld.bounds;
    ctx.fillStyle = "#142b31"; ctx.fillRect(0, 0, width, height);
    const p = (point: MapPoint) => projectPoint(point, view);
    const corner = p({ x: b.minX, z: b.minZ });
    ctx.drawImage(this.chart, corner.x, corner.y, this.chart.width * view.scale, this.chart.height * view.scale);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const line = (points: readonly MapPoint[], color: string, dashed = false) => {
      ctx.beginPath(); points.forEach((point, i) => { const v = p(point); if (i) ctx.lineTo(v.x, v.y); else ctx.moveTo(v.x, v.y); });
      ctx.strokeStyle = color; ctx.lineWidth = full ? 3 : 2; ctx.setLineDash(dashed ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]);
    };
    line([...zurichWorld.route, examPortalPosition], "#ffd271");
    line(tramPath.points, "#75b9ff", true); line(polybahnPath.points, "#ff8eaa");
    const bounds = this.bounds, a = p({ x: bounds.minX, z: bounds.minZ }), c = p({ x: bounds.maxX, z: bounds.maxZ });
    ctx.strokeStyle = "#a1beb180"; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y); ctx.setLineDash([]);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const marker of this.markers()) {
      const v = p(marker); if (v.x < 0 || v.y < 0 || v.x > width || v.y > height) continue;
      ctx.font = `900 ${full ? 19 : 13}px system-ui`; ctx.lineWidth = 3; ctx.strokeStyle = "#142b31"; ctx.strokeText("?", v.x, v.y); ctx.fillStyle = "#d7f87a"; ctx.fillText("?", v.x, v.y);
    }
    for (const [id, player] of this.net.room?.state.players ?? []) {
      if (id === this.net.room.sessionId || this.net.room.state.members.get(id)?.spectator) continue;
      const v = p(player); ctx.beginPath(); ctx.arc(v.x, v.y, full ? 5 : 3, 0, Math.PI * 2); ctx.fillStyle = "#ec9dce"; ctx.fill();
    }
    for (const [point, label, color] of [[zurichWorld.spawn, "HB / START", "#c4ded2"], [examPortalPosition, "ETH HG / EXAM", "#ffd271"]] as const) {
      const v = p(point); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(v.x, v.y, full ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      if (full) { ctx.font = "bold 11px system-ui"; const w = ctx.measureText(label).width; ctx.fillStyle = "#10242eef"; ctx.fillRect(v.x - w / 2 - 7, v.y - 28, w + 14, 20); ctx.fillStyle = color; ctx.fillText(label, v.x, v.y - 18); }
    }
    const local = this.player(), v = p(local);
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(Math.PI - local.rotY); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-6, 6); ctx.lineTo(0, 3); ctx.lineTo(6, 6); ctx.closePath(); ctx.fillStyle = "#74d8ff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); ctx.restore();
    if (!full) {
      // Keep the finish direction visible when it is outside the local radar.
      const goal = p(examPortalPosition), center = p(local), dx = goal.x - center.x, dy = goal.y - center.y;
      if (goal.x < 10 || goal.y < 10 || goal.x > width - 10 || goal.y > height - 10) {
        const ratio = Math.min((width / 2 - 12) / Math.max(.001, Math.abs(dx)), (height / 2 - 12) / Math.max(.001, Math.abs(dy)));
        ctx.fillStyle = "#ffd271"; ctx.font = "bold 15px system-ui"; ctx.fillText("◆", center.x + dx * ratio, center.y + dy * ratio);
      }
    }
  }
  update(dt: number, visible: boolean) {
    this.radar.hidden = !visible;
    if (!visible) this.hide(false);
    this.elapsed += dt; if (!visible || this.elapsed < .1) return; this.elapsed = 0;
    const local = this.player(), { width, height } = this.size(this.mini);
    this.draw(this.mini, { ...local, width, height, scale: width / 380 }, false);
    document.querySelector<HTMLElement>("#eth-distance")!.textContent = `${Math.round(distanceToEth(local))} m`;
    if (this.active) this.drawFull();
  }
  dispose() { this.hide(false); this.abort.abort(); this.observer.disconnect(); this.radar.hidden = true; this.chart.width = this.chart.height = 1; }
}
