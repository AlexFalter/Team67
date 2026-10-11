import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import { separatePlayers } from '../apps/server/src/playerContacts.ts';
import { registerRoomPerformance } from '../apps/server/src/performance.ts';
import { ContactWorld } from '../apps/server/src/physics.ts';
import { RaceState, Player } from '../apps/server/src/state.ts';
import { TrafficManager } from '../apps/server/src/traffic.ts';

// Previous response order: the optimization must preserve crowded separation exactly.
function previousSeparation(entries: [string, C.PlayerState][], intersects: (a: string, b: string) => boolean) {
  const o = C.createContact();
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [aId, a] = entries[i], [bId, b] = entries[j];
    if (pass === 0 && !intersects(aId, bId)) continue;
    if (!C.capsuleContact(a, b, o)) continue;
    const amount = (2 * C.CAPSULE_RADIUS - o.dist) / 2;
    a.x -= o.nx * amount; a.z -= o.nz * amount;
    b.x += o.nx * amount; b.z += o.nz * amount;
  }
}

test('player separation preserves Rapier-gated crowd and chain results while skipping remote pairs', async () => {
  const physics = await ContactWorld.create();
  try {
    for (const spacing of [.15, .9, 1.3, 10]) {
      const initial: [string, C.PlayerState][] = Array.from({ length: 40 }, (_, i) => [String(i),
        Object.assign(C.createBody(), { x: (i % 8) * spacing, y: i % 3 === 0 ? .3 : 0, z: Math.floor(i / 8) * spacing })]);
      physics.sync(new Map(initial));
      const previous = initial.map(([id, p]): [string, C.PlayerState] => [id, { ...p }]);
      const optimized = initial.map(([id, p]): [string, C.PlayerState] => [id, { ...p }]);
      previousSeparation(previous, (a, b) => physics.intersects(a, b));
      let queries = 0;
      separatePlayers(optimized, (a, b) => { queries++; return physics.intersects(a, b); });
      assert.deepEqual(optimized, previous, `same separation for spacing ${spacing}`);
      assert(queries < 40 * 39 / 2, 'only nearby candidate pairs require Rapier');
      if (spacing === 10) assert.equal(queries, 0);
    }
  } finally { physics.dispose(); }
});

test('traffic checks eligibility only for touching players and preserves the rotated footprint', () => {
  const state = new RaceState(), traffic = new TrafficManager(state);
  const car = { x: 0, y: 0, z: 0, rotY: .43, speed: 12 };
  let candidates = 0, hits = 0;
  for (let i = 0; i < 40; i++) state.players.set(String(i), new Player({ x: 50 + i, z: 50 }));
  state.players.set('spectator', new Player());
  traffic.collideCar('car', car, () => hits++, () => { candidates++; return false; });
  assert.equal(candidates, 1); assert.equal(hits, 0);
  state.players.clear();
  // Check corners, sidewalks and arbitrary rotations against the exact oriented footprint.
  for (const rotY of [0, .43, Math.PI / 2, 2.6]) for (let x = -4; x <= 4; x += .25) for (let z = -4; z <= 4; z += .25) {
    state.serverTime += C.PAIR_COOLDOWN_MS + 1;
    state.players.set('p', new Player({ x, z }));
    const along = x * Math.sin(rotY) + z * Math.cos(rotY);
    const across = x * Math.cos(rotY) - z * Math.sin(rotY);
    const expected = Math.hypot(Math.max(0, Math.abs(along) - 2.2), Math.max(0, Math.abs(across) - .95)) <= C.CAPSULE_RADIUS;
    let hit = false;
    traffic.collideCar('car', { ...car, rotY }, () => { hit = true; });
    assert.equal(hit, expected, `footprint at ${x}, ${z}, rotation ${rotY}`);
  }
});

test('optional performance logs aggregate rooms and stop after disposal', async t => {
  const previousFlag = process.env.SERVER_PERF_LOG, previousInterval = process.env.SERVER_PERF_LOG_INTERVAL_MS;
  const logs: string[] = [];
  t.mock.method(console, 'log', (message: string) => logs.push(message));
  delete process.env.SERVER_PERF_LOG;
  assert.equal(registerRoomPerformance('disabled', () => 40), undefined);
  process.env.SERVER_PERF_LOG = '1'; process.env.SERVER_PERF_LOG_INTERVAL_MS = '1000';
  const a = registerRoomPerformance('a', () => 40)!, b = registerRoomPerformance('b', () => 2)!;
  try {
    assert.equal(a.tick(() => 42), 42);
    assert.throws(() => a.tick(() => { throw Error('measured exception'); }), /measured exception/);
    assert.equal(a.patch(() => true), true); b.tick(() => {});
    await new Promise(resolve => setTimeout(resolve, 1150));
    const log = JSON.parse(logs[0]);
    assert.equal(log.type, 'serverPerformance'); assert(log.cpuPercentOfOneCore >= 0);
    assert(log.rssMB > 0); assert.equal(log.rooms.length, 2);
    assert.equal(log.rooms[0].players, 40); assert.equal(log.rooms[0].tick.count, 2);
    assert.equal(log.rooms[0].patch.count, 1); assert.equal(log.rooms[1].tick.count, 1);
    a.dispose(); b.dispose();
    const count = logs.length;
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(logs.length, count, 'last room disposal stops the timer');
  } finally {
    a.dispose(); b.dispose();
    if (previousFlag === undefined) delete process.env.SERVER_PERF_LOG; else process.env.SERVER_PERF_LOG = previousFlag;
    if (previousInterval === undefined) delete process.env.SERVER_PERF_LOG_INTERVAL_MS; else process.env.SERVER_PERF_LOG_INTERVAL_MS = previousInterval;
  }
});
