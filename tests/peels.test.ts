import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../packages/shared/src/index.ts";
import { Player, RaceState } from "../apps/server/src/state.ts";
import { PeelManager } from "../apps/server/src/peels.ts";

test("peels arm after landing, slip one grounded player, expire, and remain bounded", () => {
  const state = new RaceState(), manager = new PeelManager(state), now = 100000;
  const p = new Player(); state.players.set("owner", p);
  manager.drop("owner", true, now);
  const peel = [...state.peels.values()][0];
  manager.tick(now + 250, () => assert.fail("airborne peel cannot slip"));
  assert.ok(peel.y > 0); assert.ok(peel.z > 0 && peel.z < 4);
  manager.tick(now + 500, () => assert.fail("unarmed peel cannot slip"));
  assert.equal(peel.y, 0); assert.equal(peel.z, 4);
  const victim = new Player({ z: 4 }); state.players.set("victim", victim);
  victim.grounded = false;
  manager.tick(now + 1001, () => assert.fail("jumping player avoids peel"));
  victim.grounded = true;
  const slips: string[] = [];
  manager.tick(now + 1002, (_owner, target) => slips.push(target));
  assert.deepEqual(slips, ["victim"]); assert.equal(state.peels.size, 0);
  for (let i = 0; i < 40; i++) manager.drop("owner", false, now);
  assert.equal(state.peels.size, 32);
  manager.tick(now + C.PEEL_LIFETIME_MS + 1, () => {});
  assert.equal(state.peels.size, 0);
});
