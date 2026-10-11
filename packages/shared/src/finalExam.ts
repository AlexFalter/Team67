import { CAPSULE_HEIGHT, CAPSULE_RADIUS } from './constants.ts';
import type { GroundPoint, MovementWorld } from './world.ts';

/** Independent of the GLB: Swiss LV95 metres, matching the shared world origin. */
export const FINAL_EXAM_LOCATION = {
  originLV95: [2683475, 1248000, 400],
  portalLV95: [2683701, 1247851, 450.7],
  seatLV95: [2683730, 1247860, 454],
  ethFocusLV95: [2683760, 1247880, 468],
  radius: 2.8,
  verticalTolerance: 2.5,
} as const;
export function examMapPoint(point: readonly [number, number, number]) {
  const [east, north, altitude] = point, [oe, on, oh] = FINAL_EXAM_LOCATION.originLV95;
  return { x: east - oe, y: altitude - oh, z: on - north };
}
export const examPortalPosition = examMapPoint(FINAL_EXAM_LOCATION.portalLV95);
export const examDebugPosition = { ...examPortalPosition, z: examPortalPosition.z + 8 };
/** A quiet, walkable map location for exam takers, far from the Polyterrasse gameplay area. */
export function examSoundproofPosition(world: MovementWorld): GroundPoint | undefined {
  const inset = 75, { minX, maxX, minZ, maxZ } = world.bounds;
  const candidates = [
    [minX + inset, minZ + inset], [minX + inset, maxZ - inset],
    [maxX - inset, minZ + inset], [maxX - inset, maxZ - inset],
  ].flatMap(([x, z]) => {
    const y = world.height(x, z);
    return y === undefined || world.blocked(x, y, z, CAPSULE_RADIUS, CAPSULE_HEIGHT) ? [] : [{ x, y, z }];
  });
  return candidates.sort((a, b) => distanceToEth(b) - distanceToEth(a))[0];
}
export function examFlyoverPosition(progress: number) {
  const focus = examMapPoint(FINAL_EXAM_LOCATION.ethFocusLV95);
  const angle = Math.PI * 0.9 + Math.max(0, Math.min(1, progress)) * Math.PI * 1.15;
  return { x: focus.x + Math.sin(angle) * 105, y: focus.y + 100, z: focus.z + Math.cos(angle) * 105 };
}
export function insideExamPortal(position: { x: number; y: number; z: number }) {
  return Math.hypot(position.x - examPortalPosition.x, position.z - examPortalPosition.z) <= FINAL_EXAM_LOCATION.radius &&
    Math.abs(position.y - examPortalPosition.y) <= FINAL_EXAM_LOCATION.verticalTolerance;
}
export function examSecondsRemaining(endsAt: number, now: number) {
  return Math.max(0, (endsAt - now) / 1000);
}
export const EXAM_BUILDING_COUNT = 16;
export interface ExamScore { score: number; correct: number; completed: boolean }
export interface ExamProgress extends ExamScore { roundStartedAt: number }

/** Final leaderboard: reaching ETH (entering the exam) is worth this much, exam points come on top. */
export const ETH_ARRIVAL_POINTS = 1000;
/** Players who did not reach ETH score this minus their metres to ETH (at most ETH_ARRIVAL_POINTS). */
export const MISSED_ETH_POINTS = 1000;
/** Straight-line metres from a map point to the exam entrance at ETH. */
export function distanceToEth(point: { x: number; z: number }) {
  return Math.hypot(point.x - examPortalPosition.x, point.z - examPortalPosition.z);
}
/**
 * Final leaderboard score: players who reached ETH get ETH_ARRIVAL_POINTS plus their exam points, so
 * always above 0; everyone else gets MISSED_ETH_POINTS minus the metres they were still away from ETH
 * when time ran out (negative beyond 1000 m).
 */
export function finalScore(result: { examStartedAt: number; examScore: number; distanceToEth: number }) {
  return result.examStartedAt ? ETH_ARRIVAL_POINTS + result.examScore : MISSED_ETH_POINTS - Math.round(result.distanceToEth);
}
