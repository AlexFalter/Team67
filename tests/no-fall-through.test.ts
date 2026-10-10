import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { zurichNativeHeight } from "../packages/shared/src/world.ts";

// Sprint and jump in 8 directions from every 2 m around Central / the Polybahn incline, HB and the
// Polyterrasse: a body must never end up inside the terrain (it used to, when jumping against a slope:
// airborne moves were not checked against rising ground and nothing caught a body below the surface).
test("jumping against slopes never puts a body inside the ground", () => {
  const W = C.zurichWorld; const falls: string[] = []; let runs = 0;
  for (const [x0, x1, z0, z1] of [[10, 80, 80, 130], [-320, -200, -140, -40], [150, 240, 60, 200]]) for (let x = x0; x <= x1; x += 2) for (let z = z0; z <= z1; z += 2) {
    const g0 = zurichNativeHeight(x, z); if (g0 === undefined || W.blocked(x, g0, z, 0.5, 1.8)) continue;
    for (let a = 0; a < 8; a++) {
      const b = C.createBody(); b.x = x; b.z = z; b.y = W.height(x, z, g0)!; b.grounded = true; runs++;
      for (let f = 0; f < 150; f++) {
        const before = b.y;
        C.stepPlayer(b, { ...C.IDLE_INPUT, x: Math.cos(a * Math.PI / 4), z: Math.sin(a * Math.PI / 4), sprint: true, jump: f % 40 === 0 }, 1 / 60, W);
        const surface = W.height(b.x, b.z, before);  // the surface the game stands this body on
        if (surface !== undefined && b.y < surface - 1.0) { falls.push(`(${b.x.toFixed(1)}, ${b.z.toFixed(1)}) y ${b.y.toFixed(1)} < ${surface.toFixed(1)}`); break; }
      }
    }
  }
  assert.ok(runs > 30000, `runs ${runs}`);
  assert.deepEqual(falls.slice(0, 5), []);
});
