# Character movement

The three existing characters keep their mesh pieces, colours, outfits and proportions. The procedural rig now names the elbows and knees and adds chest, wrist and ankle pivots. Running uses opposing arm swings, chest rotation, knee recovery and ankle flexion. Jumping alternates the legs in the air, with pronounced alternating kicks on ascent and extended legs approaching landing. Landing compresses the body briefly.

## Sprint slide

Hold Shift while running, then press C after reaching sprint speed (at least 9 m/s). The slide lasts 750 ms, carries the current direction with drag, and has a 1.2-second cooldown after it ends. Looking remains free. Space interrupts the slide with a jump that retains momentum. Leaving the ground, impacts, boarding and a stop against a wall end the slide. The terrain collision clearance stays at the normal player height: sliding does not enable passing under low obstacles.

Slide animation 4 travels in the existing eight-number movement report. The server relays it only for grounded moving players and continues to override it for knockdowns. Timers belong to the local movement body; no schema fields or report length changed.

## First person

The owner uses a separate headless rig; the full local third-person rig is hidden in first person, and remote clients retain the full character. Hands remain low on the left/right, follow gaze and camera height, and sway laterally while running. The torso and feet stay in world space. When looking down, the eyes move slightly ahead of the chest so it does not cover the shoes. The camera lowers and tips gently downward during sliding, exposing the leading foot and retains restrained gait bob.

Twelve short peripheral streaks appear only during slides and jumps launched at sprint speed while holding Shift. They reuse one geometry and material and disappear immediately when walking, changing view, riding, falling down or leaving play. Existing ground dust remains visible for other players.

## Preview and checks

With the client development server running, open `/movement-preview.html` to inspect each original outfit, animation and camera view independently of the multiplayer round. Sprint jump can be slowed down to inspect the alternating leg kicks; Play the game opens the actual multiplayer game. This development page is not a production build entry.

Regression tests cover rig articulation, airborne leg motion, hand sway, peripheral particles, slide eligibility/cooldown/interruptions, replay determinism, camera height and a live two-client slide replication/recovery check.
