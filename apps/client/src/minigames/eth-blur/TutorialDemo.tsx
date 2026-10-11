import { useCallback, useEffect, useState } from 'react';
import { buildings } from './buildings';
import { pixelColumns } from './game';
import { PixelPhoto } from './PixelPhoto';

const hg = buildings.find(b => b.code === 'HG')!;
const captions = [
  'Recognise the building? Guess early for more points.',
  'Need a hint? Reveal more detail. Each reveal costs points.',
  'Choose from the building names and photos.',
  'Choose HG, then press Guess.',
  'Correct! +800 points. On to the next building.',
];
export function TutorialDemo({ duration, externalClock, onStart, inGame = false }: { duration: number; externalClock: boolean; onStart: () => void; inGame?: boolean }) {
  const speed = 8;
  const [stage, setStage] = useState(0);
  const [replay, setReplay] = useState(0);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setStage(s => (s + 1) % 5), speed * 1000 / 5);
    return () => window.clearTimeout(timer);
  }, [ready, stage, speed, replay]);
  function reset() { setStage(0); setReplay(r => r + 1); }
  return <section className="campus-demo" aria-labelledby="tutorial-title">
    <div className="demo-heading"><div><span className="tutorial-eyebrow">HOW TO PLAY</span><h2 id="tutorial-title">Learn with HG.</h2></div><button className="skip-button demo-skip" onClick={onStart}>{inGame ? 'Close ×' : 'Skip tutorial →'}</button></div>
    <p className="demo-intro">{inGame ? 'Practice example · Your round keeps running.' : 'Practice round · Your exam hasn’t started.'}</p>
    <div className="demo-stage" aria-label="Example round with HG">
      <div className="demo-status"><span>TUTORIAL · HG PRACTICE ROUND</span><strong>{stage === 4 ? '800 points earned' : `${stage === 0 ? 1000 : 800} points available`}</strong></div>
      <div className="demo-visual">
      <div className="campus-photo demo-photo"><PixelPhoto src={hg.image} columns={stage === 4 ? 0 : pixelColumns[stage > 0 ? 1 : 0]} onReady={onReady} onError={onReady} />{stage === 4 && <div className="photo-result"><span>✓</span><strong>HG</strong><small>Hauptgebäude · +800 points</small></div>}</div>
      <div className="demo-reveals">
        <div className="reveal-header"><span>REVEAL <strong>{stage > 0 ? 2 : 1} / 6</strong></span><span className="potential">{stage === 0 ? 1000 : 800} <small>points available</small>{stage === 1 && <span className="point-loss" aria-hidden="true">−200</span>}</span></div>
        <div className="reveal-meter" aria-hidden="true">{pixelColumns.map((_, i) => <span key={i} className={i <= (stage > 0 ? 1 : 0) ? 'revealed' : ''} />)}</div>
        <div className="reveal-labels"><span>Pixelated</span><span>Clear</span></div>
        <button className="reveal-action demo-target" onClick={() => setStage(1)}>＋ Reveal more detail{stage === 0 && <DemoCursor />}</button>
      </div></div>
      <div className="demo-controls">
        <div className="guess-form"><div className="demo-search">{stage >= 3 ? 'HG · Hauptgebäude' : 'Search or browse buildings…'}</div><button className="guess-button demo-target" onClick={() => setStage(4)}>{stage === 4 ? '✓ Correct' : 'Guess →'}{stage === 3 && <DemoCursor />}</button></div>
        <button className={`demo-option demo-target ${stage >= 3 ? 'chosen' : ''} ${stage < 2 ? 'pending' : ''}`} onClick={() => setStage(3)}><img src={hg.image} alt="HG exterior" /><span><strong>HG</strong><small>Hauptgebäude</small></span><span>{stage >= 3 ? '✓' : '↗'}</span>{stage === 2 && <DemoCursor />}</button>
      </div>
    </div>
    <div className="demo-caption" role="status"><div className="demo-step"><span>STEP</span><strong>{stage + 1}<small> / 5</small></strong></div><p>{captions[stage]}</p></div>
    <div className="demo-bottom"><button className="demo-replay" onClick={() => reset()}>↺ Replay demo</button><button className="exam-start-button" onClick={onStart}>{inGame ? 'Back to game →' : 'Start bonus round →'}</button></div>
    <p className="demo-note">{externalClock ? 'External exam clock' : `${duration}s exam`} · Wrong guess: −100 points · Skip: 0 points</p>
  </section>;
}
function DemoCursor() {
  return <span className="demo-cursor" aria-hidden="true"><svg viewBox="0 0 28 32" width="25" height="29"><path d="M3 2v24l6-6 5 10 5-2-5-10h9Z" fill="#fff" stroke="#101213" strokeWidth="2" /></svg><span /></span>;
}
