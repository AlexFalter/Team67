Single-can crops of the existing El Tony Mate product images. Basic/Light exclude the bottle; Mint/Ginger crop the foreground can. Source images remain unchanged. Rebuild inside `mini-games/` with `python3 scripts/build-mate-can-icons.py`, then copy the output here.

Used by the physical vending controls and Mate inventory. The stocked products and dispensed prize are actual aluminum-can Blender geometry in models/mate-machine.glb and the flavor-specific models/mate-can-{basic,light,mint,ginger}.glb, not product-image billboards.

Rebuild the Basic, Light and Ginger prize models with `python3 scripts/build-mate-can-flavors.py` from the workspace root. They reuse the authored Mint can geometry and replace only its photographic label with the matching existing flavor image. The client selects the prize model from the server-confirmed flavor and uses the same flavor for the inventory icon.
