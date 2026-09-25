# ESP32 Wireless Motion Controlled Multiplayer Flight Simulator

The existing school-project game, reorganized into Vite + NPM + vanilla JavaScript + Three.js + native WebSocket. It now offers Airplane Mode and Drone Mode while retaining the original aircraft, low-poly town, multiplayer combat, HUD and arcade flight controls. No framework or physics engine is used.

## Game modes

Choose one mode on the start screen. Both players use the selected vehicle during that match; mixed airplane-versus-drone matches are intentionally not enabled.

### Airplane Mode

Airplane Mode preserves the original continuous-forward arcade flight model. Choose an airplane on the start screen; the same selection applies to both players and is remembered after a reload. Controller pitch changes aircraft pitch, controller roll banks and turns, and the existing yaw-rate assistance remains active. Every model uses the same arcade flight speed and sensitivity.

| Airplane | Low-poly features |
| --- | --- |
| ATR 72 | High wing, T-tail, twin turboprops with animated propellers |
| 777MAX (concept) | Long widebody, two large jet engines and raked wing tips |
| Airbus A350 | Long widebody, swept wings, two engines and winglets |
| Boeing 737 | Smaller narrowbody, two underwing engines and winglets |
| Boeing 747 | Widebody with upper deck hump and four underwing engines |
| B-2 Spirit | Flying wing with four recessed engines |
| C-17 Globemaster III | High wing cargo plane, four engines and T-tail |
| F-16 Fighting Falcon | Small single-engine fighter with swept wings and canopy |

“777MAX” is the requested game model name; it is a concept design rather than an official aircraft designation. These are simplified recognisable shapes, not scale replicas. The chase camera and bullet spawn position adjust to the selected airframe.

### Aircraft size ratio

All eight models use **0.4 game units per metre** for overall wingspan, length and height. This makes the F-16 visibly much smaller than the B-2 and C-17. The model details are simplified, and all airplanes retain the same arcade flight physics.

| Model | Reference wingspan | Reference length |
| --- | ---: | ---: |
| ATR 72-600 | 27.05 m | 27.17 m |
| 777MAX concept (777-9 reference) | 71.8 m | 76.7 m |
| A350-900 | 64.75 m | 66.8 m |
| 737-800 | 35.8 m | 39.5 m |
| 747-8 | 68.4 m | 76.3 m |
| B-2 Spirit | 52.12 m | 20.9 m |
| C-17 Globemaster III | 51.75 m | 53 m |
| F-16 Fighting Falcon | 9.8 m | 14.8 m |

Dimension references: [ATR](https://www.atr-aircraft.com/regional-mobility/regional-aircraft/atr-72-600/), [Boeing 777-9](https://www.boeing.com/commercial/777x), [Airbus A350-900](https://www.aircraft.airbus.com/en/aircraft/a350/a350-900), [Boeing 737-800](https://www.boeing.com/commercial/737ng), [Boeing 747-8](https://www.boeing.com/content/dam/boeing/boeingdotcom/company/about_bca/startup/pdf/historical/747-8I_-_passenger.pdf), [U.S. Air Force B-2](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104482/b-2-spirit/), [C-17](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/1529726/c-17-globemaster-iii/), and [F-16](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/%20/lang/f-16-fighting-falcon/).

### Drone Mode

Drone Mode is simplified arcade physics for a school demonstration, not a real drone flight controller. The drone holds a fixed hover height and keeps its heading; MPU6050 pitch and roll request horizontal target velocity relative to that heading.

| Controller movement | Drone action |
| --- | --- |
| Neutral / calibrated centre | Smoothly decelerate, stop and hover |
| Tilt forward | Move forward |
| Tilt backward | Move backward |
| Tilt right | Strafe right |
| Tilt left | Strafe left |
| More tilt | Request more speed |
| Combined pitch and roll | Move diagonally without exceeding maximum speed |

The configurable input chain is: 4° dead zone → normalize against 45° → 1.4 response curve → target velocity → acceleration/deceleration. Returning to centre requests zero velocity; it does not stop the drone instantly. Drone attitude is visual feedback only and is limited to 14°. The low-poly propellers animate in the existing game loop.

## Hardware and controls

Two independent ESP32 + MPU6050 remotes and a computer or Raspberry Pi running Chromium/WebGL. Remotes and display computer must share the same Wi-Fi network.

| Input | Action |
| --- | --- |
| Airplane: tilt right / left | Bank and turn right / left |
| Airplane: tilt forward / backward | Pitch down / up |
| Drone: tilt right / left | Strafe right / left |
| Drone: tilt forward / backward | Move forward / backward |
| GPIO4 to GND | Calibrate neutral position |
| GPIO5 to GND | Hold to fire; short taps fire once |
| Arrow keys / Space | Player 1 movement / fire when its remote is offline |
| R | Reset match |
| D | Toggle performance/network diagnostics |
| L | Remote log with pause, clear and copy |
| M / Sound button | Mute or unmute synthesized game audio |
| Fullscreen button | Enter/leave fullscreen; Esc also exits |

Firmware remains in `../flight_remote/flight_remote.ino` and was not changed. GPIO4/GPIO5 use internal pull-ups. Avoid holding GPIO5 during ESP32 power-on/reset.

Each hit removes 20 of 100 health. Five hits destroy an aircraft and award one point. First to five points wins, followed by an automatic rematch after three seconds. Respawn takes three seconds and gives two seconds of spawn protection, during which firing is disabled. Building collisions crash without awarding the opponent a point. The original minimum-altitude clamp and world-edge wrap remain.

One remote uses its full-screen chase camera; two remotes automatically use left/right split screen. With neither remote, Player 1 has keyboard fallback. Player 1 is blue; Player 2 is red. Drone Mode uses a heading-only third-person camera, so strafing and visual tilt do not swing the view sideways.

## Sound

The simulator synthesizes engine/rotor loops, gun bursts, hit thuds, crash rumbles and low-altitude warning beeps with the browser's Web Audio API. There are no sound files, downloads or new dependencies. Select **Enable game audio** on the start screen, or use **M** or the sound button during play. The setting is remembered locally. Audio starts after pressing **Start simulation**, which satisfies browser autoplay rules. The warning text says “Pull up” when the airplane is too low. Stall and missile-lock sounds are reserved for future gameplay systems because the current simulator has no stall or missile-lock events.

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
    ├── aircraft/AircraftModel.js
    ├── aircraft/JetModels.js
    ├── aircraft/MilitaryModels.js
    ├── aircraft/AircraftScale.js
    ├── audio/GameAudio.js
    ├── drone/
    │   ├── Drone.js
    │   └── DronePhysics.js
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

Game.js owns player records, selected mode/model, connection coordination, match rules and UI events. Related small features remain together rather than adding a class for every button/player. Aircraft.js retains the original arcade physics and swaps the selected model. AircraftModel.js contains the ATR 72 and model registry; JetModels.js builds the commercial jet variants; MilitaryModels.js builds the B-2, C-17 and F-16; AircraftScale.js applies one size conversion to all airplane models. GameAudio.js generates sound from existing gameplay events. Drone.js owns the shared low-poly geometry, propellers, reset and chase camera; DronePhysics.js owns dead-zone normalization, target velocity, acceleration, deceleration, hover-height correction and horizontal movement. City.js keeps town creation and static collision bounds; WeaponSystem.js includes the shared bullet pool.

```text
ESP32 sockets → latest per-player controls + pending fire presses
                          ↓
         selected mode: airplane OR drone (both players)
                          ↓
One RAF → active vehicles → collisions/weapons → effects/respawn
                          ↓
                chase cameras → HUD (10 Hz) → one renderer
                                              ├─ P1 camera
                                              └─ P2 when split
```

## Performance and debugging

Tune src/utils/Constants.js and rebuild. Defaults: pixel ratio cap 1.25 single-view / 1.0 split-view, shadows enabled with 1024 maps, HUD 10 Hz, delta time capped at 0.05 s, 96 bullets per player, bullet speed 260 units/s, fire interval 0.065 s, and aircraft speed 42 units/s. Original pitch/roll/turn sensitivity remains 24/55/58 degrees. Drone defaults are maximum speed 38 units/s, acceleration 58 units/s², deceleration 76 units/s², hover height 12, 4° dead zone and 45° maximum controller input. For slower Pi hardware, try pixelRatio 1.0 and shadows false first.

All 72 shops and 144 trees remain in InstancedMesh batches. Roads/markings merge from 28 meshes to two. Aircraft cast shadows; ground receives them. There are no textures or point lights. Bullets retain two Points batches with a fixed vector pool, active upload ranges and swept collision tests. Explosion meshes/materials are reused. Camera projection matrices update only when aspect changes. Network callbacks do not create bullets or update DOM. HUD text changes at most 10 times per second and only if its value changes. Remote log rows append on the HUD tick.

Press **D** for FPS, frame/update/render time, whole-frame calls/triangles, and each controller's status, ping, packets/sec, packet age, sequence and fire state. FPS/timing updates once per second. Calls include both views and shadows. Render time measures CPU submission, not GPU completion. Debug is hidden by default.

Measure 30 seconds after warm-up in single and split screen, first idle then both guns held. Record resolution, pixel ratio, shadows, FPS, calls, triangles, packet rates, age and ping. No Raspberry Pi FPS is claimed.

## Validation

```bash
npm test
npm run build
npm run check
```

Tests cover packet ordering/rollover, malformed input, independent remotes, short fire presses, stale-trigger recovery, connection cleanup, bullet pool/cadence/protection, swept collision, airplane steering and model choices, drone dead zone/response/diagonal speed/deceleration/reset, game-mode switching, world contents, explosion reuse and RAF clamping. The check script verifies JS syntax, imports and built HTML assets. See MIGRATION.md for actual results.

## Troubleshooting

- Disconnected: confirm same Wi-Fi, current DHCP IP and port 81. Press L; the HTTP server log does not show ESP32 WebSocket traffic.
- Stale: inspect controller power/Wi-Fi. Old motion neutralizes controls and stops fire.
- Direction: airplane and drone signs are independent constants in src/utils/Constants.js. The current mounting uses `AIRPLANE_ROLL_INVERSION` and `DRONE_STRAFE_INVERSION` set to -1. Calibrate and physically verify forward/back/right/left before changing only the affected mode constant.
- Shaking/drift: hold still during startup calibration, press GPIO4 to set neutral, and inspect MPU6050 wiring. Yaw is a rate, not compass heading.
- Low FPS: enable hardware acceleration, close tabs, lower pixel ratio or disable shadows, rebuild and recopy dist.
- Offline failure: copy all of dist including hashed assets, serve it over HTTP and hard reload. Python cannot serve source index.html after migration.
- Build failure: verify Node 22.12+ and npm install. Three.js is the only runtime package; Vite is the only development package.

## Manual hardware checklist

Load Chromium and check its console. In Airplane Mode, select each of the eight models and verify the silhouette, relative size, camera framing, bullet origin, original keyboard/remote directions and sensitivity. In Drone Mode, verify neutral hover, forward/back/right/left, slow-to-fast tilt response, diagonal speed cap, smooth neutral deceleration, fixed altitude, propellers, camera, building crashes and zero-velocity reset/respawn. In both modes verify P1-only/P2-only full-screen, automatic split-screen, GPIO4 calibration, short GPIO5 taps and held fire, five hits to destroy, scoring, three-second respawn, two-second protection, first-to-five winner and automatic rematch/reset. Listen for engine changes, gunfire, hits, crashes and the low-altitude beep; verify sound can be muted and unmuted. Test fullscreen/resize, independent unplug/reconnect, and production reload with internet disconnected but local Wi-Fi intact. Measure single/split performance on the actual Pi.
