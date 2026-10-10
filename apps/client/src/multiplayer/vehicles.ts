import * as THREE from "three";
import * as C from "@race/shared";
import type { Network } from "./net.ts";

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
}
export class Vehicles {
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
    net.vehicleMove = () =>
      this.drivenId
        ? [
            this.drivenId,
            this.prediction.x,
            this.prediction.z,
            this.prediction.rotY,
            this.prediction.vx,
            this.prediction.vz,
          ]
        : undefined;
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
        this.items.set(id, visual);
        this.scene.add(visual.mesh);
      }
      Object.assign(visual.latest, v);
      const snapshot: Snapshot = {
        ...C.createVehicle(),
        ...v,
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
        v.mesh.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
          }
        });
        (v.label.material as THREE.SpriteMaterial).map?.dispose();
        v.label.material.dispose();
        v.mesh.removeFromParent();
        this.items.delete(id);
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
    if (shuttle) {
      box(0.15, 0.35, 4.3, -1.3, 1.1, 0, "#dce8ed");
      box(0.15, 0.35, 4.3, 1.3, 1.1, 0, "#dce8ed");
    }
    for (let side = -1; side <= 1; side += 2)
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
    canvas.width = 512;
    canvas.height = 80;
    const texture = new THREE.CanvasTexture(canvas),
      label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false }),
      );
    label.position.y = 3.6;
    label.scale.set(shuttle ? 5 : 3.8, 0.65, 1);
    mesh.add(label);
    return {
      mesh,
      rendered: { ...v },
      latest: { ...v },
      snapshots: [],
      label,
      canvas,
      labelText: "",
    };
  }
  render(t: number) {
    for (const [id, v] of this.items) {
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
      }
      this.pose(v);
    }
  }
  private pose(v: Visual) {
    v.mesh.position.set(v.rendered.x, v.rendered.y, v.rendered.z);
    v.mesh.rotation.y = v.rendered.rotY;
  }
  step(body: C.Body, input: C.Input, dt: number, sessionId: string) {
    const visual = this.items.get(body.vehicleId);
    if (!visual) {
      this.drivenId = "";
      return;
    }
    if (visual.latest.kind === 0 && visual.latest.driver === sessionId) {
      if (this.drivenId !== body.vehicleId) {
        this.drivenId = body.vehicleId;
        Object.assign(this.prediction, visual.latest);
      }
      C.stepCart(this.prediction, input, dt, C.zurichWorld);
      Object.assign(visual.rendered, this.prediction);
      this.pose(visual);
    } else this.drivenId = "";
    C.seatPosition(visual.rendered, body.seat, body);
    body.rotY = visual.rendered.rotY;
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
      distance = C.VEHICLE_BOARD_DISTANCE;
    for (const [id, v] of this.items) {
      const d = Math.hypot(body.x - v.rendered.x, body.z - v.rendered.z);
      if (d < distance) {
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
  updateLabels(body: C.Body, now: number) {
    if (now - this.lastLabels < 250) return;
    this.lastLabels = now;
    const state = this.net.room?.state;
    for (const [id, visual] of this.items) {
      const v = visual.latest;
      let count = 0;
      for (const p of state?.players?.values() ?? [])
        if (p.vehicleId === id) count++;
      const seconds = Math.max(
        0,
        Math.ceil(
          ((v.traveling ? v.arrivalAt : v.departureAt) - this.net.now()) / 1000,
        ),
      );
      const text =
        v.kind === 0
          ? `CART · ${v.driver ? "occupied" : "E to ride"}`
          : `SHUTTLE ${count}/${v.capacity} · ${v.traveling ? "arriving " + seconds + "s" : v.departureAt ? "leaving " + seconds + "s" : "E to board"}`;
      if (text !== visual.labelText) {
        const context = visual.canvas.getContext("2d")!;
        context.clearRect(0, 0, 512, 80);
        context.fillStyle = "#111c2cdd";
        context.fillRect(0, 0, 512, 80);
        context.font = "bold 26px monospace";
        context.fillStyle = "#ffffff";
        context.textAlign = "center";
        context.fillText(text, 256, 49);
        (visual.label.material as THREE.SpriteMaterial).map!.needsUpdate = true;
        visual.labelText = text;
      }
    }
    const riding = this.items.get(body.vehicleId)?.latest;
    let prompt = "WASD move · Shift sprint · Space jump · drag to orbit";
    if (riding)
      prompt =
        riding.kind === 0
          ? "WASD drive · E exit · drag to orbit"
          : riding.traveling
            ? "Riding shuttle · exit at the next stop"
            : "E leave shuttle · departure countdown is above the shuttle";
    else {
      const near = this.items.get(this.nearest(body))?.latest;
      if (near)
        prompt +=
          near.kind === 0
            ? near.driver
              ? " · Cart occupied"
              : " · E ride cart"
            : near.traveling
              ? " · Shuttle moving"
              : " · E board shuttle";
    }
    this.controls.textContent =
      this.messageUntil > Date.now() ? `${prompt} · ${this.message}` : prompt;
  }
  dispose() {
    this.drivenId = "";
    this.net.vehicleMove = undefined;
    this.net.onVehicleResult = undefined;
    for (const v of this.items.values()) {
      v.mesh.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
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
