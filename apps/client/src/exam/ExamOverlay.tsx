import { EthBlur } from '../minigames/eth-blur/EthBlur';
import type { ExamSession } from './ExamSequence';
import './exam.css';
export function ExamOverlay({ session, onComplete, onExit }: {
  session: ExamSession; onComplete: (score: number) => void; onExit: () => void;
}) {
  if (session.stage === 'world') return null;
  if (session.stage === 'exam' || session.stage === 'complete') return <div className="exam-game-screen"><EthBlur
    startImmediately remainingSeconds={session.remainingSeconds} onComplete={onComplete} onExit={onExit} /></div>;
  return <section className="exam-transition bonus" role="status" aria-label="Bonus round">
    <div className="exam-transition-heading"><h1>Chance for bonus points</h1><p>Name the buildings</p></div>
  </section>;
}
