import { MAX_DELTA_TIME } from '../utils/Constants.js';

export class GameLoop {
  constructor(update, render, report) {
    this.update = update;
    this.render = render;
    this.report = report;
    this.running = false;
    this.frame = this.frame.bind(this);
    this.stats = { fps: 0, frameMs: 0, updateMs: 0, renderMs: 0 };
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.previous = this.windowStart = performance.now();
    this.frames = this.updateTotal = this.renderTotal = 0;
    this.id = requestAnimationFrame(this.frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.id); }
  frame(now) {
    if (!this.running) return;
    // One clock drives movement, weapons, respawns, camera and HUD.
    const dt = Math.min(Math.max((now - this.previous) / 1000, 0), MAX_DELTA_TIME);
    this.previous = now;
    const before = performance.now();
    this.update(dt);
    const updated = performance.now();
    this.render();
    this.updateTotal += updated - before;
    this.renderTotal += performance.now() - updated;
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      Object.assign(this.stats, { fps: this.frames * 1000 / elapsed, frameMs: elapsed / this.frames,
        updateMs: this.updateTotal / this.frames, renderMs: this.renderTotal / this.frames });
      this.report(this.stats);
      this.windowStart = now;
      this.frames = this.updateTotal = this.renderTotal = 0;
    }
    this.id = requestAnimationFrame(this.frame);
  }
}
