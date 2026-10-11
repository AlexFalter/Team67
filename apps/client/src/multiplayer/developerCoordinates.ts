import type { PlayerState } from "@race/shared";

export class DeveloperCoordinates {
  private abort = new AbortController();
  private checkbox = document.querySelector<HTMLInputElement>("#activate-coordinates")!;
  private toggle = document.querySelector<HTMLButtonElement>("#toggle-coordinates")!;
  private panel = document.createElement("aside");
  private value: HTMLOutputElement;
  private copy: HTMLButtonElement;
  constructor(parent: HTMLElement) {
    this.panel.id = "developer-coordinates";
    this.panel.hidden = true;
    this.panel.innerHTML = '<b>PLAYER COORDINATES</b><output></output><small>X · east / Y · height / Z · south</small><button type="button">Copy coordinates</button>';
    this.value = this.panel.querySelector("output")!;
    this.copy = this.panel.querySelector("button")!;
    parent.append(this.panel);
    this.toggle.addEventListener("click", () => {
      this.checkbox.checked = !this.checkbox.checked;
      this.checkbox.dispatchEvent(new Event("change"));
    }, { signal: this.abort.signal });
    this.copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(this.value.value); this.copy.textContent = "Copied!"; }
      catch { const selection = window.getSelection(), range = document.createRange(); range.selectNodeContents(this.value); selection?.removeAllRanges(); selection?.addRange(range); this.copy.textContent = "Select and copy"; }
    }, { signal: this.abort.signal });
  }
  update(player: Pick<PlayerState, "x" | "y" | "z">, devMode: boolean, playing: boolean) {
    this.toggle.hidden = !devMode;
    this.toggle.textContent = this.checkbox.checked ? "Deactivate Coordinates" : "Activate Coordinates";
    this.panel.hidden = !devMode || !playing || !this.checkbox.checked;
    if (this.panel.hidden) return;
    const text = `X: ${player.x.toFixed(2)}, Y: ${player.y.toFixed(2)}, Z: ${player.z.toFixed(2)}`;
    if (this.value.value !== text) { this.value.value = text; this.copy.textContent = "Copy coordinates"; }
  }
  dispose() { this.abort.abort(); this.panel.remove(); }
}
