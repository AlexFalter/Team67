# Blender vending cabinet

`assets/blender/build-mate-machine.py` builds a cobalt cabinet with machined edges, twelve stocked aluminum cans, shelf LEDs, flavor labels, chrome trim, a recessed payment console and open collection tray. The separate Mint can has metal rims, a recessed lid and pull tab. Run the builder through Blender MCP or Blender's Python editor; it builds an isolated scene, exports local GLBs, writes `assets/blender/mate-machine.blend` and restores the prior scene.

`mate-machine.js` owns the existing purchase/failure/cooldown/drop/collection state. `machine-panel.js` projects the DOM controls onto a rectangle of the real cabinet rather than placing a detached screen panel. `mate-machine.css` keeps the background transparent and hides purchase controls during collection. Desktop interaction frames the full cabinet. Portrait screens focus the console during payment and widen toward the tray during dispensing.

The can-only icons are regenerated with `python3 scripts/build-mate-can-icons.py`; original product assets are preserved. Inventory uses the same Mint can icon.

Verify with `GAME_URL=<preview URL> node verify-mate-machine.mjs`. This checks actual model loads, can-only packaging, embedded controls, responsive bounds and the complete payment/failure/reopening/dispensing/click-to-collect/inventory/boost/reset flow.

The stocked cans and collectible Mint can now use the existing El Tony product photos as UV-mapped label textures, including the illustrated logo and decorative bands. The Blender mesh has tapered shoulders and base, rolled silver rims, a recessed lid and an oval pull tab. Four shared label materials keep all twelve shelf cans inexpensive to render. `artifacts/mate-can-blender-render.png` is the standalone Blender preview; `artifacts/mate-machine-panel.png` verifies the labels inside the game.
