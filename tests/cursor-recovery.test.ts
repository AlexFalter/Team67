import { test } from "node:test";
import assert from "node:assert/strict";
import { GameControls } from "../apps/client/src/multiplayer/gameControls.ts";
import { createBody } from "../packages/shared/src/index.ts";

async function fixture(run: (controls: GameControls, local: { enabled: boolean; body: ReturnType<typeof createBody>; clear(): void }, menu: { hidden: boolean }, doc: { pointerLockElement: unknown; exitPointerLock(): void; querySelector(): object }) => void | Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvas = { focus() {}, async requestPointerLock() { doc.pointerLockElement = canvas; } }, menu = { hidden: true, querySelector(){return {textContent:""};} };
  const doc = { hasFocus:()=>true, pointerLockElement: canvas as unknown, exitPointerLock() { this.pointerLockElement = null; }, querySelector() { return { textContent: "", focus() {} }; } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  const controls = Object.create(GameControls.prototype) as GameControls;
  const local = { enabled: true, body: createBody(), clear() {} };
  Object.assign(controls, { abort: new AbortController(), available:true, resumeAttempt:0, capturePending:false, canvas, menu, local, ready: () => true, suspended: () => false, captured: true, capturePrompt: {hidden:true}, edge: { x: 0, y: 0 }, play: {}, crosshair: {}, view: { perspective: 0, look() {} } });
  try { await run(controls, local, menu, doc); }
  finally { if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document"); }
}
function sync(controls: GameControls) { (controls as unknown as { syncPointerLock(): void }).syncPointerLock(); }

test('Escape dismissing an interaction waits for release before recapturing and never opens pause', async () => {
  await fixture(async (controls, local, menu, doc) => {
    controls.holdInteractionEscape();
    local.enabled = false;
    doc.pointerLockElement = null;
    await controls.restoreGameplay();
    sync(controls);
    controls.update();
    assert.equal(doc.pointerLockElement, null, 'no capture while the dismissal key is held');
    assert.equal(menu.hidden, true, 'dismissal is not a pause gesture');
    Object.assign(controls, { interactionEscapeHeld: false });
    await controls.restoreGameplay();
    assert.notEqual(doc.pointerLockElement, null);
    assert.equal(menu.hidden, true);
    doc.pointerLockElement = null;
    sync(controls);
    assert.equal(menu.hidden, false, 'the next Escape in gameplay still pauses');
  });
});

test("scanner releases and a late pointer-lock event cannot pause restored gameplay", async () => {
  await fixture(async (controls, local, menu, doc) => {
    local.enabled = false; doc.pointerLockElement = null;
    Object.assign(controls,{ready:()=>false});
    sync(controls); assert.equal(menu.hidden, true);
    Object.assign(controls,{ready:()=>true});
    menu.hidden = false; await controls.restoreGameplay();
    sync(controls); assert.equal(local.enabled, true); assert.equal(menu.hidden, true);
    assert.notEqual(doc.pointerLockElement, null, "dismissal automatically recaptures the cursor");
  });
});
test("a genuine cursor release pauses gameplay and makes the menu usable", async () => {
  await fixture((controls, local, menu, doc) => {
    doc.pointerLockElement = null; sync(controls);
    assert.equal(local.enabled, false); assert.equal(menu.hidden, false);
  });
});

test('encounters opening between frames do not turn intentional cursor release into Escape', async () => {
  for (const releasedBeforeFrame of [false, true]) await fixture((controls, local, menu, doc) => {
    Object.assign(controls, {ready:()=>false, externalMenuReady:()=>true, externalCapture:()=>false});
    if(releasedBeforeFrame)doc.pointerLockElement=null;
    controls.update();
    assert.equal(doc.pointerLockElement,null);
    assert.equal(menu.hidden,true,'conversation opens without the pause menu, regardless of event ordering');
    assert.equal(local.enabled,false);
    sync(controls);
    controls.update();
    assert.equal(menu.hidden,true,'queued pointer-lock events cannot reopen the pause menu');
    controls.toggleMenu();
    assert.equal(menu.hidden,false,'explicit Escape still pauses the encounter');
  });
});

test('a frame observing native Escape in a captured ride still opens the pause menu', async () => {
  await fixture((controls, _local, menu, doc) => {
    Object.assign(controls, {ready:()=>false, externalMenuReady:()=>true, externalCapture:()=>true});
    doc.pointerLockElement=null;
    controls.update();
    assert.equal(menu.hidden,false);
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

test("rejected cursor capture waits for keyboard input without reopening the pause overlay", async () => {
  await fixture((controls, local, menu) => {
    (controls as unknown as {fallback():void}).fallback();
    assert.equal(local.enabled,false);
    assert.equal(menu.hidden,true);
    assert.equal((controls as unknown as {recaptureOnInput:boolean}).recaptureOnInput,true);
  });
});
test("uncaptured edge movement never rotates the gameplay camera", async () => {
  await fixture((controls, local, _menu, doc) => {
    let looks=0;
    Object.assign(controls,{captured:false,edge:{x:1,y:1},view:{perspective:0,look(){looks++;}}});
    doc.pointerLockElement=null;
    controls.update(1/60);
    assert.equal(looks,0);
    assert.equal(local.enabled,false,"interaction restoration waits for cursor capture");
    assert.equal((controls as unknown as {recaptureOnInput:boolean}).recaptureOnInput,true,"next movement key can recapture without Escape");
  });
});

test("Escape opens the menu while capture recovery is waiting, and opens it again after a rejected resume", async () => {
  await fixture(async (controls, local, menu, doc) => {
    doc.pointerLockElement = null;
    (controls as unknown as {fallback():void}).fallback();
    controls.toggleMenu();
    assert.equal(menu.hidden, false, 'Escape always opens a hidden menu');
    assert.equal(local.enabled, false);
    (controls as unknown as {canvas:{requestPointerLock():Promise<void>}}).canvas.requestPointerLock = async () => { throw new Error('Capture denied'); };
    controls.toggleMenu();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(menu.hidden, true);
    controls.toggleMenu();
    assert.equal(menu.hidden, false, 'capture rejection cannot trap Escape in a retry loop');
  });
});

test("first Escape after interaction restoration opens the pause menu without requiring mouse movement", async () => {
  await fixture(async (controls, local, menu, doc) => {
    await controls.restoreGameplay();
    assert.equal(local.enabled, true);
    doc.pointerLockElement = null;
    sync(controls);
    assert.equal(menu.hidden, false, 'release after recapture must open the real pause menu');
    assert.equal(local.enabled, false);
    assert.equal((controls as unknown as {capturePrompt:{hidden:boolean}}).capturePrompt.hidden, true);
  });
});

test("a frame observing Escape before pointerlockchange opens the same pause menu", async () => {
  await fixture(async (controls, local, menu, doc) => {
    await controls.restoreGameplay();
    doc.pointerLockElement = null;
    controls.update();
    assert.equal(menu.hidden, false);
    sync(controls);
    assert.equal(menu.hidden, false, 'late release event leaves the pause menu open');
    assert.equal(local.enabled, false);
  });
});

test("helicopter owns mouse capture while normal movement is unavailable", async () => {
  await fixture((controls, local, menu, doc) => {
    const captured = doc.pointerLockElement;
    Object.assign(controls, { ready: () => false, externalCapture: () => true });
    controls.update();
    assert.equal(doc.pointerLockElement, captured, 'gameplay controls must not release ride-owned capture');
    assert.equal(local.enabled, false, 'ride capture must not enable walking or punching');
    assert.equal(menu.hidden, true);
    Object.assign(controls, { externalCapture: () => false });
    controls.update();
    assert.equal(doc.pointerLockElement, null, 'phone and other overlays can still release capture');
  });
});

test('helicopter pause menu opens and resumes without enabling normal walking', async () => {
  await fixture(async (controls, local, menu, doc) => {
    Object.assign(controls,{ready:()=>false,externalMenuReady:()=>true,externalCapture:()=>true});
    local.enabled=false;
    controls.toggleMenu();assert.equal(menu.hidden,false);assert.equal(doc.pointerLockElement,null);
    controls.update();assert.equal(menu.hidden,false,'flight updates must preserve the pause menu');
    await controls.resume();assert.equal(menu.hidden,true);assert.equal(local.enabled,false);
    assert.notEqual(doc.pointerLockElement,null,'resuming returns capture to the helicopter');
    controls.toggleMenu();assert.equal(menu.hidden,false,'Escape can open the menu repeatedly');
  });
});

test('Escape delivered after the native cursor release does not close the menu opened by that same press', async () => {
  await fixture((controls, local, menu, doc) => {
    doc.pointerLockElement = null;
    sync(controls);
    assert.equal(menu.hidden,false);
    controls.escape();
    assert.equal(menu.hidden,false,'one Escape cannot both open and close the menu');
    assert.equal(local.enabled,false);
  });
});
