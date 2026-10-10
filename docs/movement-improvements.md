# Character movement

The three existing characters keep their mesh pieces, colours, outfits and proportions. The procedural rig now names the elbows and knees and adds chest, wrist and ankle pivots. Running uses opposing arm swings, chest rotation, knee recovery and ankle flexion. Jumping alternates the legs in the air, with pronounced alternating kicks on ascent and extended legs approaching landing. Landing compresses the body briefly.

## Sprint slide

Hold Shift while running, then press C after reaching sprint speed (at least 9 m/s). The slide lasts 750 ms, carries the current direction with drag, and has a 400 ms recovery period after its scheduled end. Looking remains free. Space interrupts the slide with a jump that retains momentum. Jump takeoffs have a brief 150 ms cooldown, preserving buffered presses and coyote jumps; respawn resets it. Leaving the ground, impacts, boarding and a stop against a wall end the slide. The terrain collision clearance stays at the normal player height: sliding does not enable passing under low obstacles.

Slide animation 4 travels in the existing eight-number movement report. The server relays it only for grounded moving players and continues to override it for knockdowns. Timers belong to the local movement body; no schema fields or report length changed.

Repeated jumps build fatigue: the first jump has full height, and each consecutive jump reduces takeoff power until it reaches 55% (roughly 30% of the original height). Fatigue also reduces sprint speed toward walking speed; at 75% fatigue, sprinting and starting slides are locked until recovery completes. Tired takeoffs cap horizontal momentum so repeated jumping cannot preserve full sprint/slide speed. Half a second of grounded walking or resting fully clears fatigue, with no additional delay. Buffered/coyote jumps and jumps out of slides share the same fatigue; invalid airborne presses do not add fatigue, and respawn clears it.

## First person

The owner uses a separate headless rig; the full local third-person rig is hidden in first person, and remote clients retain the full character. Hands remain low on the left/right, follow gaze and camera height, and sway laterally while running. The torso and feet stay in world space. When looking down, the eyes move slightly ahead of the chest so it does not cover the shoes. The camera lowers and tips gently downward during sliding, exposing the leading foot and retains restrained gait bob.

Twelve short peripheral particles appear only during slides and jumps launched at sprint speed while holding Shift. Jump particles rise vertically; slide particles stream past the edges. The third-person character uses the same slide pose, with a low dust trail visible to all players. They reuse one geometry and material and disappear immediately when walking, changing view, riding, falling down or leaving play. Ground dust accompanies slides and sprint takeoff/landing; ordinary running emits no trail.

## Preview and checks

With the client development server running, open `/movement-preview.html` to inspect each original outfit, animation and camera view independently of the multiplayer round. Sprint jump can be slowed down to inspect the alternating leg kicks; Play the game opens the actual multiplayer game. This development page is not a production build entry.

Regression tests cover rig articulation, airborne leg motion, hand sway, peripheral particles, slide eligibility/cooldown/interruptions, replay determinism, camera height and a live two-client slide replication/recovery check.

## Integration with main

Merged main through `37bfa5d` on 2026-10-10. Its NPC encounters, host-controlled lobby start, updated terrain/detail patches and scooter fixes are preserved. First-person posing still runs after the player camera update; encounter cameras retain ownership, and first-person movement streaks are suppressed during NPC and vending-machine interactions. Updated lobby tests retain main's host-start behavior while removing shoe-boost messages and assertions.

The combined gameplay suite passes 120 of 122 checks. Both remaining failures reproduce on untouched main: the area 2 footpath stops about 26.4 m short of its target, and the tram hull intersects the collision grid at route distance 232.5 m. These require upstream map/collision work rather than movement tuning.
