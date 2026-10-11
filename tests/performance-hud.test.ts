import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomPhase } from "../packages/shared/src/index.ts";
import { Hud } from "../apps/client/src/multiplayer/hud.ts";
import type { Network } from "../apps/client/src/multiplayer/net.ts";

test("performance row appears in ordinary matches and spectating without enabling dev tools", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const panel = { hidden: true, classList: { add() {} } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => panel } });
  try {
    const root = { dataset: {} as Record<string, string> };
    const element = { ...panel, parentElement: root, textContent: "" };
    const hud = new Hud(element as unknown as HTMLDivElement);
    const state = { phase: RoomPhase.Running as string, devMode: false, players: new Map([["player", {}]]) };
    const net = { room: { state }, canPlay: false, rtt: 23, offline: false };
    hud.update(0.25, net as unknown as Network, { x: 0, z: 0 });
    assert.equal(element.hidden, false);
    assert.equal(element.textContent, "4 FPS · 23 ms ping · 1 players");
    assert.equal(root.dataset.devMode, "false");
    state.phase = RoomPhase.Lobby;
    hud.update(0.25, net as unknown as Network, { x: 0, z: 0 });
    assert.equal(element.hidden, true);
    hud.dispose();
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
