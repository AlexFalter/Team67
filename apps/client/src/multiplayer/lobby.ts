import { roomCode, playerName } from "@race/shared";
export interface Selection { mode: "create" | "join"; code: string; character: number; name: string; devMode?: boolean; skipIntro?: boolean; railCrashProtection?: boolean; goldPubliBikes?: boolean }

export function lobby(connect: (selection: Selection) => Promise<void>) {
  const abort = new AbortController();
  const root = document.querySelector<HTMLElement>("#lobby")!;
  const form = root.querySelector<HTMLFormElement>("form")!;
  const field = root.querySelector<HTMLInputElement>("#room-code")!;
  const name = root.querySelector<HTMLInputElement>("#player-name")!;
  const message = root.querySelector<HTMLElement>("[role=status]")!;
  const devMode = root.querySelector<HTMLInputElement>("#dev-mode")!;
  const skipIntro = root.querySelector<HTMLInputElement>("#skip-intro")!;
  const skipOption = root.querySelector<HTMLElement>("#skip-intro-option")!;
  const goldBikes = root.querySelector<HTMLInputElement>("#gold-bikes")!;
  const goldOption = root.querySelector<HTMLElement>("#gold-bikes-option")!;
  const coordinates=root.querySelector<HTMLInputElement>("#activate-coordinates")!;
  const coordinatesOption=root.querySelector<HTMLElement>("#coordinates-option")!;
  const railProtection=root.querySelector<HTMLInputElement>("#rail-protection")!;
  const railOption=root.querySelector<HTMLElement>("#rail-protection-option")!;
  try {
    const saved = JSON.parse(localStorage.getItem("eth-dev-settings") ?? "{}");
    devMode.checked = saved?.devMode === true;
    coordinates.checked = saved?.showCoordinates === true;
    railProtection.checked=saved?.railCrashProtection===true;
    skipIntro.checked = saved?.skipIntro !== false;
    goldBikes.checked = saved?.goldPubliBikes !== false;
  } catch { /* Storage can be disabled; keep the form usable. */ }
  const syncDevSettings = () => {
    coordinatesOption.hidden = !devMode.checked;
    skipOption.hidden = !devMode.checked;
    railOption.hidden=!devMode.checked;
    goldOption.hidden = !devMode.checked;
    skipIntro.disabled = !devMode.checked;
    try { localStorage.setItem("eth-dev-settings", JSON.stringify({ devMode: devMode.checked, showCoordinates: coordinates.checked, skipIntro: skipIntro.checked, goldPubliBikes: goldBikes.checked, railCrashProtection: railProtection.checked })); } catch { /* Optional persistence. */ }
  };
  syncDevSettings();
  coordinates.addEventListener("change",syncDevSettings,{signal:abort.signal});
  railProtection.addEventListener("change",syncDevSettings,{signal:abort.signal});
  devMode.addEventListener("change", syncDevSettings, { signal: abort.signal });
  goldBikes.addEventListener("change", syncDevSettings, { signal: abort.signal });
  skipIntro.addEventListener("change", syncDevSettings, { signal: abort.signal });
  message.textContent = "";
  form.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = false);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = (event.submitter as HTMLButtonElement)?.value === "join" ? "join" : "create";
    const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>("button"));
    buttons.forEach(b => b.disabled = true); message.textContent = "Connecting…";
    try {
      const generated = [...crypto.getRandomValues(new Uint8Array(3))].map(n => n.toString(16).padStart(2, "0")).join("");
      const code = roomCode(field.value || (mode === "create" ? generated : ""));
      await connect({ mode, code, name: playerName(name.value), devMode: devMode.checked, skipIntro: devMode.checked && skipIntro.checked, goldPubliBikes: goldBikes.checked, railCrashProtection: devMode.checked&&railProtection.checked, character: Number(form.querySelector<HTMLInputElement>("#character")!.value) });
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
