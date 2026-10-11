import { distanceToEth, examPortalPosition, polybahnPath, polybahnPlatforms, raceSpawnPoint, type MovementWorld, type WorldState } from "@race/shared";
export { distanceToEth };

export type MapPoint = { x: number; z: number };
export type MapProjection = MapPoint & { scale: number; width: number; height: number };
/** Join the existing route at its nearest segment instead of starting at the old shuttle stop. */
export function raceMapRoute(world: MovementWorld): MapPoint[] {
  const start = raceSpawnPoint(world);
  if (world.name === "zurich") {
    const central = polybahnPlatforms[0], terrace = polybahnPlatforms[1];
    return [
      start,
      { x: -145, z: 65 }, // West end of Bahnhofbrücke, where the bridge cows begin.
      { x: -64, z: 76 },  // East end of the bridge.
      { x: central.x, z: central.z },
      ...polybahnPath.points.map(({ x, z }) => ({ x, z })),
      { x: terrace.x, z: terrace.z },
      examPortalPosition,
    ];
  }
  let nearest = start, nextIndex = world.route.length, bestDistance = Infinity;
  for (let i = 1; i < world.route.length; i++) {
    const a = world.route[i - 1], b = world.route[i], dx = b.x - a.x, dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((start.x-a.x)*dx+(start.z-a.z)*dz)/lengthSquared)) : 0;
    const point = { x: a.x + t * dx, y: a.y + t * (b.y-a.y), z: a.z + t * dz };
    const distance = Math.hypot(point.x-start.x,point.z-start.z);
    if (distance < bestDistance) { bestDistance = distance; nearest = point; nextIndex = i; }
  }
  return [start, nearest, ...world.route.slice(nextIndex), examPortalPosition];
}
export function projectPoint(point: MapPoint, view: MapProjection) {
  return { x: view.width / 2 + (point.x - view.x) * view.scale, y: view.height / 2 + (point.z - view.z) * view.scale };
}
export function unprojectPoint(x: number, y: number, view: MapProjection): MapPoint {
  return { x: view.x + (x - view.width / 2) / view.scale, z: view.z + (y - view.height / 2) / view.scale };
}
export function zoomMap(view: MapProjection, factor: number, x = view.width / 2, y = view.height / 2): MapProjection {
  const before = unprojectPoint(x, y, view), scale = view.scale * factor;
  return { ...view, scale, x: before.x - (x - view.width / 2) / scale, z: before.z - (y - view.height / 2) / scale };
}
export function raceStandings(state: Pick<WorldState, "members" | "players">, localId: string, localPosition: MapPoint) {
  return [...state.players].flatMap(([id, player]) => {
    const member = state.members.get(id);
    if (!member || member.spectator) return [];
    const distance = distanceToEth(id === localId ? localPosition : player);
    return Number.isFinite(distance) ? [{ id, name: member.name, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
