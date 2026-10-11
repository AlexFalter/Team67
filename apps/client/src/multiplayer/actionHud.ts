import { LIME_KIND, LIME_BOOST_DURATION_MS, ATTACK_COOLDOWN_MS, SLIDE_MIN_SPEED, JUMP_FATIGUE_WALK_THRESHOLD, type Body } from "@race/shared";
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

export interface ContextAction { icon: "emote" | "bag" | "knife" | "spin" | "holster" | "equip" | "person" | "polybahn" | "tram" | "bike" | "mate" | "cart" | "leave" | "computer" | "scooter"; label: string; key: string; enabled: boolean; run: () => void }
export interface WeaponAction { kind?: "knife" | "bag"; enabled: boolean; run: () => void }
const icons = {
  emote: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5m0 7V21M4.2 7.5 9 10.3m6 3.4 4.8 2.8M4.2 16.5 9 13.7m6-3.4 4.8-2.8"/>',
  bag: '<path d="M7 8V6a5 5 0 0 1 10 0v2M5 8h14l2 14H3zM8 13l4 5 4-5"/>',
  holster: '<path d="M6 11h7v7a3.5 3.5 0 0 1-7 0zM8 11V4h3v7M6 4h7M18 3v10m-3-3 3 3 3-3"/>',
  equip: '<path d="M6 13h7v5a3.5 3.5 0 0 1-7 0zM8 10V3h3v7M6 3h7M18 13V3m-3 3 3-3 3 3"/>',
  knife: '<path d="M19 3c1 8-2 12-8 12l-3-3c4-1 7-4 11-9ZM8 12l-4 5 3 3 5-6"/><circle cx="5" cy="20" r="2"/>',
  spin: '<path d="M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/><path d="m10 15 4-6m-5 7 2 1"/>',

  computer: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8m-4-4v4"/>',
  scooter: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 19h9l3-14h-4m4 0 2 14"/>',
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
  private punchIcon = this.punch.querySelector("svg")!.innerHTML;
  private punchLabel = document.createElement("small");
  private slide = this.root.querySelector<HTMLButtonElement>("#slide-action")!;
  private context = document.createElement("div");
  private instructions = document.createElement("div");
  private entries: { item: HTMLElement; button: HTMLButtonElement; action: ContextAction }[] = [];
  private abort = new AbortController();
  private boost = document.createElement("button");
  constructor(private local: LocalPlayer, private now: () => number, focus: () => void, private getContext: () => ContextAction[] = () => [], private getWeapon: () => WeaponAction | undefined = () => undefined) {
    this.punchLabel.className="action-label";this.punchLabel.hidden=true;this.punch.parentElement!.append(this.punchLabel);
    this.context.className = "context-actions"; this.root.prepend(this.context);
    this.instructions.className = "action-instructions";
    this.instructions.innerHTML = '<div class="interaction-instruction"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg><span></span></div>';
    this.root.append(this.instructions);
    this.root.addEventListener("click", e => {
      const entry = this.entries.find(item => item.button === (e.target as Element).closest("button"));
      if (entry?.action.enabled) { focus(); entry.action.run(); }
    }, { signal: this.abort.signal });
    this.boost.type = "button"; this.boost.className = "lime-boost"; this.boost.hidden = true;
    this.boost.innerHTML = '<i aria-hidden="true"></i><span>Shift to boost</span>';
    this.root.append(this.boost);
    const options = { signal: this.abort.signal };
    this.boost.addEventListener("pointerdown", e => { e.preventDefault(); focus(); local.holdBoost(true); }, options);
    window.addEventListener("pointerup", () => local.holdBoost(false), options);
    window.addEventListener("pointercancel", () => local.holdBoost(false), options);
    this.boost.addEventListener("keydown", e => { if (["Space", "Enter"].includes(e.code)) { e.preventDefault(); local.holdBoost(true); } }, options);
    this.boost.addEventListener("keyup", () => local.holdBoost(false), options);
    this.boost.addEventListener("blur", () => local.holdBoost(false), options);
    this.punch.addEventListener("click", () => {
      const weapon = this.getWeapon();
      if(weapon){if(weapon.enabled)weapon.run();}else if(actionAvailability(local.body,local.sprinting,now()).punch)local.punch();
      focus();
    }, options);
    this.slide.addEventListener("click", () => {
      if (actionAvailability(local.body, local.sprinting, now()).slide) local.requestSlide();
      focus();
    }, options);
  }
  update(visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) { this.local.holdBoost(false); return; }
    const p = this.local.body;
    this.boost.hidden = !p.vehicleId || p.vehicleKind !== LIME_KIND || p.seat !== 0;
    const remaining = Math.max(0, Math.min(1, (p.limeBoostMs ?? LIME_BOOST_DURATION_MS) / LIME_BOOST_DURATION_MS));
    this.boost.style.setProperty("--boost-fill", `${remaining * 100}%`);
    this.boost.classList.toggle("boosting", this.local.sprinting && this.local.pushing && remaining > 0 && !p.limeBoostExhausted);
    this.boost.classList.toggle("exhausted", remaining === 0);
    this.boost.setAttribute("aria-label", `Shift to boost, ${Math.ceil(remaining * LIME_BOOST_DURATION_MS / 1000)} seconds available`);
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
        item.innerHTML = '<kbd></kbd><button type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg></button><small class="action-label" hidden></small>';
        if (action.key === "1") this.root.append(item); else this.context.append(item); entry = { item, button: item.querySelector("button")!, action }; this.entries.push(entry);
      }
      if (action.key === "1") this.root.append(entry.item); else this.context.append(entry.item);
      entry.action = action; entry.item.querySelector("kbd")!.textContent = action.key;
      const svg = entry.button.querySelector("svg")!;
      if (svg.dataset.icon !== action.icon) { svg.innerHTML = icons[action.icon]; svg.dataset.icon = action.icon; }
      const caption=entry.item.querySelector<HTMLElement>('.action-label')!;
      caption.hidden=action.icon!=='holster'&&action.icon!=='equip';caption.textContent=action.icon==='holster'?'Holster':'Equip';
      entry.button.disabled = !action.enabled; entry.button.removeAttribute("title");
      entry.button.setAttribute("aria-label", `${action.label} · ${action.key}`);
    });
    const weapon = this.getWeapon();
    const punchSvg = this.punch.querySelector('svg')!;
    const isBag=weapon?.kind==='bag',verb=isBag?'Throw bag':'Slash';
    const icon = weapon ? (isBag?'bag':'knife') : 'punch';
    if(punchSvg.dataset.icon!==icon){punchSvg.innerHTML=weapon?icons[isBag?"bag":"knife"]:this.punchIcon;punchSvg.dataset.icon=icon;}
    this.punch.parentElement!.querySelector('kbd')!.textContent=weapon?'Q':'Click';
    this.punchLabel.hidden=!weapon;this.punchLabel.textContent=isBag?"Throw":"Slash";
    this.punch.title=weapon?`${verb} · Q or click`:'Right hook · click';
    const state = actionAvailability(this.local.body, this.local.sprinting, this.now());
    for (const [button, available, seconds, label] of [
      [this.punch, (isBag?weapon!.enabled:state.punch && (!weapon || weapon.enabled)), isBag?0:state.punchSeconds, weapon ? `${verb} (Q / click)` : "Punch (click)"],
      [this.slide, state.slide, state.slideSeconds, "Slide (C)"],
    ] as const) {
      button.disabled = !available;
      button.classList.toggle("has-countdown", seconds > 0);
      button.querySelector<HTMLElement>(".action-countdown")!.textContent = seconds ? String(seconds) : "";
      button.setAttribute("aria-label", seconds ? `${label}, ${seconds} seconds remaining` : available ? label : `${label}, unavailable`);
    }
  }
  dispose() { this.local.holdBoost(false); this.instructions.remove(); this.boost.remove(); this.entries.forEach(entry => entry.item.remove()); this.abort.abort(); this.root.hidden = true; this.context.remove();this.punchLabel.remove();const svg=this.punch.querySelector("svg")!;svg.innerHTML=this.punchIcon;delete svg.dataset.icon;this.punch.parentElement!.querySelector("kbd")!.textContent="Click";this.punch.title="Right hook · click";this.punch.setAttribute("aria-label","Punch (click)"); }
}
