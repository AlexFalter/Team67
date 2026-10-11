The intro bus uses `public/models/battle-bus.glb`. Its livery follows the ETH
Link's white body, dark window band and angular wrap, using the original red
instead of the reference bus's blue. Both sides carry a 240 × 40 pixel version
of the existing ETH Zürich SVG wordmark, built from flat mesh strips without
adding a texture download.

To rebuild the livery, run from the repository root:

```sh
blender -b --python apps/client/assets-src/eth-link/update_livery.py
```

The script edits the existing model, replaces its generated livery meshes and
preserves the bus's placement and dimensions. The client still adds the hollow
cabin, seats and animated entry doors in `src/multiplayer/battleBusModel.ts`.
