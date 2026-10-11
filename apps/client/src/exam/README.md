# Campusless entrance integration

The portal is an independent scene entity in `entities/examPortal/ExamPortal.ts`.
`packages/shared/src/finalExam.ts` holds its Swiss LV95 position and the fixed
world origin. No GLB node IDs, triangles or object names are used, so replacing
the map asset preserves the entrance. The current marker is on Polyterrasse,
in front of HG (local x=226, y=50.7, z=149). Update the LV95 anchor if the team
moves the entrance; keep the shared coordinate contract intact.

During a running round, walk into the yellow ring on foot. `ExamSequence.ts`
shows a brief “Chance for bonus points” banner, then opens the building quiz
without moving the camera. Map controls pause while the quiz is active; the
server clock and network connection keep running. Each player can enter once
per round. The next round resets the entrance. The exam uses the server's
remaining round time. Finishing early leaves the score screen open; returning
to the world preserves membership. Exam scores are local to Campusless.

The old flyover and seated-room animation handoff has been removed.

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

Choose **Spectate instead** during the entrance or building quiz to watch the
current round. The server removes the player body but keeps room membership.
Left/right arrows switch players; drag the canvas to orbit and scroll to zoom.
Choose **Free flight** for a camera that passes through geometry: WASD flies in
the look direction, Space rises, Shift descends and Ctrl increases speed. Escape
opens the game menu, which also offers **Follow players** and **Back to exam**.
Returning to the exam uses the existing round deadline and keeps the player as
a server spectator; **Spectate instead** returns to the spectator camera.
At round end the results appear, and the next round restores normal participation.
The phone and its notifications are hidden during the exam and while spectating.
