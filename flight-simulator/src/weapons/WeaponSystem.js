import * as THREE from 'three';
import { MAX_BULLETS_PER_PLAYER, FIRE_INTERVAL, BULLET_LIFETIME } from '../utils/Constants.js';

export class WeaponSystem {
  constructor(scene, players) {
    this.players = players;
    this.bullets = [];
    this.free = [];
    this.counts = new Uint16Array(players.length);
    this.activeCounts = new Uint16Array(players.length);
    // Allocate once; pressing fire only borrows vectors from this fixed pool.
    for (let i = 0; i < MAX_BULLETS_PER_PLAYER * players.length; i++) {
      this.free.push({ position: new THREE.Vector3(), previous: new THREE.Vector3(), direction: new THREE.Vector3(), owner: 0, expiresAt: 0 });
    }
    this.geometries = players.map((player, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_BULLETS_PER_PLAYER * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setDrawRange(0, 0);
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: index === 0 ? 0x55a7ff : 0xff5966, size: 2.1, sizeAttenuation: true }));
      // Positions move in world space; a cached bounding sphere would hide shots.
      points.frustumCulled = false;
      scene.add(points);
      return geometry;
    });
  }
  fire(index, now, paused, immediate = false) {
    const player = this.players[index];
    if (!player.flight.alive || paused || now < player.invulnerableUntil) return false;
    if (!immediate && now - player.lastShotAt < FIRE_INTERVAL) return false;
    if (!this.free.length || this.activeCounts[index] >= MAX_BULLETS_PER_PLAYER) return false;
    player.lastShotAt = now;
    const bullet = this.free.pop();
    bullet.direction.set(0, 0, -1).applyQuaternion(player.flight.airplane.quaternion).normalize();
    bullet.position.copy(player.flight.airplane.position).addScaledVector(bullet.direction, 6);
    bullet.previous.copy(bullet.position);
    bullet.owner = index;
    bullet.expiresAt = now + BULLET_LIFETIME;
    this.bullets.push(bullet);
    this.activeCounts[index]++;
    return true;
  }
  remove(index) {
    const bullet = this.bullets[index];
    const last = this.bullets.pop();
    if (index < this.bullets.length) this.bullets[index] = last;
    this.activeCounts[bullet.owner]--;
    this.free.push(bullet);
  }
  clear() { while (this.bullets.length) this.remove(this.bullets.length - 1); }
  updateVisuals() {
    this.counts.fill(0);
    for (const bullet of this.bullets) {
      const offset = this.counts[bullet.owner]++ * 3;
      const array = this.geometries[bullet.owner].attributes.position.array;
      array[offset] = bullet.position.x;
      array[offset + 1] = bullet.position.y;
      array[offset + 2] = bullet.position.z;
    }
    for (let i = 0; i < this.geometries.length; i++) {
      const geometry = this.geometries[i];
      geometry.setDrawRange(0, this.counts[i]);
      if (this.counts[i]) {
        geometry.attributes.position.clearUpdateRanges();
        geometry.attributes.position.addUpdateRange(0, this.counts[i] * 3);
        geometry.attributes.position.needsUpdate = true;
      }
    }
  }
}
