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
