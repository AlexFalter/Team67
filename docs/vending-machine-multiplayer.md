# El Tony Mate vending machine

Implemented on `merge-vending-machine`. The complete `mini-games/` directory was
restored from `alex/merge-vehicles`; multiplayer imports no runtime code from it.

The main game now includes the prototype's cobalt cabinet and photographic can
labels, four flavor buttons, CHF 3.50 card swipe, 1.4-second dispensing wait,
failed-flavor refunds with alternating one/two-second retries, animated can drop,
tray collection and one-use Mate inventory. Press **E** at the front of the
cabinet to interact, click the dispensed can or press **Enter** to collect, and
press **1** or click the inventory item to drink. **Esc** steps away.

The cabinet is at `(-184.722, terrain height, 49.187)`, the first clear candidate
beside the prototype's Mate search anchor. The shared world blocks its footprint;
the approach aisle and existing walking route remain clear. Third-person cameras
also treat the cabinet as an obstruction. Its controls are projected onto the
physical payment console, with the prototype's portrait framing.

## Multiplayer ownership

Each room chooses one working flavor, kept on the server. As specified by the
prototype's pure rules, each player has independent attempts, payment and
collection state. Players can use the cabinet simultaneously; their dispenser
cans are personal renderings. Every player can obtain one can per round. This
avoids a shared purchase lock without allowing one player to collect another's
reward. The collectible retains the prototype's Mint can model and inventory icon.

The server owns selection, paid attempts, dispensing/drop deadlines, inventory
and boost duration. It validates proximity, front-side access, round identity,
phase, membership, on-foot status and knockdown. Repeated payment, early or
duplicate collection, stale round commands and spectator requests cannot grant
items. Closing cancels an unpaid selection; a paid purchase continues and can
be reopened. Disconnect removes purchase state; restarting resets all purchases,
inventory and boosts, including players who waited during the previous round.

Drinking grants **+35% walking/sprinting speed for 15 seconds** and is the only optional speed boost. It does not change vehicle speed. The server timer pauses
while riding and freezes with room results. In multiplayer it continues while
the player's menu is open; opening a menu does not pause the room. Clients use
replicated boost state in the existing shared movement code; movement reports
cannot create or prolong a boost. The existing horizontal report limit already
covers boosted sprinting and needs no increase.

The static cabinet's 112 source nodes are batched into nine material meshes and
the can into two, preserving embedded label textures. Loads are abortable; DOM,
listeners, camera overrides, meshes and textures are released on cleanup. Lobby
readiness waits for both models to load alongside the existing game assets.

## Validation

`tests/mate.test.ts` covers independent purchases, timed refunds/drop/collection,
invalid and stale actions, one-use boosts, riding/expiry, cabinet placement and
collision, textured batching, and live Colyseus clients with reset and spectators.
Existing gameplay regression tests, type checking, frontend lint and the
production client build are also run for the integration.

Completed checks:

- `npm run check`, `npm run lint`, and `npm run build -w @race/client` passed.
- `npx tsx --test --test-concurrency=2 --test-skip-pattern 'BVH nearest hits' tests/*.test.ts`
  passed all 88 selected tests. The previously stalling full-city BVH comparison
  is excluded. An initial run with default concurrency had a timing failure in
  the existing server movement test; it passed alone and in the final full run.
- Two Chrome clients walked to the cabinet using the normal movement/report
  loop, completed independent payments and collection, and drank their boosts.
  Click collection and keyboard collection both worked. Original models loaded
  as nine cabinet meshes and two can meshes. Desktop and 390-pixel portrait
  controls/collection framing passed; inspect/play remount removed and recreated
  exactly one feature UI without browser page errors.
- All 490 restored prototype files match the source branch after Git's normal
  line-ending conversion. `git diff --check` passed.

The shared `MATE_POSITION` places the cabinet at (-130, 83), on the pavement in front of the Coop beside Bahnhofbrücke. Its controls face the bridge (-Z). Rendering, interaction distance and collision all use this same placement.
