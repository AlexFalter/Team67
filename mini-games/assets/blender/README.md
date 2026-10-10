# PubliBike

Original stylized bicycle authored with Blender MCP for this game. `publibike.blend` is the editable source; `build-publibike.py` reproducibly builds and exports `public/models/publibike.glb` through Blender's Python API. The script replaces only the collection named PubliBike.

Game axes: X lateral, Y up, negative Z forward. Wheel centers remain at Y=0.62, Z=±1; FrontWheel and RearWheel are independent pivots about X. The runtime clones shared geometry/materials for parked and ridden bikes. The asset is approximately 468 KiB, 14,400 triangles and 14 material draw calls per bike.

Details include the low-entry frame, alloy rims and 24 spokes per wheel, disc rotors, mudguards, crank/pedals, chain cover, battery housing, brake cables, carrier, rear rack, kickstand, lights and side lettering. This is a stylized interpretation, not a measured manufacturer replica. No external models or textures were used.

Preview: `artifacts/publibike-model.png`.

## Polybahn, tram and ETH eLink

`transit.blend` contains the editable transit collection. `build-transit.py` rebuilds only its own ZurichTransit collection and exports polybahn.glb, tram.glb and eth-link.glb. The rail models fit the existing in-game carriage lengths and pivots. Models are original geometry with modeled lettering, using no downloaded textures.

The Polybahn has a hollow cabin, transparent windows, benches and grab poles for the passenger view. The tram keeps the existing three-section movement and runtime destination sign. ETH eLink is a new parked articulated shuttle placed on a clear road segment near ETH; it has no boarding or Hönggerberg route, which lies outside the map.

Appearance references: https://www.polybahn.ch/en/ and ETH's official shuttle photograph on https://ethz.ch/staffnet/en/service/mobility/link.html. These are stylized interpretations, not measured replicas. ETH branding is modeled text and angular red graphics; no reference photograph is shipped as a texture.

## Animated Polybahn

`polybahn-animation.blend` and `build-polybahn.py` supersede the static Polybahn in the general transit source. Run this builder after build-transit.py. Four independent sliding door leaves and two wheel axles are exported as named glTF nodes. The shell has an actual doorway aperture. Runtime door/wheel motion follows these nodes; the route, grade and camera are driven by polybahn-motion.js. The ticket checker uses the existing native student rig with uniform, cap, badge, mouth motion and a fare clipboard.
