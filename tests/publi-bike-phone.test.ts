import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera } from "three";
import { createBody, type BikeUnlockResult } from "../packages/shared/src/index.ts";
import { PhoneAimInput } from "../apps/client/src/multiplayer/phoneAimInput.ts";
import { PubliBikeFeature } from "../apps/client/src/multiplayer/publiBikes.ts";

// Exercise the interaction/response boundary without loading the city or GPU assets.
function setup() {
  const sent: { type: string; data: unknown }[] = [], notices: string[] = [];
  const local = { body: createBody(), enabled: true, clear() {} }, camera = new PerspectiveCamera();
  const modal = { hidden: true, querySelector: () => ({ textContent: "", focus() {} }) };
  const bike = { reservedBy: "" }, vehicle = { driver: "" };
  const net = { canPlay: true, status: "Connected", now: () => 10000,
    onVehicleResult: (r: { message: string }) => notices.push(r.message),
    room: { sessionId: "a", state: { publiBikes: new Map([["publibike-1", bike]]), vehicles: new Map([["publibike-1", vehicle]]) },
      send: (type: string, data: unknown) => sent.push({ type, data }) } };
  const feature: PubliBikeFeature = Object.assign(Object.create(PubliBikeFeature.prototype), {
    mouse: new PhoneAimInput(), canvas: { focus() {} }, local, camera, modal, net, vehicles: { nearestId: () => "publibike-1" },
    status: { textContent: "" }, bar: { style: { width: "" } }, held: new Set(), lastAim: {},
  });
  const reply = (ok: boolean, token?: string) => {
    const request = sent.find(s => s.type === "bikeScanBegin")!.data as { bikeId: string; requestId: string };
    (feature as unknown as { result(r: BikeUnlockResult): void }).result({ ...request, ok, token, message: ok ? "Scan" : "Another player is unlocking this bike." });
  };
  return { feature, local, camera, modal, bike, vehicle, sent, notices, reply };
}

test("occupied and reserved PubliBikes do not open the phone or interrupt gameplay", () => {
  for (const busy of ["driver", "reservation"]) {
    const s = setup();
    if (busy === "driver") s.vehicle.driver = "other"; else s.bike.reservedBy = "other";
    assert.equal(s.feature.interact(), true);
    assert.equal(s.feature.active, false); assert.equal(s.modal.hidden, true);
    assert.equal(s.local.enabled, true); assert.equal(s.sent.length, 0); assert.equal(s.notices.length, 1);
  }
});

test("a pending reservation keeps the phone closed; a lost race leaves gameplay enabled", () => {
  const s = setup(), fov = s.camera.fov;
  s.feature.interact(); s.feature.interact();
  assert.equal(s.sent.length, 1, "only one request is pending");
  assert.equal(s.feature.active, false); assert.equal(s.modal.hidden, true); assert.equal(s.local.enabled, true);
  s.reply(false);
  assert.equal(s.feature.active, false); assert.equal(s.modal.hidden, true); assert.equal(s.local.enabled, true);
  assert.equal(s.camera.fov, fov); assert.equal(s.notices.length, 1);
});

test("only the current server grant opens the phone; cancelled grants are ignored", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { pointerLockElement: null } });
  try {
    const s = setup(); s.feature.interact(); s.reply(true, "server-token");
    assert.equal(s.feature.active, true); assert.equal(s.modal.hidden, false); assert.equal(s.local.enabled, false);
    assert(s.camera.fov >= 65, "portrait scanner keeps the bike and QR code in view");
    s.feature.close();assert.equal(s.local.enabled, true, "scanner dismissal resumes gameplay without Click to play");assert.equal(s.camera.fov, 50, "closing restores the gameplay lens");
    const cancelled = setup(); cancelled.feature.interact(); cancelled.feature.close(); cancelled.reply(true, "late-token");
    assert.equal(cancelled.feature.active, false); assert.equal(cancelled.modal.hidden, true); assert.equal(cancelled.local.enabled, true);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});


test("closing the scanner after the round ends does not enable player input", () => {
  const s = setup();s.modal.hidden = false;s.local.enabled = false;
  (s.feature as unknown as { net: { canPlay: boolean } }).net.canPlay = false;
  s.feature.close(false);assert.equal(s.local.enabled, false);
});

test("an interrupted scanner restores gameplay through the controls owner", () => {
  const s = setup(); let resumed = 0;
  Object.assign(s.feature, { resumeGameplay: () => { resumed++; s.local.enabled = true; } });
  s.feature.interact();
  s.modal.hidden = false; s.local.enabled = false; s.local.body.knockdownUntil = 11000;
  (s.feature as unknown as { maintainRequest(): void }).maintainRequest();
  assert.equal(s.feature.active, false); assert.equal(s.local.enabled, true); assert.equal(resumed, 1);
});
test("a missing unlock reply closes the phone and restores control instead of trapping the cursor", () => {
  const s = setup(); s.feature.interact();
  s.modal.hidden = false; s.local.enabled = false;
  Object.assign(s.feature, { net: { ...((s.feature as unknown as { net: object }).net), now: () => 16001 } });
  (s.feature as unknown as { maintainRequest(): void }).maintainRequest();
  assert.equal(s.feature.active, false); assert.equal(s.local.enabled, true);
  assert.ok(s.notices.at(-1)?.includes("timed out"));
});
