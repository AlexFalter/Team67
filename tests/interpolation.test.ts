import { test } from "node:test";
import assert from "node:assert/strict";
import { Scene } from "three";
import { createBody, type WorldState } from "../packages/shared/src/index.ts";
import { RemotePlayers } from "../apps/client/src/multiplayer/remotePlayers.ts";

test("remote interpolation follows the delayed timeline and shortest angle, holds, and removes meshes", () => {
  const scene = new Scene();
  const remotes = new RemotePlayers(scene);
  const local = createBody(),
    remote = createBody();
  const state: WorldState = {
    serverTime: 1000,
    vehicles: new Map(),
    peels: new Map(),
    players: new Map([
      ["local", local],
      ["remote", remote],
    ]),
  };
  remote.rotY = Math.PI - 0.1;
  remotes.patch(state, "local");
  state.serverTime = 1100;
  remote.x = 10;
  remote.y = 2;
  remote.z = 4;
  remote.rotY = -Math.PI + 0.1;
  remotes.patch(state, "local");
  remotes.render(1050);
  const rendered = remotes.players.get("remote")!.rendered;
  assert.equal(remotes.players.has("local"), false);
  assert.equal(rendered.x, 5);
  assert.equal(rendered.y, 1);
  assert.equal(rendered.z, 2);
  assert.ok(Math.abs(rendered.rotY - Math.PI) < 1e-10);
  remotes.render(1200);
  assert.equal(rendered.x, 10, "hold latest snapshot without extrapolation");
  remotes.render(900);
  assert.equal(rendered.x, 0, "hold earliest snapshot before history");
  state.players.delete("remote");
  remotes.patch(state, "local");
  assert.equal(scene.children.length, 0);
  assert.equal(remotes.players.size, 0);
});
