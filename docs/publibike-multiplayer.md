# Multiplayer PubliBikes

This adds the prototype's eight-bike station, bike model, rear QR scanner,
50% broken-bike probability, working-bike gold highlighting, and 15-second
battery. Riding and falling use the existing multiplayer bike controller,
physics, interpolation, and collision handling. Other game content, the
map, battle bus, normal camera controls, and ordinary vehicles remain intact.

The station searches for a clear site using the prototype anchors
`[-205.551, 49.449]` and `[-187.722, 49.187]`, slot spacing, and approach aisle.
On the current map its center is approximately `(-205.478, 54.448)`.

## Interaction

- Approach a PubliBike and press E. The server reserves it before the phone
  scanner opens. Occupied or reserved bikes show a brief gameplay message
  without opening the phone or interrupting controls. The phone also stays
  closed while awaiting a reservation; it opens only after the server grants
  it, so a lost race never flashes the scanner. Nearby labels show when
  somebody else is unlocking it.
- Move the mouse/trackpad over the live phone preview (no button hold), or use WASD/arrows to center the rear QR code, then hold still.
  The prototype's settling, scan progress, and connection stutter are retained.
- A successful scan boards the bike through existing vehicle occupancy.
  Broken bikes report that they are out of service; put the phone away and
  choose another. The small home control, Esc or E closes the scanner.
- Use the existing riding controls. E returns the bike to a free nearby
  station slot, or parks it where it is if away from the station.
- The battery display uses shared server state. Parking pauses battery
  consumption; the next rider gets the remaining charge. Depletion stops
  the ride and marks the bike out of service until the next round.

## Multiplayer ownership

`RaceState.publiBikes` holds broken status, battery milliseconds, dock index,
reservation owner, and expiration. Position and driver remain in the existing
vehicle schema, under `publibike-1` through `publibike-8`.

The first valid `bikeScanBegin` wins synchronously. One player can reserve
one bike, and one bike can have one reservation. A private random token is
sent only to that player; completing a scan requires that token, proximity,
line of sight, and eligibility to board. Direct `vehicleEnter` messages
cannot bypass PubliBike scanning. The server enforces a minimum 2.05-second
scan interval; QR aiming and holding still are local challenge presentation.

Leases last at most 30 seconds. Repeated begin messages cannot extend one.
Cancellation matches the player's request ID, so a delayed old cancellation
cannot remove a new lease. Stale completion tokens cannot claim a bike in
another attempt or round. Client replies are correlated to the current
request so late grants cannot reopen a dismissed phone.

Reservations release on cancellation, disconnect, timeout, leaving range,
knockdown, losing eligibility, and round completion. Hiding the browser or
losing focus cancels the local scan. Round reset creates fresh fleet state.

Docked and currently scanned bikes are held in place in Rapier. Released
bikes outside the station retain existing loose-bike physics. Server time
controls battery use; clients cannot reset charge or choose working status.

## Rendering and cleanup

The prototype model's static meshes are merged by material per instance.
The station uses instanced dock stands and lights. The phone copies a portrait crop from the existing renderer immediately after the host render. QR detection uses the same crop, so the viewfinder and scan alignment agree at any viewport size. A wider lens keeps the rear QR visible. Pointer input starts with a modest random aim offset, ignores the inherited cursor position and large warps, and smooths relative motion. No extra renderer or animation loop is introduced.
Bike loading participates in lobby preparation. Pending loads, scanner input
listeners, phone UI, station resources, and model resources are disposed when
leaving Play mode. Each bike owns its cloned GPU resources.

## Verification

`tests/publi-bike.test.ts` covers simultaneous claims, direct-boarding
bypass attempts, stolen and stale tokens, early completion, duplicate
requests, cancellation, disconnect, timeout, range, knockdown, broken bikes,
battery depletion, parking, station clearance, and a live two-client room
with competing claims and round reset.

Type checking, lint, and the production client build passed for the initial
integration. Running
`npx tsx --test --test-skip-pattern "BVH nearest hits" tests/*.test.ts` passed
all 72 tests then. The existing full-city raycast comparison remains excluded
because it did not finish in the previous integration's nine-minute run.

Two real Chrome clients were checked against the production build: the
second player's scan is rejected while the first holds the reservation;
pointer aiming completes the scanner; riding moves the bike; returning
pauses its battery; Inspect disposes the feature; and returning to Play
loads a fresh station and enables Ready. The run reports no browser errors.

The phone-opening follow-up adds `tests/publi-bike-phone.test.ts`, covering
occupied bikes, existing reservations, pending and denied requests, valid
grants, and cancelled grants. All nine phone and server PubliBike tests pass;
type checking and lint also pass for this change.

### Centred scanner input

The scan reticle stays centred in the phone while the initial camera view starts slightly off-target. Mouse/trackpad movement is relative and works across the whole overlay, including outside the phone. The first pointer event establishes an anchor without moving the camera, so a restored cursor far from the phone cannot warp the aim. At a viewport edge, the phone continues turning slowly; returning the cursor inward stops it. Resize, leaving the window, touch release, closing, and reopening reset this state.

Verified scan completion from outside the phone on desktop and narrow screens, plus home/Escape dismissal, server-error display, and disposal. Pure input regressions cover corner starts, cursor handoff, outside-phone movement, edge turning, and touch/reset handling.
