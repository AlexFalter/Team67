// Headless load-test players: `npm run bots -- 30` (ROOM_CODE=ABCD joins an existing room,
// otherwise a new room is created and its code printed). Each bot runs the shared movement step.
import { Client, type Room } from "@colyseus/sdk";
import * as C from "@race/shared";

interface BotState { phase: string; players: Map<string, { x: number; y: number; z: number; waiting: boolean; ready: boolean }> }

const count = Number(process.argv[2] ?? 10);
if (!Number.isInteger(count) || count < 1 || count > C.MAX_PLAYERS) throw new Error(`Bot count must be 1-${C.MAX_PLAYERS}.`);
const url = process.env.COLYSEUS_URL || "ws://localhost:2567";
const world = C.zurichWorld;
let joined = false; // ready up only once every bot is in, or the round would start without them

class Bot {
  body = C.createBody();
  input = C.createInput();
  offset = 0;
  bestRtt = Infinity;
  active = false;
  turnAt = 0;
  move: C.Move = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  constructor(readonly room: Room<object, BotState>) {
    room.onMessage<[number, number]>(C.PONG, ([sent, server]) => {
      const rtt = Date.now() - sent;
      if (rtt <= this.bestRtt) { this.bestRtt = rtt; this.offset = server + rtt / 2 - Date.now(); }
    });
    room.onMessage<number[]>(C.CORRECT, ([x, y, z]) => { Object.assign(this.body, { x, y, z, vx: 0, vy: 0, vz: 0 }); });
    room.onMessage<number[]>(C.KNOCK, ([ix, iy, iz, ms]) => C.knock(this.body, ix, iy, iz, ms));
    for (const type of [C.NOTICE, C.HIT]) room.onMessage(type, () => {});
    room.onStateChange(state => {
      const me = state.players.get(room.sessionId);
      const active = state.phase === C.RUNNING && !!me && !me.waiting;
      if (active && !this.active && me) Object.assign(this.body, C.createBody(me.x, me.y, me.z));
      this.active = active;
      if (joined && state.phase === C.LOBBY && me && !me.ready) room.send(C.READY, true);
    });
  }
  get now() { return Date.now() + this.offset; }
  tick(now: number) {
    if (!this.active) return;
    const b = this.body, i = this.input;
    if (now > this.turnAt) {
      this.turnAt = now + 600 + Math.random() * 1600;
      // Wander, but keep coming back to the spawn square so the bots stay together.
      const home = Math.hypot(b.x - world.spawn.x, b.z - world.spawn.z) > 60;
      i.yaw = home ? C.yawOf(world.spawn.x - b.x, world.spawn.z - b.z) : Math.random() * Math.PI * 2;
      i.forward = Math.random() < 0.85 ? 1 : 0;
      i.sprint = Math.random() < 0.4;
      if (Math.random() < 0.15) this.room.send(C.PUNCH, [i.yaw, this.now - C.INTERP_DELAY_MS]);
    }
    i.jump = Math.random() < 0.01;
    C.step(b, i, C.DT, world);
  }
  send() {
    if (!this.active) return;
    const b = this.body, m = this.move;
    m[0] = this.now; m[1] = b.x; m[2] = b.y; m[3] = b.z; m[4] = b.yaw; m[5] = b.vx; m[6] = b.vy; m[7] = b.vz; m[8] = C.animOf(b);
    this.room.send(C.MOVE, m);
  }
}

const client = new Client(url), bots: Bot[] = [];
let code = process.env.ROOM_CODE;
for (let n = 0; n < count; n++) {
  const options = { name: `Bot ${n + 1}`, character: n % 3 };
  const room = code
    ? await client.joinById<BotState>(code, options)
    : await client.create<BotState>("game", { ...options, code: (code = `BOTS-${Math.floor(Math.random() * 1e4)}`) });
  room.reconnection.enabled = false;
  bots.push(new Bot(room));
}
joined = true;
for (const b of bots) if (b.room.state.phase === C.LOBBY) b.room.send(C.READY, true);
console.log(`${count} bots in room ${code} (${url}). Join that code to play with them; Ctrl+C to stop.`);

let tick = 0;
const timers = [
  setInterval(() => { const now = Date.now(); for (const b of bots) b.tick(now); if (++tick % 2 === 0) for (const b of bots) b.send(); }, 1000 / C.TICK_HZ),
  setInterval(() => { for (const b of bots) b.room.send(C.PING, Date.now()); }, 2000),
];
for (const b of bots) b.room.send(C.PING, Date.now());

const stop = async () => {
  timers.forEach(clearInterval);
  await Promise.allSettled(bots.map(b => b.room.leave()));
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
