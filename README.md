# Zürich multiplayer prototype

The original Zürich map viewer and Colyseus prototype now run together. The workspace contains the integrated game. The existing React page hosts plain TypeScript gameplay modules and a single Three.js scene. Rapier handles relevant entity contacts; shared map queries keep terrain movement deterministic. No database or authentication system is required.

## Run locally

Use Node **22.12+** (Node 24 also works). From `Team67/`:

```sh
npm install
npm run dev
```

Open **http://localhost:5173** in two tabs. Create a room with a code, then join that same code in another tab (up to 40 players). Choose CS Student Boy, CS Student Girl, Albert Einstein, or Rector Dissertori. Other players have a faint red outline and a name above their character. Players spawn on clear terrain near Hauptbahnhof, alongside three single-seat carts and a six-seat shuttle. The project contains only the game client, multiplayer server, and shared code.

Enter your name (1-24 characters), choose a character, and create or join a room. Rooms follow **Lobby ? Running ? Finished**. In the room lobby, everyone must press **Ready** before the round starts; readiness can be cancelled while waiting. Joining an ongoing round opens a waiting screen instead of spawning a player.

Rounds last **three minutes** by default (`ROUND_DURATION_MS` on the server). The host can also end the round from the game menu. At the end, every connected member sees the same results, sorted by hits landed, including players who left during the round. The host can return everyone to the lobby; waiting members can then ready up and play. If the host leaves, host duties pass to another connected member. Gameplay and vehicle claims are disabled outside a running round and for waiting members.

Click **Click to play** to capture the cursor. Mouse / trackpad looks, **WASD** runs, **Shift** sprints, **Space** jumps, **C** slides while sprinting, **E** rides/exits, **F / click** punches. **F5 / V** cycles first-person, rear, and front views. **Esc** opens the quick menu (bob, sensitivity, leave). **Inspect map** from the lobby/menu leaves the room; **Join multiplayer** returns to the lobby.

Carts are claimed exclusively by one player. Their driver can run over foot players. The shuttle starts its **10-second countdown** when the first passenger boards, follows a shared terrain route toward ETH, and automatically disembarks riders on arrival. Later boarders do not reset the countdown. An empty shuttle cancels its countdown; passengers cannot exit while it travels. Board again at ETH for the return trip. The route is roughly two minutes each way, rather than the old short flat-plane trip.

## Commands

Run these from `Team67/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Colyseus on 2567 and Vite on 5173, both bound to the network |
| `npm run build` | Regenerate shared map queries from the checked-in GLB, type-check, build `apps/client/dist` |
| `npm start` | One Node process serves the built game and Colyseus on 2567 |
| `npm run bots -- 30` | 30 headless players using native inputs (set ROOM_CODE to join a visible room) |
| `npm test` | Shared collision, interpolation, live server, vehicle, and map regression checks |
| `npm run check` | TypeScript checks across the workspace |
| `npm run lint` | Frontend ESLint |
| `npm run world:build` | Regenerate terrain/building queries and shuttle route, entirely offline |

For UI development, run only `npm run dev:client -w @race/client` and open `/dev/ui` on the Vite URL. This development-only playground skips joining a room and the bus intro, spawns one player directly into Zürich and has no round or exam time limit. It makes no matchmaking or game WebSocket connection; gameplay managers run locally. Assets still load from Vite. Press Escape to release the cursor and expand **UI playground** for feature teleports, item/emote grants, a Moodle question, sample opponents/name tags, a bus-intro preview and encounter resets. Feature jumps collapse the controls; interaction screens hide them so they cannot cover the UI. Enter resumes play, E interacts, P opens the phone and M opens the teleport-enabled city map. The normal `/` route keeps multiplayer behavior.

The shared `PixelPanel` component and `pixelPanel.css` tokens define the UI baseline: gray pixel boundaries and inset shadows, dark teal panels, the lobby's monospace headings and lime accents. This design carries through both lobbies, maps, the game menu, encounter dialogues, ticket and Mate interfaces, the phone and notifications, emotes, player tags and bus-intro overlays. The scoreboard shows five leaders and the performance display stays compact. Use the same component and tokens for subsequent UI work.

`npm run dev` from `apps/client/` also starts both services. Use the root workspace install and lockfile. `npm run dev:client` inside `apps/client/` starts only Vite for work with an already running server. `vite preview` alone serves static files and does not provide the multiplayer service.

## Environment and production

| Variable | Used by | Meaning |
| --- | --- | --- |
| `VITE_COLYSEUS_URL` | Vite development client | Defaults to `ws://localhost:2567`; copy `apps/client/.env.example` to `apps/client/.env.local` to override |
| `PORT` | Node server | Defaults to 2567 |
| `COLYSEUS_URL` | Bots | Defaults to `ws://localhost:2567` |
| `GAME_WORLD=flat` | Server/bots regression tests | Old flat prototype world; leave unset for the Zürich frontend |

```sh
npm run build
npm start
```

Open **http://localhost:2567**. On another device on the same LAN, open `http://<server-LAN-IP>:2567` and allow that port through the host firewall. Production derives its WebSocket URL from the page's host and port, using `wss:` with HTTPS. No client environment override is required in production. For Vite development from another device, set `VITE_COLYSEUS_URL=ws://<server-LAN-IP>:2567` and restart Vite; otherwise its default points at that device's own localhost.

Docker Compose runs two services: `client` (Caddy) and `server` (Colyseus). For a server deployment, point a public DNS `A` record (and, if used, `AAAA` record) at the server, then allow inbound TCP ports **80** and **443** through its firewall. Caddy obtains and renews the TLS certificate, redirects HTTP to HTTPS, and proxies `/matchmake/*` and WebSocket upgrades to Colyseus over the private Docker network. The browser connects using HTTPS and secure WebSockets (`wss:`); the Colyseus port is not published publicly. Caddy's `/data` and `/config` are persisted in named Docker volumes so certificates survive container replacement.

```sh
printf 'DOMAIN=game.example.com\n' > .env
docker compose up -d --build --remove-orphans
```

Replace `game.example.com` with the domain already pointed at the server. Open `https://game.example.com`; the first startup needs outbound internet access so Caddy can obtain the certificate. On later updates, pull the deployment branch and run `docker compose up -d --build --remove-orphans` again. `docker compose down` keeps the certificate volumes; `docker compose down -v` removes them. View logs with `docker compose logs -f client server`. Local `npm run dev` remains available over HTTP on localhost.

The original hackathon template documents that the **portal proxy rejects WebSockets with 502**. Caddy routing cannot fix a proxy upstream of it. Use direct LAN access, an SSH tunnel, or a deployment endpoint that supports WebSockets; portal compatibility must be verified separately. Inspection mode still works without a multiplayer connection.

## Architecture and authority

- `apps/client/src/scene/MapViewer.tsx`: map loading, renderer, camera, lights, resizing, one animation loop, inspect/play lifecycle.
- `apps/client/src/multiplayer/`: local movement/input, delayed remote interpolation, networking/clock sync, vehicles, particles/audio, and HUD. `MapGame.ts` wires these into the existing map scene.
- `apps/server/src/`: Colyseus 0.18 server, schema 5 state, collision referee, atomic vehicle occupancy, shuttle schedule, and bots.
- `packages/shared/src/`: constants, protocol types, capsule/cart collision math, movement, terrain and building queries, and route sampling.
- `scripts/build-world.ts`: derives `zurich-world.json` from the existing GLB, with a source hash and deterministic placements/route.

Networking follows main's client-owned movement: compact movement/vehicle reports at 20 Hz, server validation, ping/pong clock synchronization, and impulse messages with 20 Hz state patches. The feature's shared movement, camera, character rigs, and Rapier contacts are retained. Remote players/vehicles interpolate 100 ms behind estimated server time. Player contact only separates players; cone hits knock down for five seconds. Bikes fall/eject on impacts, heavy trams keep moving, and foot movement uses acceleration and momentum. The server owns occupancy, action cooldowns, transport schedules, and collision corrections. Banana dropping/throwing and peel slips are removed.

The map keeps its original LV95 conversion: **X = E − 2683475**, **Y = elevation − 400**, **Z = 1248000 − N**, in metres. Shared terrain uses bilinear heights on a **2 m grid**, and buildings use a sampled roof/footprint obstruction mask. This is a deliberately approximate hackathon collision surface: it blocks ordinary buildings and follows hills, but does not model doors, tunnels, bridges, rooftop walking, water, or detailed wall geometry. The shuttle route avoids sampled building footprints; it is not an imported road network. The original 60 × 60 plane is only used in regression tests.

The official GLB and source credit are preserved. Builds do not fetch GIS data. See [apps/client/README.md](apps/client/README.md) for provenance and explicit map re-import instructions. If the GLB changes, run `npm run world:build` and commit its generated JSON too.

## Late for ETH mini-games prototype

The complete modular single-player prototype is in [`mini-games/`](mini-games/README.md). Run it independently:

```sh
cd mini-games
npm ci
npm run dev
```

See its [module guide](mini-games/src/README.md), [feature export guide](mini-games/docs/feature-modules.md), and [map placement guide](mini-games/src/world/placements/README.md). Features include NPC encounters, bike and scooter interactions, ticket and Mate machines, phone tasks, and vehicle passenger systems. The multiplayer ports live in `apps/client/src/npcPrototype` and `apps/client/src/multiplayer`.

At Central, press **E** in front of the Polybahn ticket machine. Swipe the card, scan the QR code with the phone, select the three trams, then collect the printed ticket. Each player has their own server-owned ticket; boarding validates one ticket and avoids the fare inspection for that ride. The private-property NPC intercepts players approaching the story boundary, including cart and bike drivers, and returns them to the safe spawn after the cutscene. Rail and shuttle passengers remain aboard. Client and server share the boundary around the current route, stations, and encounters.

Dev mode is available under **Testing** before creating a room. Enable **Dev mode → Skip starting bus animation** to start everyone directly at the normal bus drop-off when the host starts the match. These preferences are saved on the browser and belong to the room creator; joining a room follows that room’s settings. Dev mode can also keep the intro enabled. The skip persists for subsequent rounds in the same room.

Traffic starts populated on three fixed one-way tracks: HB traffic uses the left uphill lane, traffic from under the Polybahn carriage bridge uses the right uphill lane, and southern river traffic turns toward Polybahn. The tracks have no branching junctions and leave the uphill tram corridor clear. Development hosts can hand draw roads that snap to asphalt, batch-delete unwanted segments, and simulate traffic live before starting a round, adjust density or enable rush hour, and export/import JSON. See [the traffic guide](docs/traffic.md).
### Michael Jackson and emotes

Find Michael near the bridge, press **E**, and type back his two lines (`hee-hee` and `I wanna dance`) to unlock the emote wheel for the round. Press **B**, then click a dance or use **1–6**. Floss, Orange Justice, Take the L, Dance Moves, Dab, and The Robot are available. Moving stops the dance. Other players see the emote; nearby players hear the original Fortnite clips (the original Dab is silent). See the [emote feature guide](apps/client/src/multiplayer/emotes/README.md) for placement, server rules, and extension points.

### Ersti bags

Four bags lie on a small hill beside the bridge spawn. **E** picks one up; **Q** or click throws it. A player hit falls over, receives the bag, and can throw it back after recovering. Confirmed hits award **Bagged**. In a dev room, the host can enable **Spawn practice dummies** from the Escape menu. See [Ersti bag gameplay and modules](docs/ersti-bags.md).
