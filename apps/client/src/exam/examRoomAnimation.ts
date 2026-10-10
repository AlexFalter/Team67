import type { PerspectiveCamera, Scene } from 'three';
import type { GroundPoint } from '@race/shared';
export interface ExamRoomAnimationContext {
  scene: Scene;
  camera: PerspectiveCamera;
  seat: GroundPoint;
  signal: AbortSignal;
}
/** Replace this one function with the seating / exam-paper animation later.
 * Resolve when the paper is ready; the shared round clock keeps running.
 * Honor signal and dispose any temporary meshes/listeners on cancellation. */
export async function playExamRoomAnimation({ signal }: ExamRoomAnimationContext): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = window.setTimeout(done, 650);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}
