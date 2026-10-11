import { capsuleContact, CAPSULE_RADIUS, createContact, type PlayerState } from '@race/shared';

/** Preserve the four ordered separation passes, avoiding Rapier calls for distant players. */
export function separatePlayers(entries: readonly (readonly [string, PlayerState])[], intersects: (a: string, b: string) => boolean) {
  const contact = createContact();
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [aId, a] = entries[i], [bId, b] = entries[j];
    if (!capsuleContact(a, b, contact) || (pass === 0 && !intersects(aId, bId))) continue;
    const amount = (2 * CAPSULE_RADIUS - contact.dist) / 2;
    a.x -= contact.nx * amount; a.z -= contact.nz * amount;
    b.x += contact.nx * amount; b.z += contact.nz * amount;
  }
}
