import { EthBlur } from '../minigames/eth-blur/EthBlur';
import type { ExamSession } from './ExamSequence';
import './exam.css';
export function ExamOverlay({ session, onSkip, onComplete, onExit }: {
  session: ExamSession; onSkip: () => void; onComplete: (score: number) => void; onExit: () => void;
}) {
  if (session.stage === 'world') return null;
  if (session.stage === 'exam' || session.stage === 'complete') return <div className="exam-game-screen"><EthBlur
    remainingSeconds={session.remainingSeconds} onComplete={onComplete} onExit={onExit} /></div>;
  const seconds = Math.ceil(session.remainingSeconds);
  return <section className={`exam-transition ${session.stage}`} aria-label="Final exam entrance">
    <div className="exam-transition-clock">◷ {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} remaining</div>
    <div className="exam-transition-heading"><span>ETH ZÜRICH · CAMPUSLESS</span><h1>The exam starts now.</h1><p>{session.stage === 'room' ? 'Take your seat.' : 'You made it to ETH. One final challenge.'}</p></div>
    <button onClick={onSkip}>Skip intro →</button>
  </section>;
}
