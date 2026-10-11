import { battleBusThanksVisible, type WorldState } from '@race/shared';

// A read-only activity log that can later share its container with chat.
export class ActivityFeed {
  private root = document.querySelector<HTMLElement>('#activity-feed')!;
  private run = 0;
  private thanked = new Set<string>();
  updateBusDriverThanks(state: WorldState | undefined, now: number) {
    const run = state?.introStartedAt ?? 0;
    if (run !== this.run) { this.clear(); this.run = run; }
    if (!state || !battleBusThanksVisible(state, now)) { this.clear(); return; }
    for (const [id, member] of state.members) {
      if (!member.thankedBusDriver || this.thanked.has(id)) continue;
      this.thanked.add(id); this.add(`${member.name} thanked the bus driver.`);
    }
  }
  add(message: string) {
    const line = document.createElement('div');
    line.className = 'pixel-panel';
    line.textContent = message; this.root.append(line); this.root.hidden = false;
    while (this.root.childElementCount > 6) this.root.firstElementChild?.remove();
  }
  clear() { this.root.replaceChildren(); this.root.hidden = true; this.thanked.clear(); }
  dispose() { this.clear(); }
}
