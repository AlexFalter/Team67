import { MAX_EXTRAPOLATE_MS } from "@race/shared";

/** One timestamped pose sample of a remote entity. */
export interface Sample { t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number }
export interface Pose { x: number; y: number; z: number; yaw: number; vx: number; vz: number }

const SIZE = 16;
export const INTERPOLATING = 0, EXTRAPOLATING = 1, HOLDING = 2, EMPTY = 3;

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * Small ring buffer of samples, evaluated at a render time behind the newest data. Between samples it
 * uses cubic Hermite interpolation with the sampled velocities (smooth through turns, exact at the
 * samples). Past the newest sample it extrapolates for at most MAX_EXTRAPOLATE_MS, then holds.
 */
export class SampleBuffer {
  private ring: Sample[] = Array.from({ length: SIZE }, () => ({ t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0 }));
  private count = 0;
  private head = 0; // index of the next write

  get size() { return this.count; }
  get latest(): Sample | undefined { return this.count ? this.ring[(this.head + SIZE - 1) % SIZE] : undefined; }

  push(t: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, yaw: number) {
    const last = this.latest;
    if (last && t <= last.t) return false; // duplicate patch or out of order
    const s = this.ring[this.head];
    s.t = t; s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz; s.yaw = yaw;
    this.head = (this.head + 1) % SIZE;
    this.count = Math.min(SIZE, this.count + 1);
    return true;
  }

  clear() { this.count = 0; }

  private at(i: number) { return this.ring[(this.head - this.count + i + SIZE) % SIZE]; }

  /** Samples newer than the render time (the jitter cushion). */
  depth(renderTime: number) {
    let n = 0;
    for (let i = this.count - 1; i >= 0 && this.at(i).t > renderTime; i--) n++;
    return n;
  }

  sample(renderTime: number, out: Pose) {
    if (!this.count) return EMPTY;
    const first = this.at(0), last = this.at(this.count - 1);
    if (renderTime <= first.t || this.count === 1 && renderTime <= last.t) { copy(first, out); return INTERPOLATING; }
    if (renderTime >= last.t) {
      const ahead = Math.min(renderTime - last.t, MAX_EXTRAPOLATE_MS) / 1000;
      out.x = last.x + last.vx * ahead;
      out.y = last.y + last.vy * ahead;
      out.z = last.z + last.vz * ahead;
      out.yaw = last.yaw; out.vx = last.vx; out.vz = last.vz;
      return renderTime - last.t > MAX_EXTRAPOLATE_MS ? HOLDING : EXTRAPOLATING;
    }
    let i = this.count - 2;
    while (i > 0 && this.at(i).t > renderTime) i--;
    const a = this.at(i), b = this.at(i + 1), h = (b.t - a.t) / 1000, u = (renderTime - a.t) / (b.t - a.t);
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    out.x = h00 * a.x + h10 * h * a.vx + h01 * b.x + h11 * h * b.vx;
    out.z = h00 * a.z + h10 * h * a.vz + h01 * b.z + h11 * h * b.vz;
    // Vertical: Hermite only while airborne-ish; on the ground vy is ~0 and slopes would wobble, so lerp.
    out.y = Math.abs(a.vy) + Math.abs(b.vy) > 0.5
      ? h00 * a.y + h10 * h * a.vy + h01 * b.y + h11 * h * b.vy
      : a.y + (b.y - a.y) * u;
    out.yaw = a.yaw + angleDelta(a.yaw, b.yaw) * u;
    out.vx = a.vx + (b.vx - a.vx) * u;
    out.vz = a.vz + (b.vz - a.vz) * u;
    return INTERPOLATING;
  }
}

function copy(s: Sample, out: Pose) {
  out.x = s.x; out.y = s.y; out.z = s.z; out.yaw = s.yaw; out.vx = s.vx; out.vz = s.vz;
}
