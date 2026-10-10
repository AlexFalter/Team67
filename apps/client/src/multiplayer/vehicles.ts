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
      C.snapshot(v, visual.latest);
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
    canvas.width = 512;
    canvas.height = 80;
    const texture = new THREE.CanvasTexture(canvas),
      label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture }),
      );
    label.position.y = 2.8;
    label.scale.set(shuttle ? 2.5 : 1.4, 0.28, 1);
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
  render(t: number, dt = 1 / 60) {
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
      this.pose(v, t, dt);
    }
  }
  private pose(v: Visual, t: number, dt: number) {
    v.mesh.position.set(v.rendered.x, v.rendered.y, v.rendered.z);
    v.mesh.rotation.y = v.rendered.rotY;
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
    if (visual.latest.kind !== 1 && visual.latest.driver === sessionId) {
      this.drivenId = body.vehicleId;
      Object.assign(this.prediction, visual.latest, { x: body.x, y: body.y - C.CART_SEAT_HEIGHT, z: body.z, rotY: body.rotY, vx: body.vx, vz: body.vz });
      Object.assign(visual.rendered, this.prediction);
    } else this.drivenId = "";
    if (!this.drivenId) C.seatPosition(visual.rendered, body.seat, body);
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
      if (v.latest.kind >= 3) continue;
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
    const nearest = this.nearest(body);
    for (const [id, visual] of this.items) {
      const v = visual.latest;
      visual.label.visible = id === body.vehicleId || (!body.vehicleId && id === nearest);
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
        v.kind !== 1
          ? `${v.kind === 2 ? "BIKE" : v.kind === 3 ? "NPC CAR" : v.kind === 4 ? "LOOSE BALL" : "CART"} · ${v.kind >= 3 ? "watch out" : v.fallenUntil > this.net.now() ? "recovering" : v.driver ? "occupied" : "E to ride"}`
          : `TRAM ${count}/${v.capacity} · ${v.traveling ? "arriving " + seconds + "s" : v.departureAt ? "leaving " + seconds + "s" : "E to board"}`;
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
    let prompt = `Mouse / trackpad look · WASD run · Shift sprint · Space jump · click/F hit · G throw · R shoes ${body.shoes ? "on" : "off"} · F5/V view · Esc menu`;
    if (riding)
      prompt =
        riding.kind !== 1
          ? "WASD drive · E exit · mouse / trackpad look · F5/V view · Esc menu"
          : riding.traveling
            ? "Riding tram · exit at the next stop"
            : "E leave tram · departure countdown is above the tram";
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
              ? " · Tram moving"
              : " · E board tram";
    }
    this.controls.textContent =
      this.messageUntil > Date.now() ? `${prompt} · ${this.message}` : prompt;
  }
  dispose() {
    this.drivenId = "";
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
