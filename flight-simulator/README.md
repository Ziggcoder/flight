# ESP32 Wireless Motion Controlled Multiplayer Flight Simulator

The existing school-project game, reorganized into Vite + NPM + vanilla JavaScript + Three.js + native WebSocket. The original aircraft, low-poly town, HUD and arcade flight controls are retained. No framework or physics engine is used.

## Hardware and controls

Two independent ESP32 + MPU6050 remotes and a computer or Raspberry Pi running Chromium/WebGL. Remotes and display computer must share the same Wi-Fi network.

| Input | Action |
| --- | --- |
| Tilt right / left | Bank and turn right / left |
| Tilt forward / backward | Pitch down / up |
| GPIO4 to GND | Calibrate neutral position |
| GPIO5 to GND | Hold to fire; short taps fire once |
| Arrow keys / Space | Player 1 flight / fire when its remote is offline |
| R | Reset match |
| D | Toggle performance/network diagnostics |
| L | Remote log with pause, clear and copy |
| Fullscreen button | Enter/leave fullscreen; Esc also exits |

Firmware remains in `../flight_remote/flight_remote.ino` and was not changed. GPIO4/GPIO5 use internal pull-ups. Avoid holding GPIO5 during ESP32 power-on/reset.

Each hit removes 20 of 100 health. Five hits destroy an aircraft and award one point. First to five points wins, followed by an automatic rematch after three seconds. Respawn takes three seconds and gives two seconds of spawn protection, during which firing is disabled. Building collisions crash without awarding the opponent a point. The original minimum-altitude clamp and world-edge wrap remain.

One remote uses its full-screen chase camera; two remotes automatically use left/right split screen. With neither remote, Player 1 has keyboard fallback. Player 1 is blue; Player 2 is red.

## Development and production

Use Node.js 22.12+ (tested with 22.22.0) and NPM. Installation needs internet or a populated NPM cache; the built game needs neither.

```bash
cd /Users/zigg/Bipin/flight-simulator
npm install
npm run dev
```

Open Vite's printed URL, normally http://localhost:8080. The development server listens on the LAN for classroom testing; use it on a trusted network.

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 8080
```

`dist/` is the complete production application. HTML references local hashed JS/CSS, including bundled Three.js. No CDN, online fonts, texture downloads or runtime NPM server are required. Serve over HTTP; do not double-click index.html.

## Raspberry Pi deployment

Build on the development computer and copy the contents of dist to the Pi. Replace the example Pi username/address as needed:

```bash
npm run build
ssh pi@raspberrypi.local 'mkdir -p ~/flight-simulator/dist'
scp -r dist/. pi@raspberrypi.local:~/flight-simulator/dist/
```

On the Pi:

```bash
cd ~/flight-simulator/dist
python3 -m http.server 8080
```

Open Chromium at http://localhost:8080 with hardware acceleration enabled. Keep local Wi-Fi connected to the ESP32s; internet access is unnecessary. Node/NPM are not needed on the Pi for the built game.

## ESP32 WebSocket setup

Set Wi-Fi credentials in the existing firmware, upload to both remotes, and read their DHCP addresses from Serial Monitor at 115200 baud. Enter two different IPs on the simulator start screen and choose **Save & connect remotes**. Player 2 is optional. Addresses are saved in Chromium localStorage; update them when DHCP changes them.

Each controller has its own native WebSocket at `ws://IP:81`. Use HTTP for the simulator; HTTPS pages can block insecure ws connections.

Typed motion packets with `type, seq, p, r, y, fireHeld, fireSeq` and legacy `p,r,y,b` or `pitch,roll,yawRate,button` are supported. The firmware's fire, pong, calibrated, plain CALIBRATED and plain PONG messages are preserved. Calibration sends CALIBRATE.

Only the newest valid motion state is kept; sequence comparison handles rollover and rejects duplicates/old packets. Fire uses an independent sequence and pending press count, so press/release between frames fires once outside spawn protection. Holding fire drives the gun locally. Stale motion after 500 ms neutralizes control and releases the gun; a fresh held snapshot resumes it. Reconnect delay is 1500 ms, with a 3000 ms connection/liveness timeout. Live legacy motion keeps the link open even without JSON pong support.

## Project structure

```text
flight-simulator/
├── .gitignore
├── package.json
├── package-lock.json
├── vite.config.js
├── index.html
├── README.md
├── MIGRATION.md
├── DESIGN.md
├── PRODUCT.md
├── scripts/check.mjs
├── tests/
│   ├── simulator.test.js
│   └── game-integration.test.js
└── src/
    ├── main.js
    ├── style.css
    ├── core/
    │   ├── Game.js
    │   ├── GameLoop.js
    │   └── Renderer.js
    ├── network/ControllerConnection.js
    ├── aircraft/Aircraft.js
    ├── camera/ChaseCamera.js
    ├── weapons/
    │   ├── WeaponSystem.js
    │   └── ExplosionSystem.js
    ├── world/City.js
    ├── collision/CollisionSystem.js
    ├── ui/HUD.js
    └── utils/Constants.js
```

NPM generates node_modules; build generates dist/index.html and dist/assets. Both are ignored by Git. No model, texture or audio assets existed, so empty public/assets directories are unnecessary. Put future static assets there and verify their production URLs.

Game.js owns player records, connection coordination, match rules and UI events. Related small features remain together rather than adding a class for every button/player. Aircraft.js retains geometry and arcade physics; City.js keeps town creation and static collision bounds; WeaponSystem.js includes the bullet pool.

```text
ESP32 sockets → latest per-player controls + pending fire presses
                          ↓
One RAF → aircraft → collisions/weapons → effects/respawn
                          ↓
                chase cameras → HUD (10 Hz) → one renderer
                                              ├─ P1 camera
                                              └─ P2 when split
```

## Performance and debugging

Tune src/utils/Constants.js and rebuild. Defaults: pixel ratio cap 1.25 single-view / 1.0 split-view, shadows enabled with 1024 maps, HUD 10 Hz, delta time capped at 0.05 s, 96 bullets per player, bullet speed 260 units/s, fire interval 0.065 s, aircraft speed 42 units/s. Original pitch/roll/turn sensitivity remains 24/55/58 degrees. For slower Pi hardware, try pixelRatio 1.0 and shadows false first.

All 72 shops and 144 trees remain in InstancedMesh batches. Roads/markings merge from 28 meshes to two. Aircraft cast shadows; ground receives them. There are no textures or point lights. Bullets retain two Points batches with a fixed vector pool, active upload ranges and swept collision tests. Explosion meshes/materials are reused. Camera projection matrices update only when aspect changes. Network callbacks do not create bullets or update DOM. HUD text changes at most 10 times per second and only if its value changes. Remote log rows append on the HUD tick.

Press **D** for FPS, frame/update/render time, whole-frame calls/triangles, and each controller's status, ping, packets/sec, packet age, sequence and fire state. FPS/timing updates once per second. Calls include both views and shadows. Render time measures CPU submission, not GPU completion. Debug is hidden by default.

Measure 30 seconds after warm-up in single and split screen, first idle then both guns held. Record resolution, pixel ratio, shadows, FPS, calls, triangles, packet rates, age and ping. No Raspberry Pi FPS is claimed.

## Validation

```bash
npm test
npm run build
npm run check
```

Tests cover packet ordering/rollover, malformed input, independent remotes, short fire presses, stale-trigger recovery, connection cleanup, bullet pool/cadence/protection, swept collision, steering, world contents, explosion reuse and RAF clamping. The check script verifies JS syntax, imports and built HTML assets. See MIGRATION.md for actual results.

## Troubleshooting

- Disconnected: confirm same Wi-Fi, current DHCP IP and port 81. Press L; the HTTP server log does not show ESP32 WebSocket traffic.
- Stale: inspect controller power/Wi-Fi. Old motion neutralizes controls and stops fire.
- Direction: the original mounting correction negates remote roll in src/core/Game.js. Calibrate and physically verify left/right before changing axes.
- Shaking/drift: hold still during startup calibration, press GPIO4 to set neutral, and inspect MPU6050 wiring. Yaw is a rate, not compass heading.
- Low FPS: enable hardware acceleration, close tabs, lower pixel ratio or disable shadows, rebuild and recopy dist.
- Offline failure: copy all of dist including hashed assets, serve it over HTTP and hard reload. Python cannot serve source index.html after migration.
- Build failure: verify Node 22.12+ and npm install. Three.js is the only runtime package; Vite is the only development package.

## Manual hardware checklist

Load Chromium and check its console. Verify keyboard flight/fire, P1-only/P2-only full-screen, automatic split-screen, physical right/left direction, GPIO4 calibration, short GPIO5 taps and held fire. Check building crashes, five hits to destroy, scoring, three-second respawn, two-second protection, first-to-five winner and automatic rematch/reset. Test fullscreen/resize, independent unplug/reconnect, and production reload with internet disconnected but local Wi-Fi intact. Measure single/split performance on the actual Pi.
