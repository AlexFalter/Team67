import type { Client } from 'colyseus';
import * as C from '@race/shared';
import type { RaceState } from './state.ts';

export class TicketMachine {
  constructor(private state: RaceState, private world: C.MovementWorld) {}
  command(client: Client, data: unknown, now = Date.now()) {
    const cmd = data as Partial<C.TicketCommand> | null;
    if (!cmd || !['pay','collect'].includes(cmd.action ?? '')) return;
    const reply = (ok: boolean, message = '') => client.send('ticketResult', {
      action: cmd.action!, roundStartedAt: this.state.startedAt, ok, message,
    } satisfies C.TicketResult);
    const id = client.sessionId, p = this.state.players.get(id), member = this.state.members.get(id), npc = this.state.npcs.get(id);
    if (!p || !npc || !member || member.spectator || this.world.name !== 'zurich' ||
      this.state.phase !== C.RoomPhase.Running || !this.state.introComplete || now < this.state.startedAt || now >= this.state.endsAt || cmd.roundStartedAt !== this.state.startedAt)
      return reply(false, 'Wait for the current round.');
    if (npc.kind || p.vehicleId || p.knockdownUntil > now || !C.nearTicket(p,this.world)) return reply(false, 'Move to the front of the ticket machine.');
    if (npc.ticketCount) return reply(false, 'You already have a ticket.');
    if (cmd.action === 'pay') {
      if (!Array.isArray(cmd.tiles) || cmd.tiles.length !== 3 || ![0,4,8].every(i => cmd.tiles!.includes(i))) return reply(false, 'Select all three trams.');
      // Reopening a paid machine never resets the printing deadline.
      if (!npc.ticketReadyAt) npc.ticketReadyAt = now + C.TICKET_PRINT_MS;
      return reply(true);
    }
    if (!npc.ticketReadyAt || now < npc.ticketReadyAt) return reply(false, 'Your ticket is still printing.');
    npc.ticketCount = 1; npc.ticketReadyAt = 0; reply(true);
  }
}
