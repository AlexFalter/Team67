import type { Room } from "@colyseus/sdk";
import * as C from "../packages/shared/src/index.ts";
import type { WireState } from "./fixture.ts";

// Live client: main's reports/impulses with feature movement and physics.
export function reportClient(room: Room<any, WireState>, world = C.flatWorld) {
  const body = C.snapshot(room.state.players.get(room.sessionId)!, C.createBody());
  body.simTime = room.state.serverTime;
  const input: C.Input = { ...C.IDLE_INPUT };
  let last = performance.now();
  room.onStateChange(state => {
    const own = state.players.get(room.sessionId);
    if (own && own.vehicleId !== body.vehicleId) { C.snapshot(own, body); body.simTime = state.serverTime; }
  });
  room.onMessage<C.PlayerCorrectionMessage>("playerCorrection", correction => Object.assign(body, C.unpackPlayerCorrection(correction)));
  room.onMessage<C.Impulse>("impulse", hit => C.applyImpulse(body, hit, Date.now()));
  const report = () => {
    if (!body.vehicleId) room.send("move", C.packMove(body));
    else if (body.vehicleKind !== 1) room.send("vehicleMove", [body.vehicleId, body.x, body.z, body.rotY, body.vx, body.vz]);
  };
  const simulate = setInterval(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (body.vehicleKind === 1) return;
    const impact = C.stepPlayer(body, input, dt, world) ?? 0;
    input.jump = false;
    if (impact >= C.CART_MIN_HIT_SPEED && body.vehicleKind === 2) { report(); room.send("bikeCrash"); }
  }, 1000 / 60);
  const send = setInterval(report, 1000 / C.CLIENT_SEND_RATE);
  return { body, input, report, stop() { clearInterval(simulate); clearInterval(send); } };
}
