# AWP drone streak

Each confirmed Nerf AWP hit on a real player or debug mannequin earns 100 points. At 500 points, the player earns one drone. Repeated hits on the same player count after their recovery protection ends; misses, protected hits, NPCs do not count. Getting knocked down resets unfinished progress but preserves an already earned drone. Round restart clears both.

The right-side HUD uses a vertical bar with five segments and shows points toward 500, with a +100 flash on confirmed hits. Once ready, it displays “Press 7 to call in drone” with a drone icon. Calling it consumes the earned drone, holsters held weapons and plays an original first-person tablet animation with three button presses. Calls are blocked while incapacitated, interacting, riding, inspecting, reloading or cycling the AWP.

After the 2.4-second tablet animation, the server sends a fresh position snapshot every two seconds for 30 seconds. Only the caller receives these packets. Other active players appear as red dots on the minimap and city map; distant minimap dots clamp to its edge. Dots disappear when the scan ends. Normal maps do not show other players automatically.

Shared durations and packet types live in `packages/shared/src/drone.ts`. Server award and sweep logic live in `apps/server/src/awp.ts`; room routing sends each packet privately. Client presentation lives in `apps/client/src/multiplayer/streaks/`, while `raceMap.ts` draws the scan dots. The feature removes its DOM, subscriptions, camera model and graphics resources on disposal.

Validation: `npx tsx --test tests/drone.test.ts tests/awp.test.ts tests/player-medals.test.ts`, `npm run check`, and `npm run lint`. Browser review exercises the HUD, shortcut, tablet, red map dots and expiry with controlled client state; authority and private packet routing are tested separately.

UAV audio uses six original Black Ops III beta archive recordings. `droneSoundCues.ts` tracks confirmed server timestamps to synchronize the request, three tablet taps, arrival, each scan sweep and expiry without replaying on repeated patches or returning from pause. `GameAudio` owns sample loading, volume settings, active sources and cleanup. Source provenance is recorded in `assets/audio/drone-cod-sources.json` and `public/audio/medal-credits.md`.

A visible fixed-wing UAV flies in overhead during the uplink, circles 55 metres above its initial caller position during the scan, and departs in the last three seconds. All clients render active UAVs from replicated call/scan timestamps; the aircraft grants no additional radar information. Models are removed and disposed on expiry, disconnect, round changes and game cleanup.
