# Migration audit and validation

## Before changes: architecture summary

The complete simulator directory contained index.html, main.js (657 lines), flight.js (143), city.js (151), websocket.js (328), style.css, README.md, DESIGN.md, PRODUCT.md, package.json, vite.config.js and assets/three.min.js. No model/texture/sound assets existed. Package/config files already named Vite and Three.js, but HTML still loaded five global scripts with no module entry point. There was no lockfile or installed project dependency tree.

Main.js owned scene/lighting, renderer, player records, connection callbacks, combat, collisions, effects, UI, keyboard events and RAF. Flight.js combined aircraft geometry/physics/chase camera. City.js created a deterministic town with precomputed building boxes. Websocket.js owned separate controller connections and sequence/heartbeat/reconnect handling but used global THREE. Files relied on script order; they had no explicit import graph.

```text
BEFORE
index.html → global THREE → websocket.js + city.js + flight.js → main.js
                            socket fire callback ───────────→ bullets
main.js RAF → physics/camera → collisions/combat → HUD → render

AFTER
index.html → src/main.js → Game.js (central player/match state)
ControllerConnection → latest controls + pending fire presses
GameLoop RAF → aircraft → collision/weapons → effects/respawn
             → ChaseCamera → HUD (10 Hz) → Renderer (1 or 2 views)
City → shared instances, merged roads, static building bounds
```

## Performance problems found

- 28 individual road/marking meshes and geometries. Town had 40 render objects total.
- Shop, awning, roof, trunk and leaf instancing already existed and needed preservation.
- Bullets already used two Points batches, but the object pool allocated on demand without a hard cap, used splice on removal and made a counts array every frame.
- Dynamic bullet positions could use stale frustum bounds. Endpoint-only hits could miss an aircraft crossed by a fast bullet.
- Both camera projection matrices were recalculated during rendering, even without resize.
- Fire callbacks spawned bullets outside RAF. Network callbacks also changed connection/log DOM.
- Connection monitoring used one interval per remote. Parseable null packets could throw; invalid motion could advance sequence before validation.
- Each explosion allocated 12 meshes/vectors and cloned/disposed 12 materials.
- HUD updated at roughly 12.5 Hz and wrote unchanged values. Normalized flight input allocated objects each frame.
- Shadows were already limited to aircraft, with one hemisphere and one directional light; there were no large textures or excessive point lights to remove.

## Implemented changes

NPM Three.js imports, Vite module entry and imported CSS; source organized by responsibility without changing frameworks, artwork, flight sensitivity or firmware. Existing Vite configuration retained; Vite updated from 5 to 7.3.6 after installation reported dependency advisories. Final installation reported zero vulnerabilities. Node 22.12+ is documented.

Roads now use two merged meshes, reducing town render objects from 40 to 14. All 72 building colliders and 144 trees remain. Existing instancing/material sharing stays intact. Exact visible GPU draw counts depend on camera/frustum and shadow passes and were not measured here.

Bullets remain two Points batches with 96 pooled records per player, active upload ranges, swap removal and swept collision. Explosions reuse 24 meshes/two materials. Flight and chase camera use reusable vectors. Normalized input and network motion records are reused. HUD updates at 10 Hz with changed-only text; log DOM appends occur during that tick.

One RAF drives gameplay, controller health checks, effects, cameras, HUD and render; dt clamps to 0.05 s. Socket callbacks only parse/update state and bounded logs/events. Brief fire presses are preserved until the next frame. Sequence ordering, legacy packets, independent remotes and calibration commands remain compatible with the supplied firmware. Stale-trigger recovery and disconnect cleanup were tested. Reconnect/toast/cosmetic UI timers remain; no gameplay setInterval remains.

One renderer supports scissor split-screen. Pixel-ratio caps are centrally configurable: 1.25 single / 1.0 split (old single cap was 1.2). Shadows remain configurable at 1024. Projection matrices update only when aspect changes. Optional D diagnostics report whole-frame calls/triangles and once-per-second FPS/timings, plus controller ping/rate/age.

## File inventory

Created: all files under src/, scripts/check.mjs, tests/simulator.test.js, tests/game-integration.test.js, .gitignore, package-lock.json and this MIGRATION.md. src/style.css preserves the original CSS.

Modified: index.html, package.json, README.md. Retained unchanged: vite.config.js, DESIGN.md, PRODUCT.md and the ESP32 firmware outside this folder.

Removed after replacement build/tests passed: root main.js, flight.js, city.js, websocket.js, style.css and assets/three.min.js; the empty assets folder was also removed. These removed files are recoverable from ../flight-simulator-legacy-source.tar.gz, which also contains the original README/design/product documents. No external static assets existed to move into public.

Generated: node_modules/ and dist/. README lists the complete project-owned source tree and deployment commands.

## Actual validation results

| Check | Result |
| --- | --- |
| npm install | PASS; 16 packages audited, zero vulnerabilities |
| npm run build | PASS; Vite 7.3.6, 18 modules transformed |
| npm run check | PASS; JS syntax, relative imports, built HTML asset paths |
| npm test | PASS; 13 tests |
| npm run dev | PASS; localhost:8080 served migrated entry module |
| npm run preview | PASS; localhost:4173 served HTML, JS and CSS with HTTP 200 |
| Missing production assets | PASS; all HTML asset URLs resolved locally |
| Live browser console / WebGL visual checks | NOT RUN; in-app browser backend unavailable |
| Real ESP32, MPU6050, GPIO4/GPIO5 and Raspberry Pi | NOT RUN; hardware unavailable |
| Offline browser reload with internet disabled | NOT RUN; local asset/build checks passed |

Production output: index.html 7.55 kB; CSS 12.92 kB; JS 511.25 kB (131.53 kB gzip). Vite reports a non-fatal >500 kB chunk-size warning; the bundle includes Three.js. No artificial chunk splitting or warning suppression was added.

The headless integration test runs actual Game.js/Three.js scene logic with simulated DOM, sockets and renderer. It checks two-controller split mode, short fire taps, five-hit destruction, scores, three-second respawn, protection, first-to-five winner, automatic rematch, keyboard fallback and building crash. It does not establish browser/WebGL rendering correctness or real network latency. Unit tests additionally cover sequence rollover/duplicates, malformed packets, independent state, stale-trigger recovery, reconnect cleanup, bounded pooling, swept collision, turn direction, world counts, effects reuse and delta-time clamping.

## Remaining manual validation

Use the README checklist to verify real Chromium startup/console, keyboard, one and two ESP32 remotes, physical left/right direction, GPIO4 calibration, rapid GPIO5 taps and continuous fire, crash/combat/respawn/protection/rematch, fullscreen and resize, independent reconnection and offline reload. Measure FPS/calls/triangles/ping/packet rate/age in both view modes on the actual Pi. No desktop-browser or Pi FPS numbers were fabricated.
