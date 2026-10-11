# ETH game: tickets

Exported feature library, with its transitive source dependencies and required runtime assets. This is a module for a host game, not a standalone playable game.

## Build

Run `npm install` and `npm run build`. Import factories/helpers from `./index.js` using Vite or another ESM bundler. Serve `public/` at the host site's root. CSS imports are bundled by Vite.

## Integration

Start with the [code map](src/README.md) for ownership and extension steps.

Factories retain the original signatures: the host supplies the Three.js scene/camera, world/solver and callbacks as required. Call the returned update/reset/input methods from the host loop. Browser UI factories require a DOM. See the entry modules for APIs. Some UI still uses legacy `style.css`, included when required; it contains shared game selectors and should be scoped when integrating into another application.

`feature-manifest.json` lists exactly which code, assets and npm dependencies were included. Shared dependencies stay in their own folders; no map, other encounters or unrelated recordings are copied unless the feature uses them.

## Sharing

This folder can be its own GitHub repository. No repository, commit or upload has been created automatically. Runtime asset credits are preserved where present. This exporter does not grant new licenses to code, models, recordings or branding; choose the code license and check the included credits before making the repository public. Original source is maintained in the parent game's module folders.
