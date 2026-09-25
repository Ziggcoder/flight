import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MotionRemote, sequenceIsNewer } from '../src/network/ControllerConnection.js';
import { WeaponSystem } from '../src/weapons/WeaponSystem.js';
import { ExplosionSystem } from '../src/weapons/ExplosionSystem.js';
import { ArcadeFlight } from '../src/aircraft/Aircraft.js';
import { AIRCRAFT_MODELS, createAirplaneModel } from '../src/aircraft/AircraftModel.js';
import { AIRCRAFT_DIMENSIONS_METRES, AIRCRAFT_UNITS_PER_METRE } from '../src/aircraft/AircraftScale.js';
import { ArcadeDrone } from '../src/drone/Drone.js';
import { DronePhysics, normalizeDroneAxis } from '../src/drone/DronePhysics.js';
import { createCity } from '../src/world/City.js';
import { segmentHitsSphere, sphereIntersectsBounds } from '../src/collision/CollisionSystem.js';
import { DRONE_HOVER_HEIGHT, DRONE_MAX_SPEED, MAX_BULLETS_PER_PLAYER } from '../src/utils/Constants.js';
import { GameLoop } from '../src/core/GameLoop.js';

function remote() {
  const motion = [], fire = [], statuses = [];
  const connection = new MotionRemote('ws://192.168.1.45:81', s => statuses.push(s), p => motion.push({ ...p }), p => fire.push(p), () => {});
  const send = packet => connection.handleMessage(JSON.stringify(packet));
  return { connection, motion, fire, statuses, send };
}

test('sequence checks handle duplicates, ordering and uint32 wraparound', () => {
  assert.equal(sequenceIsNewer(0, 0xffffffff), true);
  assert.equal(sequenceIsNewer(3, 3), false);
  assert.equal(sequenceIsNewer(2, 3), false);
  assert.equal(sequenceIsNewer(100, null), true);
});

test('malformed motion does not poison the sequence; legacy packets still work', () => {
  const r = remote();
  for (const packet of [null, [], 3, 'bad', { type: 'motion', seq: 1000, p: 'bad', r: 0, y: 0 }]) r.send(packet);
  r.connection.handleMessage('{');
  r.send({ type: 'motion', seq: 1, p: 12, r: -21, y: 3 });
  r.send({ type: 'motion', seq: 1, p: 45, r: 0, y: 0 });
  r.send({ p: 8, r: 5, y: 0, b: 1 });
  assert.equal(r.motion.length, 2);
  assert.equal(r.motion[0].roll, -21);
  assert.equal(r.motion[1].pitch, 8);
  assert.equal(r.connection.fireHeld, true);
});

test('two controllers retain independent state', () => {
  const a = remote(), b = remote();
  a.send({ seq: 100, p: 1, r: 2, y: 3 });
  b.send({ seq: 1, p: -1, r: -2, y: -3 });
  assert.equal(a.connection.lastSequence, 100);
  assert.equal(b.connection.lastSequence, 1);
  assert.equal(a.motion[0].pitch, 1);
  assert.equal(b.motion[0].pitch, -1);
});

test('short fire press survives release before frame; snapshot does not duplicate it', () => {
  const r = remote();
  r.send({ type: 'fire', pressed: true, fireSeq: 1 });
  r.send({ type: 'fire', pressed: false, fireSeq: 1 });
  r.send({ seq: 1, p: 0, r: 0, y: 0, fireHeld: false, fireSeq: 1 });
  r.send({ type: 'fire', pressed: true, fireSeq: 1 });
  assert.equal(r.fire.filter(f => f.newPress).length, 1);
  assert.equal(r.connection.fireHeld, false);
});

test('stale fire releases and resumes from a fresh same-sequence held snapshot', () => {
  const r = remote();
  globalThis.WebSocket = { OPEN: 1, CONNECTING: 0 };
  r.connection.socket = { readyState: 1, send() {}, close() {} };
  r.send({ seq: 1, p: 0, r: 0, y: 0, fireHeld: true, fireSeq: 1 });
  r.connection.lastPacketTime = performance.now() - 600;
  r.connection.lastPongTime = performance.now();
  r.connection.checkHealth();
  assert.equal(r.connection.fireHeld, false);
  r.send({ seq: 2, p: 0, r: 0, y: 0, fireHeld: true, fireSeq: 1 });
  assert.equal(r.connection.fireHeld, true);
  assert.equal(r.fire.filter(f => f.newPress).length, 1);
});

test('one socket per controller, old events ignored and disconnect cancels reconnect', () => {
  const sockets = [];
  globalThis.window = globalThis;
  globalThis.WebSocket = class {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 0; handlers = {};
    constructor() { sockets.push(this); }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    close() { this.readyState = 3; this.handlers.close?.(); }
    send() {}
  };
  const r = remote();
  r.connection.connect(); r.connection.connect();
  assert.equal(sockets.length, 1);
  sockets[0].readyState = 1; sockets[0].handlers.open();
  sockets[0].close();
  assert.notEqual(r.connection.reconnectTimer, null);
  r.connection.disconnect();
  assert.equal(r.connection.reconnectTimer, null);
  r.connection.connect();
  assert.equal(sockets.length, 1);
  sockets[0].handlers.message({ data: JSON.stringify({ p: 1, r: 1, y: 1 }) });
  assert.equal(r.motion.length, 0);
});

function players(scene) {
  return [1, 2].map(number => ({ flight: new ArcadeFlight(scene, new THREE.PerspectiveCamera(), number), lastShotAt: -1, invulnerableUntil: 2 }));
}

test('fixed bullet pool, local cadence, spawn protection and two batched draws', () => {
  const scene = new THREE.Scene(), pilots = players(scene), gun = new WeaponSystem(scene, pilots);
  assert.equal(gun.fire(0, 1, false, true), false);
  assert.equal(gun.fire(0, 3, true, true), false);
  assert.equal(gun.fire(0, 3, false), true);
  assert.equal(gun.fire(0, 3.01, false), false);
  assert.equal(gun.fire(0, 3.07, false), true);
  for (let i = 0; i < MAX_BULLETS_PER_PLAYER * 2; i++) gun.fire(0, 4, false, true);
  assert.equal(gun.bullets.length, MAX_BULLETS_PER_PLAYER);
  assert.equal(gun.fire(1, 4, false, true), true);
  gun.updateVisuals();
  assert.equal(gun.geometries[0].drawRange.count, MAX_BULLETS_PER_PLAYER);
  assert.equal(gun.geometries[1].drawRange.count, 1);
  assert.equal(scene.children.filter(o => o.isPoints).length, 2);
  const allocated = new Set([...gun.bullets, ...gun.free]);
  gun.clear(); gun.fire(0, 5, false, true);
  assert.equal(allocated.has(gun.bullets[0]), true);
  assert.equal(gun.free.length + gun.bullets.length, MAX_BULLETS_PER_PLAYER * 2);
});

test('swept bullet hits between endpoints and rejects nearby misses', () => {
  const a = new THREE.Vector3(-10, 0, 0), b = new THREE.Vector3(10, 0, 0);
  assert.equal(segmentHitsSphere(a, b, new THREE.Vector3(), 30), true);
  assert.equal(segmentHitsSphere(a, b, new THREE.Vector3(0, 8, 0), 30), false);
  assert.equal(segmentHitsSphere(a, a, a, 30), true);
});

test('drone input dead zone, response curve and inversion are deterministic', () => {
  assert.equal(normalizeDroneAxis(3.9), 0);
  assert.equal(normalizeDroneAxis(-4), 0);
  assert.equal(normalizeDroneAxis(45), 1);
  assert.equal(normalizeDroneAxis(-45), -1);
  assert.equal(normalizeDroneAxis(-45, -1), 1);
  assert.ok(normalizeDroneAxis(12) < normalizeDroneAxis(25));
});

test('drone accelerates diagonally, respects max speed, then smoothly hovers', () => {
  const object = new THREE.Group();
  object.position.y = DRONE_HOVER_HEIGHT;
  const physics = new DronePhysics(object);
  for (let index = 0; index < 30; index++) physics.update(0.05, 45, -45, 0);
  assert.ok(object.position.x > 0, 'raw mounted right tilt moves right');
  assert.ok(object.position.z < 0, 'forward tilt moves forward');
  assert.ok(physics.speed <= DRONE_MAX_SPEED + 1e-9);
  const movingSpeed = physics.speed;
  physics.update(0.05, 0, 0, 0);
  assert.ok(physics.speed > 0, 'neutral does not stop instantly');
  assert.ok(physics.speed < movingSpeed, 'neutral begins deceleration');
  for (let index = 0; index < 20; index++) physics.update(0.05, 0, 0, 0);
  assert.equal(physics.speed, 0);
  assert.equal(physics.isHovering(), true);
});

test('drone reset clears velocity and its heading-only camera stays finite', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const drone = new ArcadeDrone(scene, camera, 1);
  drone.update(0.05, 45, -45, 0);
  assert.ok(drone.flightSpeed > 0);
  const propellerAngle = drone.drone.userData.propellers[0].rotation.y;
  assert.ok(propellerAngle > 0);
  drone.updateCamera(0.05);
  assert.ok(Number.isFinite(camera.position.x));
  drone.reset();
  assert.equal(drone.flightSpeed, 0);
  assert.equal(drone.physics.horizontalVelocity.lengthSq(), 0);
  assert.equal(drone.drone.position.y, DRONE_HOVER_HEIGHT);
});

test('drone collision radius catches a building edge without changing point collision semantics', () => {
  const bounds = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
  assert.equal(sphereIntersectsBounds(new THREE.Vector3(-2, 5, 5), 3, bounds), true);
  assert.equal(sphereIntersectsBounds(new THREE.Vector3(-4, 5, 5), 3, bounds), false);
});

test('right input banks and turns right; camera and respawn reset remain valid', () => {
  const flight = players(new THREE.Scene())[0].flight;
  assert.equal(flight.airplane.userData.propellers.length, 2);
  flight.update(0.05, 0, 1, 0);
  assert.ok(flight.airplane.userData.propellers[0].rotation.z > 0);
  assert.ok(flight.airplane.rotation.z < 0);
  assert.ok(flight.airplane.position.x > -8);
  flight.updateCamera(0.05);
  assert.ok(Number.isFinite(flight.camera.position.x));
  flight.setAlive(false); flight.reset();
  assert.equal(flight.alive, true);
  assert.equal(flight.airplane.position.z, 260);
  assert.equal(flight.airplane.userData.propellers[0].rotation.z, 0);
  flight.update(0.05, 0, -1, 0);
  assert.ok(flight.airplane.position.x < -8);
});

test('airplane choices have the expected engine layouts and keep their forward axis', () => {
  const expectedEngines = { atr72: 0, '777max': 2, a350: 2, '737': 2, '747': 4, b2: 4, c17: 4, f16: 1 };
  for (const model of AIRCRAFT_MODELS) {
    const airplane = createAirplaneModel(model.id, 0x2488f5, 0xf0bf43);
    const size = new THREE.Box3().setFromObject(airplane).getSize(new THREE.Vector3());
    const dimensions = AIRCRAFT_DIMENSIONS_METRES[model.id];
    assert.equal(airplane.name, 'airplane');
    assert.equal(airplane.userData.modelId, model.id);
    assert.equal(airplane.getObjectsByProperty('name', 'jet-engine').length, expectedEngines[model.id]);
    assert.ok(Math.abs(size.x - dimensions.span * AIRCRAFT_UNITS_PER_METRE) < 0.001, `${model.id} wingspan`);
    assert.ok(Math.abs(size.z - dimensions.length * AIRCRAFT_UNITS_PER_METRE) < 0.001, `${model.id} length`);
    assert.ok(Math.abs(size.y - dimensions.height * AIRCRAFT_UNITS_PER_METRE) < 0.001, `${model.id} height`);
    assert.ok(airplane.userData.weaponOffset > 0);
  }
  const scene = new THREE.Scene();
  const flight = new ArcadeFlight(scene, new THREE.PerspectiveCamera(), 1);
  flight.setModel('747');
  assert.equal(flight.modelId, '747');
  assert.equal(scene.children.filter(child => child.name === 'airplane').length, 1);
  flight.update(0.05, 0, 0, 0);
  assert.ok(flight.airplane.position.z < 260);
});

test('world retains all 72 colliders and 144 trees with roads in two meshes', () => {
  const city = createCity(new THREE.Scene());
  assert.equal(city.userData.buildingColliders.length, 72);
  assert.equal(city.children.filter(o => o.isInstancedMesh && o.count === 144).length, 2);
  assert.equal(city.children.filter(o => !o.isInstancedMesh).length, 3);
  assert.equal(city.children.length, 14);
});

test('explosions reuse geometry and materials across crashes', () => {
  const scene = new THREE.Scene(), fx = new ExplosionSystem(scene), before = [...scene.children];
  fx.start(new THREE.Vector3(), 0, 0); fx.update(0.5, 0.5);
  assert.equal(fx.effects[0].material.opacity, 0.5);
  fx.update(0.5, 1); fx.start(new THREE.Vector3(1, 2, 3), 0, 2);
  assert.deepEqual(scene.children, before);
  fx.clear(); assert.ok(scene.children.every(o => !o.visible));
});

test('single RAF loop clamps a long frame and stops cleanly', () => {
  let scheduled = 0, canceled = 0, dt;
  globalThis.requestAnimationFrame = () => ++scheduled;
  globalThis.cancelAnimationFrame = () => canceled++;
  const loop = new GameLoop(value => { dt = value; }, () => {}, () => {});
  loop.start(); loop.start(); assert.equal(scheduled, 1);
  loop.frame(loop.previous + 3000); assert.equal(dt, 0.05);
  loop.stop(); assert.equal(canceled, 1);
});
