// Headless integration: real game/Three.js objects, stubbed DOM and renderer.
// This exercises orchestration, not WebGL output or a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('game integrates two controllers, brief taps, damage, respawn, winner, rematch and keyboard', async () => {
  class Element {
    textContent = ''; style = {}; children = []; value = ''; handlers = {};
    classes = new Set();
    classList = {
      add: (...items) => items.forEach(item => this.classes.add(item)),
      remove: (...items) => items.forEach(item => this.classes.delete(item)),
      contains: item => this.classes.has(item),
      toggle: (item, force = !this.classes.has(item)) => { force ? this.classes.add(item) : this.classes.delete(item); return force; }
    };
    addEventListener(name, fn) { (this.handlers[name] ??= []).push(fn); }
    async emit(name, event = {}) { for (const fn of this.handlers[name] ?? []) await fn(event); }
    appendChild(child) { this.children.push(child); child.parent = this; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = children; }
    querySelector(selector) { return this[selector] ??= new Element(); }
    get firstElementChild() { return this.children[0]; }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  }
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  globalThis.document = { getElementById: element, createElement: () => new Element(), body: new Element(), documentElement: new Element() };
  for (const id of ['network-debug', 'remote-log', 'match-result']) element(id).classList.add('is-hidden');
  globalThis.window = new Element();
  Object.assign(window, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, setTimeout, clearTimeout });
  globalThis.localStorage = { getItem: key => key.endsWith('1') ? '192.168.1.45' : '192.168.1.46' };
  const sockets = [];
  globalThis.WebSocket = class extends Element {
    static CONNECTING = 0; static OPEN = 1;
    readyState = 0;
    constructor() { super(); sockets.push(this); }
    send() {}
    close() { this.readyState = 3; void this.emit('close'); }
  };
  let callback, time = performance.now(), lastScene, renders = 0;
  globalThis.requestAnimationFrame = fn => { callback = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.__flightTestRenderer = {
    domElement: new Element(), setSize() {}, setPixelRatio() {}, setViewport() {}, setScissor() {},
    render(scene) { lastScene = scene; renders++; },
    info: { reset() {}, render: { calls: 0, triangles: 0 } }
  };
  const sourceURL = new URL('../src/core/Game.js', import.meta.url);
  const rendererSource = 'export const createRenderer = () => globalThis.__flightTestRenderer; export const updateAspect = (camera, aspect) => { camera.aspect = aspect; };';
  const source = (await readFile(sourceURL, 'utf8')).replace(/from '([^']+)'/g, (match, spec) => {
    const url = spec === './Renderer.js' ? 'data:text/javascript,' + encodeURIComponent(rendererSource)
      : spec.startsWith('.') ? new URL(spec, sourceURL).href : import.meta.resolve(spec);
    return `from '${url}'`;
  });
  // Base64 avoids quote escaping in the rewritten module's import specifiers.
  const { startGame } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  startGame();
  const step = (count = 1) => { for (let i = 0; i < count; i++) { time += 50; callback(time); } };
  try {
    for (const socket of sockets) { socket.readyState = 1; await socket.emit('open'); }
    step();
    assert.equal(document.body.classList.contains('is-split'), true);
    assert.equal(renders, 2);
    const planes = lastScene.children.filter(child => child.name === 'airplane');
    const airplaneStartX = planes[0].position.x;
    await sockets[0].emit('message', { data: JSON.stringify({ type: 'motion', seq: 1, p: 0, r: -45, y: 0 }) });
    step(5);
    assert.ok(planes[0].position.x > airplaneStartX, 'mounted remote roll still turns the airplane right');
    await sockets[0].emit('message', { data: JSON.stringify({ type: 'motion', seq: 2, p: 0, r: 0, y: 0 }) });
    await element('reset-button').emit('click');
    step(42);
    let fireSeq = 0;
    const hit = async () => {
      planes[0].position.set(0, 70, 10);
      planes[1].position.set(0, 70, 0);
      await sockets[0].emit('message', { data: JSON.stringify({ type: 'fire', pressed: true, fireSeq: ++fireSeq }) });
      await sockets[0].emit('message', { data: JSON.stringify({ type: 'fire', pressed: false, fireSeq }) });
      step();
    };
    for (let score = 1; score <= 5; score++) {
      for (let hitNumber = 0; hitNumber < 5; hitNumber++) await hit();
      step(3);
      assert.equal(element('score-1').textContent, String(score));
      assert.equal(element('health-number-2').textContent, '0');
      if (score < 5) {
        step(62);
        assert.equal(element('health-number-2').textContent, '100');
        await hit(); step(3);
        assert.equal(element('health-number-2').textContent, '100', 'spawn protection rejects damage');
        step(42);
      }
    }
    assert.equal(element('winner-text').textContent, 'Player 1 wins');
    assert.equal(element('match-result').classList.contains('is-hidden'), false);
    step(64);
    assert.equal(element('score-1').textContent, '0');
    assert.equal(element('match-result').classList.contains('is-hidden'), true);
    for (const socket of sockets) socket.close();
    step(44);
    assert.equal(document.body.classList.contains('is-split'), false);
    const x = planes[0].position.x;
    const key = { target: {}, preventDefault() {}, code: 'ArrowRight', key: 'ArrowRight', repeat: false };
    await window.emit('keydown', key); step(5); await window.emit('keyup', key);
    assert.ok(planes[0].position.x > x);
    const space = { ...key, code: 'Space', key: ' ' };
    await window.emit('keydown', space); await window.emit('keyup', space); step();
    assert.ok(lastScene.children.some(child => child.isPoints && child.geometry.drawRange.count > 0));
    const city = lastScene.children.find(child => child.name === 'Low-poly town');
    const box = city.userData.buildingColliders[0];
    planes[0].position.set((box.minX + box.maxX) / 2, 8, (box.minZ + box.maxZ) / 2);
    step(3);
    assert.equal(element('health-number-1').textContent, '0', 'building collision crashes aircraft');

    const droneMode = element('game-mode-drone');
    droneMode.value = 'drone';
    droneMode.checked = true;
    await droneMode.emit('change');
    step();
    const drones = lastScene.children.filter(child => child.name === 'drone');
    assert.equal(drones.length, 2);
    assert.equal(drones[0].visible, true);
    assert.equal(planes[0].visible, false);
    assert.equal(element('match-mode').textContent, 'Drone mode');
    const droneStart = drones[0].position.clone();
    await window.emit('keydown', { ...key, code: 'ArrowUp', key: 'ArrowUp' });
    await window.emit('keydown', { ...key, code: 'ArrowRight', key: 'ArrowRight' });
    step(12);
    await window.emit('keyup', { ...key, code: 'ArrowUp', key: 'ArrowUp' });
    await window.emit('keyup', { ...key, code: 'ArrowRight', key: 'ArrowRight' });
    assert.ok(drones[0].position.x > droneStart.x, 'drone keyboard input strafes right');
    assert.ok(drones[0].position.z < droneStart.z, 'drone keyboard input moves forward');
  } finally {
    await window.emit('pagehide');
    delete globalThis.__flightTestRenderer;
  }
});
