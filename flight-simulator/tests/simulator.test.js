import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MotionRemote, sequenceIsNewer } from '../src/network/ControllerConnection.js';
import { WeaponSystem } from '../src/weapons/WeaponSystem.js';
import { ExplosionSystem } from '../src/weapons/ExplosionSystem.js';
import { ArcadeFlight } from '../src/aircraft/Aircraft.js';
import { createCity } from '../src/world/City.js';
import { segmentHitsSphere } from '../src/collision/CollisionSystem.js';
import { MAX_BULLETS_PER_PLAYER } from '../src/utils/Constants.js';
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

test('right input banks and turns right; camera and respawn reset remain valid', () => {
  const flight = players(new THREE.Scene())[0].flight;
  flight.update(0.05, 0, 1, 0);
  assert.ok(flight.airplane.rotation.z < 0);
  assert.ok(flight.airplane.position.x > -8);
  flight.updateCamera(0.05);
  assert.ok(Number.isFinite(flight.camera.position.x));
  flight.setAlive(false); flight.reset();
  assert.equal(flight.alive, true);
  assert.equal(flight.airplane.position.z, 260);
  flight.update(0.05, 0, -1, 0);
  assert.ok(flight.airplane.position.x < -8);
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
