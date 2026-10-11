import { test } from "node:test";
import assert from "node:assert/strict";
import { GameControls } from "../apps/client/src/multiplayer/gameControls.ts";
import { createBody } from "../packages/shared/src/index.ts";

async function fixture(run: (controls: GameControls, local: { enabled: boolean; body: ReturnType<typeof createBody>; clear(): void }, menu: { hidden: boolean }, doc: { pointerLockElement: unknown; exitPointerLock(): void; querySelector(): object }) => void | Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvas = { focus() {}, async requestPointerLock() { doc.pointerLockElement = canvas; } }, menu = { hidden: true };
  const doc = { hasFocus:()=>true, pointerLockElement: canvas as unknown, exitPointerLock() { this.pointerLockElement = null; }, querySelector() { return { textContent: "", focus() {} }; } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  const controls = Object.create(GameControls.prototype) as GameControls;
  const local = { enabled: true, body: createBody(), clear() {} };
  Object.assign(controls, { canvas, menu, local, ready: () => true, suspended: () => false, available: true, abort: new AbortController(), captured: true, edge: { x: 0, y: 0 }, crosshair: {}, view: { perspective: 0, look() {} } });
  try { await run(controls, local, menu, doc); }
  finally { if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document"); }
}
function sync(controls: GameControls) { (controls as unknown as { syncPointerLock(): void }).syncPointerLock(); }

test("scanner releases and a late pointer-lock event cannot pause restored gameplay", async () => {
  await fixture((controls, local, menu, doc) => {
    local.enabled = false; doc.pointerLockElement = null;
    sync(controls); assert.equal(menu.hidden, true);
    menu.hidden = false; controls.restoreGameplay();
    sync(controls); assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
    assert.notEqual(doc.pointerLockElement, null, "dismissal automatically recaptures the cursor");
  });
});
test("cursor release never interrupts gameplay with a pause overlay", async () => {
  await fixture((controls, local, menu, doc) => {
    doc.pointerLockElement = null; sync(controls);
    assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
  });
});
test("bike knockdown keeps camera controls enabled through recovery", async () => {
  await fixture((controls, local, menu) => {
    local.body.knockdownUntil = 5000; local.body.anim = 3;
    controls.update(1 / 60); assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
    local.body.knockdownUntil = 0; local.body.anim = 0;
    controls.update(1 / 60); assert.equal(local.enabled, true);
  });
});


test("start and every encounter exit enable controls without a click", async () => {
  await fixture((controls, local, menu, doc) => {
    let ready = false;
    Object.assign(controls, { ready: () => ready, available: false });
    controls.update(); assert.equal(local.enabled, false);
    doc.pointerLockElement = null; ready = true;
    controls.update(); assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
    assert.notEqual(doc.pointerLockElement, null);
    for (const encounter of ["NPC", "Mate", "exam", "scanner"]) {
      ready = false; controls.update(); assert.equal(local.enabled, false, encounter);
      ready = true; controls.update(); assert.equal(local.enabled, true, encounter);
      assert.equal(menu.hidden, true, encounter);
    }
    controls.pause(); controls.update();
    assert.equal(local.enabled, false, "explicit pause remains paused");
    assert.equal(menu.hidden, false);
  });
});

test("rejected capture keeps gameplay enabled and can retry without an overlay", async () => {
  await fixture(async (controls, local, menu, doc) => {
    doc.pointerLockElement = null;
    const canvas = { focus() {}, async requestPointerLock(): Promise<void> { throw new Error("gesture required"); } };
    Object.assign(controls, { canvas });
    await controls.resume();
    assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
    canvas.requestPointerLock = async () => { doc.pointerLockElement = canvas; };
    await controls.resume();
    assert.equal(doc.pointerLockElement, canvas);
  });
});
