import { EthBlur } from './minigames/eth-blur/EthBlur';
import { lazy, Suspense } from 'react';

const MapViewer = lazy(() => import('./scene/MapViewer').then(module => ({ default: module.MapViewer })));

export default function App() {
  if (['/minigames/eth-blur', '/dev/eth-blur'].includes(window.location.pathname)) return <EthBlur />;
  return <main className="game-shell">
    <Suspense fallback={<p>Loading world…</p>}><MapViewer /></Suspense>
  </main>;
}
