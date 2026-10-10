# Tram and Polybahn multiplayer integration

Work branch: `mini-games`. No commits or changes to `main`.

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
  and unskippable battle-bus intro remain in place. Tickets, inspectors, NPC
  passenger stories, free movement inside the cabins and derailment events are
  separate future additions.

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
