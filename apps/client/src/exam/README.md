# Campusless entrance integration

The portal is an independent scene entity in `entities/examPortal/ExamPortal.ts`.
`packages/shared/src/finalExam.ts` holds its Swiss LV95 position and the fixed
world origin. No GLB node IDs, triangles or object names are used, so replacing
the map asset preserves the entrance. The current marker is on Polyterrasse,
in front of HG (local x=226, y=50.7, z=149). Update the LV95 anchor if the team
moves the entrance; keep the shared coordinate contract intact.

During a running round, walk into the yellow ring on foot. `ExamSequence.ts`
owns the four-second bird's-eye orbit, the room-animation handoff and the
exam phase. It disables map controls and releases pointer lock; the original
network connection and server clock keep running. Each player can enter once
per round. The next round resets the entrance. The exam uses the exact server
`endsAt - Network.now()` time; its standalone 30s / `?time=` setting is ignored.
Finishing the deck early leaves the score screen open. Returning to the world
preserves membership and lets the existing room results/restart UI work.
Exam scores are currently local to Campusless, not added to the shared hit table.

## Add the seated exam-room animation

Replace `playExamRoomAnimation` in `examRoomAnimation.ts`. It receives the
scene, camera, a coordinate-based seat anchor and an AbortSignal. Add the
room / paper assets there, animate the seat and camera, then resolve the
promise when the paper is ready. The current implementation is a brief dark
transition with “Take your seat.” Respect cancellation and dispose temporary
resources. Expiry and “Skip intro” cancel the sequence and open the exam;
no new countdown starts. `ExamOverlay.tsx` owns the presentation.

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
