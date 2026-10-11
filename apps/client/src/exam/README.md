# Campusless entrance integration

The portal is an independent scene entity in `entities/examPortal/ExamPortal.ts`.
`packages/shared/src/finalExam.ts` holds its Swiss LV95 position and the fixed
world origin. No GLB node IDs, triangles or object names are used, so replacing
the map asset preserves the entrance. The current marker is on Polyterrasse,
in front of HG (local x=226, y=50.7, z=149). Update the LV95 anchor if the team
moves the entrance; keep the shared coordinate contract intact.

During a running round, walk into the yellow ring on foot. `ExamSequence.ts`
owns the four-second bird's-eye orbit, the room-animation handoff and the
exam phase. Both the real entrance and preview start at the same elevated
outside camera position from `examFlyoverPosition`; they do not blend through
the building from the player's previous camera. It disables map controls and
releases pointer lock; the original
network connection and server clock keep running. Each player can enter once
per round. The next round resets the entrance. The exam uses the exact server
`endsAt - Network.now()` time; its standalone 30s / `?time=` setting is ignored.
Finishing the deck early leaves the score screen open. Returning to the world
preserves membership and lets the existing room results/restart UI work.
Every correct answer immediately reports its accumulated score and correct count
to the existing room connection. `examStart` is accepted only for an active
participant at the server-confirmed portal; `examProgress` is tied to that
round's `startedAt`. The server rejects stale, decreasing, malformed or
out-of-bounds reports, and completion locks further updates. At the deadline,
the server retains the latest progress without waiting for a final client
message. Disconnected participants' scores are retained too.

Server-side `RoundManager` stores exam progress alongside hit statistics.
Replicated `state.results.get(sessionId)` exposes `examScore`, `examCorrect`,
`examCompleted` and `examStartedAt` for the later final-score calculation.
No combined scoring formula is imposed here. These are validated client score
reports, not server-verified building answers; answer-level anti-cheat would
require a server-owned deck. Results freeze when the round ends and reset only
when the host resets the round.

## Standalone exam preview

Open `/dev/exam` to play the same four-second ETH orbit, brief seating transition
and exam game as the Polyterrasse entrance, without joining a multiplayer room.
The preview uses the shared three-minute round duration, starting after the
map loads; use
`/dev/exam?time=60` to change its duration in seconds. The game opens
automatically. Reload the page to replay the transition.

Open `/dev/exam/game` to test just the game after the transition. This uses the
standalone 30-second timer; `/dev/exam/game?time=180` gives three minutes.
The real entrance continues to use the shared server round deadline. Preview
routes do not submit scores to a multiplayer server.

## Add the seated exam-room animation

Replace `playExamRoomAnimation` in `examRoomAnimation.ts`. It receives the
scene, camera, a coordinate-based seat anchor and an AbortSignal. Add the
room / paper assets there, animate the seat and camera, then resolve the
promise when the paper is ready. The current implementation is a brief dark
transition with “Take your seat.” Respect cancellation and dispose temporary
resources. Expiry cancels the sequence and opens the exam;
no new countdown starts. `ExamOverlay.tsx` owns the presentation.

The transition uses the ETH Zürich logo from
https://ethz.ch/etc/designs/ethz/img/header/ethz_logo_black.svg,
stored locally at `public/assets/eth-zurich.svg` and displayed in white.

## Temporary debug teleport

Development builds show “DEBUG · Teleport to Polyterrasse”. Create/join a
room and ready up first, then click it. It moves you eight metres outside
the portal; walk forward into the ring. Shift-click the button
to enter directly and test the full transition. The server module
`apps/server/src/examDebug.ts` confirms the move and sends a position
correction, so normal movement validation keeps working. It rejects lobby,
spectator, non-Zürich and seated-in-vehicle requests. The handler is absent
for `NODE_ENV=production` and `--production`; the button is absent in a Vite
production build. Remove these two debug files and their small call sites
when finished testing.

Existing wiring is limited to MapGame, MapViewer, Race, the shared export and
optional `startImmediately` / `onExit` props on EthBlur. All scene assets and
transition logic stay in separate files for straightforward merging.
