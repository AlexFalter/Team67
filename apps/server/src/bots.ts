import { Client, type Room } from "@colyseus/sdk";
import * as C from "@race/shared";
const count = Number(process.argv[2] ?? 10);
if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error("Bot count must be 1–40.");
const rooms: Room<any, C.WorldState>[] = [], timers: ReturnType<typeof setInterval>[] = [];
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true; timers.forEach(clearInterval);
  await Promise.allSettled(rooms.map(r => r.leave()));
}
process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
try {
  for (let i = 0; i < count && !stopping; i++) {
    const client = new Client(process.env.COLYSEUS_URL || "ws://localhost:2567");
    const room = process.env.ROOM_CODE
      ? await client.joinById<C.WorldState>(C.roomCode(process.env.ROOM_CODE), { character: i % 3 })
      : await client.joinOrCreate<C.WorldState>("race", { character: i % 3 });
    rooms.push(room); room.onMessage("bump", () => {});
    const input = room.input({ type: C.MoveInput });
    let angle = Math.random() * Math.PI * 2, decision = 0;
    const timer = setInterval(() => {
      const p = room.state?.players.get(room.sessionId); if (!p) return;
      if (Date.now() >= decision) {
        decision = Date.now() + 700 + Math.random() * 1300;
        angle = Math.hypot(p.x - C.zurichWorld.spawn.x, p.z - C.zurichWorld.spawn.z) > 20 ? Math.atan2(C.zurichWorld.spawn.x - p.x, C.zurichWorld.spawn.z - p.z) : Math.random() * Math.PI * 2;
        input.data.sprint = Math.random() < 0.35;
      }
      input.data.x = Math.sin(angle); input.data.z = Math.cos(angle);
      input.data.jump = Math.random() < 0.005; input.send();
    }, input.stepMs);
    timers.push(timer); room.onLeave(() => clearInterval(timer));
  }
  console.log(`${rooms.length} bots connected. Ctrl+C to stop.`);
} catch (error) { console.error(error); await stop(); process.exitCode = 1; }
