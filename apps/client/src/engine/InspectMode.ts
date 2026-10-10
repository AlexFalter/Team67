import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Engine, Mode } from "./Engine";

/** Free orbit around the map, no connection. */
export class InspectMode implements Mode {
  private controls: OrbitControls;
  constructor(private engine: Engine) {
    const { camera, renderer } = engine;
    camera.fov = 45;
    camera.updateProjectionMatrix();
    camera.position.set(650, 850, 900);
    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.target.set(0, 25, 300);
    this.controls.enableDamping = true;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 2500;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.update();
  }
  frame() {
    this.controls.update();
    this.engine.focus.copy(this.controls.target);
  }
  dispose() {
    this.controls.dispose();
  }
}
