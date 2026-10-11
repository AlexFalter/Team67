# Gameplay merge audit — 2026-10-11

Reviewed the incoming main changes through b1b1e71 against the local gameplay work,
including the conflicts resolved while updating from 6f3b40e to 0fa9af9.

## Regressions corrected

- NPC host referenced removed `passengerPrompt` and `menu` UI. Those reads threw
  each animation frame, preventing the bus intro from reaching gameplay and
  crashing helicopter boarding. Passenger prompts belong to the action toolbar.
- The imported limousine camera hooks competed with the local helicopter's own
  seated, ejection and parachute cameras. Removed the obsolete hooks and their
  MapGame/type-declaration call sites. Helicopter movement continues through the
  NPC pose protocol; normal client movement pauses during the encounter.
- Full Retina rendering had become the default. Performance mode now defaults
  to a drawing buffer capped near 1080p. High remains selectable. The canvas no
  longer requests a second antialiasing buffer: the composer already uses MSAA.
- The helicopter inherited the old car encounter’s 90-second server timeout,
  including time spent reading the phone. Its own configurable timeout is now
  five minutes (`NPC_LAYOUT.interview.timeoutMs`); round expiry still takes
  precedence and other encounters retain their shorter limit.
- Initially removed the unused uncaptured edge-turn function and its test,
  the old NPC chooser styles/getter, and the unused seated exam-room stub.
  These harmless extension points were subsequently restored at the user's
  request; see the compatibility restoration below.
- Updated exam documentation: the endpoint uses the incoming short bonus banner,
  not the old flyover and room transition. Spectator conversion remains available.
- Updated old tests for the helicopter label and boolean rejected-hit result.
  Medal tests now account for incoming recovery invulnerability and verify that
  protected victims cannot earn additional hit medals.

## Integration retained and checked

- Incoming authoritative traffic, recovery protection, finite Lime boost, shared
  bus-driver thanks, tram countdowns and the new bonus banner.
- Local bags/dummies, emote synchronization/audio, spectator membership, admin
  free roam, map teleport animation, phone/Moodle flows and helicopter/parachute
  replication. Reviewed join/reset/disconnect cleanup and matching schema fields.
- Shared ground/collision data and existing vehicle occupancy authority were not
  changed by this audit.

## Prevention and verification

`npm run lint` now checks reads of undeclared NPC host members, including members
injected by `Object.assign` and explicitly declared optional integration hooks.
Tests confirm that the two stale UI references fail this check. A real-host
regression also exercises input locking through boarding, takeoff, flight,
ejection, parachuting and recovery with no legacy chooser menu present.

The animation callback reports an unexpected failure once, stops rendering,
disconnects gameplay, releases pointer lock and presents a reload control.
An injected browser failure verified that only one frame fails and that reload
restores the lobby. This complements startup, camera and protocol tests; it does
not make arbitrary JavaScript runtime errors impossible.

Browser checks exercised the full bus intro and walking (pointer lock simulated),
and the helicopter request/pickup/takeoff/flight/rejection/parachute/landing flow
with a second client observing replicated state. A Retina viewport verified
960,000 default canvas pixels versus 3,840,000 in High at 1200×800 CSS pixels.
This is a pixel-budget check, not a claim of measured FPS on the user's machine.

The broad gameplay suite excludes `map-raycast.test.ts` and
`no-fall-through.test.ts`: the initial full run spent minutes in these existing
geometry-heavy tests, which were interrupted. Map geometry was not edited.

Final verification: 323 gameplay tests passed; TypeScript, lint and the client
production build passed. The moving-tram phone browser check also passed:
first-person eyes stay in the moving cabin, the third-person passenger remains
visible, and closing the phone retains the seat. Pointer lock was simulated in
these browser checks because headless Chrome rejected native capture.

The final helicopter browser rerun passed through replicated canopy deployment,
landing and server encounter cleanup after removing the old car hooks.

## Compatibility restoration

At the user's request, restored `edgeTurn` and its existing test, the optional
`playExamRoomAnimation` stub, `ExamSequence.skipTransition` and the corresponding
`MapGame.skipExamTransition` entry point, legacy `#npc-choice` styles,
`nearbyInteraction`, and the optional NPC `onMedal` callback declaration.
None is automatically connected to a new gameplay path.

Restored the `ridingVehicle` and `ridePose` accessors as safe compatibility
queries. They read the current encounter state without referencing the removed
chooser menu. MapGame still leaves helicopter camera and input ownership to
the encounter: the competing camera overrides and invalid `passengerPrompt`
and `menu` reads were not restored.
