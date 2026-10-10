import { defineRoom, defineServer } from "colyseus";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GameRoom } from "./GameRoom.ts";

// Production: one process serves the built client and Colyseus on one port.
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const dist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
if (production && !existsSync(dist + "index.html")) throw new Error("Client build missing. Run npm run build first.");

const server = defineServer({
  rooms: { game: defineRoom(GameRoom) },
  express: app => { if (production) app.use(express.static(dist)); },
});
await server.listen(Number(process.env.PORT || 2567), "0.0.0.0");
