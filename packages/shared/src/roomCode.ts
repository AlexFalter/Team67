export function roomCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9-]{4,12}$/.test(code)) throw new Error("Use 4–12 letters, numbers, or hyphens for the code.");
  return code;
}
