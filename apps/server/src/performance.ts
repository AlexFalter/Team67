import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { COLLISION_TICK_RATE } from '@race/shared';

const rooms = new Set<RoomPerformance>();
let timer: ReturnType<typeof setInterval> | undefined;
let delays: ReturnType<typeof monitorEventLoopDelay> | undefined;
let since = 0;
let cpu = process.cpuUsage();
const rounded = (value: number) => Math.round(value * 100) / 100;
function summary(samples: number[]) {
  if (!samples.length) return { count: 0, meanMs: 0, p95Ms: 0, maxMs: 0 };
  samples.sort((a, b) => a - b);
  return {
    count: samples.length,
    meanMs: rounded(samples.reduce((sum, value) => sum + value, 0) / samples.length),
    p95Ms: rounded(samples[Math.ceil(samples.length * .95) - 1]),
    maxMs: rounded(samples[samples.length - 1]),
  };
}

/** Optional timings only; no player state or networking behavior is changed. */
export class RoomPerformance {
  private ticks: number[] = [];
  private patches: number[] = [];
  private gaps: number[] = [];
  private lastTick?: number;
  private since = performance.now();
  constructor(private roomId: string, private players: () => number) {}
  tick<T>(run: () => T): T {
    const start = performance.now();
    if (this.lastTick !== undefined) this.gaps.push(start - this.lastTick);
    this.lastTick = start;
    try { return run(); } finally { this.ticks.push(performance.now() - start); }
  }
  patch<T>(run: () => T): T {
    const start = performance.now();
    try { return run(); } finally { this.patches.push(performance.now() - start); }
  }
  report(now: number) {
    const elapsedMs = now - this.since;
    const result = {
      roomId: this.roomId, players: this.players(),
      tickHz: rounded(this.ticks.length * 1000 / elapsedMs),
      tickOverBudget: this.ticks.filter(ms => ms > 1000 / COLLISION_TICK_RATE).length,
      tick: summary(this.ticks), tickGap: summary(this.gaps), patch: summary(this.patches),
    };
    this.ticks = []; this.patches = []; this.gaps = []; this.since = now;
    return result;
  }
  dispose() {
    rooms.delete(this);
    if (!rooms.size) {
      clearInterval(timer); timer = undefined;
      delays?.disable(); delays = undefined;
    }
  }
}

export function registerRoomPerformance(roomId: string, players: () => number): RoomPerformance | undefined {
  if (process.env.SERVER_PERF_LOG !== '1') return;
  const room = new RoomPerformance(roomId, players); rooms.add(room);
  if (!timer) {
    since = performance.now(); cpu = process.cpuUsage();
    delays = monitorEventLoopDelay({ resolution: 10 }); delays.enable();
    const requested = Number(process.env.SERVER_PERF_LOG_INTERVAL_MS ?? 5000);
    const interval = Number.isFinite(requested) ? Math.max(1000, Math.min(60000, requested)) : 5000;
    timer = setInterval(() => {
      const now = performance.now(), elapsedMs = now - since, usage = process.cpuUsage(cpu);
      console.log(JSON.stringify({
        type: 'serverPerformance', intervalMs: rounded(elapsedMs),
        cpuPercentOfOneCore: rounded((usage.user + usage.system) / elapsedMs / 10),
        rssMB: rounded(process.memoryUsage().rss / 1048576),
        eventLoopP95Ms: rounded(delays!.percentile(95) / 1e6),
        eventLoopResolutionMs: 10,
        rooms: [...rooms].map(room => room.report(now)),
      }));
      since = now; cpu = process.cpuUsage(); delays!.reset();
    }, interval);
    timer.unref();
  }
  return room;
}
