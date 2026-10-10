import { schema, t, type SchemaType } from "@colyseus/schema";

// One input = one fixed simulation step. Never send authoritative positions.
export const MoveInput = schema({
  x: t.float32().default(0),
  z: t.float32().default(0),
  sprint: t.boolean().default(false),
  jump: t.boolean().default(false),
  toggleShoes: t.boolean().default(false),
  hit: t.boolean().default(false),
  banana: t.boolean().default(false),
  throwBanana: t.boolean().default(false),
  aim: t.boolean().default(false),
  facing: t.float32().default(0),
});
export type MoveInput = SchemaType<typeof MoveInput>;
export const IDLE_INPUT = { x: 0, z: 0, sprint: false, jump: false };
