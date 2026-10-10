# One-hour physics gauntlet

Session: 2026-10-09 17:13:27–18:13:27 UTC.

User-directed quality bar: a coherent game world with grounded buildings, smooth floors and accessible stations. General control improvements are secondary.

## Verified changes

- Dense 2.5 metre terrain tessellation and bilinear elevation sampling remove the original terrain-cell diagonal creases. Rendering and walking support share the elevation function.
- Station passage floors feather into surrounding terrain over four metres; nearby terrain geometry follows the same floor transitions.
- Surveyed main-building foundations now extend to terrain even when their exposed gap exceeds four metres. Architectural upper components retain the original protection against inappropriate extensions.
- Geometry assets rebuilt with facade attributes preserved.

## Independent critic evidence

- Lower Polybahn entrance, height difference across a four-centimetre boundary sample: 0.5946 m before, 0.07241 m after.
- Upper entrance: 0.4126 m before, 0.0000233 m after.
- Previously skipped main building z41ac39cc00001ddc: all 14 expected foundation vertices found in rebuilt packed geometry. Foundation triangle count: 114.
- Real production geometry checks pass: routes at 30/60/120 Hz, station approach and exit, transit round trips, jump landing, map limits, river entry, and 20 fast wall impacts.
- World-continuity regression passes; production build passes.

Run `npm run test:physics:node` for the deterministic checks. The harness uses actual packed geometry, BVHs, production movement source and station carving; image/canvas rendering is stubbed.

## Limits and remaining audit findings

Browser launch is blocked by the current sandbox, so final visual smoothness and GPU performance have not been rechecked. The denser terrain increases triangle count. A world-wide claim that every detached structure is fixed would require visual review.

Independent general-physics audit also identified steep-slope/airborne floor snapping, blocked-wheel animation, boarding vertical proximity, and dismount body-clearance gaps. These were documented rather than expanded into unrelated control work after the user prioritized the game world.
