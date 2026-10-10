// A read-only activity log that can later share its container with chat.
export class ActivityFeed {
  private root = document.querySelector<HTMLElement>('#activity-feed')!;
  add(message: string) {
    const line = document.createElement('div');
    line.textContent = message; this.root.append(line); this.root.hidden = false;
    while (this.root.childElementCount > 6) this.root.firstElementChild?.remove();
  }
  clear() { this.root.replaceChildren(); this.root.hidden = true; }
  dispose() { this.clear(); }
}
