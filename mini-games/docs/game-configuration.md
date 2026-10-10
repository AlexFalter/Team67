# Configure the game

Edit **`game.config.json`** at the project root. It is the single gameplay tuning file; save and reload the game to apply changes. Restart the run after changing timings. Vite reloads imported configuration during development; production changes need `npm run build`.

The sections are:

| Section | Controls |
| --- | --- |
| `mission` | Lecture deadline, score per remaining second, derailment penalty |
| `player` | Walking/sprinting/jumping, mouse sensitivity, arrow look speed, slide duration/speed/friction/cooldown/camera drop |
| `moodle` | Question bank, random interval, answer deadline, sitting penalty, reward, final-seconds warning |
| `mate` | Boost duration/multiplier, loading time, alternating retry times |
| `vehicles` | Bike/scooter speeds, bike failure percentage and battery life |
| `npcs` | Interaction distances, audio levels/fade distances, scooter greeting/gift/horns/handover, kid question/options/replies, eater options/subtitles, inspector lines/fine/speech, private-property timing, Einstein and limo interaction ranges |
| `scanning` | Ticket and bike hold/settle durations, bike stutter and alignment tolerance |
| `camera` | World/phone FOV, framing tolerance, preview resolution, relative sensitivity/smoothing, randomized QR offset |
| `visuals` | Sky/lighting colors and intensities, render pixel ratio, shadows and shadow resolution |
| `settingsDefaults` | Initial settings for a browser with no saved preferences |

Times use seconds, distances use game-world metres, speeds use metres/second, camera offsets use radians, FOV uses degrees, audio volume is 0–1. `speedMultiplier: 1.35` means +35%. A pair such as `intervalSeconds: [25,55]` gives the minimum/maximum; Mate retry times alternate between the entries. `vehicles.bikeFailurePercent` (default 50) sets an independent failure chance from 0 to 100 for each bike. Bikes roll once at the start of each run and keep their results until restart; gold highlights follow the sampled working bikes. Percentages give average rates, so a run may have any number of working bikes, including none. Set 0 for always working or 100 for always failing. Mate always has exactly one working flavor, randomly chosen from the four at the start of each run. Failed mate buttons cannot be retried in that run.

For example, set `mission.deadlineSeconds` to `180` for a three-minute run; set `moodle.sitOutSeconds` to `5` for a shorter failure penalty. UI countdowns, reward messages, boost labels, fine amounts, and settings descriptions follow their configured values.

Question entries need `course`, `question`, `options`, `correct`, and `explanation`. `correct` is a **zero-based index**: `1` selects the second option. Add/remove questions freely. Kid/eater option counts remain three/four because their choices map to existing actions; `kid.triggerChoice` selects which kid option triggers the recording. Inspector speech uses the configured lines; `{fineCHF}` inserts the configured fine. Changing subtitles for recorded dialogue does **not** change the recording itself. Audio files and synchronized cue edits remain under `public/audio` and `assets/audio`.

Settings saved in this browser take precedence over `settingsDefaults`. To test fresh defaults, clear the browser's `eth-game-test-settings` local-storage entry or use a fresh browser profile. Editing the file does not overwrite a player's saved preferences.

`src/config/game-config.js` validates configuration at startup and exposes a deeply frozen `gameConfig`. Invalid fields report their path in `game.config.json`. New features should import it through a relative path and keep gameplay state separate from configuration. Don't copy its values into new magic numbers or static UI labels. Feature exports automatically include this file and its config/validator dependencies.

This config changes gameplay tuning and selected dialogue, not model meshes or map geometry. Vehicle seat layouts remain in `src/vehicles/passengers/vehicle-seats.js`; Zurich data, placements and routes remain in `public/gameplay` and map assets; recorded dialogue cue files retain their timing. Editing those structural assets is separate from balancing the game.

Validate edits with `npm run config:check`. `npm run test:config` also checks invalid values and runs a browser test with deliberately different configuration to verify the values affect gameplay.
