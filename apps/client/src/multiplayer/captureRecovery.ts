export interface CapturePort {
  locked(): boolean;
  allowed(): boolean;
  focused(): boolean;
  request(): Promise<void> | void;
  release(): void;
  captured(): void;
  waiting(): void;
}

/** Serializes browser capture requests; a rejected request waits for fresh input. */
export class CaptureRecovery {
  pending = false;
  waiting = false;
  private generation = 0;
  private owned = false;
  constructor(private port: CapturePort) {}
  async resume() {
    if (!this.port.allowed() || !this.port.focused() || this.pending) return;
    if (this.port.locked()) { this.acquired(); return; }
    this.pending = true;
    this.waiting = false;
    const generation = ++this.generation;
    try {
      await this.port.request();
      if (generation !== this.generation) return;
      // Legacy browsers return void before pointerlockchange; let that event finish the request.
      if (this.port.locked()) this.changed();
    } catch {
      if (generation === this.generation) this.failed();
    }
  }
  changed() {
    if (!this.port.locked()) { this.owned = false; return; }
    if (!this.port.allowed() || !this.port.focused() || (!this.pending && !this.waiting && !this.owned)) {
      this.port.release(); return;
    }
    this.acquired();
  }
  private acquired() {
    this.pending = this.waiting = false;
    this.owned = true;
    this.port.captured();
  }
  failed() {
    if (!this.pending || this.port.locked()) return;
    this.pending = false;
    if (!this.port.allowed() || !this.port.focused()) return;
    this.waiting = true;
    this.port.waiting();
  }
  cancel() { this.generation++; this.pending = this.waiting = this.owned = false; }
}

export function resumeKey(code: string) {
  return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Enter'].includes(code);
}
