import { EthBlur } from '../minigames/eth-blur/EthBlur';
import type { ExamSession } from './ExamSequence';
import type { ExamScore } from '@race/shared';
import './exam.css';
export function ExamOverlay({ session, onComplete, onProgress, onExit, onSpectate }: {
  session: ExamSession; onComplete: (score: number) => void; onProgress?: (progress: ExamScore) => void; onExit: () => void; onSpectate?: () => void;
}) {
  if (session.stage === 'world') return null;
  if (session.stage === 'exam' || session.stage === 'complete' || session.stage === 'spectate') return <div className="exam-game-screen" hidden={session.stage === 'spectate'}><EthBlur
    startImmediately visible={session.stage !== 'spectate'} unlimited={session.unlimited} remainingSeconds={session.remainingSeconds} onComplete={onComplete} onProgress={onProgress} onExit={onSpectate ?? onExit} exitLabel={onSpectate ? "Spectate" : undefined} />{session.stage === "exam" && session.canEnter && onSpectate && <button className="exam-spectate" onClick={onSpectate}>Spectate instead</button>}</div>;
  const seconds = Math.ceil(session.remainingSeconds);
  return <section className={`exam-transition ${session.stage}`} aria-label="Final exam entrance">
    <div className="exam-transition-clock">{session.unlimited ? 'UI playground · no timer' : <>◷ {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} remaining</>}</div>
    <div className="exam-transition-heading"><img className="exam-transition-logo" src="/assets/eth-zurich.svg" alt="ETH Zürich" /><h1>Exam Starts</h1></div>
  </section>;
}
