import { Client, type Room } from "@colyseus/sdk";
import * as C from "@race/shared";
const count = Number(process.argv[2] ?? 10);
const world = process.env.GAME_WORLD === "flat" ? C.flatWorld : C.zurichWorld;
if (!Number.isInteger(count) || count < 1 || count > 40)
  throw new Error("Bot count must be an integer from 1 to 40.");
const rooms: Room<object, C.WorldState>[] = [];
const timers: ReturnType<typeof setInterval>[] = [];
let stopping = false, joinedAll = false;
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
    const client = new Client(process.env.COLYSEUS_URL || "ws://localhost:2567");
    const options = { name: `Bot ${i + 1}`, character: (i + 1) % C.CHARACTER_NAMES.length };
    const room = process.env.ROOM_CODE
      ? await client.joinById<C.WorldState>(process.env.ROOM_CODE, options)
      : await client.joinOrCreate<C.WorldState>("race", options);
    room.reconnection.enabled = false;
    rooms.push(room);
    const body = C.createBody();
    let ready = false,
      angle = Math.random() * Math.PI * 2,
      decision = 0,
      sprint = false;
    room.onStateChange((s) => {
      const p = s.players.get(room.sessionId);
      if (s.phase === C.RoomPhase.Lobby) ready = false;
      if (joinedAll && s.phase === C.RoomPhase.Lobby && !s.members.get(room.sessionId)?.ready) room.send("ready", true);
      if (p && !ready) {
        C.snapshot(p, body);
        ready = true;
      }
    });
    room.onMessage<C.Impulse>("impulse", (hit) =>
      C.applyImpulse(body, hit, Date.now()),
    );
    room.onMessage<C.PlayerCorrection>("playerCorrection", correction => Object.assign(body, correction));
    room.onMessage("bump", () => {});
    room.onMessage("pong", () => {});
    const input: C.Input = { x: 0, z: 0, sprint: false, jump: false };
    let last = performance.now();
    const simulation = setInterval(() => {
      const now = Date.now(),
        current = performance.now(),
        dt = Math.min(0.05, (current - last) / 1000);
      last = current;
      if (!ready || room.state.phase !== C.RoomPhase.Running || !room.state.players.has(room.sessionId)) return;
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
        if (Math.hypot(body.x - world.spawn.x, body.z - world.spawn.z) > (process.env.ROOM_CODE ? 8 : 70))
          angle = Math.atan2(world.spawn.x - body.x, world.spawn.z - body.z);
      }
      input.x = Math.sin(angle);
      input.z = Math.cos(angle);
      input.sprint = sprint;
      input.jump = Math.random() < 0.005;
      if (process.env.COLLISION_TEST === "1" && i === 0) {
        const human = [...room.state.players].find(([id]) => !room.state.members.get(id)?.name.startsWith("Bot "))?.[1];
        if (human) {
          const dx = human.x - body.x, dz = human.z - body.z, distance = Math.hypot(dx, dz);
          const facing = Math.atan2(dx, dz);
          input.x = distance > 1.7 ? dx / Math.max(1, distance) : 0;
          input.z = distance > 1.7 ? dz / Math.max(1, distance) : 0;
          input.sprint = input.jump = false; input.aim = true; input.facing = facing;
          if (distance < 2.2 && now >= body.knockdownUntil && now >= body.attackReadyAt && human.knockdownUntil <= now) {
            room.send("move", C.packMove({ ...body, rotY: facing }));
            room.send("hit"); body.attackReadyAt = now + C.ATTACK_COOLDOWN_MS + 500;
          }
        }
      }
      C.stepPlayer(body, input, dt, world);
    }, 1000 / 60);
    const send = setInterval(() => {
      if (ready && room.state.phase === C.RoomPhase.Running && room.state.players.has(room.sessionId)) room.send("move", C.packMove(body));
    }, 1000 / C.CLIENT_SEND_RATE);
    timers.push(simulation, send);
    room.onLeave(() => {
      clearInterval(simulation);
      clearInterval(send);
    });
  }
  joinedAll = true;
  for (const room of rooms) room.send("ready", true);
  console.log(`${count} bots connected to ${rooms[0]?.roomId}. Ctrl+C to stop.`);
} catch (error) {
  console.error(error);
  await stop();
  process.exitCode = 1;
}
