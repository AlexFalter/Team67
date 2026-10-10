# NPCs

Import NPC encounters from `src/npcs/index.js`. This is the central roster for Einstein, the scooter trio, the Polybahn kid, the food enthusiast, the ticket inspector, the finance guy, tourists, the private-property encounter, and the interview driver/butler. Character-specific implementations now live here in `einstein/`, `scooter/`, `polybahn/`, `finance/`, `private-property/` and `interview/`, with shared NPC UI in `shared/`. Tourist photo behavior belongs to `../interactions/photos/`. Voice timing stays with the character encounter.

Reusable NPC UI lives in `shared/`:

- `rpg-dialogue.js` builds conversations and owns keyboard/focus handling; `styleRPGDialogue` adapts existing encounter panels.
- `rpg-dialogue.css` owns the shared RPG skin and its compact variant.
- `conversation-camera.js` frames a character from their accessible approach side and restores the previous camera on exit.

Einstein uses the compact variant with one short line at a time, bottom-screen choices, optional destination details, and a front-facing view. Teleport limits and GTA travel remain in the Einstein feature. Existing shared/dialogue import paths forward to the NPC dialogue helper for compatibility; edit the NPC helper rather than the forwarding files. General subtitle/audio typography remains in `src/shared/dialogue/encounter-ui.*`.

`michael-jackson/` contains a Blender-authored dancer with a perpetual moonwalk and a short distance-faded “hee-hee” recording. Its validated loop comes from the host's feature placement; editable Blender source stays under `assets/blender/`.

- `tiki-performer/`: Blender hoodie dancer, rolling LED party speaker, short distance-faded Tiki Tiki audio.
