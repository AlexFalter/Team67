# Singing cyclist

Ambient adult riding a dedicated PubliBike in circles near the starting station. The NPC is separate from the player bike fleet and cannot consume or drain a rentable bike. `createCyclingKid` reuses the PubliBike model, adult student rig, fitted contact pose, collision access helper, subtitles and distance-volume helper.

The placement search checks 96 points around the whole loop, including 0.8 m on either side, rejects water/buildings/uneven terrain and reserved encounter space, and requires a walkable connection to the early route. The cyclist coasts at 2.2 m/s on a 2.8 m radius loop. Singing fades out by 22 m; UI interactions and pause stop the NPC and audio. Reset returns the cyclist to the start of the circle. Audio playback generations prevent interrupted play promises from stopping a newer playback session.

Audio is the short original refrain from KITSCHKRIEG feat. Blumengarten & Shirin David’s “Gut genug” (official video, 00:13.30–00:21.80, main chorus around the requested 00:15). Two complete repeats are followed by a 1.55-second musical fade and loop immediately without an added silent pause; there is no synthesis or pitch shifting. Source builder: `scripts/build-cycling-kid-voice.py`. Credit: `public/audio/CREDITS.md`.

Run `GAME_URL=<preview> node verify-cycling-kid.mjs` to check the grounded circular route, hand/foot contact, animated wheels, audible loop, distance silence, pause/reset and independent player fleet.

The legacy `createCyclingKid` export remains compatible with existing callers. `rider-fit.js` aligns the adult pelvis with the saddle and solves both arms and legs against the Blender-authored grip and pedal anchors. Feet rest on the fixed pedals of the merged bicycle mesh.

The multiplayer host mounts this restored NPC using `NPC_LAYOUT.singingCyclist.center`. This point is the center of the 2.8 m loop around the trash can; the rider starts on its east side. A supplied `position` remains supported as the initial ground contact, with the loop extending west of it. The host owns pause, encounter muting, map marker, reset and cleanup. The dedicated bike owns its geometry and materials independently of rentable bikes.
