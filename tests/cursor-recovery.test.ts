import { test } from "node:test";
import assert from "node:assert/strict";
import { GameControls } from "../apps/client/src/multiplayer/gameControls.ts";
import { createBody } from "../packages/shared/src/index.ts";

function fixture(run: (controls: GameControls, local: { enabled: boolean; body: ReturnType<typeof createBody>; clear(): void }, menu: { hidden: boolean }, doc: { pointerLockElement: unknown; exitPointerLock(): void; querySelector(): object }) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvas = { focus() {}, async requestPointerLock() { doc.pointerLockElement = canvas; } }, menu = { hidden: true };
  const doc = { hasFocus:()=>true, pointerLockElement: canvas as unknown, exitPointerLock() { this.pointerLockElement = null; }, querySelector() { return { textContent: "", focus() {} }; } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  const controls = Object.create(GameControls.prototype) as GameControls;
  const local = { enabled: true, body: createBody(), clear() {} };
  Object.assign(controls, { canvas, menu, local, ready: () => true, suspended: () => false, captured: true, edge: { x: 0, y: 0 }, play: {}, crosshair: {}, view: { perspective: 0, look() {} } });
  try { run(controls, local, menu, doc); }
  finally { if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document"); }
}
function sync(controls: GameControls) { (controls as unknown as { syncPointerLock(): void }).syncPointerLock(); }

test("scanner releases and a late pointer-lock event cannot pause restored gameplay", () => {
  fixture((controls, local, menu, doc) => {
    local.enabled = false; doc.pointerLockElement = null;
    sync(controls); assert.equal(menu.hidden, true);
    menu.hidden = false; controls.restoreGameplay();
    sync(controls); assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
    assert.notEqual(doc.pointerLockElement, null, "dismissal automatically recaptures the cursor");
  });
});
test("a genuine cursor release pauses gameplay and makes the menu usable", () => {
  fixture((controls, local, menu, doc) => {
    doc.pointerLockElement = null; sync(controls);
    assert.equal(local.enabled, false); assert.equal(menu.hidden, false);
  });
});
test("bike knockdown keeps camera controls enabled through recovery", () => {
  fixture((controls, local, menu) => {
    local.body.knockdownUntil = 5000; local.body.anim = 3;
    controls.update(1 / 60); assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
    local.body.knockdownUntil = 0; local.body.anim = 0;
    controls.update(1 / 60); assert.equal(local.enabled, true);
  });
});
