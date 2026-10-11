import { useState } from "react";
import "./game.css";
import "./raceHud.css";
import { CHARACTERS as characters } from "./avatar.ts";

export function GameOverlay({ resolution, onResolutionChange }: {
  resolution: "performance" | "high";
  onResolutionChange: (resolution: "performance" | "high") => void;
}) {
  const [character, setCharacter] = useState(0);
  const cycleCharacter = (direction: number) => setCharacter(current => (current + direction + characters.length) % characters.length);
  return <>
    <section id="lobby" aria-label="Multiplayer lobby">
      <div className="menu-story">
        <p className="menu-place">ZÜRICH / SCHWEIZ</p>
        <h2>Race to ETH</h2>
        <p className="menu-neighbourhoods">Zürich HB <span className="menu-route-arrow">→</span> ETH HG</p>
        <p className="menu-game-type">One city. Every player for themselves.</p>
        <p className="mission-intro">Your exam is starting. Race across Zürich, find a ride, and reach ETH before time runs out.</p>
        <div className="lobby-controls" aria-label="Game controls">
          <h3>Know your moves</h3>
          <dl>
            <div><dt><kbd>W A S D</kbd></dt><dd>Move <span>Mouse to look</span></dd></div>
            <div><dt><kbd>Shift</kbd></dt><dd>Sprint <span>C to slide while sprinting</span></dd></div>
            <div><dt><kbd>Space</kbd></dt><dd>Jump</dd></div>
            <div><dt><kbd>E</kbd></dt><dd>Interact / ride <span>Follow prompts near people and vehicles</span></dd></div>
            <div><dt><kbd>Click / F</kbd></dt><dd>Punch</dd></div>
            <div><dt><kbd>M</kbd></dt><dd>Open city map <span>Scroll to zoom · drag to pan</span></dd></div>
            <div><dt><kbd>V</kbd></dt><dd>Change view</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>Game menu</dd></div>
          </dl>
          <p className="controls-extra"><kbd>1</kbd> Drink Mate · <kbd>E</kbd> Leave a ride · <kbd>Backspace</kbd> Leave Polybahn</p>
        </div>
        <a className="practice-exam" href="/minigames/eth-blur">Practice the final exam ↗</a>
      </div>
      <form onSubmit={event => event.preventDefault()}>
        <div className="menu-card-heading"><span>CHOOSE YOUR CHARACTER</span><span>0{character + 1} / 0{characters.length}</span></div>
        <div className="character-picker" role="group" aria-label="Choose your character"
          onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault(); cycleCharacter(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}>
          <button type="button" className="character-arrow" aria-label="Previous character" onClick={() => cycleCharacter(-1)}>‹</button>
          <div id="character-stage" role="img" aria-label={`3D preview of ${characters[character]}`} />
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
        <input id="room-code" autoComplete="off" maxLength={12} minLength={4} placeholder="e.g. ZURICH" />
        <fieldset id="dev-settings">
          <legend>Testing</legend>
          <label><input id="dev-mode" type="checkbox" /> Dev mode</label>
          <label id="skip-intro-option" hidden><input id="skip-intro" type="checkbox" defaultChecked /> Skip starting bus animation</label>
          <label id="gold-bikes-option" hidden><input id="gold-bikes" type="checkbox" defaultChecked /> Gold working PubliBikes</label>
          <label id="coordinates-option" hidden><input id="activate-coordinates" type="checkbox" /> Activate Coordinates</label>
          <label id="rail-protection-option" hidden><input id="rail-protection" type="checkbox" /> Prevent tram derailment</label>
          <p className="hint">Saved on this browser. Applies to rooms you create; everyone in the room starts together.</p>
        </fieldset>
        <div className="buttons">
          <button type="submit" value="create" disabled>Create room <span aria-hidden="true">↗</span></button>
          <button type="submit" value="join" disabled>Join room</button>
        </div>
        <p className="hint">Choose a code to create a session. Share it so others can join.<br />4–12 letters, numbers, or hyphens.</p>
        <p role="status" aria-live="polite">Loading Zürich…</p>
      </form>
      <div className="menu-coordinate"><span className="location-dot" aria-hidden="true"></span> ZÜRICH, SWITZERLAND <span>47.3769° N · 8.5417° E</span></div>
      <a className="menu-credit" href="https://data.stadt-zuerich.ch/dataset/geo_bauten___kombinierte_darstellung_heute" target="_blank" rel="noreferrer">Source data: Stadt Zürich · CC0</a>
    </section>
    <section id="room-screen" hidden aria-label="Room" aria-live="polite">
      <div className="room-heading"><p className="menu-kicker">MULTIPLAYER LOBBY</p><h2>Zürich HB → ETH HG</h2></div>
      <div id="squad-labels" aria-hidden="true"></div>
      <div className="room-location"><span className="location-dot" aria-hidden="true"></span><div>POLYTERRASSE<span>ETH ZENTRUM / ZÜRICH</span></div></div>
      <div className="room-card">
        <div className="room-card-top"><span>PRIVATE ROOM</span><span id="room-count"></span></div>
        <p className="eyebrow" id="room-code-label"></p>
        <h1 id="room-title">Lobby</h1>
        <p id="room-message" role="status"></p>
        <ul id="room-roster" aria-label="Players in this room"></ul>
        <button id="room-ready" hidden>Ready</button>
        <table id="room-results" hidden>
          <caption>Round results</caption>
          <thead><tr><th scope="col">Player</th><th scope="col">Hits landed</th><th scope="col">Hits received</th></tr></thead>
          <tbody></tbody>
        </table>
        <button id="room-restart" hidden>Return room to lobby</button>
        <button id="room-leave">Leave room</button>
      </div>
      <a className="menu-credit" href="https://data.stadt-zuerich.ch/dataset/geo_bauten___kombinierte_darstellung_heute" target="_blank" rel="noreferrer">Source data: Stadt Zürich · CC0</a>
    </section>
    <div id="round-timer" hidden aria-live="off">
      <span id="timer-label">EXAM STARTS IN</span><strong id="timer-value">0:00</strong>
      <div className="timer-track" aria-hidden="true"><i id="timer-fill" /></div>
    </div>
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
    <div id="battle-bus-intro" hidden role="status" aria-live="polite"></div>
    <div id="activity-feed" hidden role="log" aria-live="polite" aria-label="Activity feed"></div>
    <div id="crosshair" hidden aria-hidden="true">+</div>
    <div id="combat-actions" hidden role="group" aria-label="Player actions">
      <div className="combat-action">
        <kbd>F</kbd>
        <button id="punch-action" type="button" aria-label="Punch (F)" title="Right hook · F or click">
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
      <div>
        <h2>Game menu</h2>
        <p>Your controls are paused. The multiplayer world keeps running.</p>
        <button id="resume">Resume game</button>
        <button id="respawn">Respawn at bus drop-off</button>
        <button id="perspective">View: First person</button>
        <label><input id="bob" type="checkbox" defaultChecked /> Walking / running bob</label>
        <label><input id="vehicle-sounds" type="checkbox" defaultChecked /> Movement and vehicle sounds</label>
        <label><input id="medal-sounds" type="checkbox" defaultChecked /> Medal sounds</label>
        <label htmlFor="sensitivity">Mouse / trackpad sensitivity</label>
        <input id="sensitivity" type="range" min="8" max="60" defaultValue="25" />
        <label htmlFor="render-resolution">Rendering resolution</label>
        <select id="render-resolution" value={resolution}
          onChange={event => onResolutionChange(event.target.value === "high" ? "high" : "performance")}>
          <option value="performance">Performance</option>
          <option value="high">High — sharper image</option>
        </select>
        <p>Performance reduces rendering resolution for smoother play. High uses more GPU power.</p>
        <p>Mouse / trackpad: look · click to punch.<br />
          WASD run · Shift sprint · Space jump · C slide while sprinting · E ride<br />
          F hit<br />
          M city map · F5 / V change view · Esc menu<br />1 drink Mate · Backspace leave Polybahn</p>
        <p role="status"></p>
        <button id="toggle-coordinates" type="button" hidden>Activate Coordinates</button>
        <button id="leave">Leave room</button>
        <button id="finish-round" hidden>End round for everyone</button>
      </div>
    </section>
  </>;
}
