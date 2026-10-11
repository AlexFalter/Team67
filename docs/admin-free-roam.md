# Admin free roam

Before creating a room, enable **Dev mode**, then **Admin free roam** in Testing. This disables the round countdown, automatic finish, and final exam entry for everyone in the room. Walking, vehicles, interactions, challenges, and multiplayer combat remain available. The host can still end the session manually.

Moodle has a separate **Disable Moodle notifications** checkbox before creating any room and in the host's Escape menu. It works independently of free roam. The existing phone toggle controls the same setting. Only the host can change it; disabling clears active deadlines and sit-out penalties. Re-enabling schedules a fresh interval.

Developer settings also include **Show collision checks**, available before starting and in the Escape menu. Orange wireframe probes show blocked player space at the current height within 24 metres, cyan shows terrain, yellow shows player capsules, pink shows vehicle contact shapes, and red shows map bounds. Probes use the shared movement query including ticket/Mate machines and Polybahn corridor overrides; they refresh as the player moves. These are movement clearance checks, not visual model wireframes. The display is local, has no effect on collision behavior, and is gated by the room's dev mode.

Lobby preferences persist in `eth-dev-settings`. Room creation owns `adminMode`; it requires `devMode` and cannot be enabled by a joining guest. `RoundManager` stores `Number.MAX_SAFE_INTEGER` as the finite untimed deadline so feature deadline checks and Colyseus serialization keep working. It also explicitly excludes admin rooms from automatic finish. Moodle rewards do not increase this sentinel. Normal rooms retain their countdown and Moodle behavior.

Regression coverage: `tests/admin-mode.test.ts`, `tests/moodle.test.ts`, and `tests/round.test.ts`.
