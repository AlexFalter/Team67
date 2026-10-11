import { WebSocketTransport } from 'colyseus';

export function createRaceTransport() {
  return new WebSocketTransport({
    maxPayload: 256 * 1024,
    // Reuse each connection's dictionary: successive movement patches share most bytes.
    perMessageDeflate: process.env.SERVER_WS_COMPRESSION === '0' ? false : {
      threshold: 512,
      serverNoContextTakeover: process.env.SERVER_WS_CONTEXT_TAKEOVER === '0',
      clientNoContextTakeover: true,
      concurrencyLimit: 4,
      zlibDeflateOptions: { level: 1, memLevel: 4 },
    },
  });
}
