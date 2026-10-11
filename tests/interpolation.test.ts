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
    phase: "Running", hostId: "local", startedAt: 0, endsAt: 0, finishedAt: 0,
    introStartedAt: 0, introComplete: true, devMode: false, skipIntro: false, goldPubliBikes: true, railCrashProtection: false,
    members: new Map(), results: new Map(),
    vehicles: new Map(),
    publiBikes: new Map(),
    mates: new Map(),
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
  assert.equal(rendered.simTime, 1050, "remote animation follows the shared interpolated clock");
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

test("other players see the full third-person slide pose and its recovery", () => {
  const remotes = new RemotePlayers(new Scene()), remote = createBody(); remote.anim = 4; remote.vz = 10;
  const state: WorldState = { serverTime: 1000, phase: "Running", hostId: "local", startedAt: 0, endsAt: 0, finishedAt: 0,
    devMode: false, skipIntro: false, goldPubliBikes: true, railCrashProtection: false,
    introStartedAt: 0, introComplete: true, members: new Map(), results: new Map(), vehicles: new Map(), publiBikes: new Map(), mates: new Map(), players: new Map([["remote", remote]]) };
  remotes.patch(state, "local");
  for (let i = 0; i < 40; i++) remotes.render(1000);
  const mesh = remotes.players.get("remote")!.mesh;
  assert.equal(mesh.visible, true);
  assert.equal(mesh.getObjectByName("head")!.visible, true);
  assert.ok(mesh.getObjectByName("torso")!.position.y < 0.3);
  assert.ok(mesh.getObjectByName("right-knee")!.rotation.x > 1.4);
  remote.anim = 0; remote.vz = 0; state.serverTime = 2000; remotes.patch(state, "local");
  for (let i = 0; i < 60; i++) remotes.render(2000);
  assert.ok(mesh.getObjectByName("torso")!.position.y > 0.74, "stands smoothly after sliding");
  remotes.dispose();
});
