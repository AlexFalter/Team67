import { test } from "node:test";
import assert from "node:assert/strict";
import { examPortalPosition, createBody, type WorldState } from "../packages/shared/src/index.ts";
import { distanceToEth, raceStandings, projectPoint, unprojectPoint, zoomMap } from "../apps/client/src/multiplayer/raceHudModel.ts";
import map from "../apps/client/src/multiplayer/city-map-data.json" with { type: "json" };

test("leaderboard orders active members by distance to the actual exam entrance, using local prediction", () => {
  const members: WorldState["members"] = new Map(["self", "near", "far", "spectator"].map(id => [id, { name: id, spectator: id === "spectator", ready: true, character: 0, introSeat: 0 }]));
  const players: WorldState["players"] = new Map(["self", "near", "far", "spectator", "npc"].map(id => [id, { ...createBody(), color: "#fff", character: 0, mateCount: 0, mateBoostMs: 0, ...examPortalPosition, x: examPortalPosition.x + (id === "far" ? 50 : 5) }]));
  const results = raceStandings({ members, players }, "self", examPortalPosition);
  assert.deepEqual(results.map(p => p.id), ["self", "near", "far"]);
  assert.equal(results[0].distance, 0);
  assert.equal(results[2].distance, 50);
  assert.equal(distanceToEth({ x: examPortalPosition.x + 3, z: examPortalPosition.z + 4 }), 5);
});

test("zoom anchors stay fixed under the cursor and map projection preserves north", () => {
  const view = { x: 20, z: 50, width: 800, height: 600, scale: 2 };
  const point = unprojectPoint(173, 231, view);
  const zoomed = zoomMap(view, 3, 173, 231);
  const projected = projectPoint(point, zoomed);
  assert.ok(Math.abs(projected.x - 173) < 1e-8);
  assert.ok(Math.abs(projected.y - 231) < 1e-8);
  assert.ok(projectPoint({ x: 20, z: 40 }, view).y < view.height / 2);
  assert.deepEqual(unprojectPoint(400, 300, view), { x: 20, z: 50 });
});

test("ported streets and clipped water use the current city origin", () => {
  assert.deepEqual(map.origin, [2683475, 1248000, 400]);
  assert.ok(map.streets.length > 100);
  for (const polygon of map.water) for (const [x, z] of polygon) {
    assert.ok(x >= -725 && x <= 875 && z >= -400 && z <= 1500);
  }
});
