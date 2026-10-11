# Interview helicopter

The Jane Street laptop still asks for the missing loop condition. Solving it grants a phone invitation; requesting the ride summons a helicopter to the existing pickup. The attendant opens the door, the player boards, and the helicopter takes off and flies to the same tram-corner destination.

At the destination it hovers while the rejection message is read. The attendant throws the passenger out in the air. **Space** opens the parachute, **WASD** steers the glide, and mouse/arrows plus **V** retain the ride camera controls. An emergency deployment at 14 metres prevents missing Space from trapping the encounter. The descent slows to 4.5 m/s and ends at the server-approved ground location before the helicopter leaves.

`helicopter-model.js` owns the aircraft, moving rotors, open cabin, door, skids and parachute canopy/lines. `interview-limo.js` retains its exported name for compatibility and owns the challenge/ride timeline. The existing `limousine` network encounter ID and pose field names stay compatible; visible UI calls it a helicopter. Aircraft movement and parachuting avatars replicate through NPC poses; the shared air-corridor validator rejects stale, off-route and excessive-altitude reports. The movement/vehicle sound setting also controls a recorded helicopter rotor loop with a smooth loop seam and distance/height attenuation.

Placement remains supplied by the host: current pickup and destination come from `NPC_LAYOUT.interview`, and the final parachute landing uses the server's approved encounter target. The vehicle no longer relies on a ground-driving route.

Parachute touchdown uses a 0.45-second knee bend and camera blend into the normal player view. The landing callback preserves the look direction and first/third-person choice. The aircraft leaves in the background after control returns, rather than holding the player for a two-second departure shot.
