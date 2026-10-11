import { EthBlur } from '../minigames/eth-blur/EthBlur';
import type { ExamSession } from './ExamSequence';
import './exam.css';
export function ExamOverlay({ session, onComplete, onExit, onSpectate }: {
  session: ExamSession; onComplete: (score: number) => void; onExit: () => void; onSpectate: () => void;
}) {
  if (session.stage === 'world' || session.stage === 'spectate') return null;
  if (session.stage === 'exam' || session.stage === 'complete') return <div className="exam-game-screen"><EthBlur
    startImmediately remainingSeconds={session.remainingSeconds} onComplete={onComplete} onExit={onExit} />{session.canEnter&&<button className="exam-spectate" onClick={onSpectate}>Spectate instead</button>}</div>;
  return <section className="exam-transition bonus" role="status" aria-label="Bonus round">
    <div className="exam-transition-heading"><h1>Chance for bonus points</h1><p>Name the buildings</p></div>
    {session.canEnter&&<button className="exam-spectate" onClick={onSpectate}>Spectate instead</button>}
  </section>;
}
