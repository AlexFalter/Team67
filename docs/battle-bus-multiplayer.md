# Multiplayer battle bus intro

Each round now brings its ready players to the singleplayer prototype's start
location on the battle bus. This is the only prototype feature added here.
The existing multiplayer map, player controller, normal camera controls,
collisions, vehicles, interactions, and results remain in place.

## Round flow

- The lobby downloads the bus before enabling Ready.
- When everybody is ready, the server assigns stable passenger slots and a
  shared intro timestamp, with a one-second lead for clients to receive it.
- The bus flies in for seven seconds. Its cabin, doors, exterior model, and
  audio come from `mini-games`; passengers use existing multiplayer avatars.
- Players disembark over another 6.35 seconds. The server then places them
  around the prototype start: map coordinates **x = -191.642, z = 11.025**,
  heading **2.514579388516376**. Ground height comes from the existing map.
- Normal movement and the existing round timer begin after arrival. The bus
  flies away for six seconds while gameplay continues.

The room still has Lobby, Running, and Finished states. Running includes the
intro, distinguished by `introStartedAt` and `introComplete`; `startedAt` is
the gameplay start time. Joining during the intro or gameplay uses the
existing waiting screen and participation in the next round.

## Synchronization and boundaries

The server owns timing, passenger assignments, and arrival positions. Clients
derive bus motion and the cinematic camera from the existing synchronized
server clock, rather than incrementing an independent animation timer. A
backgrounded client catches up when it renders again. Network delivery and
clock estimation can introduce small visual differences between browsers.

Movement, attacks, interactions, vehicle messages, and the host's Finish
command are blocked during the intro. Passing its timestamp on the client
alone does not unlock gameplay: the server must publish `introComplete`.
There is no skip control. Disconnects do not renumber remaining passengers.
The existing room capacity of 40 is retained; overflow passengers stand in
the aisle, and arrival points are separated and checked against map geometry.

Bus rendering uses the existing renderer and animation loop. Static cabin
geometry is merged by material. Mode changes dispose the bus, driver, audio,
and pending download along with the normal game cleanup. Ready unlocks audio
within a user gesture; browser audio restrictions cannot bypass the intro.

Other prototype features, NPC passengers, the river crash, and explosions were
not imported. The existing multiplayer shuttle remains separate.

## Verification

`tests/battle-bus.test.ts` covers server scheduling, stable seats, clock
catch-up, 40 unobstructed arrival positions, client gameplay gating, and a
live three-client Zurich room. It checks attempts to bypass the intro,
late joins, results, reset, and a subsequent round.

The existing live test fixture uses shortened server intro timings to keep
network regression tests fast. Production defaults are 13,350 ms plus the
1,000 ms lead. Trusted server environment variables `BATTLE_BUS_INTRO_MS`
and `BATTLE_BUS_LEAD_MS` can override these for testing; room clients cannot.

Browser verification uses two real Chrome clients against the built client,
checks matching timelines and bus poses at the same server timestamp, tries
skip keys and Finish, verifies arrival, and checks disposal on a mode change.
Development-mode verification also switches back into Play and checks that
the remounted game loads its bus and enables Ready without browser errors.

Type checking, lint, and the production client build pass. The existing
full-city BVH comparison was stopped after approximately nine minutes without
finishing; its map geometry and camera implementation were left unchanged.
The separate camera acceleration cleanup and obstruction checks pass.
Running `npx tsx --test --test-skip-pattern "BVH nearest hits" tests/*.test.ts`
passes all 66 remaining tests, including the new live multiplayer intro test.

Asset provenance is recorded in
`apps/client/public/models/BATTLE-BUS-CREDITS.md`.
