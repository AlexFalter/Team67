import * as THREE from "three";
import * as C from "@race/shared";
import {transitStatus} from "./transitStatus.ts";
import type { Network } from "./net.ts";
import { loadPubliBikeModel } from "./publiBikeModel.ts";
import { disposeMap } from "../maps/zurich/loadZurichMap.ts";
import { loadTransitModels } from "./transitModels.ts";
import {createTramBoardingZone, updateTramBoardingZone} from "./tramBoardingZone.ts";
import {createTramConnector, updateTramConnector, disposeTramConnector} from "./tramConnectors.ts";
const tramLabelBounds = new THREE.Box3();
import {TramExplosions} from "./tramExplosions.ts";
interface Snapshot extends C.VehicleState {
  t: number;
}
interface Visual {
  mesh: THREE.Group;
  rendered: C.VehicleState;
  latest: C.VehicleState;
  snapshots: Snapshot[];
  label: THREE.Sprite;
  canvas: HTMLCanvasElement;
  labelText: string;
  railCars?: THREE.Group[];
  railConnectors?: THREE.Group[];
  boardingZone?: THREE.Group;
  explosions?: TramExplosions;
}
export class Vehicles {
  readonly publiReady: Promise<void>;
  readonly transitReady: Promise<void>;
  private abort = new AbortController();
  private publiModel?: Awaited<ReturnType<typeof loadPubliBikeModel>>;
  private transitModels?: Awaited<ReturnType<typeof loadTransitModels>>;
  items = new Map<string, Visual>();
  private prediction = C.createVehicle();
  private drivenId = "";
  private platforms: THREE.Mesh[] = [];
  private message = "";
  private messageUntil = 0;
  private lastLabels = 0;
  constructor(
    private scene: THREE.Scene,
    private net: Network,
    private controls: HTMLDivElement,
  ) {
    this.transitReady = loadTransitModels(this.abort.signal).then(models => {
      if (this.abort.signal.aborted) { models.dispose(); return; }
      this.transitModels = models;
      for (const visual of this.items.values()) if (C.isRail(visual.latest)) this.replaceRail(visual);
    });
    this.publiReady = loadPubliBikeModel(this.abort.signal).then(model => {
      if (this.abort.signal.aborted) { model.dispose(); return; }
      this.publiModel = model;
      for (const [id, visual] of this.items) if (id.startsWith("publibike-")) this.replacePubliBike(id, visual);
    });
    net.vehicleMove = () => this.drivenId ? [this.drivenId, this.prediction.x, this.prediction.z,
      this.prediction.rotY, this.prediction.vx, this.prediction.vz] : undefined;
    net.onVehicleResult = (result) => {
      this.message = result.message;
      this.messageUntil = Date.now() + 2000;
    };
    C.zurichWorld.stops.forEach((stop, i) => {
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.08, 7),
        new THREE.MeshStandardMaterial({
          color: i === 0 ? "#dba347" : "#5999d6",
          roughness: 1,
        }),
      );
      platform.position.set(stop.x, stop.y + 0.045, stop.z);
      platform.receiveShadow = true;
      this.scene.add(platform);
      this.platforms.push(platform);
    });
  }
  patch(state: C.WorldState) {
    for (const [id, v] of state.vehicles) {
      let visual = this.items.get(id);
      if (!visual) {
        visual = this.create(v);
        if (C.isRail(v) && this.transitModels) this.replaceRail(visual);
        if (state.publiBikes.has(id) && this.publiModel) this.replacePubliBike(id, visual);
        this.items.set(id, visual);
        this.scene.add(visual.mesh);
      }
      C.snapshot(v, visual.latest);
      const bike = state.publiBikes.get(id);
      if (bike) visual.mesh.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          if (mat instanceof THREE.MeshStandardMaterial && mat.name.includes("berry enamel"))
            mat.color.copy(state.goldPubliBikes !== false && !bike.broken && bike.batteryMs > 0 ? new THREE.Color("#ffd174") : mat.userData.originalColor ?? mat.color);
        }
      });
      const snapshot: Snapshot = {
        ...C.snapshot(v, C.createVehicle()),
        t: state.serverTime,
      };
      if (visual.snapshots.at(-1)?.t === snapshot.t)
        visual.snapshots[visual.snapshots.length - 1] = snapshot;
      else visual.snapshots.push(snapshot);
      while (
        visual.snapshots.length > 2 &&
        visual.snapshots[1].t < snapshot.t - 1000
      )
        visual.snapshots.shift();
    }
    for (const [id, v] of this.items)
      if (!state.vehicles.has(id)) {
        v.explosions?.dispose();
        v.railConnectors?.forEach(disposeTramConnector);
        disposeMap(v.mesh);
        (v.label.material as THREE.SpriteMaterial).map?.dispose();
        v.label.material.dispose();
        v.mesh.removeFromParent();
        this.items.delete(id);
      }
  }
  private replacePubliBike(id: string, visual: Visual) {
    for (const child of [...visual.mesh.children]) if (child !== visual.label) { disposeMap(child); child.removeFromParent(); }
    visual.mesh.add(this.publiModel!.create(Number(id.split("-")[1])));
  }
  private replaceRail(visual: Visual) {
    visual.explosions?.dispose();
    visual.railConnectors?.forEach(disposeTramConnector);
    for (const child of [...visual.mesh.children]) if (child !== visual.label) { disposeMap(child); child.removeFromParent(); }
    visual.railCars = Array.from({ length: visual.latest.kind === C.TRAM_KIND ? 3 : 1 }, () => this.transitModels!.create(visual.latest.kind === C.TRAM_KIND));
    visual.mesh.add(...visual.railCars); visual.label.scale.set(3.5, .5, 1);
    visual.railConnectors = visual.latest.kind === C.TRAM_KIND ? visual.railCars.slice(1).map(() => createTramConnector()) : [];
    if (visual.railConnectors.length) visual.mesh.add(...visual.railConnectors);
    visual.explosions=visual.latest.kind===C.TRAM_KIND?new TramExplosions():undefined;
    if(visual.explosions)visual.mesh.add(visual.explosions);
    if (C.isRail(visual.latest)) {
      visual.boardingZone=createTramBoardingZone(visual.latest.kind); visual.boardingZone.visible=false;visual.mesh.add(visual.boardingZone);
    }
  }
  private create(v: C.VehicleState): Visual {
    const mesh = new THREE.Group(),
      shuttle = v.kind === 1;
    const box = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      color: string,
    ) => {
      const part = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
      );
      part.position.set(x, y, z);
      part.castShadow = true;
      part.receiveShadow = true;
      mesh.add(part);
    };
    box(
      shuttle ? 2.7 : 1.5,
      0.65,
      shuttle ? 4.5 : 2.1,
      0,
      0.65,
      0,
      shuttle ? "#339bba" : "#e59c40",
    );
    box(shuttle ? 2.4 : 1.25, 0.35, 0.65, 0, 1, shuttle ? 1.7 : 0.8, "#dce8ed");
    if (v.kind === 2) {
      // Reuse the lightweight vehicle root, with a narrow bicycle silhouette.
      mesh.children.forEach((child) => { (child as THREE.Mesh).geometry.dispose(); ((child as THREE.Mesh).material as THREE.Material).dispose(); });
      mesh.clear();
      box(0.12, 0.12, 1.3, 0, 0.7, 0, "#80dbb5");
      box(0.12, 0.6, 0.12, 0, 0.65, 0, "#80dbb5");
      box(0.4, 0.12, 0.35, 0, 1, 0, "#182430");
      box(0.7, 0.1, 0.1, 0, 1.2, 0.55, "#dce8ed");
      for (const z of [-0.6, 0.6]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 16), new THREE.MeshStandardMaterial({ color: "#182430" }));
        wheel.rotation.y = Math.PI / 2; wheel.position.set(0, 0.42, z); mesh.add(wheel);
      }
    }
    if (v.kind === 4) {
      mesh.children.forEach((child) => { (child as THREE.Mesh).geometry.dispose(); ((child as THREE.Mesh).material as THREE.Material).dispose(); });
      mesh.clear();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(C.vehicleRadius(v), 16, 12), new THREE.MeshStandardMaterial({ color: "#e777a9", roughness: 0.7 }));
      ball.position.y = C.vehicleRadius(v); ball.castShadow = true; mesh.add(ball);
    }
    if (shuttle) {
      box(0.15, 0.35, 4.3, -1.3, 1.1, 0, "#dce8ed");
      box(0.15, 0.35, 4.3, 1.3, 1.1, 0, "#dce8ed");
      box(2.8, 0.15, 4.6, 0, 2.3, 0, "#e3e7da");
      for (const x of [-1.25, 1.25]) for (const z of [-1.8, 0, 1.8]) box(0.10, 1.1, 0.12, x, 1.75, z, "#e3e7da");
      box(2.4, 0.7, 0.06, 0, 1.7, 2.15, "#78b8c6");
      box(2.2, 0.10, 0.12, 0, 0.85, 2.2, "#ffe8a0");
    }
    for (let side = -1; v.kind !== 2 && v.kind !== 4 && side <= 1; side += 2)
      for (let axle = -1; axle <= 1; axle += 2) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.38, 0.25, 10),
          new THREE.MeshStandardMaterial({ color: "#192430" }),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(
          side * (shuttle ? 1.4 : 0.8),
          0.4,
          axle * (shuttle ? 1.5 : 0.65),
        );
        wheel.castShadow = true;
        mesh.add(wheel);
      }
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 160;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, toneMapped: false, depthWrite: false }),
    );
    label.position.y = 2.8;
    label.scale.set(shuttle ? 3.5 : 2.8, (shuttle ? 3.5 : 2.8) * 160 / 1024, 1);
    mesh.add(label);
    return {
      mesh,
      rendered: C.snapshot(v, C.createVehicle()),
      latest: C.snapshot(v, C.createVehicle()),
      snapshots: [],
      label,
      canvas,
      labelText: "",
    };
  }
  render(t: number, dt = 1 / 60, filter: "all" | "rail" | "other" = "all") {
    for (const [id, v] of this.items) {
      if ((filter === "rail" && !C.isRail(v.latest)) || (filter === "other" && C.isRail(v.latest))) continue;
      if (id === this.drivenId) Object.assign(v.rendered, this.prediction);
      else {
        let a = v.snapshots[0],
          b = a;
        for (let i = 1; i < v.snapshots.length; i++) {
          b = v.snapshots[i];
          if (b.t >= t) break;
          a = b;
        }
        const f =
          a === b ? 0 : THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
        Object.assign(v.rendered, b);
        v.rendered.x = a.x + (b.x - a.x) * f;
        v.rendered.y = a.y + (b.y - a.y) * f;
        v.rendered.z = a.z + (b.z - a.z) * f;
        v.rendered.rotY =
          a.rotY +
          Math.atan2(Math.sin(b.rotY - a.rotY), Math.cos(b.rotY - a.rotY)) * f;
        v.rendered.railDistance = a.railDistance + (b.railDistance - a.railDistance) * f;
        if(v.rendered.derailStartedAt){const clock=this.net.room?.state.phase===C.RoomPhase.Finished?this.net.room.state.finishedAt:t;v.rendered.derailAge=Math.min(8,Math.max(0,(clock-v.rendered.derailStartedAt)/1000));}
        if (C.isRail(v.rendered)) {
          if (v.rendered.traveling && this.net.room?.state.phase !== C.RoomPhase.Finished) C.railMotion(v.rendered, t, !this.net.room?.state.railCrashProtection);
          else Object.assign(v.rendered, C.railFrame(v.rendered));
        }
      }
      this.pose(v, t, dt);
    }
  }
  private pose(v: Visual, t: number, dt: number) {
    if (C.isRail(v.rendered)) {
      const frame = C.railFrame(v.rendered);
      v.mesh.position.set(frame.x, frame.y, frame.z); v.mesh.rotation.set(0, 0, 0);
      for (const [part, car] of (v.railCars ?? []).entries()) {
        const f = C.tramDerailFrame(v.rendered, part); car.position.set(f.x - frame.x, f.y - frame.y, f.z - frame.z);
        car.rotation.set(-f.pitch, f.rotY + Math.PI, f.roll, "YXZ");
        if (v.rendered.kind === C.POLYBAHN_KIND) {
          const latest = v.latest;
          const clock = this.net.room?.state.phase === C.RoomPhase.Finished ? this.net.room.state.finishedAt : t;
          const open = !latest.traveling ? (latest.departureAt ? THREE.MathUtils.clamp((latest.departureAt + C.TRANSIT_DOOR_MS - clock) / C.TRANSIT_DOOR_MS, 0, 1) : 1)
            : clock < latest.tripStartedAt ? THREE.MathUtils.clamp((latest.tripStartedAt - clock) / C.TRANSIT_DOOR_MS, 0, 1)
            : THREE.MathUtils.clamp((clock - (latest.arrivalAt - C.TRANSIT_DOOR_MS)) / C.TRANSIT_DOOR_MS, 0, 1);
          for (const side of [-1, 1]) for (const leaf of [-1, 1]) {
            const door = car.getObjectByName(`Door_${side}_${leaf}`); if (door) door.position.z = leaf * open * .52;
          }
          for (const name of ["Axle_front", "Axle_rear"]) { const axle = car.getObjectByName(name); if (axle) axle.rotation.x = -v.rendered.railDistance / .24; }
        }
      }
      v.railConnectors?.forEach((connector, i) => {connector.visible=!v.rendered.derailStartedAt;if(connector.visible)updateTramConnector(connector, v.railCars![i], v.railCars![i + 1]);});
      v.explosions?.update(v.rendered);
      const middleCar = v.railCars?.[v.rendered.kind === C.TRAM_KIND ? 1 : 0];
      if (middleCar) {
        middleCar.updateWorldMatrix(true, true);
        tramLabelBounds.setFromObject(middleCar);
        v.label.position.set(middleCar.position.x, tramLabelBounds.max.y - frame.y + .4 + v.label.scale.y / 2, middleCar.position.z);
      } else {
        const boarding = C.railBoardingPoint(v.rendered);
        v.label.position.set(boarding.x - frame.x, boarding.y - frame.y + 3, boarding.z - frame.z);
      }
      return;
    }
    v.mesh.position.set(v.rendered.x, v.rendered.y, v.rendered.z);
    v.mesh.rotation.y = v.rendered.rotY;
    if (v.rendered.kind === 2) {
      const speed = v.rendered.vx * Math.sin(v.rendered.rotY) + v.rendered.vz * Math.cos(v.rendered.rotY);
      for (const name of ["PubliBike FrontWheel", "PubliBike RearWheel"]) {
        const wheel = v.mesh.getObjectByName(name); if (wheel) wheel.rotation.x += speed * dt / (0.62 * 0.68);
      }
    }
    const fallen = v.rendered.kind === 2 && v.rendered.fallenUntil > t;
    v.mesh.rotation.z = THREE.MathUtils.lerp(v.mesh.rotation.z, fallen ? -1.42 : 0, 1 - Math.exp(-9 * dt));
    // Rotate about the tyre contact rather than burying the frame underground.
    v.mesh.position.y += Math.abs(Math.sin(v.mesh.rotation.z)) * 0.11;
    v.label.position.set(Math.sin(v.mesh.rotation.z) * 2.8, Math.cos(v.mesh.rotation.z) * 2.8, 0);
  }
  local(body: C.Body, sessionId: string) {
    const visual = this.items.get(body.vehicleId);
    if (!visual) {
      this.drivenId = "";
      return;
    }
    if (!C.isPassengerVehicle(visual.latest) && visual.latest.driver === sessionId) {
      this.drivenId = body.vehicleId;
      Object.assign(this.prediction, visual.latest, { x: body.x, y: body.y - (body.vehicleKind === 2 ? C.BIKE_SEAT_HEIGHT : C.CART_SEAT_HEIGHT), z: body.z, rotY: body.rotY, vx: body.vx, vz: body.vz });
      Object.assign(visual.rendered, this.prediction);
    } else this.drivenId = "";
    if (!this.drivenId) C.seatPosition(visual.rendered, body.seat, body);
    body.rotY = C.passengerYaw(visual.rendered, body.seat);
    body.vx = visual.rendered.vx;
    body.vy = 0;
    body.vz = visual.rendered.vz;
    body.anim = 0;
    body.grounded = false;
  }
  stopDriving() {
    this.drivenId = "";
  }
  private nearest(body: C.Body) {
    let closest = "",
      distance = Infinity;
    for (const [id, v] of this.items) {
      if (C.isRail(v.latest) && (v.latest.traveling || (v.latest.departureAt && this.net.now()>=v.latest.departureAt))) continue;
      if (v.latest.fallenUntil > this.net.now() || (!C.isPassengerVehicle(v.latest) && v.latest.driver)) continue;
      if (this.net.room?.state.publiBikes.get(id)?.reservedBy) continue;
      const boarding = C.isRail(v.latest) ? C.railBoardingPoint(v.rendered) : v.rendered;
      const d = Math.hypot(body.x - boarding.x, body.z - boarding.z);
      if (!C.isRideable(v.latest) || Math.abs(body.y - boarding.y) > C.VEHICLE_BOARD_HEIGHT) continue;
      if (d <= (C.isRail(v.latest) ? C.railBoardingDistance(v.latest) : C.VEHICLE_BOARD_DISTANCE) && d < distance) {
        closest = id;
        distance = d;
      }
    }
    return closest;
  }
  interact(body: C.Body) {
    if (body.vehicleId) this.net.room.send("vehicleExit");
    else {
      const id = this.nearest(body);
      if (id) this.net.room.send("vehicleEnter", id);
    }
  }
  interactionKind(body: C.Body) {
    const v = this.items.get(body.vehicleId || this.nearest(body))?.latest;
    return v ? v.kind === 2 ? "bike" : v.kind === C.POLYBAHN_KIND ? "polybahn" : C.isPassengerVehicle(v) ? "tram" : "cart" : undefined;
  }
  nearestId(body: C.Body) { return this.nearest(body); }
  updateLabels(body: C.Body, now: number) {
    for(const visual of this.items.values())if(visual.boardingZone)
      updateTramBoardingZone(visual.boardingZone,visual.latest,visual.rendered,body,this.net.now(),this.net.canPlay);
    if (now - this.lastLabels < 250) return;
    this.lastLabels = now;
    const state = this.net.room?.state;
    const nearest = this.nearest(body);
    const clock = state?.phase === C.RoomPhase.Finished ? state.finishedAt : this.net.now();
    for (const [id, visual] of this.items) {
      const v = visual.latest;
      const boarding=C.isRail(v)?C.railBoardingPoint(visual.rendered):visual.rendered;
      const nearbyRail=C.isRail(v)&&Math.hypot(body.x-boarding.x,body.z-boarding.z)<25;
      visual.label.visible = id === body.vehicleId || (!body.vehicleId && (id === nearest || nearbyRail));
      let count = 0;
      for (const p of state?.players?.values() ?? [])
        if (p.vehicleId === id) count++;
      const text =
        C.isRail(v) ? `${C.transitName(v).toUpperCase()} ${count}/${v.capacity} · ${transitStatus(v,clock)}` :
        state?.publiBikes?.has(id)
          ? `PUBLIBIKE · ${state.publiBikes.get(id)!.broken ? "out of service" : id === body.vehicleId ? "E to get off" : v.driver ? "occupied" : state.publiBikes.get(id)!.reservedBy ? "being unlocked" : "E to scan"}` :
        v.kind !== 1
          ? `${v.kind === 2 ? "BIKE" : v.kind === 3 ? "NPC CAR" : v.kind === 4 ? "LOOSE BALL" : "CART"} · ${v.kind >= 3 ? "watch out" : v.fallenUntil > this.net.now() ? "recovering" : v.driver ? "occupied" : "E to ride"}`
          : `TRAM ${count}/${v.capacity} · ${transitStatus(v,clock)}`;
      if (text !== visual.labelText) {
        const context = visual.canvas.getContext("2d")!;
        const { width, height } = visual.canvas;
        context.clearRect(0, 0, width, height);
        context.fillStyle = state?.publiBikes?.has(id) ? "#68184eeF" : "#111c2cef";
        context.beginPath();
        context.roundRect(4, 4, width - 8, height - 8, 32);
        context.fill();
        context.strokeStyle = "#ffffff50";
        context.lineWidth = 3;
        context.stroke();
        let fontSize = 54;
        context.font = `600 ${fontSize}px Arial, sans-serif`;
        while (context.measureText(text).width > width - 72 && fontSize > 28) {
          context.font = `600 ${--fontSize}px Arial, sans-serif`;
        }
        context.fillStyle = "#ffffff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, width / 2, height / 2);
        (visual.label.material as THREE.SpriteMaterial).map!.needsUpdate = true;
        visual.labelText = text;
      }
    }
    const riding = this.items.get(body.vehicleId)?.latest;
    let prompt = `Mouse / trackpad look · WASD run · Shift sprint · Space jump · C sprint slide · click/F hit · F5/V view · Esc menu`;
    if (riding)
      prompt =
        !C.isPassengerVehicle(riding)
          ? "WASD drive · E exit · mouse / trackpad look · F5/V view · Esc menu"
          : riding.traveling
            ? `Riding ${C.transitName(riding)} · ${transitStatus(riding,clock)} · mouse / trackpad look · F5/V view · exit at next stop`
            : `${C.transitName(riding)} · ${transitStatus(riding,clock)} · E leave · mouse / trackpad look · F5/V view`;
    else {
      const near = this.items.get(this.nearest(body))?.latest;
      if (near)
        prompt +=
          near.kind === 2
            ? near.fallenUntil > this.net.now() ? " · Bike recovering" : near.driver ? " · Bike occupied" : " · E ride bike"
            : near.kind === 0
            ? near.driver
              ? " · Cart occupied"
              : " · E ride cart"
            : near.traveling
              ? ` · ${C.transitName(near)} moving`
              : ` · E board ${C.transitName(near)}${C.isRail(near) ? " · inside boarding circle" : ""}`;
    }
    this.controls.textContent =
      this.messageUntil > Date.now() ? `${prompt} · ${this.message}` : prompt;
  }
  dispose() {
    this.abort.abort(); this.publiModel?.dispose();
    this.transitModels?.dispose();
    this.drivenId = "";
    this.net.onVehicleResult = undefined;
    this.net.vehicleMove = undefined;
    for (const v of this.items.values()) {
      v.explosions?.dispose();
      v.railConnectors?.forEach(disposeTramConnector);
      disposeMap(v.mesh);
      (v.label.material as THREE.SpriteMaterial).map?.dispose();
      v.label.material.dispose();
      v.mesh.removeFromParent();
    }
    this.items.clear();
    for (const p of this.platforms) {
      p.removeFromParent();
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.platforms = [];
  }
}
