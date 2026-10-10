import { roomCode, playerName } from "@race/shared";
export interface Selection { mode: "create" | "join"; code: string; character: number; name: string }

export function lobby(connect: (selection: Selection) => Promise<void>) {
  const abort = new AbortController();
  const root = document.querySelector<HTMLElement>("#lobby")!;
  const form = root.querySelector<HTMLFormElement>("form")!;
  const field = root.querySelector<HTMLInputElement>("#room-code")!;
  const name = root.querySelector<HTMLInputElement>("#player-name")!;
  const message = root.querySelector<HTMLElement>("[role=status]")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = (event.submitter as HTMLButtonElement)?.value === "join" ? "join" : "create";
    const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>("button"));
    buttons.forEach(b => b.disabled = true); message.textContent = "Connecting…";
    try {
      const generated = [...crypto.getRandomValues(new Uint8Array(3))].map(n => n.toString(16).padStart(2, "0")).join("");
      const code = roomCode(field.value || (mode === "create" ? generated : ""));
      await connect({ mode, code, name: playerName(name.value), character: Number(form.querySelector<HTMLSelectElement>("select")!.value) });
      if (!abort.signal.aborted) root.hidden = true;
    } catch (error) {
      if (abort.signal.aborted) return;
      message.textContent = error instanceof Error ? error.message : String(error);
      buttons.forEach(b => b.disabled = false);
    }
  }, { signal: abort.signal });
  document.querySelector<HTMLButtonElement>("#leave")!.addEventListener("click", () => location.reload(), { signal: abort.signal });
  return () => abort.abort();
}
