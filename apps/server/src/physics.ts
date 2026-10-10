import RAPIER from "@dimforge/rapier3d-compat";
import * as C from "@race/shared";
const ready = RAPIER.init();

// Rapier owns narrow-phase contact detection; gameplay owns the response.
// Kinematic sensors keep arcade movement replayable without serializing a
// rigid-body world into the player's Colyseus reconciler.
export class ContactWorld {
  static async create(terrain: C.MovementWorld = C.flatWorld) { await ready; return new ContactWorld(terrain); }
  private world = new RAPIER.World({ x: 0, y: -25, z: 0 });
  private shapes = new Map<string, RAPIER.Collider>();
  private constructor(private terrain: C.MovementWorld) {
    this.world.timestep = 1 / C.COLLISION_TICK_RATE;
    if (terrain.name === "flat") {
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(C.PLANE_SIZE / 2, 0.1, C.PLANE_SIZE / 2).setTranslation(0, -0.1, 0));
    for (const h of C.HOUSES) this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(h.width / 2, h.height / 2, h.depth / 2).setTranslation(h.x, h.height / 2, h.z));
    // Keep the loose physics object on the test field; player fall/respawn stays available.
    for (const side of [-1, 1]) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2, 30).setTranslation(side * 30, 2, 0).setRestitution(1));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(30, 2, 0.1).setTranslation(0, 2, side * 30).setRestitution(1));
    }
    } else {
      // The same offline terrain samples used by shared movement, in map coordinates.
      const b = terrain.bounds, columns = Math.round((b.maxX - b.minX) / 2), rows = Math.round((b.maxZ - b.minZ) / 2);
      const heights = new Float32Array((columns + 1) * (rows + 1));
      for (let x = 0; x <= columns; x++) for (let z = 0; z <= rows; z++)
        heights[x * (rows + 1) + z] = terrain.height(b.minX + x * 2, b.minZ + z * 2) ?? terrain.spawn.y - 20;
      this.world.createCollider(RAPIER.ColliderDesc.heightfield(rows, columns, heights,
        { x: b.maxX - b.minX, y: 1, z: b.maxZ - b.minZ }).setTranslation((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2));
    }
  }
  sync(players: ReadonlyMap<string, C.PlayerState>, vehicles: ReadonlyMap<string, C.VehicleState> = new Map()) {
    const entities = new Map<string, { x: number; y: number; z: number; radius?: number; dynamic?: boolean; ball?: boolean; vx?: number; vz?: number }>(players);
    for (const [id, v] of vehicles) entities.set(`v:${id}`, { ...C.snapshot(v, C.createVehicle()), radius: C.vehicleRadius(v), ball: v.kind === 4, dynamic: v.kind === 4 || (v.kind !== 1 && v.kind < 3 && !v.driver && !v.fallenUntil) });
    for (const [id, p] of entities) {
      let shape = this.shapes.get(id);
      if (shape && shape.parent()!.isDynamic() !== !!p.dynamic) {
        this.world.removeRigidBody(shape.parent()!); this.shapes.delete(id); shape = undefined;
      }
      if (!shape) {
        const ball = p.ball;
        const desc = p.dynamic ? RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y + (ball ? p.radius! : 0.55), p.z).setLinvel(p.vx!, 0, p.vz!).setCcdEnabled(true).setLinearDamping(ball ? 0 : 2)
          : RAPIER.RigidBodyDesc.kinematicPositionBased();
        if (p.dynamic && !ball) desc.lockRotations();
        const body = this.world.createRigidBody(desc);
        const descriptor = ball ? RAPIER.ColliderDesc.ball(p.radius!) : p.radius !== undefined ? RAPIER.ColliderDesc.cylinder(0.55, p.radius) : RAPIER.ColliderDesc.capsule(
          (C.CAPSULE_HEIGHT - 2 * C.CAPSULE_RADIUS) / 2, C.CAPSULE_RADIUS,
        );
        shape = this.world.createCollider(descriptor.setSensor(p.radius === undefined).setFriction(0).setRestitution(ball ? 0.8 : 0).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL), body);
        this.shapes.set(id, shape);
      }
      const position = { x: p.x, y: p.y + (p.radius === undefined ? C.CAPSULE_HEIGHT / 2 : 0.55), z: p.z };
      if (!p.dynamic) shape.parent()!.setNextKinematicTranslation(position);
    }
    for (const [id, shape] of this.shapes) if (!entities.has(id)) {
      this.world.removeRigidBody(shape.parent()!); this.shapes.delete(id);
    }
    this.world.step();
    for (const [id, v] of vehicles) if (this.shapes.get(`v:${id}`)!.parent()!.isDynamic()) {
      const body = this.shapes.get(`v:${id}`)!.parent()!, pos = body.translation(), vel = body.linvel();
      const blocked = this.terrain.name === "zurich" && (this.terrain.height(pos.x, pos.z) === undefined ||
        this.terrain.blocked(pos.x, pos.y - 0.55, pos.z, C.vehicleRadius(v), 1.1));
      if (blocked) {
        body.setTranslation({ x: v.x, y: v.y + (v.kind === 4 ? C.vehicleRadius(v) : 0.55), z: v.z }, true);
        body.setLinvel({ x: -vel.x * 0.5, y: vel.y, z: -vel.z * 0.5 }, true);
        continue;
      }
      v.x = pos.x; v.y = pos.y - (v.kind === 4 ? C.vehicleRadius(v) : 0.55); v.z = pos.z; v.vx = vel.x; v.vz = vel.z;
    }
  }
  intersects(a: string, b: string) {
    const x = this.shapes.get(a), y = this.shapes.get(b);
    if (!x || !y) return false;
    if (this.world.intersectionPair(x, y)) return true;
    let contact = false;
    this.world.contactPair(x, y, () => { contact = true; });
    return contact;
  }
  dispose() { this.world.free(); }
}
