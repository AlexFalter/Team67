import * as THREE from "three";
import { PLANE_SIZE, INTERP_DELAY_MS } from "@race/shared";
import { Network } from "./net.ts";
import { LocalPlayer } from "./localPlayer.ts";
import { RemotePlayers } from "./remotePlayers.ts";
import { Effects } from "./effects.ts";
import { Hud } from "./hud.ts";
import { avatar, pose } from "./avatar.ts";
import { Vehicles } from "./vehicles.ts";
import "./style.css";
const scene = new THREE.Scene();
scene.background = new THREE.Color("#162333");
scene.fog = new THREE.Fog("#162333", 45, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 150);
camera.position.set(0, 6, 9);
scene.add(new THREE.HemisphereLight("#eaf4ff", "#556044", 2));
const sun = new THREE.DirectionalLight("#fff4db", 2);
sun.position.set(12, 25, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -35,
  right: 35,
  top: 35,
  bottom: -35,
  near: 1,
  far: 80,
});
scene.add(sun);
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE),
  new THREE.MeshStandardMaterial({ color: "#334953", roughness: 1 }),
);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);
const grid = new THREE.GridHelper(PLANE_SIZE, PLANE_SIZE, "#789591", "#45636c");
grid.position.y = 0.005;
scene.add(grid);
const local = new LocalPlayer(),
  net = new Network(),
  remotes = new RemotePlayers(scene),
  effects = new Effects(scene),
  hud = new Hud();
const vehicles = new Vehicles(scene, net);
const mesh = avatar("#ffffff");
scene.add(mesh);
mesh.visible = false;
void net
  .connect(
    local.body,
    (state, id) => {
      vehicles.patch(state);
      remotes.patch(state, id);
      const p = state.players.get(id);
      if (p) {
        (
          (mesh.children[0] as THREE.Mesh)
            .material as THREE.MeshStandardMaterial
        ).color.set(p.color);
        mesh.visible = true;
      }
    },
    (hit) => local.impulse(hit),
    (hit) => effects.enqueue(hit),
  )
  .catch((error) => {
    net.status = `Could not connect: ${error instanceof Error ? error.message : String(error)}`;
  });
let yaw = 0,
  dragging = false;
renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointerup", () => (dragging = false));
renderer.domElement.addEventListener("pointercancel", () => (dragging = false));
renderer.domElement.addEventListener("pointermove", (e) => {
  if (dragging) yaw -= e.movementX * 0.005;
});
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener("resize", resize);
resize();
const target = new THREE.Vector3(),
  desired = new THREE.Vector3();
let previous = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  const renderTime = net.now() - INTERP_DELAY_MS;
  vehicles.render(renderTime);
  remotes.render(renderTime, vehicles.items);
  if (net.initialized) {
    if (local.takeInteraction()) vehicles.interact(local.body);
    let remaining = elapsed;
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 60);
      if (local.body.vehicleId)
        vehicles.step(local.body, local.controls(yaw), dt, net.room.sessionId);
      else {
        vehicles.stopDriving();
        local.step(dt, yaw);
        remotes.pushLocal(local.body, dt);
      }
      remaining -= dt;
    }
    pose(mesh, local.body);
  }
  const p = local.body;
  target.set(p.x, p.y + 1, p.z);
  desired.set(p.x + Math.sin(yaw) * 9, p.y + 6, p.z + Math.cos(yaw) * 9);
  camera.position.lerp(desired, 1 - Math.exp(-6 * elapsed));
  camera.lookAt(target);
  effects.update(renderTime, elapsed);
  hud.update(elapsed, net);
  vehicles.updateLabels(local.body, now);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => {
  net.stop();
  void net.room?.leave();
});
