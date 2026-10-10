# World

`core/` loads the real map and owns collision, navigation, terrain access and atmosphere. `map/` owns the route-map controls and encounter markers. `water/` owns the river surface and splash rendering.

Import from `index.js`, or a subfolder entry when only one part is needed. Pass the world/solver to vehicles and interactions; map loading does not start encounters or own player input. See [the code map](../README.md) for extension steps.
