# Knife-only first-person sliding

`canKnifeSlide()` in main.js centralizes the slide requirement: eligible first-person walking, no modal/gameplay restriction, an equipped owned karambit, and no bag occupying the hands. The keyboard start, ongoing movement and first-person legs use this requirement. Holstering via 3 cancels immediately; other equipment changes cancel on the next player update. Existing grounded/sprint-speed/cooldown rules remain in player-slide.js.

Validation: isolated production build; `GAME_URL=<preview> node verify-knife-slide-requirement.mjs` checks empty hands, owned but holstered knife, third-person rejection, equipped success, immediate holster cancellation and camera recovery. `node verify-slide-look.mjs` checks independent look direction, leg anchors and reset.
