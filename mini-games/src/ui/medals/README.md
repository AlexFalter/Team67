# Achievement medals

`createMedals()` owns the top-center medal display, original BO3 medal textures, original Black Ops 3 medal-earned recording and a per-run award queue. It has no map dependencies. `createMedalState()` can be used without a browser.

A thrown Ersti-bag hitting an eligible NPC awards **Bagged**, with BO3 Bankshot artwork. Missing, hitting a wall, or picking up a bag earns nothing; successful hits merge into the same 2x/3x counter while the medal is pending or displayed. Each throw/person pair has a stable event key.

The host awards Revenge + Frankfurt Delivery after the real karambit collection callback, and Bloodthirsty + Public Menace + Bike Lane Justice after a successful PubliBike NPC knockdown. The newest medal turns into the center with an orange flash; previous distinct medals shrink to the right. Duplicate pending/current awards merge into 2x/3x counters without another entry animation or chime. The names are a playful adaptation: one run-over earns Bloodthirsty here. Use stable NPC event keys to award once per NPC per run; reset clears the queue, earned medals and deduplication. Existing comic knockdown/recovery remains intact.

```js
const medals = createMedals();
medals.award('revenge');
medals.awardMany(['bloodthirsty', 'publicMenace', 'bikeLaneJustice'], npcId);
medals.update(dt, {paused: settingsOpen, visible: !phoneOpen});
// On a fresh run:
medals.reset();
// On host teardown:
medals.destroy();
```

Import `index.js` to include scoped CSS. Supply a definitions object (`id: {title, detail, icon}`; `icon` is `knife`, `skull`, `wheel` or `bag`) to add achievements, and trigger them from feature callbacks. Hidden/paused displays retain pending awards. `setSoundEnabled(false)` mutes medal audio; this host has a separate Medal sounds setting. Audio unlocks on pointer/key input and awaits decoding and context resume before playback. `state().sound` exposes playback count and failures. `audioUrl` can replace the default recording; include that recording in the host's asset/export declarations. `sound` can inject another sound adapter with `play`, `stop`, and `destroy`.

The motion/layout was reconstructed from frames of [this Black Ops 3 gameplay clip](https://medal.tv/games/cod-black-ops-3/clips/1JfLd1czlr5kUe): Kingslayer starts turning in at roughly 1.8 seconds, Caught arrives roughly 0.3 seconds later, the previous medal shrinks to the right, and the badges flash out roughly 2.4 seconds after their arrivals. The renderer uses a 0.24-second turn-in, orange flare, a 0.38-second interval for pending different medals, and a 2.4-second lifetime. These timings are approximations measured from the clip; the code is a reconstruction rather than the original game's animation assets. Built-in awards use original BO3 artwork from a community-converted texture pack; humorous titles reuse related BO3 icons. See `public/assets/medals/CREDITS.md`. Custom definitions retain the vector fallback. Medal audio plays at 0.45 gain, 6 dB below the previous 0.9 gain. The sound is the original `medal_earned.LN100.pc.snd.flac` from the Black Ops III multiplayer beta extraction, converted to MP3 without pitch or timing changes; see `public/audio/CREDITS.md`. The downloaded reference and review frames are local test evidence under ignored `artifacts/`, not runtime assets.

Run `npm run test:medals` for queue and collision checks. With Vite running on port 5197 (or `GAME_URL` set to its URL), `npm run test:medals:audio` verifies recording decode, measured audio output, replay and stop. `GAME_URL=... node verify-medals-browser.mjs` checks real knife collection, an actual mounted-bike run-over, desktop/mobile rendering and reset.
