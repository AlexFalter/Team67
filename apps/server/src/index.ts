import { defineServer, defineRoom } from "colyseus";
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
const server = defineServer({
  rooms: { race: defineRoom(Race) },
  express: (app) => {
    if (production) app.use(express.static(dist));
  },
});
await server.listen(Number(process.env.PORT || 2567), "0.0.0.0");
