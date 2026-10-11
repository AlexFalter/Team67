# Dance reward and emote wheel

Michael Jackson is the existing Blender asset and moonwalk from `mini-games-2`,
not a replacement model. His placement is configured in
`packages/shared/src/npc-layout.json`; the NPC validates a clear, level loop.

Talk with E, then type `hee-hee` and `I wanna dance` into his dialogue.
`packages/shared/src/emotes.ts` defines the lines and allowed emote IDs.
The server's `EmoteChallenge` owns per-player, per-round progress and unlocks;
answers require proximity and a valid active player. Reopening the dialogue
restarts an unfinished challenge. A completed challenge stays unlocked for the round.

The wheel is available from the start with Default Dance and Orange Justice. Completing Michael’s conversation unlocks the other four dances for that player for the round. Locked slots are disabled; the server checks the same shared availability rule.

Press B to open the six-slot wheel; use the mouse, 1–6, or arrows and Enter.
It temporarily releases mouse capture; closing it restores gameplay capture.
A dance switches to third person and restores the previous perspective when stopped.
Movement, interactions, vehicles, knockdowns, focus loss, and round changes stop dances.

`dancePose.ts` adapts the branch's authored procedural choreography to the current
multiplayer avatar using its real joint lengths. The server replicates the selected
emote and start time, so other players render the same animation. Music plays for the dancer and nearby players, fading out over 25 metres. Each
client aligns playback with the replicated start time; music stops with the dance,
on disconnect, or when leaving hearing range. Browser audio unlocks on input. The five music clips are Fortnite assets;
the original single Dab is silent. See `public/audio/emotes/CREDITS.md`.

The game host calls `update` from its existing render loop and disposes the feature
with the game. No map geometry or separate animation loop belongs to this module.
