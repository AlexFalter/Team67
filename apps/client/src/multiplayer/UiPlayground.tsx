import { useRef, useState } from 'react';
import { PixelPanel } from './PixelPanel';
import { UI_PLAYGROUND_LOCATIONS } from './uiPlaygroundLocations';
import './uiPlayground.css';

export function UiPlayground({ ready, onAction }: {
  ready: boolean;
  onAction: (action: 'teleport' | 'tools' | 'reset' | 'moodle' | 'menu' | 'bus' | 'players', location?: string) => string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const [location, setLocation] = useState('mate');
  const [message, setMessage] = useState('Press Enter or click the world to play. Escape releases the cursor.');
  return <PixelPanel className="ui-playground" aria-label="Offline UI playground">
    <details ref={details}>
      <summary>UI playground <span>OFFLINE · NO TIMER</span></summary>
      <div className="ui-playground-body">
        <label htmlFor="ui-location">Jump to a feature</label>
        <div className="ui-playground-jump">
          <select id="ui-location" value={location} onChange={event => setLocation(event.target.value)}>
            {UI_PLAYGROUND_LOCATIONS.map(site => <option key={site.id} value={site.id}>{site.label}</option>)}
          </select>
          <button disabled={!ready} onClick={() => { const result = onAction('teleport', location); setMessage(result); if (result.startsWith('Ready') && details.current) details.current.open = false; }}>Go</button>
        </div>
        <div className="ui-playground-actions">
          <button disabled={!ready} onClick={() => { setMessage(onAction('menu')); if (details.current) details.current.open = false; }}>Game menu</button>
          <button disabled={!ready} onClick={() => setMessage(onAction('tools'))}>Give items + emotes</button>
          <button disabled={!ready} onClick={() => setMessage(onAction('moodle'))}>Moodle question</button>
          <button disabled={!ready} onClick={() => setMessage(onAction('players'))}>Preview player tags</button>
          <button disabled={!ready} onClick={() => setMessage(onAction('bus'))}>Bus intro preview</button>
          <button disabled={!ready} onClick={() => setMessage(onAction('reset'))}>Reset encounters</button>
        </div>
        <p role="status">{message}</p>
        <p>Use E near people, machines and vehicles. M opens the city map; click a location to teleport.</p>
        <a href="/">Back to multiplayer</a>
      </div>
    </details>
  </PixelPanel>;
}
