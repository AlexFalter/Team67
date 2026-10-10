import { MapViewer } from './scene/MapViewer';

export default function App() {
  return <main>
    <header><h1>Zürich HB → ETH Zentrum</h1><p>Multiplayer capsules · carts · shared shuttle · official city model</p></header>
    <MapViewer />
    <footer>Buildings & terrain: <a href="https://data.stadt-zuerich.ch/dataset/geo_bauten___kombinierte_darstellung_heute" target="_blank" rel="noreferrer">Stadt Zürich / Geomatik + Vermessung</a> · CC0</footer>
  </main>;
}
