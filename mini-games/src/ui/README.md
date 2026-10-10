# UI

`phone/` owns handset presentation, app navigation and messages. `hud/` owns the general HUD and test settings. Quiz rules live in `../games/quizzes/`; scanning/capture helpers live in `../shared/phone-camera/`. Feature-specific machine and NPC interfaces stay beside their owning feature.

Import from `index.js`, or the phone/HUD entry when only one is needed. Keep presentation separate from rewards, vehicle motion and quest decisions, using the existing callbacks. See [the code map](../README.md).

Achievement pop-ups live in [medals](medals/README.md). Award them from host callbacks; keep map placement and NPC behavior in their own modules.
