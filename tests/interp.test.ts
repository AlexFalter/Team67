import { test } from "node:test";
import assert from "node:assert/strict";
import { SampleBuffer, INTERPOLATING, EXTRAPOLATING, HOLDING, EMPTY, type Pose } from "../apps/client/src/net/interp.ts";
import { Clock } from "../apps/client/src/net/clock.ts";

const pose = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 });

test("Hermite reproduces a circle between 30 Hz samples (with velocities) to millimetres", () => {
  const b = new SampleBuffer(), r = 4, w = 1.875; // 7.5 m/s around a 4 m circle
  const at = (t: number) => ({ x: r * Math.cos(w * t), z: r * Math.sin(w * t), vx: -r * w * Math.sin(w * t), vz: r * w * Math.cos(w * t) });
  for (let i = 0; i < 16; i++) {
    const t = i / 30, s = at(t);
    b.push(t * 1000, s.x, 0, s.z, s.vx, 0, s.vz, 0);
  }
  const out = pose();
  let worst = 0;
  for (let ms = 50; ms < 450; ms += 1000 / 144) {
    assert.equal(b.sample(ms, out), INTERPOLATING);
    const s = at(ms / 1000);
    worst = Math.max(worst, Math.hypot(out.x - s.x, out.z - s.z));
  }
  assert.ok(worst < 0.003, `max error ${worst} m`);
});

test("irregular sample spacing does not distort positions; duplicates and out-of-order are dropped", () => {
  const b = new SampleBuffer();
  const ts = [0, 25, 70, 95, 140, 160, 210];
  for (const t of ts) b.push(t, (t / 1000) * 5, 0, 0, 5, 0, 0, 0); // straight line at 5 m/s
  assert.equal(b.push(160, 99, 0, 0, 0, 0, 0, 0), false);
  assert.equal(b.push(100, 99, 0, 0, 0, 0, 0, 0), false);
  const out = pose();
  for (let t = 0; t <= 210; t += 3) {
    b.sample(t, out);
    assert.ok(Math.abs(out.x - (t / 1000) * 5) < 1e-9);
  }
});

test("past the newest sample: extrapolate at most 100 ms, then hold", () => {
  const b = new SampleBuffer(), out = pose();
  assert.equal(b.sample(0, out), EMPTY);
  b.push(0, 0, 0, 0, 10, 0, 0, 0);
  b.push(100, 1, 0, 0, 10, 0, 0, 0);
  assert.equal(b.sample(150, out), EXTRAPOLATING);
  assert.ok(Math.abs(out.x - 1.5) < 1e-9);
  assert.equal(b.sample(400, out), HOLDING);
  assert.ok(Math.abs(out.x - 2) < 1e-9, "held at +100 ms");
  assert.equal(b.depth(50), 1);
});

test("yaw interpolates along the shortest arc", () => {
  const b = new SampleBuffer(), out = pose();
  b.push(0, 0, 0, 0, 0, 0, 0, Math.PI - 0.1);
  b.push(100, 0, 0, 0, 0, 0, 0, -Math.PI + 0.1);
  b.sample(50, out);
  assert.ok(Math.abs(Math.abs(out.yaw) - Math.PI) < 1e-9, `yaw ${out.yaw}`);
});

test("clock: minimum-RTT sample wins, offset slews instead of jumping", () => {
  let local = 1000;
  const c = new Clock(() => local);
  // Server is 5000 ms ahead. Symmetric 40 ms RTT except one slow, asymmetric sample.
  const ping = (rtt: number, up = rtt / 2) => { const sent = local; local += rtt; c.sample(sent, sent + 5000 + up, local); };
  ping(40);
  assert.equal(c.offset, 5000);
  ping(300, 250); // delayed: would suggest +100 ms
  assert.equal(c.target, 5000, "slow sample ignored");
  ping(20, 10);
  assert.equal(c.target, 5000);
  c.target = 5050;
  c.update(0.1);
  assert.ok(Math.abs(c.offset - 5005) < 1e-9, "5% of 100 ms per frame");
  c.target = 9000;
  c.update(0.016);
  assert.equal(c.offset, 9000, "large errors snap");
});
