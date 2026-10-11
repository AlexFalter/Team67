# Collision and knockdown

Normal walking contacts between players still only separate their capsules. Punches, moving vehicles, bicycle hits and rider ejections share `applyImpulse`: velocity change determines push direction and intensity, with a server timestamp and knockdown deadline replicated to all clients. Existing vehicle contact detection, boarding rules and rider ejection remain authoritative on the server.

Punches interrupt movement for 1.5 seconds. Bike impacts use 1.9–3.2 seconds and other vehicle impacts 2.3–4.2 seconds, increasing with the magnitude of the impulse. Vehicle impulses are capped at 25 m/s with at most 5 m/s lift. Repeated hits do not restart an active knockout; grounded drag slows the victim while airborne momentum remains visible. Running, jumping, sliding, attacking and boarding stay blocked until recovery ends.

The shared animation timeline has a 320 ms directional fall, a floor pause and a final 650 ms get-up while grounded. The chest, neck, shoulders, elbows, wrists, hips, knees, ankles and new toe pivots participate. The get-up curls the torso, plants the arms and bends the legs asymmetrically before returning upright. These are procedural animations; gameplay continues using the existing upright capsule rather than a physical ragdoll collider.

First person keeps hands/body visible with the head hidden. Eye height drops and the view rolls toward the incoming push, then rises during recovery. A subtle red vignette fades over 700 ms without blocking input. The local hit plays a synthesized impact sound and a second low thud once the victim is grounded. Audio unlocks on a user gesture; no external audio assets are needed. The feedback element, audio context and scene objects are disposed with the game.

The movement preview has a “Knockdown & get up” mode for checking third person, first person and slow motion. Tests cover impulse bounds, source-dependent downtime, input interruption, timestamp replication, rider ejection, directional falls, articulated recovery and camera recovery.

The bottom-center action HUD has transparent fist and slide buttons with F/C labels. Punches have a four-second cooldown, shown as a grey number over the fist. Slide availability follows sprint speed, grounded state, fatigue and its short cooldown, without a slide cooldown number. Knockdown temporarily disables both actions and shows the remaining recovery seconds over both buttons. The right hook raises a bent right elbow, sweeps across the body and twists the chest in both camera views.
