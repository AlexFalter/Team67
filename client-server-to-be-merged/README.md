# Capsule race

Minimal multiplayer prototype using TypeScript, three.js, Vite, and Colyseus. No physics engine, database, authentication, or UI framework.

Use Node **22.12+** and npm. From this directory:

```sh
npm install
npm run dev
```

Open http://localhost:5173 in two or three tabs. WASD moves relative to the camera, Shift sprints, Space jumps, and dragging the canvas orbits the camera. Sound unlocks on first keyboard or pointer input. Reload to rejoin after disconnecting.

## Vehicles

Press **E** near a vehicle to board and **E** again to get out. The controls at the bottom change while riding, and labels above the vehicles show availability and the shuttle countdown.

- Three orange **carts** start near the center. Each has one exclusive driver; the server reserves it for the first successful boarder. Drive with camera-relative WASD. Carts accelerate to 16 units/s and remain on the plane. Running into a player on foot pushes them away and knocks them down at higher impact speeds, with the existing bump particles and sound. Exiting or disconnecting frees the cart and stops it immediately.
- A blue **shuttle** has six seats and runs between the gold and blue stops at `(-12, 9)` and `(12, 9)`. Its first passenger starts a **10-second countdown**. Additional passengers do not restart it. During the countdown passengers may leave; if everyone leaves, the countdown cancels. At departure it carries all passengers to the opposite stop and automatically lets them out. Boarding and voluntary exits are disabled while travelling. The next group can use it for the return trip.

Vehicle speeds, capacities, countdowns, spawn locations, and stops are tunable in `packages/shared/src/constants.ts`. Vehicles use plain kinematic math and existing three.js primitives; no dependencies were added.

| Script               | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Colyseus on 2567 and Vite on 5173 via concurrently               |
| `npm run build`      | Type checks all workspaces and builds `apps/client/dist`         |
| `npm start`          | One Node process serves the built client and multiplayer on 2567 |
| `npm run bots -- 10` | Connects N headless players (1–40)                               |
| `npm run check`      | TypeScript checks                                                |
| `npm test`           | Movement, collision, interpolation, and live-server tests        |

All tuning lives in `packages/shared/src/constants.ts`. The shared package contains message types, movement, and capsule math. Each race room holds up to 40 players; further players join another room.

## Environment variables

- `VITE_COLYSEUS_URL`: development browser endpoint, default `ws://localhost:2567`. Set in `apps/client/.env` and restart Vite. For development on a second device, set `ws://YOUR_LAN_IP:2567`.
- `COLYSEUS_URL`: bot endpoint, default `ws://localhost:2567`.
- `PORT`: server port, default `2567`.
- `NODE_ENV=production`: enables static serving; `npm start` also enables it through a cross-platform command-line flag.

Production browser connections derive the WebSocket URL from the page host and port, using `wss:` under HTTPS.

## Production / LAN

```sh
npm install
npm run build
npm start
```

Visit http://localhost:2567 or http://YOUR_LAN_IP:2567 from another device on the same network. The server binds to `0.0.0.0`; allow TCP 2567 through your host firewall. Retain the workspace and installed dependencies on the production machine: Node runs TypeScript through tsx. For public HTTPS, forward HTTP and WebSocket upgrade requests through a TLS reverse proxy to the same port.

## Implementation

Clients simulate their own movement on foot and report compact arrays at 20 Hz. Colyseus patches at 20 Hz. The server never integrates movement on foot; its 30 Hz simulation interval updates the clock and referees capsule hits. Reports reject nonfinite values and horizontal displacement above twice sprint speed (with a small timing allowance), and clamp positions and velocities. Center respawns after falling are allowed. Reports older than 500 ms cannot trigger capsule hits.

Vehicle occupancy and seat assignment are server authoritative. Clients send `vehicleEnter` with a vehicle ID or `vehicleExit`; the server replies with `vehicleResult`. Only a cart's reserved driver may send `vehicleMove`: `[id, x, z, rotY, vx, vz]` at 20 Hz. The server validates its speed and plane bounds, attaches the rider, and referees cart impacts. Normal movement reports are ignored while aboard. Shuttle departure and arrival use server timestamps and analytic route movement. Remote vehicles interpolate on the same delayed timeline as players, and rendered riders attach to their vehicle's seats. The local cart driver renders from immediate movement simulation. Existing bots remain on foot and can be run over.

Remote snapshots retain about one second and interpolate 100 ms behind estimated server time. Angles take the shortest route. Ping bursts choose the lowest RTT sample and repeat every ten seconds. Bump effects wait for the remote render clock. Local soft separation moves only the local capsule; impulses affect velocity and knockdown. The pair loop reuses contact and message objects and stores cooldowns in a fixed 40×40 array.

This deliberately trusts movement for a hackathon prototype. Rejected reports are not reconciled. Logs contain joins/leaves and one ten-second performance summary per room.

## Validation

Run `npm test` and `npm run build`, then run 30 bots alongside browser players with `npm run bots -- 30`. Check the ten-second `collision-tick` average, normal bumps, sprint knockdowns, stomps in both directions, and effects in a third tab. Browser rendering/sound and second-device connectivity require manual checks.

Verified with Node 22.20.0:

- `npm install`, `npm test` (13 tests), and `npm run build` pass.
- The live-server test starts its own server on a free port and checks three-client state sync, ping/pong, invalid movement rejection, sprint impulses, cooldown, both stomp directions, spectator bumps, and leave removal.
- Two Chrome tabs joined the Vite dev server alongside 30 bots without browser errors. The foreground HUD reported 60 FPS.
- After warm-up, 30-bot collision ticks averaged about 0.4–0.6 ms across multiple ten-second reporting windows. Forcing three browsers to use CPU-only WebGL caused substantial contention and timing spikes; use hardware-accelerated WebGL for the game.
- Production HTML and WebSockets worked together through the machine's LAN IP. Browser WASD movement and jumping reached the server, and an instrumented spectator generated its bonk 115 ms after the collision timestamp, matching the 100 ms interpolation delay plus a frame.
- Vehicle tests cover simultaneous exclusive claims over real connections, unauthorized updates, attached rider sync, exits, disconnect cleanup, run-over cooldown and airborne targets, full shuttles, a single shared countdown, cancellation, travel, arrival, and return trips. A two-browser test boarded and drove a cart, rejected a competing claim, hit another player, and carried both players together in the shuttle through arrival with no browser errors.

A physically separate device and audible sound quality still need manual checking. The browser harness was kept outside the workspace; no browser automation dependencies were added to the project.

APIs follow the current [server setup](https://docs.colyseus.io/server), [schema 5 builder](https://docs.colyseus.io/state/schema), [SDK state-change callbacks](https://docs.colyseus.io/sdk), and [0.18 migration notes](https://docs.colyseus.io/migrating/0.18). The lockfile records stable Colyseus 0.18.9, SDK 0.18.5, and schema 5.0.36. Keep the lockfile and use `npm ci` for reproducible installs.
