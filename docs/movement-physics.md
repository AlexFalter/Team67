# Acceleration and momentum

The foot controller integrates horizontal acceleration in metres per second squared. It separates active acceleration, lateral ground grip, release braking, overspeed deceleration and airborne steering. The existing deterministic shared movement step still owns terrain collision, gravity, jumping and slide state; Rapier continues to referee entity contacts.

Design references:

- [Unreal CharacterMovementComponent](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/UCharacterMovementComponent): separate acceleration, braking deceleration, friction and air control.
- [Quake III movement source](https://github.com/id-Software/Quake-III-Arena/blob/master/code/game/bg_pmove.c): directional acceleration and velocity-preserving air movement. This implementation uses those concepts with independently written code and game-specific tuning, including a speed cap to prevent accumulated air-strafe speed.

Ground acceleration is 40 m/s², with stronger 90 m/s² acceleration against an existing direction. Lateral grip removes old sideways velocity gradually. Releasing controls combines constant 45 m/s² braking and drag, reaching a finite stop. Releasing sprint while still running eases toward walking speed at 14 m/s² instead of snapping. Mate boosts scale active acceleration to retain responsiveness.

At 60 Hz, sprinting from rest reaches 11 m/s in about 0.28 seconds. Releasing movement stops in about 0.18 seconds and covers roughly 0.74 m. Reversing starts moving the other way within about 0.17 seconds; a right-angle turn settles within roughly 0.27 seconds.

Air steering adds at most 9 m/s² in the input direction. Releasing input applies no airborne drag. Takeoff retains momentum even when movement is released on the jump frame. Air turning cannot create speed beyond the larger of the launch/impulse speed and selected movement speed. Sliding retains its existing low drag, cooldown and jump exit.

The acceleration controller needs no new movement-report or server-schema fields. The separate running-shoes removal deletes the old shoe flag and toggle action. Clients, test clients and bots all use the shared controller. Regression checks cover input release, reversals, turning, air control/speed caps, replay, 30/60/120 Hz integration, terrain, collision impulses and live multiplayer slide/jump reports.
