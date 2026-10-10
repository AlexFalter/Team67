# Camera collision performance

## Problem and measurements

Third-person camera obstruction checks previously raycast against the complete
Zurich map every frame, then select the closest hit. The map contains 199,561
triangles across two large meshes. Browser CPU profiles attributed approximately
88-89% of sampled third-person time to ray intersection work.

Before this change, a fixed-position browser comparison measured:

| Metric, pixel density 1 | Development | Local production |
| --- | ---: | ---: |
| Third-person FPS | 25.5 | 31.4 |
| Camera raycast per frame | 35.4 ms | 24.3 ms |
| FPS with camera raycasting temporarily bypassed | 60 | 60 |

These tests used hardware-accelerated headless Chrome 154 on Intel Iris Xe,
a 1280 x 900 viewport, a 1280 x 784 game drawing buffer, one stationary player,
and position (-273, 7.53, -106), yaw 0, pitch 0. Each condition had 2.5 seconds
to settle and 6 seconds of sampling. Other desktop applications were active,
and some samples had large GPU stalls. This establishes a camera bottleneck,
but does not establish a consistent production-only slowdown. The actual remote
deployment has not been profiled.

## Implementation

- Added `three-mesh-bvh` to the client dependencies.
- `mapRaycast.ts` builds a spatial index for each unique static map geometry
  when `MapGame` starts. `indirect: true` preserves existing index buffers and
  triangle order. The geometry, materials, and world transforms are retained.
- Only the map mesh instances use accelerated raycasting. Three.js prototypes,
  avatars, and vehicles are not patched.
- `PlayerView` requests the nearest hit from each indexed mesh, limits the ray
  to the current camera distance, and reuses its intersection array.
- `MapGame.dispose()` restores the map's original raycast methods and releases
  the indexes it created. Existing indexes are reused and left with their owner.

Camera obstruction remains enabled, with the same wall clearance and smoothing.
The change does not alter movement, game physics, networking, graphics quality,
pixel density, or shadows. Index construction adds a one-time initialization
cost and memory use; the indexes are intended for the current static map, not
deforming or edited geometry.

## Validation

Focused tests cover actual city building and terrain intersections from both
sides, unchanged geometry buffers, instance-only installation and cleanup,
shared geometry, repeated setup, and rear/front camera obstruction and smoothing.

- `npm test`: 62 tests passed on a standalone run. An initial run alongside
  build checks reported one failure; the standalone rerun passed all tests.
- `npm run check`: passed.
- `npm run lint`: passed.
- `npm run build -w @race/client`: passed, with the existing large-bundle warning.
- Browser Inspect/Play switches passed in both builds: both map indexes were
  released, the old scene emptied and connection disposed, and re-entering Play
  built two fresh indexed meshes and showed the lobby. Development retained
  React StrictMode.

## Measurements after the change

Repeated the same fixed-position browser conditions, with camera collision
enabled, for a fresh production build and development:

| Metric | Development before | Development after | Local production before | Local production after |
| --- | ---: | ---: | ---: | ---: |
| Rear view FPS, pixel density 1 | 25.5 | 60.0 | 31.4 | 58.0 |
| Rear camera raycast, pixel density 1 | 35.4 ms | 0.040 ms | 24.3 ms | 0.044 ms |
| Front view FPS, pixel density 1 | Not measured | 60.0 | Not measured | 60.0 |
| Rear view FPS, pixel density 2 | 25.4 | 50.8 | 28.7 | 50.5 |
| First-person FPS, pixel density 2 | 49.4 | 52.5 | 46.5 | 49.2 |

The optimized CPU profiles were dominated by idle time rather than triangle
intersection work. At pixel density 1, temporarily bypassing camera collision
after optimization still measured approximately 60 FPS, so retaining collision
now has little overhead in this scenario.

Frame rates remain sensitive to GPU contention and rendering resolution.
Pixel density 2 still falls short of 60 FPS on this machine. Graphics quality
was deliberately retained; a configurable resolution cap or shadow options are
separate potential improvements if further GPU profiling justifies them.

These are local browser measurements, not a guarantee for other devices or
the remote deployment. A deployment URL is still needed to investigate the
reported environment-specific slowdown directly.

## Docker port mapping and HTTP context check

Tested the existing optimized production build through a direct Node server
on `localhost:2567` and an isolated copy of the Compose deployment. The latter
publishes host port 80 to Caddy's container port 8080; Caddy serves the files and
proxies matchmaking and WebSockets to the server container. An additional host
port 8080 mapped to the same Caddy port for comparison. No deployment
configuration or gameplay code was changed.

All four addresses (direct Node, Docker port 80, Docker port 8080, and Docker
through the LAN IP) served the same client bundle, `index-B7a47jHe.js`, with
SHA-256 `b542689e57b910c706d65844fec881f52204acbeb6c03159d1a2c3a2ac59f06b`.
Both map meshes had their BVH indexes installed. The browser, viewport, player
position, shadows, and sampling durations matched the earlier measurements.

The first comparison ran direct / Docker / Docker / direct, followed by port
8080 and the LAN address. A follow-up used a fresh browser process and profile
for each address, testing pixel density 1 in the order 8080 / LAN / direct / 80.
The ranges below include every direct and port-80 sample from both comparisons:

| FPS | Direct Node | Docker, host 80 to container 8080 |
| --- | ---: | ---: |
| Rear view, density 1 | 57.3-59.5 | 57.1-60.0 |
| First-person, density 1 | 58.0-59.8 | 54.6-59.3 |
| Rear view, density 2 | 31.4-34.3 | 35.4-35.6 |
| First-person, density 2 | 30.5-35.6 | 31.8-36.8 |

The normal port-80 deployment matched direct rendering performance. Increasing
pixel density from 1 to 2 quadrupled the drawing-buffer pixel count and
reproduced a large slowdown through both paths. These measurements provide no
evidence that the 80-to-8080 mapping explains the reported FPS loss. Docker's
forwarding and Caddy's proxy affect transport; rendering and camera physics run
in the browser and do not wait for network responses each frame.

`isSecureContext` was true on all localhost addresses, including HTTP port 80,
and false on HTTP at the LAN IP (`10.5.92.11`). All addresses retained the same
Intel Iris Xe / ANGLE D3D11 WebGL renderer. `navigator.gpu` was unavailable in
the insecure context, but this application renders with WebGL rather than
WebGPU.

The alternate-port and LAN samples had substantial GPU stalls and must not be
discarded. At density 1, port 8080 measured 8.2 FPS rear / 7.5 FPS first-person;
its fresh-browser repeat measured 30.0 / 9.3 FPS. The LAN samples measured
11.3 / 11.7 FPS, then 26.4 / 11.3 FPS in a fresh browser. At density 2, these
addresses measured 3.3-6.3 FPS. Game CPU work generally remained below 1 ms,
while GPU elapsed queries frequently exceeded 100 ms. Server patches continued
roughly every 50 ms, and measured RTTs remained approximately 3-25 ms.
Other Chrome windows and Warp were also consuming substantial GPU time.

The origin-correlated stalls remain unexplained; this check does not establish
whether they arise from browser/driver behavior, instrumentation, or concurrent
GPU work. Consequently, the LAN comparison confirms GPU availability but does
not give a clean FPS comparison of secure and insecure contexts. HTTPS itself
and the actual remote deployment were not tested. Further graphics tracing or
a controlled repeat is needed before attributing those stalls to a cause.

Raw results and the temporary browser harness are retained in the Windows temp
directory `team67-perf-eac89218251143a5952b292ac8feebda`, as `port-context.json`
and `port-context-repeat-{8080,lan,direct,80}.json`. Test containers, the test
network, the direct test server, and the isolated test browsers were stopped
after measurement. Existing containers and user browser windows were retained.

## Rendering resolution fix

The viewer now defaults to **Performance** resolution: at most one drawing-buffer
pixel per CSS pixel, with an additional 1920 x 1080 pixel budget for large
windows. A density-2 display with the tested viewport now renders 1280 x 784
instead of 2560 x 1568, reducing pixel count by 75%. CSS sizing, camera aspect,
and the HTML menu remain at their original size.

The game menu includes **Rendering resolution** with Performance and
**High — sharper image** options. High restores the previous density limit of
2. Changing the setting resizes the existing renderer; it does not recreate the
game or reconnect to the room. The choice survives Inspect/Play switches for
the current page session and resets to Performance on a page reload.

The renderer requests `powerPreference: "high-performance"`, a browser hint
rather than a guarantee of a different GPU. Resize updates density and drawing
buffer size together with `setDrawingBufferSize`, avoiding two successive
buffer reallocations. Window resize listeners use the existing abort signal.
Unmount explicitly loses the old WebGL context after disposal, so Inspect/Play
switches release the renderer's context rather than awaiting browser garbage
collection. Context-loss listeners are removed before this deliberate release.

The previous BVH change retains collision behavior. This follow-up changes
rendering resolution and renderer lifecycle; antialiasing, shadows, map geometry,
camera movement, game physics, and multiplayer logic retain their settings.
Performance resolution gives a softer image on HiDPI/large displays; High is
available for players who prefer sharpness and have GPU capacity.

### Follow-up measurements and limitations

Repeated the prior stalled addresses using fresh browsers with GPU elapsed-time
queries disabled. CPU/frame sampling remained enabled. At density 1, the
unchanged Docker client measured:

| Address | Rear FPS | First-person FPS |
| --- | ---: | ---: |
| localhost:8080 | 58.3 | 59.6 |
| LAN IP over insecure HTTP | 57.4 | 60.0 |
| localhost:80 | 56.9 | 60.0 |

This shows those addresses can retain hardware acceleration and smooth
rendering. It weakens the earlier apparent association between origin and
stalls; the profiling instrumentation is a possible contributor.

On a density-2 display, the new local production client initially measured
60.0 FPS rear in Performance and 52.0 FPS rear in High. First-person High
measured 40.9 FPS. A subsequent first-person Performance sample stalled at
3.8 FPS even without GPU timing queries. A first final Docker run measured
60.0 FPS first-person and 31.3 FPS rear, with regular network updates. These
outliers are retained here: removing timer queries did not eliminate every
stall, and changing resolution cannot guarantee 60 FPS under all conditions.
A separate system snapshot showed Warp using approximately 70% of the GPU
engine and the desktop compositor approximately 20% while probe Chrome was
closed. Concurrent GPU work and driver/browser behavior remain confounding
factors; their causal contribution has not been isolated.

The fix reduces a verified GPU workload rather than claiming to solve Docker
forwarding, HTTP security, or every unexplained stall. The actual remote
deployment still has not been measured. The resolution approach follows the
[Three.js responsive-rendering guidance](https://threejs.org/manual/pages/responsive.html).

### Final validation

- TypeScript checks, frontend lint, and the client production build passed.
- Built a fresh client Docker image using the repository Dockerfile; its full
  workspace build passed, with the existing bundle-size warning.
- A final Docker repeat on a density-2 display measured **59.8 FPS in both first
  and rear third person** using the default Performance setting. These are local
  samples rather than a sustained-performance guarantee.
- Browser checks passed in Docker production and Vite development with
  StrictMode: changing resolution retained the room ID, the 4K viewport stayed
  within the pixel budget (1973 x 1050), and High restored 2560 x 1568.
- Inspect released both BVH indexes, emptied the old scene, disposed networking,
  and lost the old WebGL context. Returning to Play created a fresh game with two
  indexed map meshes, retained High, and displayed the lobby. Context loss is
  asynchronous; the browser check waits for it.
- The temporary CDP harness initially failed lifecycle checks because its
  result field and remount hook were incorrect. Correcting the harness made the
  assertions pass; those failures did not require further application changes.
- `git diff --check` passed. No commits or pushes were made.

The temporary directory above contains `render-no-query-*.json` measurements,
`render-validation-{docker-final,dev-final}.json`, and the browser harness.
All test browsers, servers, containers, and the isolated network were stopped
afterward. The test Docker image remains available as
`team67-render-probe-client:latest`; normal Compose images were not retagged.

Rebuild the normal local deployment to pick up the source changes:

```sh
docker compose up -d --build
```
