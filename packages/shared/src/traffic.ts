/** Independent road authoring data, in the game's metre-based world coordinates. */
export interface TrafficPoint { x: number; y: number; z: number }
export interface RoadNode extends TrafficPoint { id: string; spawn?: boolean; despawn?: boolean }
export interface Road { id: string; from: string; to: string; oneWay?: boolean; lanes?: number; speed?: number; laneOffset?: number }
export interface TrafficNetwork { version: 1; laneWidth: number; nodes: RoadNode[]; roads: Road[] }
export interface TrafficCarState extends TrafficPoint { rotY: number; speed: number; kind?: number; color?: number }
export interface TrafficSettings { density: number; spawnInterval: number; speedMultiplier?: number; speedLimit?: number }
export const DEFAULT_TRAFFIC_SETTINGS: TrafficSettings = { density: 60, spawnInterval: 2, speedMultiplier: 1 };
export const MAX_TRAFFIC_CARS = 60;

export function validateTrafficNetwork(value: unknown): TrafficNetwork {
  const n = value as TrafficNetwork;
  const fail = () => { throw new Error('Invalid traffic JSON: use version 1, unique nodes/roads, valid endpoints, lanes 1–4 and speed 1–25 m/s.'); };
  if (!n || n.version !== 1 || !Number.isFinite(n.laneWidth) || n.laneWidth < 3 || n.laneWidth > 5 ||
    !Array.isArray(n.nodes) || !Array.isArray(n.roads) || n.nodes.length > 500 || n.roads.length > 1000) return fail();
  const ids = new Set<string>();
  for (const node of n.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[\w-]{1,64}$/.test(node.id) || ids.has(node.id) ||
      ![node.x, node.y, node.z].every(v => Number.isFinite(v) && Math.abs(v) <= 10000) ||
      (node.spawn !== undefined && typeof node.spawn !== 'boolean') || (node.despawn !== undefined && typeof node.despawn !== 'boolean')) return fail();
    ids.add(node.id);
  }
  const roadIds = new Set<string>(), connections = new Set<string>(), degrees = new Map<string, number>();
  for (const road of n.roads) {
    if (!road || typeof road.id !== 'string' || !/^[\w-]{1,64}$/.test(road.id) || roadIds.has(road.id) ||
      !ids.has(road.from) || !ids.has(road.to) || road.from === road.to ||
      (road.oneWay !== undefined && typeof road.oneWay !== 'boolean') ||
      (road.lanes !== undefined && (!Number.isInteger(road.lanes) || road.lanes < 1 || road.lanes > 4)) ||
      (road.speed !== undefined && (!Number.isFinite(road.speed) || road.speed < 1 || road.speed > 25)) ||
      (road.laneOffset !== undefined && (!Number.isFinite(road.laneOffset) || road.laneOffset < (road.oneWay ? -12 : n.laneWidth / 2) || road.laneOffset > 12))) return fail();
    const a = n.nodes.find(node => node.id === road.from)!, b = n.nodes.find(node => node.id === road.to)!;
    if (Math.hypot(b.x - a.x, b.z - a.z) < 15) return fail();
    const pair = [road.from, road.to].sort().join(':');
    if (connections.has(pair)) return fail();
    connections.add(pair);
    for (const id of [road.from, road.to]) {
      degrees.set(id, (degrees.get(id) ?? 0) + 1);
      if (degrees.get(id)! > 8) return fail();
    }
    roadIds.add(road.id);
  }
  // Normalize the wire data; discard unrecognized keys.
  return { version: 1, laneWidth: n.laneWidth,
    nodes: n.nodes.map(({ id, x, y, z, spawn, despawn }) => ({ id, x, y, z, spawn: spawn ?? false, despawn: despawn ?? false })),
    roads: n.roads.map(({ id, from, to, oneWay, lanes, speed, laneOffset }) => ({ id, from, to, oneWay: oneWay ?? false, lanes: lanes ?? 1, speed: speed ?? 8, laneOffset: laneOffset ?? (oneWay ? 0 : n.laneWidth / 2) })) };
}

export interface LanePath {
  id: string; from: string; to: string; road: string; turn?: string; yield?: boolean;
  points: TrafficPoint[]; distances: number[]; length: number; speed: number; next: string[];
}
export interface LaneGraph { paths: Map<string, LanePath>; spawns: string[]; nodes: Map<string, RoadNode> }
const mix = (a: TrafficPoint, b: TrafficPoint, f: number): TrafficPoint => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
function path(data: Omit<LanePath, 'distances' | 'length' | 'next'>): LanePath {
  const distances = [0];
  for (let i = 1; i < data.points.length; i++) {
    const a = data.points[i - 1], b = data.points[i];
    distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return { ...data, distances, length: distances.at(-1)!, next: [] };
}
export function buildLaneGraph(network: TrafficNetwork): LaneGraph {
  const nodes = new Map(network.nodes.map(n => [n.id, n])), paths = new Map<string, LanePath>();
  const roads = new Map(network.roads.map(road => [road.id, road]));
  const degree = new Map(network.nodes.map(node => [node.id, 0]));
  for (const road of network.roads) for (const id of [road.from, road.to]) degree.set(id, degree.get(id)! + 1);
  const radius = new Map(network.nodes.map(n => [n.id, 3]));
  for (const r of network.roads) for (const id of [r.from, r.to]) radius.set(id, Math.max(radius.get(id)!, Math.abs(r.laneOffset ?? network.laneWidth / 2) + ((r.lanes ?? 1) - 0.5) * network.laneWidth + 3));
  for (const road of network.roads) {
    const a = nodes.get(road.from)!, b = nodes.get(road.to)!, len = Math.hypot(b.x - a.x, b.z - a.z);
    const trimA = Math.min(radius.get(a.id)!, len * 0.3), trimB = Math.min(radius.get(b.id)!, len * 0.3);
    for (const reverse of road.oneWay ? [false] : [false, true]) {
      const from = reverse ? b : a, to = reverse ? a : b;
      const dx = (to.x - from.x) / len, dz = (to.z - from.z) / len;
      for (let lane = 0; lane < (road.lanes ?? 1); lane++) {
        // One-way lanes can reuse both curb lanes, leaving center rail tracks free.
        const count = road.lanes ?? 1;
        const offset = road.oneWay
          ? count === 1 ? road.laneOffset ?? 0 : (lane / (count - 1) * 2 - 1) * Math.max(Math.abs(road.laneOffset ?? 0), (count - 1) * network.laneWidth / 2)
          : (road.laneOffset ?? network.laneWidth / 2) + lane * network.laneWidth;
        const start = mix(from, to, (reverse ? trimB : trimA) / len), end = mix(from, to, 1 - (reverse ? trimA : trimB) / len);
        start.x -= dz * offset; start.z += dx * offset; end.x -= dz * offset; end.z += dx * offset;
        const p = path({ id: `${road.id}:${reverse ? 'back' : 'forward'}:${lane}`, from: from.id, to: to.id, road: road.id, points: [start, end], speed: road.speed ?? 8 });
        paths.set(p.id, p);
      }
    }
  }
  const lanes = [...paths.values()];
  for (const incoming of lanes) {
    if (nodes.get(incoming.to)?.despawn) continue;
    const incomingCount = lanes.filter(l => l.road === incoming.road && l.from === incoming.from).length;
    for (const outgoing of lanes) {
      if (outgoing.from !== incoming.to || outgoing.road === incoming.road) continue;
      // Match lane indices where possible, avoiding arbitrary lane changes in a junction.
      const index = Number(incoming.id.split(':').at(-1)), outIndex = Number(outgoing.id.split(':').at(-1));
      const count = lanes.filter(l => l.road === outgoing.road && l.from === outgoing.from).length;
      if (count > incomingCount ? outIndex % incomingCount !== index : outIndex !== Math.min(index, count - 1)) continue;
      const a = incoming.points[1], b = outgoing.points[0], before = incoming.points[0], after = outgoing.points[1];
      const handle = Math.hypot(b.x - a.x, b.z - a.z) * 0.55;
      const il = Math.hypot(a.x - before.x, a.z - before.z), ol = Math.hypot(after.x - b.x, after.z - b.z);
      const c = { x: a.x + (a.x - before.x) / il * handle, y: a.y, z: a.z + (a.z - before.z) / il * handle };
      const d = { x: b.x - (after.x - b.x) / ol * handle, y: b.y, z: b.z - (after.z - b.z) / ol * handle };
      const points = Array.from({ length: 25 }, (_, i) => {
        const f = i / 24, u = 1 - f;
        return { x: u ** 3 * a.x + 3 * u * u * f * c.x + 3 * u * f * f * d.x + f ** 3 * b.x,
          y: a.y + (b.y - a.y) * f,
          z: u ** 3 * a.z + 3 * u * u * f * c.z + 3 * u * f * f * d.z + f ** 3 * b.z };
      });
      // Arcade traffic keeps the road speed through every free connector.
      const speed = Math.min(incoming.speed, outgoing.speed);
      const inRoad = roads.get(incoming.road)!, outRoad = roads.get(outgoing.road)!;
      // Two-way seams can conflict with nearby opposing lanes, especially as curb
      // offsets change. Keep their reservation; one-way continuations are simpler.
      const separated = inRoad.oneWay && outRoad.oneWay;
      const turn = path({ id: `${incoming.id}>${outgoing.id}`, from: incoming.to, to: outgoing.from, road: '', turn: incoming.to, yield: !separated || degree.get(incoming.to)! > 2, points, speed });
      turn.next.push(outgoing.id); incoming.next.push(turn.id); paths.set(turn.id, turn);
    }
  }
  return { paths, nodes, spawns: lanes.filter(l => nodes.get(l.from)?.spawn).map(l => l.id) };
}
export function sampleLane(p: LanePath, distance: number): TrafficCarState {
  const s = Math.max(0, Math.min(p.length, distance));
  let i = 1;
  while (i < p.distances.length - 1 && p.distances[i] < s) i++;
  const a = p.points[i - 1], b = p.points[i], f = (s - p.distances[i - 1]) / Math.max(0.0001, p.distances[i] - p.distances[i - 1]);
  return { ...mix(a, b, f), rotY: Math.atan2(b.x - a.x, b.z - a.z), speed: 0 };
}
/** Conservative oriented boxes; cars yield to players/vehicles rather than applying impulses. */
export function trafficOverlap(a: TrafficCarState, b: TrafficCarState, extra = 0.3) {
  if (Math.abs(a.y - b.y) > 2.5) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > 7 + extra * 2) return false;
  const axes = [a.rotY, a.rotY + Math.PI / 2, b.rotY, b.rotY + Math.PI / 2];
  for (const angle of axes) {
    const x = Math.sin(angle), z = Math.cos(angle);
    const extent = (car: TrafficCarState) => Math.abs(x * Math.sin(car.rotY) + z * Math.cos(car.rotY)) * (2.2 + extra) + Math.abs(x * Math.cos(car.rotY) - z * Math.sin(car.rotY)) * (0.95 + extra);
    if (Math.abs(dx * x + dz * z) >= extent(a) + extent(b)) return false;
  }
  return true;
}
