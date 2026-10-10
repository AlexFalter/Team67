import type { Room } from "@colyseus/sdk";

export interface LagOptions { lag: number; jitter: number; loss: number }

/** `?lag=150&jitter=30&loss=2`: one-way delay (ms, each direction), random extra delay, % of stalls. */
export function lagFromUrl(search = location.search): LagOptions | undefined {
  const q = new URLSearchParams(search), lag = Number(q.get("lag") ?? 0), jitter = Number(q.get("jitter") ?? 0), loss = Number(q.get("loss") ?? 0);
  return lag > 0 || jitter > 0 || loss > 0 ? { lag, jitter, loss } : undefined;
}

/**
 * Client-side network conditions for testing smoothness. WebSockets are ordered and reliable, so a
 * "lost" packet is modelled as a retransmit stall that also holds back everything behind it.
 */
export function simulateLag(room: Room, o: LagOptions) {
  const connection = room.connection, events = connection.events;
  const delay = () => o.lag + Math.random() * o.jitter + (Math.random() * 100 < o.loss ? 2 * o.lag + 200 : 0);
  const queue = () => {
    let last = 0;
    return (run: () => void) => {
      last = Math.max(last, performance.now() + delay()); // keep order, like TCP
      setTimeout(run, last - performance.now());
    };
  };
  const outgoing = queue(), incoming = queue();
  const send = connection.send.bind(connection);
  connection.send = (data: Uint8Array) => {
    const copy = data.slice(); // the SDK reuses its send buffer
    outgoing(() => { if (connection.isOpen) send(copy); });
  };
  const onmessage = events.onmessage;
  events.onmessage = (event: MessageEvent) => incoming(() => onmessage?.(event));
}
