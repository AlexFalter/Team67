import { Client, type Room } from "@colyseus/sdk";
import * as C from "@race/shared";
const count = Number(process.argv[2] ?? 10);
if (!Number.isInteger(count) || count < 1 || count > 40)
  throw new Error("Bot count must be an integer from 1 to 40.");
const rooms: Room<any, C.WorldState>[] = [];
const timers: ReturnType<typeof setInterval>[] = [];
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  timers.forEach(clearInterval);
  await Promise.allSettled(rooms.map((r) => r.leave()));
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
try {
  for (let i = 0; i < count; i++) {
    const room = await new Client(
      process.env.COLYSEUS_URL || "ws://localhost:2567",
    ).joinOrCreate<C.WorldState>("race");
    rooms.push(room);
    const body = C.createBody();
    let ready = false,
      angle = Math.random() * Math.PI * 2,
      decision = 0,
      sprint = false;
    room.onStateChange((s) => {
      const p = s.players.get(room.sessionId);
      if (p && !ready) {
        Object.assign(body, p);
        ready = true;
      }
    });
    room.onMessage<C.Impulse>("impulse", (hit) =>
      C.applyImpulse(body, hit, Date.now()),
    );
    room.onMessage("bump", () => {});
    room.onMessage("pong", () => {});
    const input: C.Input = { x: 0, z: 0, sprint: false, jump: false };
    let last = performance.now();
    const simulation = setInterval(() => {
      const now = Date.now(),
        current = performance.now(),
        dt = Math.min(0.05, (current - last) / 1000);
      last = current;
      if (!ready) return;
      if (now >= decision) {
        decision = now + 700 + Math.random() * 1300;
        sprint = Math.random() < 0.35;
        angle = Math.random() * Math.PI * 2;
        let nearest: C.PlayerState | undefined,
          distance = Infinity;
        for (const [id, p] of room.state.players) {
          const d = Math.hypot(p.x - body.x, p.z - body.z);
          if (id !== room.sessionId && d < distance) {
            distance = d;
            nearest = p;
          }
        }
        if (sprint && nearest)
          angle = Math.atan2(nearest.x - body.x, nearest.z - body.z);
        if (Math.hypot(body.x, body.z) > 20)
          angle = Math.atan2(-body.x, -body.z);
      }
      input.x = Math.sin(angle);
      input.z = Math.cos(angle);
      input.sprint = sprint;
      input.jump = Math.random() < 0.005;
      C.stepMovement(body, input, dt, now);
    }, 1000 / 60);
    const send = setInterval(() => {
      if (ready) room.send("move", C.packMove(body));
    }, 1000 / C.CLIENT_SEND_RATE);
    timers.push(simulation, send);
    room.onLeave(() => {
      clearInterval(simulation);
      clearInterval(send);
    });
  }
  console.log(`${count} bots connected. Ctrl+C to stop.`);
} catch (error) {
  console.error(error);
  await stop();
  process.exitCode = 1;
}
