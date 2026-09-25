import { ExplosionSystem } from '../weapons/ExplosionSystem.js';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createCity } from '../world/City.js';
import { createRealMapWorld } from '../world/realMap/RealMapWorld.js';
import { ArcadeFlight } from '../aircraft/Aircraft.js';
import { AIRCRAFT_MODELS } from '../aircraft/AircraftModel.js';
import { ArcadeDrone } from '../drone/Drone.js';
import { MotionRemote } from '../network/ControllerConnection.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { segmentHitsSphere, sphereIntersectsBounds } from '../collision/CollisionSystem.js';
import { createRenderer, updateAspect } from './Renderer.js';
import { GameLoop } from './GameLoop.js';
import { createHUD, setText } from '../ui/HUD.js';
import { GameAudio } from '../audio/GameAudio.js';
import {
  AIRPLANE_PITCH_INVERSION,
  AIRPLANE_ROLL_INVERSION,
  AUDIO_UPDATE_HZ,
  BULLET_SPEED,
  CONTROLLER_MAX_ANGLE,
  DRONE_FORWARD_INVERSION,
  DRONE_STRAFE_INVERSION,
  HUD_UPDATE_HZ,
  MAX_BULLETS_PER_PLAYER,
  PERFORMANCE
} from '../utils/Constants.js';

/* Two-player game setup, combat rules, split rendering, HUD, and controls. */

export function startGame() {
  const errorPanel = document.getElementById("loading-error");
  const errorText = document.getElementById("loading-error-text");

  let renderer;
  try {
    renderer = createRenderer();
  } catch (error) {
    errorText.textContent = "WebGL could not start. Enable hardware acceleration in Chromium and reload.";
    errorPanel.classList.remove("is-hidden");
    document.getElementById("start-screen").classList.add("is-hidden");
    return;
  }

  /* ── CSS2D label renderer (used by Kolar map labels) ── */
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelRenderer.domElement.classList.add('css2d-layer');
  document.getElementById("scene-container").appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x89a9c1);
  scene.fog = new THREE.Fog(0x89a9c1, 260, 1050);
  document.getElementById("scene-container").appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xc8dded, 0x53614a, 1.7));
  const sunlight = new THREE.DirectionalLight(0xfff1d2, 2);
  sunlight.position.set(180, 260, 100);
  sunlight.castShadow = PERFORMANCE.shadows;
  sunlight.shadow.mapSize.set(PERFORMANCE.shadowMapSize, PERFORMANCE.shadowMapSize);
  sunlight.shadow.camera.left = -150;
  sunlight.shadow.camera.right = 150;
  sunlight.shadow.camera.top = 150;
  sunlight.shadow.camera.bottom = -150;
  scene.add(sunlight);

  /* ── World selection ── */
  const savedWorldMap = localStorage.getItem("simulatorWorldMap") || "arcade";
  const worldMapInput = [
    document.getElementById("world-arcade"),
    document.getElementById("world-kolar")
  ];
  if (savedWorldMap === "kolar" && worldMapInput[1]) worldMapInput[1].checked = true;

  let currentWorldGroup = null;
  let buildingColliders  = [];
  let worldHalfX = 690;
  let worldHalfZ = 690;
  let isKolarMap = savedWorldMap === "kolar";
  let labelObjects = [];

  function buildWorld(mapType) {
    // Remove previous world
    if (currentWorldGroup) scene.remove(currentWorldGroup);
    buildingColliders = [];
    labelObjects = [];

    if (mapType === "kolar") {
      isKolarMap = true;
      scene.fog = new THREE.Fog(0x89a9c1, 800, 5000);
      currentWorldGroup = createRealMapWorld(scene);
      buildingColliders = currentWorldGroup.userData.buildingColliders;
      labelObjects      = currentWorldGroup.userData.css2dObjects ?? [];
      const bounds = currentWorldGroup.userData.worldBounds;
      if (bounds) { worldHalfX = bounds.halfX; worldHalfZ = bounds.halfZ; }
      labelRenderer.domElement.style.display = '';
    } else {
      isKolarMap = false;
      scene.fog = new THREE.Fog(0x89a9c1, 260, 1050);
      currentWorldGroup = createCity(scene);
      buildingColliders = currentWorldGroup.userData.buildingColliders;
      worldHalfX = 690;
      worldHalfZ = 690;
      labelRenderer.domElement.style.display = 'none';
    }

    // Apply world bounds to vehicle wrap limits
    for (const player of players) {
      if (player.vehicles) {
        player.vehicles.airplane.worldLimit = Math.min(worldHalfX, worldHalfZ) - 50;
        player.vehicles.drone.worldLimit    = Math.min(worldHalfX, worldHalfZ) - 50;
      }
    }
  }

  /* ── Player vehicle array (built before world, since buildWorld references players) ── */
  const cameras = [
    new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000),
    new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000)
  ];

  function makeControls() {
    return { pitch: 0, roll: 0, yawRate: 0, fire: false };
  }

  const savedAircraftModel = localStorage.getItem('simulatorAircraftModel');
  let aircraftModel = AIRCRAFT_MODELS.some((model) => model.id === savedAircraftModel) ? savedAircraftModel : 'atr72';

  const players = [1, 2].map((number, index) => {
    const vehicles = {
      airplane: new ArcadeFlight(scene, cameras[index], number, aircraftModel),
      drone: new ArcadeDrone(scene, cameras[index], number)
    };
    vehicles.drone.setAlive(false);
    return {
      number,
      camera: cameras[index],
      vehicles,
      flight: vehicles.airplane,
      controls: makeControls(),
      input: { pitch: 0, roll: 0, yawRate: 0, keyboard: false },
      pendingShots: 0,
      pendingConnection: null,
      pendingCalibration: false,
      remote: null,
      connection: "disconnected",
      health: 100,
      score: 0,
      respawnAt: 0,
      invulnerableUntil: 2,
      lastShotAt: -1
    };
  });

  /* ── Build the initial world (after players exist so buildWorld can set worldLimit) ── */
  buildWorld(savedWorldMap);

  /* ── Apply spawn positions from world data (overrides vehicle reset) ── */
  function applySpawnFromWorld() {
    const spawns = currentWorldGroup?.userData?.spawnPositions;
    if (!spawns) return; // arcade town — use vehicle defaults
    players.forEach((player, index) => {
      const sp = spawns[index] ?? spawns[0];
      const vehicle = player.flight;
      const mode = gameMode;
      const pos = sp[mode] ?? sp.drone;
      if (!pos) return;
      vehicle.object.position.set(pos.x, pos.y, pos.z);
      if (typeof sp[`heading${mode.charAt(0).toUpperCase() + mode.slice(1)}`] === 'number') {
        vehicle.headingAngle = sp[`heading${mode.charAt(0).toUpperCase() + mode.slice(1)}`];
      }
      vehicle.snapCamera?.();
    });
  }

  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false };
  const weapons = new WeaponSystem(scene, players);
  const bullets = weapons.bullets;
  const explosions = new ExplosionSystem(scene);
  const audio = new GameAudio(players.length);
  audio.setMuted(localStorage.getItem('simulatorSound') === 'off');
  const audiblePlayers = [false, false];

  let gameTime = 0;
  let hudTimer = 0;
  let audioTimer = 0;
  let toastTimer = null;
  let matchPaused = false;
  let rematchAt = 0;
  let gameMode = localStorage.getItem("simulatorGameMode") === "drone" ? "drone" : "airplane";
  const winningScore = 5;

  const ui = {
    startScreen: document.getElementById("start-screen"),
    setupStatus: [document.getElementById("setup-status-1"), document.getElementById("setup-status-2")],
    remoteIP: [document.getElementById("remote-ip-1"), document.getElementById("remote-ip-2")],
    score: [document.getElementById("score-1"), document.getElementById("score-2")],
    health: [document.getElementById("health-number-1"), document.getElementById("health-number-2")],
    healthFill: [document.getElementById("health-fill-1"), document.getElementById("health-fill-2")],
    altitude: [document.getElementById("altitude-1"), document.getElementById("altitude-2")],
    speed: [document.getElementById("speed-1"), document.getElementById("speed-2")],
    pitch: [document.getElementById("pitch-1"), document.getElementById("pitch-2")],
    roll: [document.getElementById("roll-1"), document.getElementById("roll-2")],
    altitudeLabel: [document.getElementById("altitude-label-1"), document.getElementById("altitude-label-2")],
    speedLabel: [document.getElementById("speed-label-1"), document.getElementById("speed-label-2")],
    pitchLabel: [document.getElementById("pitch-label-1"), document.getElementById("pitch-label-2")],
    rollLabel: [document.getElementById("roll-label-1"), document.getElementById("roll-label-2")],
    connection: [document.getElementById("connection-1"), document.getElementById("connection-2")],
    connectionText: [document.getElementById("connection-text-1"), document.getElementById("connection-text-2")],
    warning: [document.getElementById("warning-1"), document.getElementById("warning-2")],
    respawn: [document.getElementById("respawn-1"), document.getElementById("respawn-2")],
    hitMarker: [document.getElementById("hit-marker-1"), document.getElementById("hit-marker-2")],
    hud: [document.getElementById("hud-1"), document.getElementById("hud-2")],
    divider: document.getElementById("split-divider"),
    matchMode: document.getElementById("match-mode"),
    matchStatus: document.getElementById("match-status"),
    matchResult: document.getElementById("match-result"),
    winnerText: document.getElementById("winner-text"),
    rematchCountdown: document.getElementById("rematch-countdown"),
    networkDebug: document.getElementById("network-debug"),
    debug: [document.getElementById("debug-1"), document.getElementById("debug-2")],
    remoteLog: document.getElementById("remote-log"),
    remoteLogLines: document.getElementById("remote-log-lines"),
    remoteLogEmpty: document.getElementById("remote-log-empty"),
    logPause: document.getElementById("log-pause"),
    toast: document.getElementById("toast"),
    soundEnabled: document.getElementById('sound-enabled'),
    soundButton: document.getElementById('sound-button'),
    modeInputs: [document.getElementById("game-mode-airplane"), document.getElementById("game-mode-drone")],
    aircraftPicker: document.getElementById('aircraft-picker'),
    aircraftModel: document.getElementById('aircraft-model'),
    respawnVehicle: [document.getElementById("respawn-vehicle-1"), document.getElementById("respawn-vehicle-2")]
  };

  const remoteLogEntries = [];
  const maximumLogEntries = 160;
  let remoteLogPaused = false;
  let remoteLogDirty = false;
  let nextLogId = 0;
  let renderedLogId = 0;

  const savedIPs = [
    localStorage.getItem("esp32RemoteIP1") || "",
    localStorage.getItem("esp32RemoteIP2") || ""
  ];
  ui.remoteIP.forEach((input, index) => { input.value = savedIPs[index]; });

  function updateSoundControls() {
    const enabled = audio.supported && !audio.muted;
    ui.soundEnabled.checked = enabled;
    ui.soundEnabled.disabled = !audio.supported;
    ui.soundButton.disabled = !audio.supported;
    ui.soundButton.textContent = audio.supported ? (enabled ? 'Mute sound · M' : 'Unmute sound · M') : 'Audio unavailable';
    ui.soundButton.setAttribute('aria-pressed', String(enabled));
  }

  function setSoundEnabled(enabled) {
    audio.setMuted(!enabled);
    localStorage.setItem?.('simulatorSound', enabled ? 'on' : 'off');
    if (enabled && ui.startScreen.classList.contains('is-hidden')) audio.start();
    updateSoundControls();
  }

  function selectGameMode(mode) {
    if (mode !== "airplane" && mode !== "drone") return;
    gameMode = mode;
    localStorage.setItem?.("simulatorGameMode", mode);
    for (const player of players) {
      for (const vehicle of Object.values(player.vehicles)) vehicle.setAlive(false);
      player.flight = player.vehicles[mode];
      player.flight.reset();
    }
    const droneMode = mode === "drone";
    document.body.classList.toggle("mode-drone", droneMode);
    ui.aircraftPicker.classList.toggle('is-hidden', droneMode);
    setText(ui.matchMode, droneMode ? "Drone mode" : `Airplane · ${AIRCRAFT_MODELS.find((model) => model.id === aircraftModel).hudLabel}`);
    for (let index = 0; index < players.length; index++) {
      setText(ui.altitudeLabel[index], droneMode ? "HGT" : "ALT");
      setText(ui.speedLabel[index], "SPD");
      setText(ui.pitchLabel[index], droneMode ? "F/B" : "P");
      setText(ui.rollLabel[index], droneMode ? "L/R" : "R");
      setText(ui.respawnVehicle[index], droneMode ? "Drone rebuilding" : "Aircraft rebuilding");
    }
    ui.modeInputs[0].checked = !droneMode;
    ui.modeInputs[1].checked = droneMode;
  }

  function selectAircraftModel(modelId) {
    if (!AIRCRAFT_MODELS.some((model) => model.id === modelId)) return;
    aircraftModel = modelId;
    localStorage.setItem?.('simulatorAircraftModel', modelId);
    for (const player of players) player.vehicles.airplane.setModel(modelId);
    ui.aircraftModel.value = modelId;
    if (gameMode === 'airplane') {
      setText(ui.matchMode, `Airplane · ${AIRCRAFT_MODELS.find((model) => model.id === modelId).hudLabel}`);
      updateHUD();
    }
  }

  function createRemoteLogRow(entry) {
    const row = document.createElement("li");
    row.className = `remote-log__line remote-log__line--p${entry.player} remote-log__line--${entry.kind}`;
    const time = document.createElement("time");
    const player = document.createElement("b");
    const message = document.createElement("code");
    time.textContent = entry.time;
    player.textContent = `P${entry.player}`;
    message.textContent = entry.message;
    row.append(time, player, message);
    return row;
  }

  function renderRemoteLog(reset = false) {
    remoteLogDirty = false;
    if (reset || !remoteLogEntries.length) {
      ui.remoteLogLines.replaceChildren();
      renderedLogId = 0;
    }
    for (const entry of remoteLogEntries) {
      if (entry.id <= renderedLogId) continue;
      ui.remoteLogLines.appendChild(createRemoteLogRow(entry));
      renderedLogId = entry.id;
    }
    while (ui.remoteLogLines.children.length > maximumLogEntries) ui.remoteLogLines.firstElementChild.remove();
    ui.remoteLogEmpty.classList.toggle("is-hidden", remoteLogEntries.length > 0);
    ui.remoteLogLines.classList.toggle("is-hidden", remoteLogEntries.length === 0);
    ui.remoteLogLines.scrollTop = ui.remoteLogLines.scrollHeight;
  }

  function appendRemoteLog(playerIndex, event) {
    if (remoteLogPaused) return;
    const current = new Date();
    const time = `${current.toLocaleTimeString("en-GB", { hour12: false })}.${String(current.getMilliseconds()).padStart(3, "0")}`;
    const entry = {
      id: ++nextLogId,
      player: playerIndex + 1,
      kind: event.kind || "status",
      message: event.message || "unknown event",
      time
    };
    remoteLogEntries.push(entry);
    if (remoteLogEntries.length > maximumLogEntries) remoteLogEntries.shift();

    remoteLogDirty = true;
  }

  function toggleRemoteLog(forceOpen) {
    const shouldOpen = forceOpen ?? ui.remoteLog.classList.contains("is-hidden");
    ui.remoteLog.classList.toggle("is-hidden", !shouldOpen);
    if (shouldOpen) renderRemoteLog(true);
  }

  function validIPv4(address) {
    const parts = address.trim().split(".");
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  }

  function connectPlayer(index) {
    const ip = savedIPs[index];
    if (!validIPv4(ip)) return;
    const player = players[index];
    player.remote?.disconnect();
    player.remote = new MotionRemote(
      `ws://${ip}:81`,
      (state) => { player.pendingConnection = state; },
      (packet) => {
        player.controls.pitch = packet.pitch;
        // Keep raw sensor signs here. Each vehicle mode owns its orientation.
        player.controls.roll = packet.roll;
        player.controls.yawRate = packet.yawRate;
      },
      (fire) => {
        player.controls.fire = fire.held;
        if (fire.newPress) player.pendingShots = Math.min(player.pendingShots + 1, MAX_BULLETS_PER_PLAYER);
      },
      (message) => { if (message === "CALIBRATED") player.pendingCalibration = true; },
      (event) => appendRemoteLog(index, event)
    );
    player.remote.connect();
  }

  function setConnection(index, state) {
    const player = players[index];
    player.connection = state;
    const tag = ui.connection[index];
    tag.className = "connection-tag";
    if (state === "connected") {
      tag.classList.add("connection-tag--online");
      tag.querySelector("span").textContent = "Connected";
      ui.setupStatus[index].textContent = "Connected";
    } else if (state === "stale") {
      tag.classList.add("connection-tag--stale");
      tag.querySelector("span").textContent = "Signal stale";
      ui.setupStatus[index].textContent = "Signal stale";
      player.controls.fire = false;
    } else if (state === "connecting") {
      tag.classList.add("connection-tag--trying");
      tag.querySelector("span").textContent = "Connecting";
      ui.setupStatus[index].textContent = "Connecting";
    } else {
      tag.classList.add("connection-tag--offline");
      tag.querySelector("span").textContent = "Disconnected";
      ui.setupStatus[index].textContent = savedIPs[index] ? "Retrying" : "Not configured";
      Object.assign(player.controls, { pitch: 0, roll: 0, yawRate: 0, fire: false });
    }
    updateViewMode();
  }

  function playerIsPresent(player) {
    return player.connection === "connected" || player.connection === "stale";
  }

  function updateViewMode() {
    const split = players.every(playerIsPresent);
    document.body.classList.toggle("is-split", split);
    ui.divider.classList.toggle("is-hidden", !split);
    ui.hud[0].classList.toggle("is-hidden", !split && playerIsPresent(players[1]));
    ui.hud[1].classList.toggle("is-hidden", !split && !playerIsPresent(players[1]));
    // Split screen draws the scene twice, so use native 1x rendering on Pi.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, split ? PERFORMANCE.splitPixelRatio : PERFORMANCE.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function saveAndConnect() {
    const newIPs = ui.remoteIP.map((input) => input.value.trim());
    if (!validIPv4(newIPs[0]) && !validIPv4(newIPs[1])) {
      showToast("Enter at least one valid ESP32 IP address");
      return;
    }
    if (newIPs[0] && newIPs[0] === newIPs[1]) {
      showToast("Player 1 and Player 2 need different ESP32 IP addresses");
      return;
    }
    const invalid = newIPs.findIndex((ip) => ip && !validIPv4(ip));
    if (invalid !== -1) { showToast(`Player ${invalid + 1} IP address is not valid`); return; }
    newIPs.forEach((ip, index) => {
      localStorage.setItem(`esp32RemoteIP${index + 1}`, ip);
    });
    showToast("Remote addresses saved — reconnecting");
    window.setTimeout(() => window.location.reload(), 500);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.remove("is-hidden");
    toastTimer = window.setTimeout(() => ui.toast.classList.add("is-hidden"), 2500);
  }

  function calibrate(index) {
    if (players[index].remote?.send("CALIBRATE")) showToast(`Calibration sent to Player ${index + 1}`);
    else showToast(`Player ${index + 1} remote is offline`);
  }

  function fireBullet(index, immediate = false) {
    const fired = weapons.fire(index, gameTime, matchPaused, immediate);
    if (fired) audio.playShot(index);
    return fired;
  }
  const removeBullet = (index) => weapons.remove(index);
  const updateBulletVisuals = () => weapons.updateVisuals();

  function damagePlayer(targetIndex, attackerIndex) {
    const target = players[targetIndex];
    if (!target.flight.alive || gameTime < target.invulnerableUntil || matchPaused) return;
    target.health = Math.max(0, target.health - 20);
    audio.playHit();
    showHitMarker(attackerIndex);
    if (target.health > 0) return;

    target.flight.setAlive(false);
    target.respawnAt = gameTime + 3;
    createExplosion(target.flight.object.position, targetIndex);
    players[attackerIndex].score += 1;

    if (players[attackerIndex].score >= winningScore) finishMatch(attackerIndex);
  }

  function crashPlayer(playerIndex) {
    const player = players[playerIndex];
    if (!player.flight.alive || matchPaused) return;
    player.health = 0;
    player.flight.setAlive(false);
    player.respawnAt = gameTime + 3;
    createExplosion(player.flight.object.position, playerIndex);
    ui.matchStatus.textContent = `Player ${playerIndex + 1} crashed`;
    window.setTimeout(() => {
      if (!matchPaused) ui.matchStatus.textContent = "Training match";
    }, 1500);
  }

  function checkBuildingCollisions() {
    players.forEach((player, playerIndex) => {
      if (!player.flight.alive) return;
      const position = player.flight.object.position;
      const radius = player.flight.collisionRadius;
      for (const box of buildingColliders) {
        const collided = radius > 0
          ? sphereIntersectsBounds(position, radius, box)
          : position.x >= box.minX && position.x <= box.maxX &&
            position.y >= box.minY && position.y <= box.maxY &&
            position.z >= box.minZ && position.z <= box.maxZ;
        if (collided) {
          crashPlayer(playerIndex);
          break;
        }
      }
    });
  }

  function showHitMarker(playerIndex) {
    const marker = ui.hitMarker[playerIndex];
    marker.classList.add("is-active");
    window.setTimeout(() => marker.classList.remove("is-active"), 130);
  }

  function createExplosion(position, playerIndex) {
    explosions.start(position, playerIndex, gameTime);
    audio.playExplosion();
  }

  function finishMatch(winnerIndex) {
    matchPaused = true;
    rematchAt = gameTime + 3;
    ui.winnerText.textContent = `Player ${winnerIndex + 1} wins`;
    ui.matchResult.classList.remove("is-hidden");
    ui.matchStatus.textContent = "Match complete";
  }

  function resetMatch() {
    clearProjectiles();
    explosions.clear();
    players.forEach((player) => {
      player.pendingShots = 0;
      player.lastShotAt = -1;
      player.controls.fire = false;
      player.score = 0;
      player.health = 100;
      player.respawnAt = 0;
      player.invulnerableUntil = gameTime + 2;
      player.flight.reset();
    });
    matchPaused = false;
    ui.matchResult.classList.add("is-hidden");
    ui.matchStatus.textContent = "Training match";
  }

  function clearProjectiles() {
    weapons.clear();
    updateBulletVisuals();
  }

  function updateCombat(deltaTime) {
    players.forEach((player, index) => {
      const pending = player.pendingShots;
      player.pendingShots = 0;
      for (let press = 0; press < pending; press++) fireBullet(index, true);
      if (player.controls.fire) fireBullet(index);
    });

    for (let index = bullets.length - 1; index >= 0; index--) {
      const bullet = bullets[index];
      bullet.previous.copy(bullet.position);
      bullet.position.addScaledVector(bullet.direction, BULLET_SPEED * deltaTime);
      if (gameTime >= bullet.expiresAt) { removeBullet(index); continue; }
      const targetIndex = bullet.owner === 0 ? 1 : 0;
      const target = players[targetIndex];
      if (target.flight.alive && segmentHitsSphere(bullet.previous, bullet.position, target.flight.object.position, 30)) {
        removeBullet(index);
        damagePlayer(targetIndex, bullet.owner);
      }
    }
    updateBulletVisuals();

    explosions.update(deltaTime, gameTime);

    players.forEach((player) => {
      if (!player.flight.alive && !matchPaused && gameTime >= player.respawnAt) {
        player.health = 100;
        player.invulnerableUntil = gameTime + 2;
        player.flight.reset();
      }
      if (player.flight.alive && gameTime < player.invulnerableUntil) {
        player.flight.object.visible = Math.floor(gameTime * 10) % 2 === 0;
      } else if (player.flight.alive) {
        player.flight.object.visible = true;
      }
    });

    if (matchPaused) {
      const remaining = Math.max(0, Math.ceil(rematchAt - gameTime));
      ui.rematchCountdown.textContent = remaining;
      if (gameTime >= rematchAt) resetMatch();
    }
  }

  function latestControls(player, index) {
    let pitch = player.controls.pitch;
    let roll = player.controls.roll;
    let yawRate = player.controls.yawRate;
    let keyboard = false;

    // A stale stream returns toward neutral and cannot leave the gun stuck on.
    if (player.connection === "stale") {
      pitch = 0;
      roll = 0;
      yawRate = 0;
      player.controls.fire = false;
    }

    // Keyboard fallback controls Player 1 whenever its remote is unavailable.
    if (index === 0 && player.connection !== "connected" && player.connection !== "stale") {
      const vertical = gameMode === "drone"
        ? (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0)
        : (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
      pitch = vertical * CONTROLLER_MAX_ANGLE;
      roll = ((keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0)) * CONTROLLER_MAX_ANGLE;
      yawRate = 0;
      keyboard = true;
      player.controls.fire = keys.Space;
    }
    player.input.pitch = pitch;
    player.input.roll = roll;
    player.input.yawRate = yawRate;
    player.input.keyboard = keyboard;
    return player.input;
  }

  function updateFlights(deltaTime) {
    if (matchPaused) return;
    players.forEach((player, index) => {
      const input = latestControls(player, index);
      // The ESP32 and aircraft already provide light filtering. Applying a
      // third input filter here made steering visibly trail the controller.
      if (gameMode === "airplane") {
        let pitch = THREE.MathUtils.clamp(input.pitch / CONTROLLER_MAX_ANGLE, -1, 1) * AIRPLANE_PITCH_INVERSION;
        let roll = THREE.MathUtils.clamp(input.roll / CONTROLLER_MAX_ANGLE, -1, 1);
        if (!input.keyboard) roll *= AIRPLANE_ROLL_INVERSION;
        if (Math.abs(pitch) < 0.025) pitch = 0;
        if (Math.abs(roll) < 0.025) roll = 0;
        player.flight.update(deltaTime, pitch, roll, input.yawRate);
      } else {
        // Keyboard values are already action-oriented; cancel the physical
        // mounting inversions that DronePhysics applies to raw remote angles.
        const pitch = input.keyboard ? input.pitch * DRONE_FORWARD_INVERSION : input.pitch;
        const roll = input.keyboard ? input.roll * DRONE_STRAFE_INVERSION : input.roll;
        player.flight.update(deltaTime, pitch, roll, 0);
      }
    });
  }

  function renderViews() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const split = players.every(playerIsPresent);
    renderer.info.reset();

    let activeCamera;
    if (split) {
      const half = Math.floor(width / 2);
      players.forEach((player, index) => {
        const viewportWidth = index === 0 ? half : width - half;
        const left = index === 0 ? 0 : half;
        updateAspect(player.camera, viewportWidth / height);
        renderer.setViewport(left, 0, viewportWidth, height);
        renderer.setScissor(left, 0, viewportWidth, height);
        renderer.render(scene, player.camera);
      });
      activeCamera = players[0].camera;
    } else {
      const active = playerIsPresent(players[1]) ? players[1] : players[0];
      updateAspect(active.camera, width / height);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.render(scene, active.camera);
      activeCamera = active.camera;
    }

    /* CSS2D labels — only rendered for Kolar map */
    if (isKolarMap && labelObjects.length > 0) {
      // Distance-cull labels: hide if > 800 m from camera
      const camPos = activeCamera.position;
      for (const obj of labelObjects) {
        const dx = obj.position.x - camPos.x;
        const dz = obj.position.z - camPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        obj.visible = dist < 800;
      }
      labelRenderer.render(scene, activeCamera);
    }
  }

  const updateHUD = createHUD(ui, players, () => ({ gameTime, matchPaused, gameMode }));

  const loop = new GameLoop((deltaTime) => {
    gameTime += deltaTime;
    players.forEach((player, index) => {
      player.remote?.checkHealth();
      if (player.pendingConnection !== null) {
        setConnection(index, player.pendingConnection);
        player.pendingConnection = null;
      }
      if (player.pendingCalibration) {
        showToast(`Player ${index + 1} remote calibrated`);
        player.pendingCalibration = false;
      }
    });
    updateFlights(deltaTime);
    checkBuildingCollisions();
    updateCombat(deltaTime);
    audioTimer += deltaTime;
    if (audioTimer >= 1 / AUDIO_UPDATE_HZ) {
      audioTimer = 0;
      for (let index = 0; index < players.length; index++) {
        audiblePlayers[index] = !matchPaused && (playerIsPresent(players[index]) ||
          (index === 0 && !playerIsPresent(players[1])));
      }
      audio.update(players, gameMode, gameTime, audiblePlayers);
    }
    for (const player of players) if (player.flight.alive) player.flight.updateCamera(deltaTime);
    hudTimer += deltaTime;
    if (hudTimer >= 1 / HUD_UPDATE_HZ) {
      hudTimer = 0;
      updateHUD();
      if (remoteLogDirty && !ui.remoteLog.classList.contains("is-hidden")) renderRemoteLog();
    }
  }, renderViews, (stats) => {
    if (!ui.networkDebug.classList.contains("is-hidden")) {
      setText(document.getElementById("debug-performance"),
        `FPS ${stats.fps.toFixed(0)} · FRAME ${stats.frameMs.toFixed(1)}ms · UPDATE ${stats.updateMs.toFixed(1)}ms · RENDER ${stats.renderMs.toFixed(1)}ms · CALLS ${renderer.info.render.calls} · TRIANGLES ${renderer.info.render.triangles}`);
    }
  });

  document.getElementById("connect-button").addEventListener("click", () => {
    try { saveAndConnect(); } catch (error) { if (error.message !== "invalid-ip") throw error; }
  });
  document.getElementById("start-button").addEventListener("click", () => {
    audio.start();
    updateSoundControls();
    ui.startScreen.classList.add("is-hidden");
  });
  ui.soundEnabled.addEventListener('change', () => setSoundEnabled(ui.soundEnabled.checked));
  ui.soundButton.addEventListener('click', () => setSoundEnabled(audio.muted));
  ui.modeInputs.forEach((input) => input.addEventListener("change", () => {
    if (input.checked) selectGameMode(input.value);
  }));
  ui.aircraftModel.addEventListener('change', () => selectAircraftModel(ui.aircraftModel.value));
  document.getElementById("calibrate-1").addEventListener("click", () => calibrate(0));
  document.getElementById("calibrate-2").addEventListener("click", () => calibrate(1));
  document.getElementById("reset-button").addEventListener("click", resetMatch);
  document.getElementById("log-button").addEventListener("click", () => toggleRemoteLog());
  document.getElementById("log-close").addEventListener("click", () => toggleRemoteLog(false));
  document.getElementById("log-clear").addEventListener("click", () => {
    remoteLogEntries.length = 0;
    renderRemoteLog();
  });
  ui.logPause.addEventListener("click", () => {
    remoteLogPaused = !remoteLogPaused;
    ui.logPause.textContent = remoteLogPaused ? "Resume" : "Pause";
    showToast(remoteLogPaused ? "Remote log paused" : "Remote log resumed");
  });
  document.getElementById("log-copy").addEventListener("click", async () => {
    if (!remoteLogEntries.length) {
      showToast("Remote log is empty");
      return;
    }
    const text = remoteLogEntries
      .map((entry) => `${entry.time} P${entry.player} ${entry.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Remote log copied");
    } catch (error) {
      showToast("Browser blocked copying; select the log manually");
    }
  });
  document.getElementById("fullscreen-button").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) { showToast("Fullscreen is not available in this browser"); }
  });

  window.addEventListener("keydown", (event) => {
    if (event.target.matches?.("input, textarea, [contenteditable='true']")) return;
    if (Object.prototype.hasOwnProperty.call(keys, event.code)) {
      keys[event.code] = true;
      event.preventDefault();
    } else if (Object.prototype.hasOwnProperty.call(keys, event.key)) {
      keys[event.key] = true;
      event.preventDefault();
    }
    if (event.code === "Space" && !event.repeat && !playerIsPresent(players[0])) {
      players[0].pendingShots++;
    }
    if (event.key.toLowerCase() === "r") resetMatch();
    if (event.key.toLowerCase() === "d" && !event.repeat) {
      ui.networkDebug.classList.toggle("is-hidden");
    }
    if (event.key.toLowerCase() === "l" && !event.repeat) toggleRemoteLog();
    if (event.key.toLowerCase() === 'm' && !event.repeat) setSoundEnabled(audio.muted);
  });
  window.addEventListener("keyup", (event) => {
    if (Object.prototype.hasOwnProperty.call(keys, event.code)) keys[event.code] = false;
    if (Object.prototype.hasOwnProperty.call(keys, event.key)) keys[event.key] = false;
  });
  window.addEventListener("blur", () => Object.keys(keys).forEach((key) => { keys[key] = false; }));
  window.addEventListener("resize", () => {
    const split = players.every(playerIsPresent);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, split ? PERFORMANCE.splitPixelRatio : PERFORMANCE.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* World map radio buttons */
  worldMapInput.forEach((input) => {
    if (!input) return;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      const mapType = input.value;
      localStorage.setItem("simulatorWorldMap", mapType);
      buildWorld(mapType);
      resetMatch();
      applySpawnFromWorld();
      showToast(mapType === "kolar" ? "Kolar Road Map loaded" : "Arcade Town loaded");
    });
  });

  ui.aircraftModel.value = aircraftModel;
  updateSoundControls();
  selectGameMode(gameMode);
  savedIPs.forEach((ip, index) => { if (validIPv4(ip)) connectPlayer(index); });
  updateViewMode();
  updateHUD();
  loop.start();
  window.addEventListener("pagehide", () => {
    loop.stop();
    audio.suspend();
    for (const player of players) player.remote?.disconnect();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    audio.start();
    for (const player of players) if (player.remote) { player.remote.shouldReconnect = true; player.remote.connect(); }
    loop.start();
  });
}
