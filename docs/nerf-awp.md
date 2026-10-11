# Nerf AWP

Collect the wall-mounted blaster with **E** near (-152.50, 8.54, 91.82). Its west-facing rack is at (-149.83, 10.09, 91.82), configured in `packages/shared/src/npc-layout.json`. Each player can collect it once per round. Proximity and line of sight are server-validated. Initial pickup lifts the weapon off the hooks and inspects it for 2.6 seconds; the server blocks firing and refilling until it settles.

Controls: **6** equip/holster, **left click** fire, **Q or right mouse button** scope, **R** refill. Equipping selects first person. The bottom-right counter shows loaded darts / pocket reserve. Each round supplies exactly 20 darts: 10 loaded and 10 in the pocket. Early refills transfer only missing darts; re-equipping and repeated pickup cannot replenish ammunition.

After every shot, the right hand lifts and retracts the lever. The support hand takes a blue foam dart from the left-side carrier and seats it in the open chamber, then the bolt moves forward and locks. The 1.4-second cycle blocks firing and refilling. Scoped shots briefly unzoom to show this action before returning to the scope. Refilling brings darts from the pocket into the carrier over 1.8 seconds. Other clients see the held blaster, bolt cycle and pocket refill. Carrier darts use instanced meshes.

`packages/shared/src/awp.ts` defines range (150 metres), timing, exact standing-capsule intersection and map obstruction queries. `apps/server/src/awp.ts` validates ownership, round, eligibility, finite normalized aim, ammunition and cooldown. Hitscan stops at terrain/buildings and hits the nearest eligible player or debug dummy. Confirmed hits apply strong knockback and knockdown through existing server impulse handling, respecting recovery protection. Riders cannot shoot or be hit. No damage or kills are added.

`apps/client/src/multiplayer/weapons` owns the model, scope, recoil, animations, audio, hit marker and remote rifles. The optic has a circular crosshair lens with blurred edges. Foam dart flight is visual; hit authority remains on the server. Confirmed hits attach darts to animated head/body joints for 25 seconds. Effects are capped at 48 darts and cleared on room/round changes, target removal and disposal. All action buttons display labels and shortcuts.

Confirmed headshots award **Sharpshooter**; hits at 30 metres or farther award **Long Shot**, using the existing medal queue and sound. Debug dummies can preview these medals without consuming First Blood or player-hit streaks.

Firing uses a trimmed CC0 Nerf Hammershot recording by ImAFoley (Freesound 516745). Six original DSR-50 mechanical recordings from the BO3 multiplayer beta archive accompany the bolt and refill. Audio is preloaded, synchronized to animation phases, gated during interruptions and stopped on disposal. Source manifests are in `assets/audio`; credits are in `apps/client/public/audio/medal-credits.md`.

Tests cover wall pickup and inspection gating, finite ammo, capsule intersections, nearest-hit/wall checks, invalid commands, cooldown, two-client knockback, practice dummies, medals, dart attachment, animation phases and audio lifecycle. Browser review verifies the wall position, pickup inspection, firing playback, head attachment, refill, scope, ammo counter and controls.
