import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { zurichNativeBlocked, zurichNativeHeight } from "../packages/shared/src/world.ts";
import data from "../packages/shared/src/zurich-world.json";

// Hundreds of walks from around each Polybahn hall to points inside and across it: nobody may sink below the
// hall/street floor or end up standing inside a wall (the walkable Polybahn track corridor overlaps the halls).
test("no sinking through floors or walking through walls around the Polybahn halls", () => {
  const W = C.zurichWorld;
  const patches = (data as any).patches.slice(0, 2);
  let issues: string[] = [], walks = 0;
  for (const [pi, p] of patches.entries()) {
    const name = pi ? "top" : "bottom";
    const x0 = p.minX, z0 = p.minZ, x1 = p.minX + (p.width - 1) * p.step, z1 = p.minZ + (p.depth - 1) * p.step;
    const free = (x: number, z: number) => { const h = zurichNativeHeight(x, z); return h !== undefined && !zurichNativeBlocked(x, h, z, 0.5, 1.8); };
    const starts: [number, number][] = [], targets: [number, number][] = [];
    for (let x = x0 + 0.5; x < x1; x += 2) for (let z = z0 + 0.5; z < z1; z += 2) {
      if (!free(x, z)) continue;
      (x < x0 + 4 || x > x1 - 4 || z < z0 + 4 || z > z1 - 4 ? starts : targets).push([x, z]);
    }
    for (const s of starts) for (let k = 0; k < targets.length; k += 3) {
      const t = targets[k]; walks++;
      const b = C.createBody(); b.x = s[0]; b.z = s[1]; b.y = W.height(b.x, b.z, zurichNativeHeight(b.x, b.z))!;
      for (let f = 0; f < 240; f++) {
        const dx = t[0] - b.x, dz = t[1] - b.z, l = Math.hypot(dx, dz); if (l < 0.3) break;
        C.stepPlayer(b, { ...C.IDLE_INPUT, x: dx / l, z: dz / l }, 1 / 60, W);
        const g = zurichNativeHeight(b.x, b.z);
        if (g !== undefined && b.y < g - 0.5 && b.grounded) { issues.push(`${name}: sank to ${b.y.toFixed(2)} at (${b.x.toFixed(1)},${b.z.toFixed(1)}) floor ${g.toFixed(2)} from ${s} to ${t}`); break; }
        if (g !== undefined && b.grounded && zurichNativeBlocked(b.x, b.y, b.z, 0.25, 1.8) && !W.blocked(b.x, b.y, b.z, 0.25, 1.8) && Math.abs(b.y - g) < 0.5) {
          issues.push(`${name}: inside a wall cell at (${b.x.toFixed(1)},${b.z.toFixed(1)}) y ${b.y.toFixed(2)} from ${s} to ${t}`); break; }
        if (b.y < g! - 3) { issues.push(`${name}: fell to ${b.y.toFixed(2)} at (${b.x.toFixed(1)},${b.z.toFixed(1)})`); break; }
      }
    }
  }

  assert.ok(walks > 300, `walks ${walks}`);
  assert.deepEqual([...new Set(issues)].slice(0, 5), []);
});
