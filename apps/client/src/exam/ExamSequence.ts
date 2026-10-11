import { type PerspectiveCamera, type Scene } from 'three';
import { insideExamPortal, type Body } from '@race/shared';
import { ExamPortal } from '../entities/examPortal/ExamPortal';
export type ExamStage = 'world' | 'bonus' | 'exam' | 'complete' | 'spectate';
export interface ExamSession { stage: ExamStage; remainingSeconds: number; canEnter: boolean; score: number }
export const emptyExamSession: ExamSession = { stage: 'world', remainingSeconds: 0, canEnter: false, score: 0 };
export const BONUS_BANNER_MS = 1800;
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
  constructor(scene: Scene, _camera: PerspectiveCamera, private publish: (session: ExamSession) => void) {
    this.portal = new ExamPortal(scene);
  }
  get active() { return this.stage !== 'world'; }
  get spectating(){return this.stage==='spectate';}
  get screenVisible() { return this.stage === 'exam' || this.stage === 'complete'; }
  update(body: Body, canPlay: boolean, controlsEnabled: boolean, round: number, remaining: number, now: number) {
    this.remaining = remaining; this.canEnter = canPlay;
    this.portal.update(now);
    if (round && round !== this.round) {
      this.round = round; this.enteredRound = -1; this.score = 0; this.stage = 'world'; this.notify();
    }
    if(this.spectating){this.portal.root.visible=false;this.notify();return;}
    if (!this.active && this.enteredRound !== round && canPlay && controlsEnabled && !body.vehicleId && body.anim !== 3 && insideExamPortal(body)) {
      this.enteredRound = round; this.started = now; this.stage = 'bonus';
      body.vx = body.vy = body.vz = 0; this.notify();
    }
    if (this.stage === 'bonus' && (now - this.started >= BONUS_BANNER_MS || remaining <= 0)) {
      this.stage = 'exam'; this.notify();
    }
    if (now - this.lastPublish >= 100) { this.lastPublish = now; this.notify(); }
    this.portal.root.visible = !this.active;
  }
  skipTransition() { if (this.stage === 'bonus') { this.stage = 'exam'; this.notify(); } }
  spectate(){this.stage='spectate';this.notify();}
  returnToExam(){if(this.stage==='spectate'){this.stage='exam';this.notify();}}
  complete(score: number) { this.score = score; this.stage = 'complete'; this.notify(); }
  returnToWorld() { this.stage = 'world'; this.notify(); }
  private notify() { this.publish({ stage: this.stage, remainingSeconds: this.remaining, canEnter: this.canEnter, score: this.score }); }
  dispose() { this.portal.dispose(); }
}
