import { test } from "node:test";
import assert from "node:assert/strict";
import { Scene, SphereGeometry } from "three";
import { Effects } from "../apps/client/src/multiplayer/effects.ts";
import { RoomFlow } from "../apps/client/src/multiplayer/roomFlow.ts";
import { GameAudio } from "../apps/client/src/multiplayer/gameAudio.ts";
import { createBody, SLIDE_ANIM } from "../packages/shared/src/index.ts";

test("timer cues fire once at 2m, 1m and 30s, tolerate clock jitter and reset each round", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
  Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  let remaining = 121000, cues = 0, animations = 0;
  const state = { phase: "Running", startedAt: 1000, endsAt: 301000 };
  const net = { canPlay: true, room: { state }, status: "Connected", now: () => state.endsAt - remaining };
  const flow = Object.create(RoomFlow.prototype) as RoomFlow;
  Object.assign(flow, { net, timerRound: -1, timerCues: new Set(), timerCue: () => cues++, timer: { dataset: {}, setAttribute() {} },
    timerValue: { textContent: "", animate() { animations++; return { cancel() {} }; } }, timerFill: { style: {} }, timerLabel: {} });
  try {
    flow.update(); assert.equal(cues, 0);
    for (const threshold of [120000, 60000, 30000]) {
      remaining = threshold + 100; flow.update();
      remaining = threshold; flow.update();
      remaining = threshold + 100; flow.update(); remaining = threshold - 100; flow.update();
    }
    assert.equal(cues, 3); assert.ok(animations > 0);
    state.startedAt++; remaining = 121000; flow.update(); remaining = 120000; flow.update();
    assert.equal(cues, 4);
    remaining = 0; flow.update(); assert.equal(cues, 4);
  } finally { if (previous) Object.defineProperty(globalThis, "matchMedia", previous); else Reflect.deleteProperty(globalThis, "matchMedia"); }
});

test("slide whoosh plays once on entry, without footsteps or false wall-impact sounds", () => {
  const audio = Object.create(GameAudio.prototype) as GameAudio, sounds: string[] = [];
  Object.assign(audio, { sliding: false, lastGrounded: true, lastSpeed: 11, lastVy: 0, stepAge: 0, effect: (kind: string) => sounds.push(kind) });
  const p = createBody(); p.anim = SLIDE_ANIM; p.vx = 4;
  audio.movement(.1, p, true, 1000); audio.movement(.1, p, true, 1100);
  assert.deepEqual(sounds, ["slide"]);
  p.anim = 0; p.vx = 0; audio.movement(.1, p, false, 1200);
  p.anim = SLIDE_ANIM; p.vx = 8; audio.movement(.1, p, true, 1300);
  assert.deepEqual(sounds, ["slide", "slide"]);
});

test("dead bikes keep sparking at a bounded rate and each particle expires", () => {
  const scene = new Scene(), geometry = new SphereGeometry(.07, 6, 4);
  const effects = Object.create(Effects.prototype) as Effects;
  Object.assign(effects, { scene, geometry, batteries: new Map(), nextBatterySpark: new Map(), particles: [], motion: new Map(), queue: [] });
  const p = { x: 2, y: 3, z: 4 };
  effects.battery("bike", 25000, p, 0); assert.equal(scene.children.length, 0);
  effects.battery("bike", 0, p, 1000); assert.equal(scene.children.length, 18);
  effects.battery("bike", 0, p, 1000); assert.equal(scene.children.length, 18);
  effects.update(1000, .5); assert.equal(scene.children.length, 0);
  effects.battery("bike", 0, p, 1500); assert.equal(scene.children.length, 3);
  effects.battery("bike", 0, p, 1550); assert.equal(scene.children.length, 3, "does not emit every frame");
  effects.battery("bike", 0, p, 1650); assert.equal(scene.children.length, 6);
  effects.battery("already-empty", 0, p, 1650); assert.equal(scene.children.length, 9, "late joiners see dead bikes sparking too");
  effects.update(2000, .5); assert.equal(scene.children.length, 0);
  effects.battery("bike", 25000, p, 2000); assert.equal(scene.children.length, 0, "fresh round stops sparks");
  geometry.dispose();
});
