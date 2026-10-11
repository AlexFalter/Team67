import { examPortalPosition, type WorldState } from "@race/shared";

export type MapPoint = { x: number; z: number };
export type MapProjection = MapPoint & { scale: number; width: number; height: number };
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
export function distanceToEth(point: MapPoint) { return Math.hypot(point.x - examPortalPosition.x, point.z - examPortalPosition.z); }
export function raceStandings(state: Pick<WorldState, "members" | "players">, localId: string, localPosition: MapPoint) {
  return [...state.players].flatMap(([id, player]) => {
    const member = state.members.get(id);
    if (!member || member.spectator) return [];
    const distance = distanceToEth(id === localId ? localPosition : player);
    return Number.isFinite(distance) ? [{ id, name: member.name, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
