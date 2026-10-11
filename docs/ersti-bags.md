# Ersti bags and practice dummies

Four VSETH Ersti bags are grouped around (-217.18, 8.05, 35.98), resting on the map terrain. The old added mound is disabled at this location. The world and first-person models, along with the Pickup
and Throw Blender animations, are restored directly from `origin/mini-games-2`.
Editable assets are in `assets/blender/ersti-bag.blend` and its build script.

Press **E** to collect a bag. Aim with the camera, then press **Q** or click to throw.
A recipient is knocked down for three seconds and receives the bag in their hands;
after recovering they can throw it back. Players carry one bag at a time. When the
target already carries a bag, the incoming bag lands nearby for someone to collect.
Misses land on the ground and can be picked up. Boarding a vehicle or disconnecting
drops a held bag. Bags occupy the hands and holster the karambit while carried.

The server owns pickup, delayed release, projectile flight, wall/ground collision,
player hits and transfers. Clients send an aim vector, never a claimed hit or target.
Accepted player hits award **Bagged**, with the existing BO3 artwork, sound, animation,
event deduplication and multiplier system. The first real-player hit also awards
First Blood. A single projectile cannot hit a second player after ownership transfers.

In a room created with **Dev mode**, the host's Escape menu has **Spawn practice
dummies**. Three labeled dummies appear beside the relocated bags, receive bags, fall from the same
impulse/knockdown system as players, and recover at their original positions after
three seconds. A dummy's bag can be retrieved with E. Disabling the option drops any
held bags and removes the dummies. Practice hits award Bagged, but do not change
real-player combat scores or consume First Blood. Non-hosts and ordinary rooms
cannot activate them.

- `packages/shared/src/bags.ts`: placement helpers, mound height, capsule sweep and constants.
- `packages/shared/src/npc-layout.json`, `bagHill`: map coordinates, hill dimensions, bag offsets and dummy positions.
- `apps/server/src/bags.ts`: authoritative ownership, flight, collisions and dummy simulation.
- `apps/client/src/multiplayer/bags/BagFeature.ts`: existing GLBs/animations, held/world rendering, HUD integration and debug toggle.

The mound is an added feature mesh. Its sampled surface matches the shared movement
height profile; existing map geometry and origin remain intact.

Throws launch at 18 m/s and inherit up to 12 m/s of the player’s horizontal movement at release, so running and strafing carry through naturally. The client sends its latest movement before the throw command; the authoritative release still follows the 430 ms animation timing. The player hit sweep uses a 0.72 m combined radius for more forgiving hits while walls still block the path. A delayed release keeps the throw animation active until ownership changes, avoiding a second pickup animation or a missed handoff.
