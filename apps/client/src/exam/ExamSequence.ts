import { Vector3, type PerspectiveCamera, type Scene } from 'three';
import { FINAL_EXAM_LOCATION, examMapPoint, examFlyoverPosition, insideExamPortal, type Body } from '@race/shared';
import { ExamPortal } from '../entities/examPortal/ExamPortal';
import { playExamRoomAnimation } from './examRoomAnimation';
export type ExamStage = 'world' | 'flyover' | 'room' | 'exam' | 'complete' | 'spectate';
export interface ExamSession { stage: ExamStage; remainingSeconds: number; canEnter: boolean; score: number; unlimited?: boolean }
export const emptyExamSession: ExamSession = { stage: 'world', remainingSeconds: 0, canEnter: false, score: 0 };
export const EXAM_FLYOVER_MS = 4000;
export class ExamSequence {
  private portal: ExamPortal;
  private stage: ExamStage = 'world';
  private round = 0;
  private enteredRound = -1;
  private started = 0;
  private score = 0;
  private finished = false;
  private lastPublish = 0;
  private remaining = 0;
  private canEnter = false;
  private abort = new AbortController();
  private focus = new Vector3();
  constructor(private scene: Scene, private camera: PerspectiveCamera, private publish: (session: ExamSession) => void, private unlimited = false) {
    this.portal = new ExamPortal(scene);
    const target = examMapPoint(FINAL_EXAM_LOCATION.ethFocusLV95);
    this.focus.set(target.x, target.y, target.z);
  }
  get active() { return this.stage !== 'world'; }
  get entered(){return this.round!==0&&this.enteredRound===this.round;}
  get completed(){return this.finished;}
  get takingExam(){return this.stage==='exam';}
  get spectating(){return this.stage==='spectate';}
  get screenVisible() { return this.stage === 'exam' || this.stage === 'complete'; }
  update(body: Body, canPlay: boolean, controlsEnabled: boolean, round: number, remaining: number, now: number) {
    this.remaining = remaining; this.canEnter = canPlay;
    this.portal.update(now);
    if (round !== this.round) {
      this.round = round; this.enteredRound = -1; this.score = 0; this.finished = false;
      this.abort.abort(); this.abort = new AbortController(); this.stage = 'world';
      this.notify();
    }
    if(this.spectating){this.portal.root.visible=false;this.notify();return;}
    if (!this.active && this.enteredRound !== round && canPlay && controlsEnabled && !body.vehicleId && body.anim !== 3 && insideExamPortal(body)) {
      this.enteredRound = round; this.started = now; this.stage = 'flyover';
      body.vx = body.vy = body.vz = 0;
      this.notify();
    }
    if (this.active && remaining <= 0 && this.stage !== 'complete') {
      this.abort.abort(); this.stage = 'exam'; this.notify();
    }
    if (this.stage === 'flyover') {
      const progress = Math.min(1, (now - this.started) / EXAM_FLYOVER_MS);
      const position = examFlyoverPosition(progress);
      this.camera.position.set(position.x, position.y, position.z);
      this.camera.lookAt(this.focus);
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
  spectate(){this.abort.abort();this.stage='spectate';this.notify();}
  returnToExam(){if(this.stage==='spectate'&&this.entered&&!this.finished){this.stage='exam';this.notify();}}
  complete(score: number) { this.finished = true; this.score = score; if (!this.spectating) this.stage = 'complete'; this.notify(); }
  returnToWorld() { this.abort.abort(); this.stage = 'world'; this.notify(); }
  private notify() { this.publish({ stage: this.stage, remainingSeconds: this.remaining, canEnter: this.canEnter, score: this.score, ...(this.unlimited ? { unlimited: true } : {}) }); }
  dispose() { this.abort.abort(); this.portal.dispose(); }
}
