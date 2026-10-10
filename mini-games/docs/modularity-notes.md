# Shared modules and safe integration boundaries

## Extracted in this review

- `photo-camera.js`: `aimPhotoCamera(camera, eye, target, yaw, pitch)` owns handheld-camera positioning and rotation. It preserves field of view and encounter anchors. Tourist and scooter photos use it. Existing framing and capture exports remain compatible with the QR camera.
- `photo-dialog.js`: `handlePhotoDialogKey(event, ui, {framing, onShutter})` owns mandatory-photo keyboard routing, visible/enabled button focus wrapping, native Enter activation, and Space repeat/preview guards. Each encounter still owns activation, photo validity, completion and reset.
- `encounter-ui.js`: voice playback accepts `speaker` and `formatLine` options. Mandarin photo dialogue supplies its own speaker label; other encounters can use plain text or their own translation format without editing the playback helper.
- `encounter-ui.css`: shared subtitle typography and surface tokens. Existing encounter panels retain their layout and controls.

Checks: `node verify-photo-helpers.mjs`; full tourist and scooter browser flows against an isolated build. The helper test covers camera anchors/FOV, focus boundaries, shutter guards and pending-play/reset races.

## Next candidates when their owners are ready

1. A shared cancellable audio-session helper for recorded NPC speech. Preserve each encounter's cue timing, repeat rules, volume and speech-completion requirements; migrate one encounter at a time with its audio regression.
2. A shared dialog focus helper for optional panels such as settings and ticket purchasing. Mandatory photo apps deliberately keep their stricter keyboard contract.
3. Move encounter availability and map-marker definitions beside encounter modules, exposing small descriptors to the map. Avoid moving gameplay checks wholesale out of `main.js` while interactions are changing.

Broad changes to main input/update dispatch, ticket purchasing, inventory, weapons, global styling, or map geometry were deferred during this review because those files were recently edited by other work. A missing agent in this thread's agent list does not establish that the wider workspace is idle.

## Working alongside other agents

Read the current file before a narrow edit and check it again before writing. Keep shared export signatures compatible. Use a dedicated Vite output directory and a server on an automatically allocated port for validation; do not rebuild `dist`, replace another preview snapshot, or stop an existing server. Separate extraction from gameplay changes so encounter tests can confirm behavior is preserved.
