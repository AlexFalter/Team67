# Tram and Polybahn multiplayer integration

Server-owned tram and Polybahn gameplay for the multiplayer client.

## Included

- Prototype Tram 6 model and passenger interior, with three carriages and 18
  real-player seats. Central and ETH boarding stops use the prototype endpoints,
  resolved against the current multiplayer map.
- Both prototype Polybahn cabins and bench interiors, with 12 seats per cabin.
  The original Central–Polyterrasse route includes separate passing lanes,
  slope-aware cabin placement, wheel rotation and shared door animation.
- Server-owned seating and schedules. The first passenger starts a five-second
  countdown; later passengers cannot reset it. The Polybahn cabins share one
  countdown and move in opposite directions. Boarding closes before departure;
  passengers cannot exit in transit and disembark automatically into separate
  clear landing spots at arrival.
  Empty boarding sessions cancel; disconnects release seats; room resets rebuild
  transport. Client movement reports cannot drive either service.
- Existing shuttle, vehicles, PubliBike unlocking, character movement, room flow,
  NPC encounters, and battle-bus intro remain in place; dev rooms can skip the intro.
  Polybahn passenger conversations and the inspector use the multiplayer NPC adapter.
  Ticket economy and free movement inside the cabins remain separate future additions.

## First-turn derailment

The tram now derails at the first substantial bend of the shared route. The server
stops its route motion and publishes a crash timestamp; all clients animate the
same wagon flight, slide and outward tip. The tram builds speed continuously
from departure, reaching 48 m/s at the bend.
Acceleration is derived from the distance to that bend, with no late speed boost.
On derailment it retains its incoming
tangent velocity; gravity brings the wagons down and friction settles their slide.
The derail trigger compares speed squared times track curvature with available
adhesion, so the same bend remains safe at the ordinary tram speed.
Ground contact uses actual lower-body and side vertices from the tram model,
checked in as `tram-hull.json`; regenerate them with
`npx tsx scripts/build-tram-contact.ts` after replacing that model. Gravity acts on
the centre of mass until landing. Each wagon then settles onto its side and slides
with ground friction until it stops, keeping its visible body in contact with the
pavement instead of resting on a larger invisible box.
Seats follow the tilted wagons until
riders are released to clear trackside landing positions after 1.1 seconds. Riders
see a brief outside camera shot, then regain movement without a click-to-play
interruption or releasing mouse capture. The wreck remains until the
next round, with its sign showing that service is suspended.

Three landing-triggered explosion bursts add fire, sparks and rising smoke, using three
instanced draw calls. Their animation follows the shared crash clock, and nearby
players hear distance-scaled explosion sounds once per wagon. Dev mode offers
“Prevent tram derailment” for testing complete journeys. Polybahn rides are
unaffected. The normal five-second countdown still starts with the first rider.

Both shared route curves filter short survey ripples with bounded, metre-based
smoothing, preserving endpoints and the checked corridor. Generated rails use
continuous indexed cross-sections instead of separate overlapping cylinders.
Authored Polybahn metal rail surfaces are smoothed separately from the bridge;
their original geometry is restored when leaving play mode.

## Tram zigzag fix

The prototype rerouted onto a coarse navigation grid, then aimed each carriage
along its short grid edges. This exposed the alternating horizontal/vertical
steps as abrupt steering changes.

`npm run transit:build` now generates a clearance-checked route from the shipped
map. It removes redundant grid corners with line-of-sight checks and rounds
meaningful bends with validated quadratic curves. The final route has **8 bends**
instead of **373 grid steps**, sampled at most every half metre against native
terrain. All carriages and passenger seats use the same metre-based route.
Heading samples span 1.6 metres rather than aiming down individual grid edges.
Trips accelerate and brake on server timestamps, so motion does not depend on
the client's frame rate. Route lookups use binary search.

Generated route data lives in `packages/shared/src/transit-routes.json`.
The original prototype route coordinates and attribution are retained in
`tram-source.json` and `polybahn-source.json`. Regenerate transit routes after a
map export and `npm run world:build`; they are checked in and are not rebuilt
implicitly during normal deployment.

## Polybahn passage and rendering

The current map has building footprints and terrain holes along the prototype
funicular route. Native heights are resolved offline, with surrounding terrain
used only where the export has a hole. A narrow passage follows the track and
connects each station to nearby clear ground. Shared movement and the server
use the same passage floors and clearance.

During play, only city triangles inside that corridor are clipped; all existing
mesh attributes are preserved. Passage floors and rails are batched. Original
city geometry is restored when switching to inspection mode. Models are merged
into opaque and glass batches using vertex colors, while Polybahn door and wheel
pivots remain articulated. Loads are
abortable and owned model instances are disposed with the game.

Each tram carriage uses two meshes; each Polybahn cabin uses twelve, including
doors and wheels. A fixed browser render check measured 217 draw calls with
transport versus 194 with transport hidden: 23 additional calls in that view.
This is a draw-call check, not a hardware frame-rate benchmark.

## Validation

- TypeScript checks, frontend lint and production build.
- 82 automated checks passed with
  `npx tsx --test --test-skip-pattern 'BVH nearest hits' tests/*.test.ts`.
  The existing full-city BVH comparison was excluded because it previously hung;
  the other camera/BVH checks were run.
- New checks cover distinct seats, capacity overflow, forged movement, countdown
  contention, empty-cabin cancellation, opposite Polybahn motion, station exits,
  return rides, live schema replication, waiting joiners, round resets and
  freezing client rail motion when a room finishes during a trip.
- Every half metre of the tram route was checked against native terrain and
  building clearance, including sampled points across the full carriage width
  and length. Camera heading changes are bounded to exclude grid zigzags.
- A passage-clipping check confirms that the corridor opens while building
  surfaces above it and the original geometry/UV attributes remain intact.
- The checked-in prototype GLBs are loaded in an automated check, verifying
  color batches, articulated pivots and independent instance resources.
- Two production browser clients boarded different tram seats and received
  identical departure/arrival times. The Polybahn door animation, coupled cabins,
  automatic disembarkation, inspect/play cleanup and fresh remount were exercised
  without browser errors. The browser harness uses a short server-owned intro
  duration for testing; deployed intro timing is unchanged.

Transport retains the existing game's coarse vehicle contact physics; detailed
articulated carriage collision hulls are a separate follow-up.

## Current map alignment

Transit generation now traces the original tram alignment and samples the road
material across each street to find its centre. It does not shortcut through open
plazas. Polybahn positions and passing offsets are recovered from the authored
metal rails, including elevated bridge heights. Its cabins meet in the native
passing loop; existing bridge, tracks and station geometry stay intact.
Production builds regenerate transit after the world grid, preventing stale routes
after a map replacement.

### Tram boarding circle and clearance check

The tram displays a blue ground circle while stopped and accepting passengers. It turns green when the local player is inside; press E to board. Its radius uses the same `VEHICLE_BOARD_DISTANCE` as the server. The circle disappears during travel, door closing, inactive rounds, and while the player is riding.

`npm run transit:build` centres the route between the exported road edges and samples the actual road mesh for track elevation. `npm run transit:check` sweeps the three cabin envelopes against the shipped map triangles every 0.5 m along the complete route (4,053 carriage poses). The cabin check begins at its authored floor, y=0.60; wheel contact underneath is intentional. Server tests cover both directions, countdowns, seat limits, and distinct passenger drop-offs.

### Polybahn ride smoothing

Polybahn cabins use a shared monotone Hermite curve with filtered lane offsets and stable track normals. This removes positional jumps at rail nodes while keeping the station endpoints and passing-loop separation. A continuous progress curve brings both cabins to the off-centre meeting point without the previous midpoint speed change. Both server and client use this trajectory.

First-person Polybahn eyes sit 1.4 m above the seated body anchor, follow the cabin incline with a level horizon, and turn around a fixed head position. Gait bob and landing compression are disabled while seated. `tests/polybahn-smooth.test.ts` checks every rail node on both lanes, passing-loop timing/separation, endpoint arrival, and fixed-head mouse look.

Polybahn boarding uses a one-metre circle inside the cabin doorway, following the cabin slope. The same shared doorway point and radius drive server eligibility and client hints at both stops, replacing the old station marker coordinates. Rail pitch is fitted across the model’s 3.2844 m axle spacing.

Departure signs remain visible within 25 metres of a rail cabin before boarding. Both the overhead sign and seated controls prompt show the same live server-clock countdown, followed by Doors closing and the arrival countdown. The timer starts with the first passenger, not on an empty repeating schedule.

Polybahn docking now extends to x=16 inside Central and x=177 inside the upper hall. The lower station's missing rail continuation is supplied by the merged scenery rails; the original bridge remains intact. Station signs use the same cabin boarding point as the server, and only the cabin-owned circle is shown for the Polybahn. The lower endpoint preserves the rail incline instead of flattening it with a truncated smoothing window. Articulated axle spacing is reduced from the prototype's 1.6 m to the map's 1 m gauge without changing the cabin width.

Boarding correction: the walk-up points are now on the interior lobby slabs, Central (12.5, 8.625, 114) and Polyterrasse (185, 48.875, 75). They are independent of the elevated cabin doorway. Shared station-floor collision heights, client circles/prompts, and server boarding/drop-off all use those interior points. Circles lie flat on the lobby floor; an actual-GLB raycast regression checks both points against G_StationFloor, and the old exterior Central approach is explicitly rejected.

Station doorway access extends narrowly across the coarse obstacle grid at both facades. Central has a level approach from x=4.5 to the lobby; Polyterrasse has a short terrace-level doorway corridor. The regression walks with normal movement from outside into each lobby, boards, exits, and walks outside again without jumping. Raycasts through the shipped map verify both walking lines cross actual door openings.

Station approaches now flare out towards the street and terrace instead of using narrow rectangular strips. The upper corridor follows the shipped doorway offset (1.1 m across the lobby reference axis); Central uses the full authored doorway width and lobby slab. Movement regression tests approach both doors diagonally from either side. The vehicle status billboard follows the Polybahn cabin roof, independently of the lobby boarding circle. Seated rail riders hide their own first-person body to allow free look without torso/limb clipping; other players and third-person views retain the avatar.
