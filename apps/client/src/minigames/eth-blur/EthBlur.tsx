import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExamScore } from '@race/shared';
import { buildings, matchesBuildingAnswer } from './buildings';
import { createDeck, pixelColumns, pointsFor, readDuration } from './game';
import { PixelPhoto } from './PixelPhoto';
import { loadPhoto } from './photos';
import './eth-blur.css';
import './bonus-round.css';
import { TutorialDemo } from './TutorialDemo';
import { BuildingAnswer } from './BuildingAnswer';
import { ExamPaperHeader } from './ExamPaperHeader';
import './exam-paper.css';

/** The final clock can override the standalone 30-second timer. */
export type EthBlurProps = { unlimited?: boolean; remainingSeconds?: number; onComplete?: (score: number) => void; onProgress?: (progress: ExamScore) => void; startImmediately?: boolean; onExit?: () => void; visible?: boolean };
type Feedback = { kind: 'correct' | 'wrong' | 'skip'; text: string } | null;
export function EthBlur({ unlimited = false, remainingSeconds, onComplete, onProgress, startImmediately = true, onExit, visible = true }: EthBlurProps) {
  const [started, setStarted] = useState(startImmediately);
  const [duration] = useState(() => readDuration(window.location.search));
  const [deck] = useState(createDeck);
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [pointLoss, setPointLoss] = useState<{ amount: number; id: number } | null>(null);
  const [correct, setCorrect] = useState(0);
  const [seconds, setSeconds] = useState(duration);
  const [ready, setReady] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [resolving, setResolving] = useState(false);
  const deadline = useRef(0);
  const locked = useRef(false);
  const notified = useRef(false);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const completion = useRef(onComplete);
  const progressCallback = useRef(onProgress);
  const scoreRef = useRef(0);
  const current = deck[Math.min(index, deck.length - 1)];
  const left = unlimited ? Infinity : Math.max(0, remainingSeconds ?? seconds);
  const clockSeconds = Math.ceil(left);
  const clockLabel = clockSeconds >= 60 ? `${Math.floor(clockSeconds / 60)}:${String(clockSeconds % 60).padStart(2, '0')}` : String(clockSeconds);
  const exhausted = index >= deck.length;
  const ended = started && (exhausted || left <= 0);
  const potential = pointsFor(reveal, mistakes.length);
  const pointHue = Math.max(0, Math.min(120, (potential - 100) / 900 * 120));
  const onReady = useCallback(() => setReady(true), []);
  const onPhotoError = useCallback(() => { setPhotoError(true); setReady(true); }, []);
  useEffect(() => { completion.current = onComplete; progressCallback.current = onProgress; }, [onComplete, onProgress]);
  useEffect(() => {
    if (visible && started && !ended && !resolving) input.current?.focus({ preventScroll: true });
  }, [visible, started, ended, resolving, index]);
  useEffect(() => { const previous = document.title; document.title = 'Campusless · ETH Zürich'; return () => { document.title = previous; }; }, []);
  useEffect(() => {
    if (unlimited || !started || !ready || remainingSeconds !== undefined || ended) return;
    if (deadline.current === 0) deadline.current = Date.now() + duration * 1000;
    const tick = () => setSeconds(Math.max(0, (deadline.current - Date.now()) / 1000));
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [started, ready, remainingSeconds, ended, duration, unlimited]);
  useEffect(() => {
    if (ended && !notified.current) {
      notified.current = true;
      progressCallback.current?.({ score: scoreRef.current, correct, completed: true });
      completion.current?.(scoreRef.current);
    }
  }, [ended, correct]);
  useEffect(() => {
    const upcoming = deck[started ? index + 1 : index];
    if (upcoming) void loadPhoto(upcoming.image).catch(() => {});
  }, [deck, index, started]);
  useEffect(() => () => { if (transition.current) clearTimeout(transition.current); }, []);
  function active() { return visible && started && ready && !ended && !locked.current && (remainingSeconds !== undefined ? remainingSeconds > 0 : Date.now() < deadline.current); }
  function showPointLoss(amount: number) {
    if (amount > 0) setPointLoss(previous => ({ amount, id: (previous?.id ?? 0) + 1 }));
  }
  function changeReveal(step: number) {
    if (!active()) return;
    showPointLoss(potential - pointsFor(step, mistakes.length));
    setReveal(step);
    input.current?.focus({ preventScroll: true });
  }
  function advance(kind: 'correct' | 'skip', earned = 0) {
    locked.current = true; setResolving(true);
    setFeedback({ kind, text: `${current.code} · ${current.name}${kind === 'correct' ? `  +${earned} points` : '  · skipped'}` });
    transition.current = setTimeout(() => {
      setIndex(i => i + 1); setReveal(0); setMistakes([]);
      setQuery(''); setPhotoError(false); setReady(false);
      setFeedback(null); setPointLoss(null); setResolving(false); locked.current = false;
    }, 550);
  }
  function guess() {
    if (!active()) return;
    const answer = buildings.find(b => matchesBuildingAnswer(b, query));
    if (!answer) { setFeedback({ kind: 'wrong', text: 'Unknown building code. Try another answer.' }); input.current?.focus(); return; }
    if (mistakes.includes(answer.code)) { input.current?.focus(); return; }
    if (answer.code !== current.code) {
      showPointLoss(potential - pointsFor(reveal, mistakes.length + 1));
      setMistakes(m => [...m, answer.code]);
      setFeedback({ kind: 'wrong', text: `${answer.code} isn't this building. Try again, or reveal more detail.` });
      setQuery(''); input.current?.focus(); return;
    }
    scoreRef.current += potential; setScore(scoreRef.current); setCorrect(c => c + 1);
    progressCallback.current?.({ score: scoreRef.current, correct: correct + 1, completed: false });
    advance('correct', potential);
  }
  return <div className={`campus-game exam-paper${ended ? ' exam-ended' : ''}`} onKeyDownCapture={event => {
    if (!visible || !started || ended || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) guess();
    } else if (event.key === 'ArrowRight' && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) changeReveal(Math.min(5, reveal + 1));
    }
  }}>
    <div className="exam-sheet">
      <ExamPaperHeader />
      {!started ? <TutorialDemo duration={duration} externalClock={remainingSeconds !== undefined} onStart={() => setStarted(true)} /> : ended ? <section className="exam-finish">
        <span className="exam-section-label">Exam</span>
        <h1>{exhausted ? 'Exam complete.' : 'Time’s up.'}</h1>
        <p>{correct} buildings recognised · {score.toLocaleString()} points</p>
        <div className="exam-finish-actions">
          {onExit ? <button className="paper-button" onClick={onExit}>Back to the world</button> : <a className="paper-button" href="/">Back to the world</a>}
        </div>
      </section> : <>
        <div className="exam-cover-title">
          <span className="exam-section-label">Exam</span>
          <h1 id="exam-title">Advanced BS</h1>
          <p className="exam-date">August 18, 2025</p>
          <p className="exam-seal">DO NOT OPEN!</p>
        </div>
        <div className="exam-spread">
        <section className="exam-cover" aria-labelledby="exam-title">
          <div className="exam-timer">
            <span className={left < 10 ? 'exam-time urgent' : 'exam-time'} role="timer" aria-label={unlimited ? "No time limit" : "Time remaining"}>{unlimited ? 'No timer' : clockLabel}{!unlimited && clockSeconds < 60 && 's'}</span>
          </div>
          <form className="exam-answer-form" onSubmit={event => { event.preventDefault(); guess(); }}>
            <label htmlFor="building-answer">Type Building Code</label>
            <BuildingAnswer value={query} length={current.code.length} readOnly={resolving} inputRef={input} onChange={setQuery} />
            <p id="building-answer-hint"><kbd>Enter</kbd> submits · <kbd>→</kbd> reveals more detail.</p>
            <div className="exam-answer-actions">
              <button className="paper-button primary" disabled={!ready || resolving || !query.trim()} type="submit">Submit answer <span aria-hidden="true">↵</span></button>
              <button className="paper-button" type="button" onClick={() => changeReveal(Math.min(5, reveal + 1))} disabled={!ready || resolving || reveal === 5}>
                {reveal === 5 ? 'Fully revealed' : 'Reveal detail'} <kbd>→</kbd>
              </button>
              <button className="paper-button quiet" type="button" onClick={() => { if (active()) advance('skip'); }} disabled={!ready || resolving}>Skip building</button>
            </div>
          </form>
          <div className={`exam-feedback ${feedback?.kind ?? ''}`} role="status">{feedback?.text}</div>
          <div className="exam-points-summary">
            <div className="exam-available-points" style={{ color: `hsl(${pointHue}, 75%, 30%)` }}><strong>{potential}</strong> points available{pointLoss && <span key={pointLoss.id} className="exam-point-loss" role="status">−{pointLoss.amount}</span>}</div>
          </div>
        </section>
        <section className="exam-question" aria-label="Building photograph">
          <div className={`exam-building-photo ${resolving ? 'resolved' : ''}`}>
            <PixelPhoto src={current.image} columns={resolving ? 0 : pixelColumns[reveal]} onReady={onReady} onError={onPhotoError} background="#f5f5f2" />
            {!ready && <div className="exam-photo-message">Loading building…</div>}
            {photoError && <div className="exam-photo-message">Photo unavailable. You can skip this building.</div>}
            {resolving && <div className={`exam-photo-result ${feedback?.kind}`}><strong>{current.code}</strong><span>{current.name}</span><small>{feedback?.kind === 'correct' ? 'Correct answer' : 'Skipped'}</small></div>}
          </div>
        </section>
        </div>
      </>}
    </div>
  </div>;
}
