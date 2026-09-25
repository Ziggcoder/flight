import * as THREE from 'three';
import { WEBSOCKET_RECONNECT_MS as REMOTE_RECONNECT_MS } from '../utils/Constants.js';
/*
  Low-latency ESP32 WebSocket connection.

  Each MotionRemote owns its own sequence checks, heartbeat and statistics, so
  a slow or disconnected Player 2 can never delay Player 1.
*/

const REMOTE_HEARTBEAT_MS = 1000;
const REMOTE_STALE_MS = 500;
const REMOTE_TIMEOUT_MS = 3000;


export function sequenceIsNewer(next, previous) {
  if (previous === null) return true;
  const difference = (next - previous) >>> 0;
  return difference !== 0 && difference < 0x80000000;
}

export class MotionRemote {
  constructor(url, onStatusChange, onMotionPacket, onFireChange, onMessage, onLog = () => {}) {
    this.url = url;
    this.onStatusChange = onStatusChange;
    this.onMotionPacket = onMotionPacket;
    this.onFireChange = onFireChange;
    this.onMessage = onMessage;
    this.onLog = onLog;

    this.socket = null;
    this.reconnectTimer = null;
    this.connectStarted = 0;
    this.fireSuspended = false;
    this.motion = { pitch: 0, roll: 0, yawRate: 0, sequence: null, deviceMs: null };
    this.shouldReconnect = true;
    this.status = "disconnected";

    this.lastSequence = null;
    this.lastFireSequence = null;
    this.fireHeld = false;
    this.lastPacketTime = 0;
    this.lastPongTime = 0;
    this.lastPingTime = 0;
    this.pingNumber = 0;
    this.rttMs = null;
    this.packetCount = 0;
    this.packetsPerSecond = 0;
    this.packetWindowStarted = performance.now();
    this.deviceMs = null;
    this.acceptedMotionCount = 0;
    this.lastRejectLogTime = 0;
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange(status);
    this.onLog({ kind: "status", message: status });
  }

  connect() {
    if (!this.shouldReconnect) return;
    if (this.socket &&
        (this.socket.readyState === WebSocket.OPEN ||
         this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus("connecting");
    this.connectStarted = performance.now();
    let newSocket;
    try {
      newSocket = new WebSocket(this.url);
      this.socket = newSocket;
    } catch (error) {
      console.warn("Could not create WebSocket:", error);
      this.setStatus("disconnected");
      this.scheduleReconnect();
      return;
    }

    newSocket.addEventListener("open", () => {
      if (this.socket !== newSocket) return;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;

      const now = performance.now();
      this.lastSequence = null;
      this.lastFireSequence = null;
      this.fireHeld = false;
      this.fireSuspended = false;
      this.rttMs = null;
      this.lastPacketTime = now;
      this.lastPongTime = now;
      this.lastPingTime = 0;
      this.packetCount = 0;
      this.packetsPerSecond = 0;
      this.packetWindowStarted = now;
      this.setStatus("connected");

      this.sendPing(now);
    });

    newSocket.addEventListener("message", (event) => {
      if (this.socket === newSocket) this.handleMessage(event.data);
    });

    newSocket.addEventListener("close", () => {
      if (this.socket !== newSocket) return;
      this.socket = null;

      this.releaseFire();
      this.setStatus("disconnected");
      this.scheduleReconnect();
    });

    newSocket.addEventListener("error", () => {
      // Closing guarantees that the reconnect path runs on every browser.
      if (this.socket === newSocket) newSocket.close();
    });
  }

  checkHealth() {
    const now = performance.now();
    if (this.socket?.readyState === WebSocket.CONNECTING && now - this.connectStarted >= REMOTE_TIMEOUT_MS) {
      this.socket.close();
      return;
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    if (now - this.packetWindowStarted >= 1000) {
      const elapsedSeconds = (now - this.packetWindowStarted) / 1000;
      this.packetsPerSecond = this.packetCount / elapsedSeconds;
      this.packetCount = 0;
      this.packetWindowStarted = now;
    }

    if (now - this.lastPingTime >= REMOTE_HEARTBEAT_MS) this.sendPing(now);

    if (now - Math.max(this.lastPongTime, this.lastPacketTime) >= REMOTE_TIMEOUT_MS) {
      this.onLog({ kind: "error", message: "heartbeat timeout; reconnecting" });
      this.socket.close();
      return;
    }

    if (now - this.lastPacketTime >= REMOTE_STALE_MS) {
      if (this.fireHeld) this.fireSuspended = true;
      this.releaseFire();
      this.setStatus("stale");
    } else {
      this.setStatus("connected");
    }
  }

  sendPing(now) {
    this.lastPingTime = now;
    this.pingNumber = (this.pingNumber + 1) >>> 0;
    this.send({ type: "ping", id: this.pingNumber, clientTime: now });
    if (this.rttMs === null) this.send("PING");
  }

  handleMessage(data) {
    if (data === "PONG") {
      this.lastPongTime = performance.now();
      this.onLog({ kind: "pong", message: "legacy pong received" });
      this.onMessage("PONG");
      return;
    }
    if (data === "CALIBRATED") {
      this.onLog({ kind: "calibrated", message: "neutral position calibrated" });
      this.onMessage("CALIBRATED");
      return;
    }

    let packet;
    try {
      packet = JSON.parse(data);
    } catch (error) {

      this.onLog({ kind: "error", message: `invalid message: ${String(data).slice(0, 80)}` });
      return;
    }

    if (!packet || typeof packet !== "object" || Array.isArray(packet)) return;

    if (packet.type === "pong") {
      const now = performance.now();
      this.lastPongTime = now;
      const sentAt = Number(packet.clientTime);
      if (Number.isFinite(sentAt)) this.rttMs = Math.max(0, now - sentAt);
      this.onLog({
        kind: "pong",
        message: `pong ${this.rttMs == null ? "--" : Math.round(this.rttMs)} ms`,
        rttMs: this.rttMs
      });
      return;
    }

    if (packet.type === "calibrated") {
      this.onLog({ kind: "calibrated", message: "neutral position calibrated" });
      this.onMessage("CALIBRATED");
      return;
    }

    if (packet.type === "fire") {
      this.onLog({
        kind: "fire",
        message: `fire ${packet.pressed ? "PRESS" : "release"} seq=${packet.fireSeq ?? "--"}`
      });
      this.applyFireState(Boolean(packet.pressed), packet.fireSeq);
      return;
    }

    // Accept both the new typed format and the older compact packet format.
    if (packet.type && packet.type !== "motion") return;
    const receivedSequence = Number(packet.seq ?? packet.sequence);
    const hasSequence = Number.isFinite(receivedSequence);
    const sequence = hasSequence ? receivedSequence >>> 0 : null;
    if (hasSequence && !sequenceIsNewer(sequence, this.lastSequence)) {
      const now = performance.now();
      if (now - this.lastRejectLogTime >= 1000) {
        this.lastRejectLogTime = now;
        this.onLog({ kind: "warning", message: `rejected old/duplicate motion seq=${sequence}` });
      }
      return;
    }

    const pitch = Number(packet.p ?? packet.pitch);
    const roll = Number(packet.r ?? packet.roll);
    const yawRate = Number(packet.y ?? packet.yawRate);
    if (!Number.isFinite(pitch) || !Number.isFinite(roll) || !Number.isFinite(yawRate)) {
      this.onLog({ kind: "error", message: "motion packet has invalid p/r/y values" });
      return;
    }

    const now = performance.now();
    if (hasSequence) this.lastSequence = sequence;
    this.lastPacketTime = now;
    this.packetCount++;
    this.acceptedMotionCount++;
    this.deviceMs = Number.isFinite(Number(packet.deviceMs)) ? Number(packet.deviceMs) : null;
    if (this.status === "stale") this.setStatus("connected");

    if (Object.prototype.hasOwnProperty.call(packet, "fireHeld") ||
        Object.prototype.hasOwnProperty.call(packet, "b") ||
        Object.prototype.hasOwnProperty.call(packet, "button")) {
      const held = Object.prototype.hasOwnProperty.call(packet, "fireHeld")
        ? Boolean(packet.fireHeld)
        : Number(packet.b ?? packet.button) === 1;
      this.applyFireState(held, packet.fireSeq);
    }

    // Sample one in every 15 packets (about four lines/second at 60 pps).
    if (this.acceptedMotionCount % 15 === 1) {
      const held = Object.prototype.hasOwnProperty.call(packet, "fireHeld")
        ? Boolean(packet.fireHeld)
        : Number(packet.b ?? packet.button) === 1;
      this.onLog({
        kind: "motion",
        message: `motion seq=${sequence ?? "--"} p=${pitch.toFixed(1)} r=${roll.toFixed(1)} y=${yawRate.toFixed(1)} fire=${held ? "ON" : "off"}`
      });
    }

    this.motion.pitch = THREE.MathUtils.clamp(pitch, -45, 45);
    this.motion.roll = THREE.MathUtils.clamp(roll, -45, 45);
    this.motion.yawRate = THREE.MathUtils.clamp(yawRate, -500, 500);
    this.motion.sequence = sequence;
    this.motion.deviceMs = this.deviceMs;
    this.onMotionPacket(this.motion);
  }

  applyFireState(pressed, receivedSequence) {
    const numericSequence = Number(receivedSequence);
    const hasSequence = Number.isFinite(numericSequence);
    const sequence = hasSequence ? numericSequence >>> 0 : null;

    if (pressed) {
      if (hasSequence) {
        // A fresh snapshot can resume a held trigger after a temporary stale link.
        // It must not manufacture another press for the same fire sequence.
        if (sequence === this.lastFireSequence && this.fireSuspended) {
          this.fireSuspended = false;
          this.fireHeld = true;
          this.onFireChange({ held: true, newPress: false, sequence });
          return;
        }
        if (!sequenceIsNewer(sequence, this.lastFireSequence)) return;
        this.lastFireSequence = sequence;
      } else if (this.fireHeld) {
        return;
      }
      this.fireHeld = true;
      this.fireSuspended = false;
      this.onFireChange({ held: true, newPress: true, sequence });
      return;
    }

    // The release normally carries the same fireSeq as its matching press.
    if (hasSequence && this.lastFireSequence !== null &&
        sequence !== this.lastFireSequence &&
        !sequenceIsNewer(sequence, this.lastFireSequence)) {
      return;
    }
    if (hasSequence && sequenceIsNewer(sequence, this.lastFireSequence)) {
      this.lastFireSequence = sequence;
    }
    this.fireSuspended = false;
    this.releaseFire();
  }

  releaseFire() {
    if (!this.fireHeld) return;
    this.fireHeld = false;
    this.onFireChange({ held: false, newPress: false, sequence: this.lastFireSequence });
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(typeof message === "string" ? message : JSON.stringify(message));
    return true;
  }

  scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, REMOTE_RECONNECT_MS);
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.releaseFire();
    this.setStatus("disconnected");
  }

  getDiagnostics() {
    const now = performance.now();
    return {
      status: this.status,
      pingMs: this.rttMs,
      packetsPerSecond: this.packetsPerSecond,
      sequence: this.lastSequence,
      packetAgeMs: this.lastPacketTime ? now - this.lastPacketTime : null,
      fireHeld: this.fireHeld,
      fireSequence: this.lastFireSequence
    };
  }
}
