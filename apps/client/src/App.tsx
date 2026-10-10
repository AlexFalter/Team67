import { EthBlur } from './minigames/eth-blur/EthBlur';
import { lazy, Suspense } from 'react';

const MapViewer = lazy(() => import('./scene/MapViewer').then(module => ({ default: module.MapViewer })));

export default function App() {
  if (['/minigames/eth-blur', '/dev/eth-blur'].includes(window.location.pathname)) return <EthBlur />;
  return <main>
    <header><h1>Zürich HB → ETH Zentrum</h1><p>Multiplayer capsules · carts · shared shuttle · official city model</p></header>
    <a href="/minigames/eth-blur" style={{ padding: '8px 22px' }}>Play Campusless · Final Exam →</a>
    <Suspense fallback={<p>Loading world…</p>}><MapViewer /></Suspense>
    <footer>Buildings & terrain: <a href="https://data.stadt-zuerich.ch/dataset/geo_bauten___kombinierte_darstellung_heute" target="_blank" rel="noreferrer">Stadt Zürich / Geomatik + Vermessung</a> · CC0</footer>
  </main>;
}
