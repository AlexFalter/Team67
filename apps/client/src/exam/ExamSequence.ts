import { Quaternion, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { FINAL_EXAM_LOCATION, examMapPoint, insideExamPortal, type Body } from '@race/shared';
import { ExamPortal } from '../entities/examPortal/ExamPortal';
import { playExamRoomAnimation } from './examRoomAnimation';
export type ExamStage = 'world' | 'flyover' | 'room' | 'exam' | 'complete';
export interface ExamSession { stage: ExamStage; remainingSeconds: number; canEnter: boolean; score: number }
export const emptyExamSession: ExamSession = { stage: 'world', remainingSeconds: 0, canEnter: false, score: 0 };
export class ExamSequence {
  private portal: ExamPortal;
  private stage: ExamStage = 'world';
  private round = 0;
  private enteredRound = -1;
  private started = 0;
  private score = 0;
  private lastPublish = 0;
  private remaining = 0;
  private canEnter = false;
  private abort = new AbortController();
  private from = new Vector3();
  private fromRotation = new Quaternion();
  private orbitRotation = new Quaternion();
  private cameraPosition = new Vector3();
  private focus = new Vector3();
  constructor(private scene: Scene, private camera: PerspectiveCamera, private publish: (session: ExamSession) => void) {
    this.portal = new ExamPortal(scene);
    const target = examMapPoint(FINAL_EXAM_LOCATION.ethFocusLV95);
    this.focus.set(target.x, target.y, target.z);
  }
  get active() { return this.stage !== 'world'; }
  get screenVisible() { return this.stage === 'exam' || this.stage === 'complete'; }
  update(body: Body, canPlay: boolean, controlsEnabled: boolean, round: number, remaining: number, now: number) {
    this.remaining = remaining; this.canEnter = canPlay;
    this.portal.update(now);
    if (round && round !== this.round) {
      this.round = round; this.enteredRound = -1; this.score = 0;
      this.abort.abort(); this.abort = new AbortController(); this.stage = 'world';
      this.notify();
    }
    if (!this.active && this.enteredRound !== round && canPlay && controlsEnabled && !body.vehicleId && body.anim !== 3 && insideExamPortal(body)) {
      this.enteredRound = round; this.started = now; this.stage = 'flyover';
      this.from.copy(this.camera.position); this.fromRotation.copy(this.camera.quaternion);
      body.vx = body.vy = body.vz = 0;
      this.notify();
    }
    if (this.active && remaining <= 0 && this.stage !== 'complete') {
      this.abort.abort(); this.stage = 'exam';
    }
    if (this.stage === 'flyover') {
      const progress = Math.min(1, (now - this.started) / 4000);
      const angle = Math.PI * 0.9 + progress * Math.PI * 1.15;
      this.cameraPosition.set(this.focus.x + Math.sin(angle) * 105, this.focus.y + 100, this.focus.z + Math.cos(angle) * 105);
      const blend = Math.min(1, progress * 4), eased = blend * blend * (3 - 2 * blend);
      this.camera.position.lerpVectors(this.from, this.cameraPosition, eased);
      this.camera.lookAt(this.focus);
      this.orbitRotation.copy(this.camera.quaternion);
      this.camera.quaternion.slerpQuaternions(this.fromRotation, this.orbitRotation, eased);
      if (progress === 1) {
        this.stage = 'room'; this.notify();
        const signal = this.abort.signal;
        void playExamRoomAnimation({ scene: this.scene, camera: this.camera,
          seat: examMapPoint(FINAL_EXAM_LOCATION.seatLV95), signal }).then(() => {
            if (!signal.aborted) { this.stage = 'exam'; this.notify(); }
          }).catch(() => { if (!signal.aborted) { this.stage = 'exam'; this.notify(); } });
      }
    }
    if (now - this.lastPublish >= 100) { this.lastPublish = now; this.notify(); }
    this.portal.root.visible = !this.active;
  }
  skipTransition() {
    if (this.stage !== 'flyover' && this.stage !== 'room') return;
    this.abort.abort(); this.stage = 'exam'; this.notify();
  }
  complete(score: number) { this.score = score; this.stage = 'complete'; this.notify(); }
  returnToWorld() { this.stage = 'world'; this.notify(); }
  private notify() { this.publish({ stage: this.stage, remainingSeconds: this.remaining, canEnter: this.canEnter, score: this.score }); }
  dispose() { this.abort.abort(); this.portal.dispose(); }
}
