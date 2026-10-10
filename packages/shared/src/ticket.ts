import type { GroundPoint, MovementWorld } from './world.ts';

// Clear floor beside Central's current, authored Polybahn platform.
export const TICKET_POSITION = { x: 8.5, z: 114 };
export const TICKET_PRINT_MS = 1800;
export interface TicketCommand { action: 'pay' | 'collect'; roundStartedAt: number; tiles?: number[] }
export interface TicketResult { action: TicketCommand['action']; roundStartedAt: number; ok: boolean; message: string }
export function ticketSite(world: MovementWorld): GroundPoint {
  return { ...TICKET_POSITION, y: world.height(TICKET_POSITION.x, TICKET_POSITION.z) ?? world.spawn.y };
}
export function nearTicket(p: GroundPoint, world: MovementWorld) {
  const site = ticketSite(world);
  return Math.abs(p.y - site.y) < .65 && p.z <= site.z - .5 && Math.hypot(p.x-site.x,p.z-site.z) <= 2.8;
}
export function ticketBlocked(x: number, y: number, z: number, radius: number, height: number, ground: number) {
  return y < ground+2.05 && y+height > ground && Math.abs(x-TICKET_POSITION.x) < .44+radius && Math.abs(z-TICKET_POSITION.z) < .39+radius;
}
