import type { RenderingQuality } from "../scene/shadowQuality.ts";
import { useState } from "react";
import { PixelPanel } from "./PixelPanel";
import "./game.css";
import "./publiBikeUi.css";
import "./raceHud.css";
import { CHARACTERS as characters } from "./avatar.ts";

export function GameOverlay({ resolution, onResolutionChange, offline = false }: {
  offline?: boolean;
  resolution: RenderingQuality;
  onResolutionChange: (resolution: RenderingQuality) => void;
}) {
  const [character, setCharacter] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const cycleCharacter = (direction: number) => setCharacter(current => (current + direction + characters.length) % characters.length);
  return <>
    <section id="lobby" hidden={offline} aria-label="Multiplayer lobby">
      <div className="menu-story">
        <p className="menu-place">ZÜRICH / SCHWEIZ</p>
        <h2>Race to ETH</h2>
        <PixelPanel className="lobby-controls" aria-label="Game controls">
          <h3>Know your moves</h3>
          <dl>
            <div><dt><kbd>W A S D</kbd></dt><dd>Move</dd></div>
            <div><dt><kbd>Shift</kbd></dt><dd>Sprint</dd></div>
            <div><dt><kbd>C</kbd></dt><dd>Slide</dd></div>
            <div><dt><kbd>Space</kbd></dt><dd>Jump</dd></div>
            <div><dt><kbd>E</kbd></dt><dd>Interact</dd></div>
            <div><dt><kbd>Click</kbd></dt><dd>Punch</dd></div>
            <div><dt><kbd>M</kbd></dt><dd>Open city map</dd></div>
            <div><dt><kbd>F</kbd></dt><dd>Change view</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>Game menu</dd></div>
          </dl>
        </PixelPanel>
        <a className="practice-exam" href="/minigames/eth-blur">Practice the final exam ↗</a>
      </div>
      <PixelPanel as="form" onSubmit={event => event.preventDefault()}>
        <div className="menu-card-heading"><span>CHOOSE YOUR CHARACTER</span><span>0{character + 1} / 0{characters.length}</span></div>
        <div className="character-picker" role="group" aria-label="Choose your character"
          onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault(); cycleCharacter(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}>
          <button type="button" className="character-arrow" aria-label="Previous character" onClick={() => cycleCharacter(-1)}>‹</button>
          <canvas id="character-stage" role="img" aria-label={`3D preview of ${characters[character]}`} />
          <button type="button" className="character-arrow" aria-label="Next character" onClick={() => cycleCharacter(1)}>›</button>
        </div>
        <div className="character-description" aria-live="polite">
          <h1>{characters[character]}</h1>
        </div>
        <div className="character-pagination" aria-hidden="true">{characters.map((_, index) => <i key={index} className={index === character ? "selected" : undefined} />)}</div>
        <input id="character" type="hidden" name="character" value={character} />
        <label htmlFor="player-name">Your name</label>
        <input id="player-name" autoComplete="nickname" maxLength={24} required placeholder="Your name" />
        <label htmlFor="room-code">Room code</label>
        <div className="room-code-input">
          <input id="room-code" type={showCode ? "text" : "password"} autoComplete="off" maxLength={12} minLength={4} placeholder="e.g. ZURICH" />
          <button type="button" className="code-visibility" aria-label={showCode ? "Hide room code" : "Show room code"} aria-controls="room-code" aria-pressed={showCode} onClick={() => setShowCode(value => !value)}>{showCode ? "Hide" : "Show"}</button>
        </div>
        <fieldset id="dev-settings" className="pixel-panel" popover="auto">
          <legend>Options</legend>
          <label><input id="dev-mode" type="checkbox" /> Dev mode</label>
          <label id="admin-mode-option" hidden><input id="admin-mode" type="checkbox" /> Admin free roam — no timer or final exam</label>
          <label title="Traffic cars pass through players and vehicles"><input id="no-car-collisions" type="checkbox" /> No car collisions</label>
          <label><input id="disable-moodle" type="checkbox" /> Disable Moodle notifications</label>
          <label id="collisions-option" hidden><input id="show-collisions" type="checkbox" /> Show hitboxes + practice dummies</label>
          <label id="skip-intro-option" hidden><input id="skip-intro" type="checkbox" defaultChecked /> Skip starting bus animation</label>
          <label id="gold-bikes-option" hidden><input id="gold-bikes" type="checkbox" defaultChecked /> Gold working PubliBikes</label>
          <label id="map-teleport-option" hidden><input id="map-teleport" type="checkbox" /> Enable map teleportation</label>
          <label id="coordinates-option" hidden><input id="activate-coordinates" type="checkbox" /> Activate Coordinates</label>
          <label id="rail-protection-option" hidden><input id="rail-protection" type="checkbox" /> Prevent tram derailment</label>
          <p className="hint">Saved on this browser. Applies to rooms you create; everyone in the room starts together.</p>
          <button type="button" className="options-close" popoverTarget="dev-settings" popoverTargetAction="hide">Done</button>
        </fieldset>
        <div className="buttons">
          <button type="submit" value="create" disabled>Create room <span aria-hidden="true">↗</span></button>
          <button type="submit" value="join" disabled>Join room</button>
          <button type="button" id="room-options" popoverTarget="dev-settings">Options</button>
        </div>
        <p className="hint">Choose a code to create a session. Share it so others can join.<br />4–12 letters, numbers, or hyphens.</p>
        <p role="status" aria-live="polite">Loading Zürich…</p>
      </PixelPanel>
      <div className="menu-coordinate"><span className="location-dot" aria-hidden="true"></span> ZÜRICH, SWITZERLAND <span>47.3769° N · 8.5417° E</span></div>
      <a className="menu-credit" href="https://data.stadt-zuerich.ch/dataset/geo_bauten___kombinierte_darstellung_heute" target="_blank" rel="noreferrer">Source data: Stadt Zürich · CC0</a>
    </section>
    <section id="room-screen" hidden aria-label="Room" aria-live="polite">
      <div className="room-heading"><p className="menu-kicker">MULTIPLAYER LOBBY</p><h2>Race to ETH</h2></div>
      <div id="squad-labels" aria-hidden="true"></div>
      <div className="room-location"><span className="location-dot" aria-hidden="true"></span><div>POLYTERRASSE<span>ETH ZENTRUM / ZÜRICH</span></div></div>
      <PixelPanel className="room-card">
        <div className="room-card-top"><span>PRIVATE ROOM</span><span id="room-count"></span></div>
        <div className="eyebrow room-code-display">
          <span className="room-code-caption">ROOM CODE</span>
          <span id="room-code-label">••••••</span>
          <button id="room-code-visibility" type="button" className="code-visibility" aria-label="Show room code" aria-controls="room-code-label" aria-pressed="false">Show</button>
        </div>
        <h1 id="room-title">Room lobby</h1>
        <p id="room-message" role="status"></p>
        <ul id="room-roster" aria-label="Players in this room"></ul>
        <button id="room-ready" hidden>Start match ↗</button>
        <div id="room-results-scroll" role="region" aria-label="Round results" tabIndex={0}>
          <table id="room-results" hidden>
            <caption>Round results</caption>
            <thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Distance to ETH</th><th scope="col">Hits landed</th><th scope="col">Hits received</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <button id="room-restart" hidden>Return room to lobby</button>
        <button id="room-leave">Leave room</button>
      </PixelPanel>
      <a className="menu-credit" href="https://data.stadt-zuerich.ch/dataset/geo_bauten___kombinierte_darstellung_heute" target="_blank" rel="noreferrer">Source data: Stadt Zürich · CC0</a>
    </section>
    <PixelPanel id="round-timer" hidden aria-live="off">
      <span id="timer-label">EXAM STARTS IN</span><strong id="timer-value">0:00</strong>
      <div className="timer-track" aria-hidden="true"><i id="timer-fill" /></div>
    </PixelPanel>
    <section id="race-leaderboard" hidden aria-label="Players closest to ETH">
      <h2><span>RACE LEADERS</span><small>TO ETH ↗</small></h2>
      <ol id="race-leaders" /><p id="race-own-rank" hidden />
      <small className="distance-note">Straight-line distance</small>
    </section>
    <aside id="race-radar" hidden aria-label="Minimap">
      <div className="radar-heading"><span>N ↑</span><span>ETH HG <b id="eth-distance" /></span></div>
      <canvas id="race-minimap" aria-label="Nearby routes, players, and encounters" />
      <button id="open-city-map"><kbd>M</kbd> City map <span>↗</span></button>
    </aside>
    <section id="city-map" hidden role="dialog" aria-modal="true" aria-labelledby="city-map-title" tabIndex={-1}>
      <div className="city-map-panel">
        <header><div><span>ZÜRICH / RACE TO ETH</span><h2 id="city-map-title">Find your way to ETH</h2></div><button id="close-city-map" aria-label="Close city map">Close <kbd>M / Esc</kbd></button></header>
        <div className="map-tools"><button data-map="out" aria-label="Zoom out">−</button><output id="map-zoom">100%</output><button data-map="in" aria-label="Zoom in">+</button><button data-map="fit">Fit all</button><button data-map="player">Find me</button></div>
        <canvas id="city-map-canvas" aria-label="City map. Drag to pan and scroll to zoom." />
        <p id="map-readout" role="status">Scroll to zoom · Drag to pan · + / − zoom · F fit all · C find me</p>
        <div className="map-legend"><span className="legend-you">● You</span><span className="legend-player">● Players</span><span className="legend-route">━ Suggested route</span><span className="legend-tram">┅ Tram</span><span className="legend-poly">━ Polybahn</span><span className="legend-npc">? Encounters / rides</span><span>◆ ETH exam entrance</span></div>
        <small>The round keeps running while you check the map. Map data © OpenStreetMap contributors · City model: Stadt Zürich / CC0</small>
      </div>
    </section>
    <PixelPanel id="battle-bus-intro" hidden role="status" aria-live="polite"></PixelPanel>
    <div id="activity-feed" hidden role="log" aria-live="polite" aria-label="Activity feed"></div>
    <div id="crosshair" hidden aria-hidden="true">+</div>
    <div id="combat-actions" hidden role="group" aria-label="Player actions">
      <div className="combat-action">
        <kbd>Click</kbd>
        <button id="punch-action" type="button" aria-label="Punch (click)" title="Right hook · click">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 11V7a2 2 0 0 1 4 0v4M9 11V5a2 2 0 0 1 4 0v6M13 11V6a2 2 0 0 1 4 0v5M17 11V8a2 2 0 0 1 4 0v6c0 3-2 5-4 5H9c-2 0-3-1-4-3l-2-3a2 2 0 0 1 3-2l3 3h5M9 19v3h8v-3" />
          </svg>
          <span className="action-countdown" aria-hidden="true" />
        </button>
      </div>
      <div className="combat-action">
        <kbd>C</kbd>
        <button id="slide-action" type="button" aria-label="Slide (C)" title="Slide while sprinting · C">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="15" cy="5" r="2" /><path d="m13 9-4 4 4 3 7 2M9 13l-4 5H2M13 9l5 3 3-1M2 22h20M3 10h4M1 14h3" />
          </svg>
          <span className="action-countdown" aria-hidden="true" />
        </button>
      </div>
    </div>
    <section id="pause" hidden aria-label="Game menu">
      <PixelPanel className="game-menu-panel">
        <h2>Game menu</h2>
        <p>Press Escape, WASD, or Enter to resume. {offline ? "The offline world keeps running." : "The multiplayer world keeps running."}</p>
        <button id="resume">Resume game</button>
        <div id="spectator-settings" hidden><button id="spectator-flight">Free flight</button><button id="spectator-exam">Back to exam</button></div>
        <button id="respawn">Respawn at bus drop-off</button>
        <button id="perspective">View: First person</button>
        <details className="game-settings"><summary>Settings</summary><div>
        <label><input id="bob" type="checkbox" defaultChecked /> Walking / running bob</label>
        <label><input id="vehicle-sounds" type="checkbox" defaultChecked /> Movement and vehicle sounds</label>
        <label><input id="medal-sounds" type="checkbox" defaultChecked /> Medal sounds</label>
        <label htmlFor="sensitivity">Mouse / trackpad sensitivity</label>
        <input id="sensitivity" type="range" min="8" max="60" defaultValue="25" />
        <label htmlFor="render-resolution">Rendering resolution</label>
        <select id="render-resolution" value={resolution}
          onChange={event => onResolutionChange(event.target.value === "high" ? "high" : event.target.value === "medium" ? "medium" : "performance")}>
          <option value="performance">Performance</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <p className="setting-help">Performance: low resolution and shadows. Medium: high resolution, low shadows. High: high resolution and longer shadows.</p>
        </div></details>
        <details className="game-controls-guide"><summary>Controls</summary>
        <dl className="game-control-list">{[
          ["W A S D", "Move"], ["Shift", "Sprint"], ["Space", "Jump"], ["C", "Slide"],
          ["Click", "Punch"], ["E", "Interact"], ["F", "Change view"], ["M", "City map"],
          ["P", "Phone"], ["B", "Emotes"], ["1", "Drink Mate"], ["3", "Karambit"],
          ["Q", "Throw / slash"], ["4", "Football"], ["5", "Tomatoes"], ["R", "Wipe tomato"], ["Backspace", "Leave Polybahn"], ["Esc", "Game menu"],
        ].map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
        </details>
        <p role="status"></p>
        <button id="toggle-coordinates" type="button" hidden>Activate Coordinates</button>
        <button id="leave">Leave room</button>
        <button id="finish-round" hidden>End round for everyone</button>
      </PixelPanel>
    </section>
  </>;
}
