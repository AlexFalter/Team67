# NPC encounters in multiplayer

Added on `add-npcs`, using the restored `mini-games` prototype as the source. No merge or commit to main is part of this change.

## Encounters

- Finance guy: original model details, recorded monologue, captions and unskippable conversation near Weinbergstrasse.
- Tourists: original Mandarin dialogue and two-photo sequence at the Polyterrasse. Players frame, capture, retake and hand back portrait and landscape pictures.
- Polybahn: strange kid with the clock question and 67 recording, food enthusiast with dialogue choices and eating audio, and the inspector's arrival conversation. Press **E** while seated to choose a passenger; **Backspace** leaves the cabin. NPCs sit at bench ends to preserve existing player capacity. The inspector appears once per round after completing a trip.
- Jane Street: original laptop puzzle, complimentary limousine pickup with butler and door animation, ride, rejection and ejection. The answer is validated as data; entered code is never executed.
- Scooter trio: original riders and recorded conversation on Bahnhofbrücke. They are parked at a fixed shared location, because the single-player approach originally diverted towards the local player. The handover closes with thanking the riders; it does not grant a new combat weapon.
- Private property: original pickup and boundary conversation, followed by a server-approved return to the battle-bus start.
- Einstein: original Einstein and teleporter GLBs, dialogue choices, a server-selected modest shortcut and the original 4.5-second zoom transition. Each player gets one charge per round. Travel cannot shortcut directly to ETH.

## Multiplayer ownership

Dialogue and photographs belong to each player's client. An encounter disables that player's input and temporarily controls their existing camera; it does not stop the room clock, rail vehicles, or another player's controls. Finishing a round closes encounters so results remain available.

The server owns travel authorization, puzzle completion, destination selection, travel completion and per-round use limits. Commands carry the current round timestamp and reject spectators, vehicle occupants, distant players and stale requests. While traveling, ordinary movement, boarding and attacks cannot override the encounter. Cancellation, timeout, disconnect and round reset release held state; cancellation does not replenish a consumed charge.

Limousine poses are validated against the fixed route and speed limits and replicated for other players to render. Cars are personal encounter vehicles, not additions to the shared vehicle claiming system. Passenger avatars are hidden behind the limousine's opaque windows during the trip. Inspector fines and time penalties remain dialogue content; this pass does not add a ticket economy or change multiplayer scores/deadlines.

## Rendering and lifecycle

`apps/client/src/npcPrototype` contains the selected encounter implementations and their dependency closure, with a multiplayer adapter in `host.js`. It has no runtime dependency on the `mini-games` directory. Only NPC/camera configuration, required recordings, Einstein models and encounter helpers were copied. Audio provenance is retained in `apps/client/public/audio/CREDITS.md`.

The adapter uses main's terrain and existing map BVHs. Instanced decorative trees are excluded from collision queries. It does not import the prototype's world loader, modify global raycasting, alter the map, or create another renderer/animation loop. Portrait/landscape photos and their live previews use MapViewer's existing renderer and canvas.

Static NPC geometry is merged using vertex colours; each animated character is rendered as one skinned mesh driven by its original mouth and joint pivots. Textured details remain separate. Einstein's two static GLBs are flattened by material, including their emissive surfaces. Models and UI are instance-owned. Loads are abortable; cleanup removes dialogue, body classes, input listeners, media, speech, teleport audio and owned Three.js resources. Repeated play/inspect mounts create fresh instances.

`packages/shared/src/npc-layout.json` fixes placements and the limousine corridor in the existing LV95-relative coordinate system. It was fitted using the prototype placement searches and navigation against main's shared terrain; the client additionally checks native building triangles before choosing curve smoothing. Keep this data coordinated with future map changes.

## Validation

- TypeScript check, frontend lint and production client build.
- Six NPC authority/integration tests, including independent charges, safe destinations, unauthorized travel, puzzle validation, boundary return, cancellation, disconnect and lobby reset.
- Complete selected regression suite: 96 tests passed with concurrency limited to two and the existing `BVH nearest hits` exclusion used by prior work.
- Two rendering tests verify original joint transforms, static GLB bounds and emissive materials after batching.
- Chrome with two room clients: normal movement to Einstein, dialogue, full teleport, independent waiting client, authoritative destination agreement, both tourist photo captures and round reset. The photo interaction was started through a local encounter fixture to exercise its real UI/capture without walking the entire route.
- Chrome with a second room member: normal walking to the laptop and pickup, wrong/correct answers, remote limousine visibility, full boarding/ride/rejection/ejection sequence and authoritative landing agreement.
- Local browser fixtures: kid choice, eater dialogue closure, inspector completion and finance unskippability. Play/inspect/play cleanup left no NPC UI, body classes or private-property styles behind; the fresh play mount had exactly one UI root and one Einstein dialogue. No page errors in these completed checks.

An initial camera comparison found 159 extra draw calls from the prototype assets. Character skin batching plus static Einstein model batching reduced that to 20 extra calls at the same camera (423 with NPCs, 403 with NPCs hidden, including the existing shadow pass). This measures that scene's draw calls, not an FPS guarantee; the underlying scene already exceeded the agreement's approximate 300-call budget.

Headless browser checks are functional checks, not a deployment FPS benchmark.
