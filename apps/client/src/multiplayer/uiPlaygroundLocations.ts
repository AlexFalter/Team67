import { bagHomes, FRUIT_STAND, MATE_POSITION, NPC_LAYOUT, TICKET_POSITION, examDebugPosition, raceSpawnPoint, zurichWorld } from '@race/shared';

import placements from '../npcPrototype/placements.json';

const at = (point: readonly number[]) => ({ x: point[0], z: point[2] });
export interface UiPlaygroundLocation { id: string; label: string; x: number; z: number; facing?: number; offset?: number; vehicle?: string }

/** Shortcuts use the same authored positions as the live game. */
export const UI_PLAYGROUND_LOCATIONS: readonly UiPlaygroundLocation[] = [
  { id: 'spawn', label: 'Bus drop-off', ...raceSpawnPoint(zurichWorld) },
  { id: 'mate', label: 'Mate machine', x: MATE_POSITION.x, z: MATE_POSITION.z - 2, facing: Math.PI },
  { id: 'ticket', label: 'Polybahn tickets', x: TICKET_POSITION.x - 2, z: TICKET_POSITION.z, facing: -Math.PI / 2 },
  { id: 'bikes', label: 'PubliBikes', ...at(NPC_LAYOUT.publiBike.position), vehicle: 'publibike-4' },
  { id: 'lime', label: 'Lime scooter', x: NPC_LAYOUT.lime.positions[0][0], z: NPC_LAYOUT.lime.positions[0][1], vehicle: 'lime-1' },
  { id: 'fruit', label: 'Tomato stand', ...at(FRUIT_STAND.position), offset: 2 },
  { id: 'finance', label: 'Finance quiz', ...at(NPC_LAYOUT.finance.access) },
  { id: 'einstein', label: 'Einstein', ...at(NPC_LAYOUT.einstein.approach) },
  { id: 'interview', label: 'Interview laptop', ...at(NPC_LAYOUT.interview.laptop), offset: 2 },
  { id: 'football', label: 'Football challenge', ...at(NPC_LAYOUT.football.position), offset: 2 },
  { id: 'tourists', label: 'Polybahn tourists / photos', x: placements.tourists.viewpoint[0], z: placements.tourists.viewpoint[1] },
  { id: 'cat', label: 'Cat', ...at(NPC_LAYOUT.cat.position), offset: 2 },
  { id: 'cyclist', label: 'Singing cyclist', ...at(NPC_LAYOUT.singingCyclist.center), offset: 2 },
  { id: 'tiki', label: 'Tiki performer', ...at(NPC_LAYOUT.tikiPerformer.position), offset: 2 },
  { id: 'michael', label: 'Michael / emotes', x: NPC_LAYOUT.michaelJackson.anchor[0], z: NPC_LAYOUT.michaelJackson.anchor[1], offset: 3 },
  { id: 'bags', label: 'Ersti bags', ...bagHomes(zurichWorld)[0] },
  { id: 'tram', label: 'Tram', x: 0, z: 0, vehicle: 'tram-1' },
  { id: 'polybahn', label: 'Polybahn', x: 0, z: 0, vehicle: 'polybahn-1' },
  { id: 'exam', label: 'Final exam entrance', ...examDebugPosition },
];
