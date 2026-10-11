import { defineServer, defineRoom, WebSocketTransport } from "colyseus";
import { Encoder } from "@colyseus/schema";
import express from "express";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Race } from "./race.ts";
const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";
const dist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
if (production && !existsSync(dist + "index.html"))
  throw new Error("Client build missing. Run npm run build first.");
// Traffic authoring sends bounded JSON networks larger than the default 4 KB message limit.
Encoder.BUFFER_SIZE = 64 * 1024;
const server = defineServer({
  transport: new WebSocketTransport({ maxPayload: 256 * 1024 }),
  rooms: { race: defineRoom(Race) },
  express: (app) => {
    if (production) app.use(express.static(dist));
  },
});
await server.listen(Number(process.env.PORT || 2567), "0.0.0.0");
