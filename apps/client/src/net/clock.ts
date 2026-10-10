/**
 * Estimated server clock from ping/pong. Each sample gives offset = serverTime + rtt/2 - receiveTime;
 * the sample with the lowest RTT in a sliding window is the least delayed, so it is the target. The
 * applied offset slews toward the target instead of jumping, so remote motion never hitches.
 */
const WINDOW = 10;

export class Clock {
  offset = 0;
  target = 0;
  rtt = 0;
  jitter = 0;
  samples = 0;
  private rtts = new Float64Array(WINDOW);
  private offsets = new Float64Array(WINDOW);

  constructor(private local: () => number = () => performance.now()) {}

  /** Estimated server time (ms). */
  now() {
    return this.local() + this.offset;
  }

  sample(sentAt: number, serverTime: number, receivedAt = this.local()) {
    const rtt = Math.max(0, receivedAt - sentAt), i = this.samples % WINDOW;
    if (this.samples) this.jitter += (Math.abs(rtt - this.rtt) - this.jitter) / 8;
    this.rtt = rtt;
    this.rtts[i] = rtt;
    this.offsets[i] = serverTime + rtt / 2 - receivedAt;
    this.samples++;
    let best = 0;
    for (let k = 1; k < Math.min(this.samples, WINDOW); k++) if (this.rtts[k] < this.rtts[best]) best = k;
    this.target = this.offsets[best];
    if (this.samples === 1) this.offset = this.target;
  }

  /** Slew at most 5% of elapsed time (big errors, e.g. a sleeping tab, snap). */
  update(dt: number) {
    const diff = this.target - this.offset, max = dt * 1000 * 0.05;
    this.offset = Math.abs(diff) > 250 ? this.target : this.offset + Math.max(-max, Math.min(max, diff));
  }
}
