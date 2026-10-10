import { useCallback, useEffect, useRef, useState } from 'react';
import { buildings, matchesBuildingAnswer, matchesBuildingSearch, type Building } from './buildings';
import { createDeck, pixelColumns, pointsFor, readDuration } from './game';
import { PixelPhoto } from './PixelPhoto';
import { loadPhoto } from './photos';
import './eth-blur.css';
import { TutorialDemo } from './TutorialDemo';

/** The final clock can override the standalone 30-second timer. */
export type EthBlurProps = { remainingSeconds?: number; onComplete?: (score: number) => void };
type Feedback = { kind: 'correct' | 'wrong' | 'skip'; text: string } | null;
export function EthBlur({ remainingSeconds, onComplete }: EthBlurProps) {
  const [started, setStarted] = useState(false);
  const [duration] = useState(() => readDuration(window.location.search));
  const [deck, setDeck] = useState(createDeck);
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [pointLoss, setPointLoss] = useState<{ amount: number; id: number } | null>(null);
  const [correct, setCorrect] = useState(0);
  const [seconds, setSeconds] = useState(duration);
  const [ready, setReady] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [run, setRun] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Building | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [resolving, setResolving] = useState(false);
  const [clockDuration] = useState(() => Math.max(1, remainingSeconds ?? duration));
  const deadline = useRef(0);
  const startedRun = useRef(-1);
  const locked = useRef(false);
  const notified = useRef(false);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const completion = useRef(onComplete);
  const scoreRef = useRef(0);
  const current = deck[Math.min(index, deck.length - 1)];
  const left = Math.max(0, remainingSeconds ?? seconds);
  const clockSeconds = Math.ceil(left);
  const clockLabel = clockSeconds >= 60 ? `${Math.floor(clockSeconds / 60)}:${String(clockSeconds % 60).padStart(2, '0')}` : String(clockSeconds);
  const exhausted = index >= deck.length;
  const ended = started && (exhausted || left <= 0);
  const potential = pointsFor(reveal, mistakes.length);
  const suggestions = buildings.filter(b => matchesBuildingSearch(b, query) && !mistakes.includes(b.code));
  const onReady = useCallback(() => setReady(true), []);
  const onPhotoError = useCallback(() => { setPhotoError(true); setReady(true); }, []);
  useEffect(() => { completion.current = onComplete; }, [onComplete]);
  useEffect(() => { const previous = document.title; document.title = 'Campusless · ETH Zürich'; return () => { document.title = previous; }; }, []);
  useEffect(() => {
    if (!started || !ready || remainingSeconds !== undefined || ended) return;
    if (startedRun.current !== run) { startedRun.current = run; deadline.current = Date.now() + duration * 1000; }
    const tick = () => setSeconds(Math.max(0, (deadline.current - Date.now()) / 1000));
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [started, ready, remainingSeconds, run, ended, duration]);
  useEffect(() => {
    if (ended && !notified.current) { notified.current = true; completion.current?.(scoreRef.current); }
  }, [ended]);
  useEffect(() => {
    const upcoming = deck[started ? index + 1 : index];
    if (upcoming) void loadPhoto(upcoming.image).catch(() => {});
  }, [deck, index, started]);
  useEffect(() => () => { if (transition.current) clearTimeout(transition.current); }, []);

  function active() { return started && ready && !ended && !locked.current && (remainingSeconds !== undefined ? remainingSeconds > 0 : Date.now() < deadline.current); }
  function showPointLoss(amount: number) {
    if (amount > 0) setPointLoss(previous => ({ amount, id: (previous?.id ?? 0) + 1 }));
  }
  function changeReveal(step: number) {
    if (!active()) return;
    showPointLoss(potential - pointsFor(step, mistakes.length));
    setReveal(step);
  }
  function advance(kind: 'correct' | 'skip', earned = 0) {
    locked.current = true; setResolving(true);
    setFeedback({ kind, text: `${current.code} · ${current.name}${kind === 'correct' ? `  +${earned} points` : '  · skipped'}` });
    transition.current = setTimeout(() => {
      setIndex(i => i + 1); setReveal(0); setMistakes([]);
      setQuery(''); setSelected(null); setPhotoError(false); setReady(false);
      setFeedback(null); setPointLoss(null); setResolving(false); locked.current = false;
      input.current?.focus({ preventScroll: true });
    }, 550);
  }
  function guess() {
    if (!active()) return;
    const answer = selected ?? buildings.find(b => matchesBuildingAnswer(b, query));
    if (!answer) { input.current?.focus(); return; }
    if (mistakes.includes(answer.code)) return;
    if (answer.code !== current.code) {
      showPointLoss(potential - pointsFor(reveal, mistakes.length + 1));
      setMistakes(m => [...m, answer.code]);
      setFeedback({ kind: 'wrong', text: `${answer.code} isn't this building. Try again, or reveal more detail.` });
      setQuery(''); setSelected(null); return;
    }
    scoreRef.current += potential; setScore(scoreRef.current); setCorrect(c => c + 1); advance('correct', potential);
  }
  function restart() {
    if (transition.current) clearTimeout(transition.current);
    locked.current = false; notified.current = false; scoreRef.current = 0;
    setDeck(createDeck()); setIndex(0); setReveal(0); setMistakes([]);
    setPointLoss(null); setScore(0); setCorrect(0); setSeconds(duration); setReady(false); setRun(r => r + 1);
    setQuery(''); setSelected(null); setFeedback(null); setResolving(false); setPhotoError(false);
  }
  function select(b: Building) { setSelected(b); setQuery(b.code); input.current?.focus({ preventScroll: true }); }
  return <div className={`campus-game ${!started ? 'tutorial-mode' : ''}`}>
    <div className="campus-shell">
      <nav className="campus-nav"><a href="/" aria-label="Back to world">←</a><span>FINAL EXAM</span><span className="campus-mark">ETH ZÜRICH</span></nav>
      <div className="campus-title"><h1>Campusless<span>.</span></h1><p>A familiar place. A little less familiar.</p></div>
      {!started ? <TutorialDemo duration={duration} externalClock={remainingSeconds !== undefined} onStart={() => setStarted(true)} /> : <>
      <div className="campus-stats"><span><strong>{score.toLocaleString()}</strong> points</span><span className={left < 10 ? 'clock urgent' : 'clock'}><span aria-hidden="true">◷</span> <strong>{clockLabel}</strong>{clockSeconds < 60 && 's'}</span></div>
      <div className="campus-clock-track"><div style={{ width: `${Math.max(0, Math.min(100, left / clockDuration * 100))}%` }} /></div>
      {ended ? <section className="campus-finish"><span className="finish-icon">✦</span><h2>{exhausted ? 'Exam complete.' : 'Time’s up.'}</h2><p>{correct} buildings recognised · {score.toLocaleString()} points</p>{remainingSeconds === undefined && <button className="guess-button" onClick={restart}>Play again ↗</button>}<a href="/">Back to the world</a></section> : <>
        <div className="campus-round">
        <div className="campus-visual">
        <div className={`campus-photo ${resolving ? 'resolved' : ''}`}>
          <PixelPhoto src={current.image} columns={resolving ? 0 : pixelColumns[reveal]} onReady={onReady} onError={onPhotoError} />
          {!ready && <div className="photo-message">Loading building…</div>}
          {photoError && <div className="photo-message">Photo unavailable. You can skip this building.</div>}
          <span className="photo-round">BUILDING {String(index + 1).padStart(2, '0')} / {deck.length}</span>
          {resolving && <div className={`photo-result ${feedback?.kind}`}><span>{feedback?.kind === 'correct' ? '✓' : '→'}</span><strong>{current.code}</strong><small>{current.name}</small></div>}
        </div>
        <div className="reveal-header"><span>REVEAL <strong>{reveal + 1} / 6</strong></span><span className="potential">{potential} <small>points available</small>{pointLoss && <span key={pointLoss.id} className="point-loss" role="status" aria-label={`${pointLoss.amount} available points lost`}>−{pointLoss.amount}</span>}</span></div>
        <div className="reveal-meter" role="progressbar" aria-label="Photo reveal" aria-valuemin={1} aria-valuemax={6} aria-valuenow={reveal + 1} aria-valuetext={`Step ${reveal + 1} of 6`}>{pixelColumns.map((_, i) => <span key={i} className={i <= reveal ? 'revealed' : ''} />)}</div>
        <div className="reveal-labels"><span>Pixelated</span><span>Clear</span></div>
        <button className="reveal-action" onClick={() => changeReveal(Math.min(5, reveal + 1))} disabled={!ready || resolving || reveal === 5}><span><span aria-hidden="true">＋</span> {reveal === 5 ? 'Fully revealed' : 'Reveal more detail'}</span><small>{reveal < 5 ? `${pointsFor(reveal + 1, mistakes.length)} pts next` : 'Original photo'}</small></button>
        </div>
        <div className="campus-round-controls">
        <form className="guess-form" onSubmit={e => { e.preventDefault(); guess(); }}>
          <div className="search-wrap"><span className="search-icon" aria-hidden="true">⌕</span><input ref={input} role="combobox" aria-label="Search ETH buildings" aria-expanded={!resolving} aria-controls="building-options" aria-autocomplete="list" aria-activedescendant={!resolving && suggestions[highlight] ? `option-${suggestions[highlight].code}` : undefined} placeholder="Search a building, or browse the photos…" value={query} disabled={resolving || !ready} onChange={e => { setQuery(e.target.value); setSelected(null); setHighlight(0); }} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const next = Math.max(0, Math.min(suggestions.length - 1, highlight + (e.key === 'ArrowDown' ? 1 : -1))); setHighlight(next); document.getElementById(`option-${suggestions[next]?.code}`)?.scrollIntoView({ block: 'nearest' }); } if (e.key === 'Enter' && !resolving && suggestions[highlight] && !buildings.some(b => matchesBuildingAnswer(b, query))) { e.preventDefault(); select(suggestions[highlight]); } }} />{query && <button type="button" className="clear-search" aria-label="Clear search" onClick={() => { setQuery(''); setSelected(null); input.current?.focus(); }}>×</button>}</div>
          <button className="guess-button" disabled={!ready || resolving || !query.trim()} type="submit">Guess →</button>
        </form>
        <div className="guess-secondary"><button onClick={() => { setSelected(null); setQuery(''); setHighlight(0); }} disabled={!ready || resolving}>{`Browse all ${buildings.length} buildings ↓`}</button><button className="skip-button" onClick={() => { if (active()) advance('skip'); }} disabled={!ready || resolving}>Skip building →</button></div>
        <div className="building-options-slot">
        {!resolving && <div className="building-options" id="building-options" role="listbox" aria-label="ETH buildings">{suggestions.length ? suggestions.map((b, i) => <button type="button" role="option" id={`option-${b.code}`} aria-selected={selected?.code === b.code} className={i === highlight ? 'highlighted' : ''} key={b.code} onClick={() => select(b)}><img className="option-photo" src={b.image} alt={`${b.code} exterior`} loading="lazy" /><span><strong>{b.code}</strong><small>{b.name} · {b.campus}</small></span>{b.plan && <img className="option-plan" src={b.plan} alt={`${b.code} footprint / site plan`} loading="lazy" />}<span className="option-arrow">↗</span></button>) : <p>No matching buildings. Try a code like HG.</p>}</div>}
        </div>
        <div className={`campus-feedback ${feedback?.kind ?? ''}`} role="status">{feedback?.text ?? 'Press Reveal more detail to sharpen the photo. Earlier guesses earn more points.'}</div>
        </div></div>
      </>}
      </>}

    </div>
  </div>;
}
