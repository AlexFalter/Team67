import { Raycaster, Vector3, type Intersection, type Mesh, type PerspectiveCamera } from "three";
import { HEIGHT, type World } from "@race/shared";

export const VIEWS = ["First person", "Third person (rear)", "Third person (front)"] as const;
const BOOM = 4.5, CLEARANCE = 0.25, BOOM_RETURN = 6;
/** Street-level view distance; fog hides the cut, and distant tiles cost no draw calls. */
export const FAR = 700;

/**
 * Camera placement. Rotation always comes straight from yaw/pitch (never eased). In first person the
 * eye sits exactly on the interpolated body. Third person casts a BVH ray: the boom snaps in at once
 * when something is in the way and eases back out.
 */
export class CameraRig {
  view = 0;
  bob = true;
  private boom = BOOM;
  private bobPhase = 0;
  private dip = 0;
  private dipVelocity = 0;
  private ray = new Raycaster();
  private pivot = new Vector3();
  private dir = new Vector3();
  private hits: Intersection[] = [];

  constructor(private camera: PerspectiveCamera, private colliders: Mesh[], private world: World) {
    this.ray.firstHitOnly = true;
    camera.fov = 72;
    camera.near = 0.05;
    camera.far = FAR;
    camera.updateProjectionMatrix();
  }

  cycle() {
    this.view = (this.view + 1) % VIEWS.length;
    if (this.view !== 0) this.boom = 0;
  }

  /** Landing impact for a small camera dip (first person only). */
  land(speed: number) {
    if (this.bob) this.dipVelocity -= Math.min(4, speed * 0.25);
  }

  update(x: number, y: number, z: number, eye: number, yaw: number, pitch: number, groundSpeed: number, dt: number) {
    const c = this.camera;
    // Damped spring for the landing dip; tiny distance-driven bob.
    this.dipVelocity += (-this.dip * 180 - this.dipVelocity * 22) * dt;
    this.dip += this.dipVelocity * dt;
    this.bobPhase += groundSpeed * dt * 1.6;
    const bob = this.bob ? Math.sin(this.bobPhase * 2) * 0.03 * Math.min(1, groundSpeed / 7.5) : 0;
    if (this.view === 0) {
      c.position.set(x, y + eye + bob + this.dip, z);
      c.rotation.set(pitch, yaw, 0, "YXZ");
      return;
    }
    const front = this.view === 2;
    this.pivot.set(x, y + Math.min(eye, HEIGHT) - 0.05, z);
    const cp = Math.cos(pitch);
    // Rear: opposite the view direction. Front: along it, looking back at the player.
    this.dir.set(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);
    if (front) this.dir.set(-this.dir.x, this.dir.y, -this.dir.z);
    this.ray.set(this.pivot, this.dir);
    this.ray.far = BOOM;
    this.hits.length = 0;
    const hit = this.ray.intersectObjects(this.colliders, false, this.hits)[0];
    const target = hit ? Math.max(0.3, hit.distance - CLEARANCE) : BOOM;
    this.boom = target < this.boom ? target : this.boom + (target - this.boom) * (1 - Math.exp(-BOOM_RETURN * dt));
    c.position.copy(this.pivot).addScaledVector(this.dir, this.boom);
    const g = this.world.height(c.position.x, c.position.z);
    if (!Number.isNaN(g)) c.position.y = Math.max(c.position.y, g + 0.2);
    if (front) c.lookAt(this.pivot);
    else c.rotation.set(pitch, yaw, 0, "YXZ");
  }
}
