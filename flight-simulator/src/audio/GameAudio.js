// All sounds are synthesized locally. The context is created only after a
// button/key gesture, as required by browser autoplay policies.
export class GameAudio {
  constructor(playerCount = 2) {
    this.Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.supported = Boolean(this.Context);
    this.muted = false;
    this.context = null;
    this.master = null;
    this.engineLoops = [];
    this.noiseBuffer = null;
    this.lastShotAt = Array(playerCount).fill(-Infinity);
    this.nextWarningAt = Array(playerCount).fill(0);
  }

  start() {
    if (!this.supported || this.muted) return false;
    if (!this.context) {
      try {
        this.context = new this.Context();
        this.master = this.context.createGain();
        this.master.gain.value = 0.38;
        this.master.connect(this.context.destination);
        this.noiseBuffer = this.createNoiseBuffer();
        for (let i = 0; i < this.lastShotAt.length; i++) this.engineLoops.push(this.createEngineLoop());
      } catch (error) {
        this.context?.close?.()?.catch?.(() => {});
        this.context = null;
        this.supported = false;
        return false;
      }
    }
    if (this.context.state === 'suspended') this.context.resume()?.catch?.(() => {});
    return true;
  }

  suspend() {
    if (this.context?.state === 'running') this.context.suspend()?.catch?.(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.38, this.context.currentTime, 0.03);
  }

  createNoiseBuffer() {
    const length = Math.ceil(this.context.sampleRate * 0.65);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  createEngineLoop() {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    gain.gain.value = 0;
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 80;
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    return { oscillator, filter, gain, type: 'sawtooth' };
  }

  update(players, gameMode, gameTime, audible) {
    if (!this.context || this.muted || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    for (let index = 0; index < players.length; index++) {
      const player = players[index];
      const loop = this.engineLoops[index];
      const active = audible[index] && player.flight.alive;
      const speed = player.flight.flightSpeed;
      const isDrone = gameMode === 'drone';
      const turning = isDrone
        ? Math.min(1, Math.hypot(player.flight.inputForward, player.flight.inputStrafe))
        : Math.min(1, Math.abs(player.flight.rollAngle) / 0.9 + Math.abs(player.flight.pitchAngle) / 0.6);
      const isPropeller = !isDrone && player.flight.object.userData.propellers.length > 0;
      const type = isDrone ? 'triangle' : isPropeller ? 'square' : 'sawtooth';
      if (loop.type !== type) {
        loop.oscillator.type = type;
        loop.type = type;
      }
      const pitch = isDrone ? 75 + speed * 2.4 + turning * 15
        : isPropeller ? 67 + speed * 0.8 + turning * 24
          : 58 + speed * 1.3 + turning * 32;
      loop.oscillator.frequency.setTargetAtTime(pitch, now, 0.07);
      loop.filter.frequency.setTargetAtTime(isDrone ? 420 : isPropeller ? 380 : 540 + turning * 300, now, 0.1);
      loop.gain.gain.setTargetAtTime(active ? (isDrone ? 0.13 : 0.095) + turning * 0.055 : 0, now, 0.08);

      const lowAltitude = player.flight.isLowAltitude();
      if (active && gameMode === 'airplane' && lowAltitude && gameTime >= this.nextWarningAt[index]) {
        this.playWarning();
        this.nextWarningAt[index] = gameTime + 1.4;
      }
      if (!lowAltitude) this.nextWarningAt[index] = gameTime;
    }
  }

  playShot(index) {
    if (!this.ready()) return;
    const now = this.context.currentTime;
    if (now - this.lastShotAt[index] < 0.045) return;
    this.lastShotAt[index] = now;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 450;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(now);
    source.stop(now + 0.1);
  }

  playHit() {
    if (!this.ready()) return;
    this.playTone('triangle', 310, 95, 0.18, 0.16);
    this.playTone('sine', 1150, 420, 0.11, 0.045);
  }

  playExplosion() {
    if (!this.ready()) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.8;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(850, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.55);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.52, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(now);
    source.stop(now + 0.7);
    this.playTone('sine', 90, 32, 0.55, 0.34);
  }

  playWarning() {
    if (!this.ready()) return;
    this.playTone('square', 660, 520, 0.22, 0.13);
  }

  playTone(type, from, to, duration, volume) {
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  ready() {
    return this.context && !this.muted && this.context.state === 'running';
  }
}
