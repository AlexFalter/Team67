// An isolated server process with real headless Colyseus clients; no existing lobby is used.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { Room } from '@colyseus/sdk';
import type { Socket } from 'node:net';
import * as C from '../packages/shared/src/index.ts';
import { reportClient } from '../tests/reportClient.ts';
import type { WireState } from '../tests/fixture.ts';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, description: string, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw Error(`Timed out: ${description}`); await delay(25); }
}

interface Timing { calls: number; meanMs: number; p95Ms: number; maxMs: number }
interface Report {
  wallMs: number; cpuPercentOfOneCore: number; rssMB: number;
  egressMbps: number; payloadMbps: number; compressedClients: number; bufferedBytes: number;
  framesPerSec: number; correctionsPerSec: number; payloadMbpsByType: Record<string, number>;
  eventLoopP95Ms: number; tickHz: number; metrics: Record<string, Timing>;
}
const round = (n: number) => Math.round(n * 1000) / 1000;

async function worker() {
  const { Race } = await import('../apps/server/src/race.ts');
  const { ContactWorld } = await import('../apps/server/src/physics.ts');
  const { TrafficManager } = await import('../apps/server/src/traffic.ts');
  const { defineServer, defineRoom } = await import('colyseus');
  const { createRaceTransport } = await import('../apps/server/src/transport.ts');
  const { WebSocketClient } = await import('@colyseus/ws-transport');
  const { Encoder } = await import('@colyseus/schema');
  const { Protocol } = await import('@colyseus/core');
  const connections = new Set<InstanceType<typeof WebSocketClient>>();
  const written = () => [...connections].reduce((sum, client) => sum +
    ((client.ref as unknown as { _socket?: Socket })._socket?.bytesWritten ?? 0), 0);
  let writtenStart = 0;
  const rooms: InstanceType<typeof Race>[] = [];
  const create = Race.prototype.onCreate;
  Race.prototype.onCreate = async function (...args) { await create.apply(this, args); rooms.push(this); };
  let metrics: Record<string, number[]> = {}, bytes = 0, frames = 0, corrections = 0;
  let bytesByType: Record<string, number> = {}, sendingType: string | undefined;
  let start = performance.now(), cpu = process.cpuUsage();
  const delays = monitorEventLoopDelay({ resolution: 10 }); delays.enable();
  for (const [prototype, names] of [
    [Race.prototype, ['tick', 'broadcastPatch']],
    [ContactWorld.prototype, ['sync']], [TrafficManager.prototype, ['tick']],
  ] as const) {
    const target = prototype as unknown as Record<string, (...args: any[]) => any>;
    for (const name of names) {
      const original = target[name], label = `${prototype.constructor.name}.${name}`;
      target[name] = function (...args) {
        const begin = performance.now();
        try { return original.apply(this, args); }
        finally { (metrics[label] ??= []).push(performance.now() - begin); }
      };
    }
  }
  const raw = WebSocketClient.prototype.raw;
  WebSocketClient.prototype.raw = function (data, ...args) {
    const code = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)[0];
    const category = code === Protocol.ROOM_STATE_PATCH ? 'statePatches' :
      code === Protocol.ROOM_STATE ? 'initialState' : sendingType ?? 'other';
    bytesByType[category] = (bytesByType[category] ?? 0) + data.byteLength;
    connections.add(this); bytes += data.byteLength; frames++; return raw.call(this, data, ...args);
  };
  const send = WebSocketClient.prototype.send;
  WebSocketClient.prototype.send = function (type: any, ...args: any[]) {
    if (type === 'playerCorrection') corrections++;
    sendingType = String(type);
    try { return (send as (...args: any[]) => void).call(this, type, ...args); }
    finally { sendingType = undefined; }
  };
  process.on('message', message => {
    if (message === 'spread') {
      const world = process.env.GAME_WORLD === 'flat' ? C.flatWorld : C.zurichWorld;
      const points: { x: number; y: number; z: number }[] = [];
      const bounds = world.name === 'flat' ? { minX: -25, maxX: 25, minZ: -25, maxZ: 25 } : { minX: -310, maxX: -130, minZ: -40, maxZ: 120 };
      for (let x = bounds.minX; x < bounds.maxX; x += 5) for (let z = bounds.minZ; z < bounds.maxZ; z += 5) {
        const y = world.height(x, z);
        if (y !== undefined && !world.blocked(x, y, z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT)) points.push({ x, y, z });
      }
      for (const room of rooms) {
        // Test-only access to authoritative correction helpers.
        const internals = room as unknown as { lastMoves: Map<string, number>; correction: (p: C.PlayerState) => C.PlayerCorrection };
        let index = 0;
        for (const [id, p] of room.state.players) {
          Object.assign(p, points[index++], { vx: 0, vy: 0, vz: 0, grounded: true, anim: 0, simTime: Date.now() });
          internals.lastMoves.set(id, Date.now());
          room.clients.find(client => client.sessionId === id)?.send('playerCorrection', internals.correction(p));
        }
      }
      return;
    }
    if (message !== 'report' && message !== 'reset') return;
    const wallMs = performance.now() - start, usage = process.cpuUsage(cpu);
    const summary: Record<string, Timing> = {};
    for (const [name, values] of Object.entries(metrics)) {
      values.sort((a, b) => a - b);
      summary[name] = { calls: values.length, meanMs: round(values.reduce((a, b) => a + b, 0) / values.length),
        p95Ms: round(values[Math.ceil(values.length * .95) - 1]), maxMs: round(values.at(-1)!) };
    }
    if (message === 'report') process.send!({
      wallMs: round(wallMs), cpuPercentOfOneCore: round((usage.user + usage.system) / wallMs / 10),
      rssMB: round(process.memoryUsage().rss / 1048576),
      egressMbps: round((written() - writtenStart) * 8 / wallMs / 1000), payloadMbps: round(bytes * 8 / wallMs / 1000),
      compressedClients: [...connections].filter(client => client.ref.extensions.includes('permessage-deflate')).length,
      bufferedBytes: [...connections].reduce((sum, client) => sum + client.ref.bufferedAmount, 0),
      payloadMbpsByType: Object.fromEntries(Object.entries(bytesByType).map(([key, value]) => [key, round(value * 8 / wallMs / 1000)])),
      framesPerSec: round(frames * 1000 / wallMs),
      correctionsPerSec: round(corrections * 1000 / wallMs), eventLoopP95Ms: round(delays.percentile(95) / 1e6),
      tickHz: round((summary['Race.tick']?.calls ?? 0) * 1000 / wallMs), metrics: summary,
    } satisfies Report);
    metrics = {}; bytesByType = {}; bytes = frames = corrections = 0; writtenStart = written(); start = performance.now(); cpu = process.cpuUsage(); delays.reset();
  });
  Encoder.BUFFER_SIZE = 64 * 1024;
  const server = defineServer({ transport: createRaceTransport(), rooms: { race: defineRoom(Race) } });
  await server.listen(Number(process.argv[3]), '127.0.0.1'); process.send!('ready');
}

function report(child: ChildProcess) {
  return new Promise<Report>((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(Error('Load-test server report timed out')); }, 15000);
    const receive = (message: unknown) => {
      if (typeof message === 'object' && message !== null) { cleanup(); resolve(message as Report); }
    };
    const cleanup = () => { clearTimeout(timeout); child.off('message', receive); };
    child.on('message', receive); child.send('report');
  });
}

async function benchmark() {
  // Node's built-in WebSocket may not negotiate compression. Use ws to exercise it explicitly.
  const { default: WebSocket } = await import('ws');
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  const { Client } = await import('@colyseus/sdk');
  const option = (name: string, fallback: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
  const counts = option('players', '20,40').split(',').map(Number), seconds = Number(option('seconds', '8'));
  const world = option('world', 'zurich');
  if (counts.some(n => !Number.isInteger(n) || n < 1 || n > 40) || !Number.isFinite(seconds) || seconds < 1 || seconds > 60 || !['flat', 'zurich'].includes(world))
    throw Error('Use --players=20,40 (1–40 per room), --seconds=8 (1–60) and --world=zurich or flat.');
  for (const count of counts) {
    const socket = createServer();
    await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>(resolve => socket.close(() => resolve()));
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--worker', String(port)], {
      env: { ...process.env, GAME_WORLD: world, SERVER_PERF_LOG: '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let ready = false, logs = '';
    child.on('message', message => { if (message === 'ready') ready = true; });
    child.stdout!.on('data', data => { logs = (logs + data).slice(-8000); });
    child.stderr!.on('data', data => { logs = (logs + data).slice(-8000); });
    const rooms: Room<any, WireState>[] = [], bodies: ReturnType<typeof reportClient>[] = [];
    try {
      await until(() => ready || child.exitCode !== null, 'load-test server startup', 20000);
      if (!ready) throw Error(logs);
      const client = new Client(`ws://127.0.0.1:${port}`);
      const host = await client.create<WireState>('race', { name: 'Load 0', devMode: true, skipIntro: true, moodleEnabled: false }); rooms.push(host);
      for (let i = 1; i < count; i++) rooms.push(await client.joinById<WireState>(host.roomId, { name: `Load ${i}` }));
      for (const room of rooms) { room.onMessage('*', () => {}); room.reconnection.enabled = false; }
      host.send('ready', true);
      await until(() => rooms.every(room => room.state.introComplete && room.state.players.size === count), 'load-test round ready', 20000);
      const sample = async (scenario: string) => {
        await delay(2000); child.send('reset'); await delay(seconds * 1000);
        if (!rooms.every(room => room.connection.isOpen && room.state.players.size === count) ||
          bodies.some(({ body }) => !Number.isFinite(body.x + body.y + body.z + body.simTime)))
          throw Error('Load-test clients disconnected or received invalid movement state');
        console.log(JSON.stringify({ players: count, scenario, world, ...await report(child) }));
      };
      await sample('idle');
      for (const room of rooms) {
        const body = reportClient(room, world === 'flat' ? C.flatWorld : C.zurichWorld);
        body.input.z = 1; body.input.sprint = true; bodies.push(body);
      }
      await sample('crowded moving'); child.send('spread'); await sample('spread moving');
    } catch (error) { throw Error(`${String(error)}\n${logs}`); }
    finally { bodies.forEach(body => body.stop()); await Promise.allSettled(rooms.map(room => room.leave())); child.kill(); }
  }
}

if (process.argv[2] === '--worker') await worker(); else await benchmark();
