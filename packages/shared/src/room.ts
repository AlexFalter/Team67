export const RoomPhase = { Lobby: "Lobby", Running: "Running", Finished: "Finished" } as const;
export const ROUND_DURATION_MS = 3 * 60 * 1000;
export const MAX_PLAYER_NAME_LENGTH = 24;

export function playerName(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter your name to join a room.");
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  if (!name || [...name].length > MAX_PLAYER_NAME_LENGTH)
    throw new Error(`Use a name with 1-${MAX_PLAYER_NAME_LENGTH} characters.`);
  return name;
}
