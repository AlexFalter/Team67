import "./game.css";

export function GameOverlay() {
  return <>
    <section id="lobby" aria-label="Multiplayer lobby">
      <form>
        <p className="eyebrow">ZÜRICH MULTIPLAYER</p>
        <h1>Campus chase.</h1>
        <p>Create a room or join your friends by code.</p>
        <label htmlFor="character">Your character</label>
        <select id="character" defaultValue="0">
          <option value="0">CS Student — glasses &amp; backpack</option>
          <option value="1">Student Athlete — varsity &amp; sneakers</option>
          <option value="2">Albert Einstein — wild hair &amp; moustache</option>
        </select>
        <label htmlFor="room-code">Room code</label>
        <input id="room-code" autoComplete="off" maxLength={12} placeholder="e.g. TEAM67" />
        <div className="buttons">
          <button type="submit" value="create">Create room</button>
          <button type="submit" value="join">Join room</button>
        </div>
        <p className="hint">4–12 letters, numbers, or hyphens. Leave blank when creating to generate a code.</p>
        <p role="status" aria-live="polite"></p>
      </form>
    </section>
    <button id="play" hidden>Click to play<br /><small>Mouse / trackpad look · WASD run · Space jump · Esc menu</small></button>
    <div id="crosshair" hidden aria-hidden="true">+</div>
    <section id="pause" hidden aria-label="Game menu">
      <div>
        <h2>Game menu</h2>
        <p>Your controls are paused. The multiplayer world keeps running.</p>
        <button id="resume">Resume game</button>
        <button id="perspective">View: First person</button>
        <label><input id="bob" type="checkbox" defaultChecked /> Walking / running bob</label>
        <label htmlFor="sensitivity">Mouse / trackpad sensitivity</label>
        <input id="sensitivity" type="range" min="8" max="60" defaultValue="25" />
        <p>Mouse / trackpad: look · click to punch.<br />
          WASD run · Shift sprint · Space jump · E ride<br />
          F hit · R shoes<br />
          F5 / V change view · Esc menu</p>
        <p role="status"></p>
        <button id="leave">Leave room</button>
      </div>
    </section>
  </>;
}
