import { ATTACK_COOLDOWN_MS, SLIDE_MIN_SPEED, JUMP_FATIGUE_WALK_THRESHOLD, type Body } from "@race/shared";
import type { LocalPlayer } from "./localPlayer.ts";

export function actionAvailability(p: Body, sprinting: boolean, now: number) {
  const knocked = now < p.knockdownUntil;
  const punchSeconds = Math.ceil(Math.min(ATTACK_COOLDOWN_MS, Math.max(0, p.attackReadyAt - now)) / 1000);
  const knockdownSeconds = Math.ceil(Math.max(0, p.knockdownUntil - now) / 1000);
  const onFoot = !p.vehicleId && !knocked;
  return {
    punch: onFoot && !punchSeconds,
    slide: onFoot && sprinting && !p.jumpSprintLocked &&
      (p.jumpFatigue ?? 0) < JUMP_FATIGUE_WALK_THRESHOLD && Math.hypot(p.vx, p.vz) >= SLIDE_MIN_SPEED &&
      now >= (p.slideReadyAt ?? 0) && now >= (p.slideUntil ?? 0),
    punchSeconds: knockdownSeconds || punchSeconds,
    slideSeconds: knockdownSeconds,
  };
}

export interface ContextAction { icon: "person" | "polybahn" | "tram" | "bike" | "mate" | "cart" | "leave"; label: string; key: string; enabled: boolean; run: () => void }
const icons = {
  leave: '<path d="M10 3H4v18h6M10 12h11m-4-4 4 4-4 4"/>',
  person: '<circle cx="12" cy="6" r="3"/><path d="M5 21v-5a7 7 0 0 1 14 0v5M8 21v-5m8 5v-5"/>',
  bike: '<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-9 5 9H5m5-9h7l2 9M8 5h4m4 0h3l1 3"/>',
  cart: '<path d="m4 10 2-6h12l2 6v9H4zM4 10h16M8 4v6m8-6v6M4 14h16m-14 5v3m12-3v3"/><circle cx="7" cy="17" r=".5"/><circle cx="17" cy="17" r=".5"/>',
  tram: '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 12h14M12 3v9M8 19l-2 3m10-3 2 3M9 1h6"/><circle cx="8" cy="16" r=".5"/><circle cx="16" cy="16" r=".5"/>',
  polybahn: '<path d="m2 7 20-5M4 12l16-4v11H4zM7 12v5h4v-6m3-1v7h4V9M7 7v4m10-6v3"/><circle cx="7" cy="21" r="1"/><circle cx="17" cy="21" r="1"/>',
  mate: '<rect x="7" y="3" width="10" height="19" rx="2"/><path d="M7 6h10M7 18h10m-6-15h2m-1 7-2 4h4l-2 3"/>',
};
export class ActionHud {
  private root = document.querySelector<HTMLElement>("#combat-actions")!;
  private punch = this.root.querySelector<HTMLButtonElement>("#punch-action")!;
  private slide = this.root.querySelector<HTMLButtonElement>("#slide-action")!;
  private context = document.createElement("div");
  private instructions = document.createElement("div");
  private entries: { item: HTMLElement; button: HTMLButtonElement; action: ContextAction }[] = [];
  private abort = new AbortController();
  constructor(private local: LocalPlayer, private now: () => number, focus: () => void, private getContext: () => ContextAction[] = () => []) {
    this.context.className = "context-actions"; this.root.prepend(this.context);
    this.instructions.className = "action-instructions";
    this.instructions.innerHTML = '<div class="interaction-instruction"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg><span></span></div>';
    this.root.append(this.instructions);
    this.root.addEventListener("click", e => {
      const entry = this.entries.find(item => item.button === (e.target as Element).closest("button"));
      if (entry?.action.enabled) { focus(); entry.action.run(); }
    }, { signal: this.abort.signal });
    const options = { signal: this.abort.signal };
    this.punch.addEventListener("click", () => {
      if (actionAvailability(local.body, local.sprinting, now()).punch) local.punch();
      focus();
    }, options);
    this.slide.addEventListener("click", () => {
      if (actionAvailability(local.body, local.sprinting, now()).slide) local.requestSlide();
      focus();
    }, options);
  }
  update(visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) return;
    const actions = this.getContext();
    const interaction = actions.find(action => action.key === "E");
    const hint = this.instructions.querySelector<HTMLElement>(".interaction-instruction")!;
    hint.hidden = !interaction;
    if (interaction) {
      hint.querySelector("span")!.textContent = `E · ${interaction.label}`;
      const svg = hint.querySelector("svg")!;
      if (svg.dataset.icon !== interaction.icon) { svg.innerHTML = icons[interaction.icon]; svg.dataset.icon = interaction.icon; }
    }
    while (this.entries.length > actions.length) this.entries.pop()!.item.remove();
    actions.forEach((action, i) => {
      let entry = this.entries[i];
      if (!entry) {
        const item = document.createElement("div"); item.className = "combat-action";
        item.innerHTML = '<kbd></kbd><button type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg></button>';
        if (action.key === "1") this.root.append(item); else this.context.append(item); entry = { item, button: item.querySelector("button")!, action }; this.entries.push(entry);
      }
      if (action.key === "1") this.root.append(entry.item); else this.context.append(entry.item);
      entry.action = action; entry.item.querySelector("kbd")!.textContent = action.key;
      const svg = entry.button.querySelector("svg")!;
      if (svg.dataset.icon !== action.icon) { svg.innerHTML = icons[action.icon]; svg.dataset.icon = action.icon; }
      entry.button.disabled = !action.enabled; entry.button.title = `${action.label} · ${action.key}`;
      entry.button.setAttribute("aria-label", entry.button.title);
    });
    const state = actionAvailability(this.local.body, this.local.sprinting, this.now());
    for (const [button, available, seconds, label] of [
      [this.punch, state.punch, state.punchSeconds, "Punch (F)"],
      [this.slide, state.slide, state.slideSeconds, "Slide (C)"],
    ] as const) {
      button.disabled = !available;
      button.classList.toggle("has-countdown", seconds > 0);
      button.querySelector<HTMLElement>(".action-countdown")!.textContent = seconds ? String(seconds) : "";
      button.setAttribute("aria-label", seconds ? `${label}, ${seconds} seconds remaining` : available ? label : `${label}, unavailable`);
    }
  }
  dispose() { this.abort.abort(); this.root.hidden = true; this.context.remove(); this.instructions.remove(); this.entries.forEach(entry => entry.item.remove()); }
}
