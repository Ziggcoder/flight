import * as THREE from 'three';

// One reusable explosion per aircraft: respawn takes longer than the effect.
export class ExplosionSystem {
  constructor(scene) {
    const geometry = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    this.effects = [0x68b2ff, 0xff6672].map((color) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true });
      const pieces = Array.from({ length: 12 }, () => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.userData.velocity = new THREE.Vector3();
        scene.add(mesh);
        return mesh;
      });
      return { material, pieces, expiresAt: 0, active: false };
    });
  }
  start(position, player, now) {
    const effect = this.effects[player];
    effect.active = true;
    effect.expiresAt = now + 1;
    effect.material.opacity = 1;
    for (const piece of effect.pieces) {
      piece.position.copy(position);
      piece.rotation.set(0, 0, 0);
      piece.visible = true;
      piece.userData.velocity.set((Math.random() - 0.5) * 20, (Math.random() - 0.1) * 18, (Math.random() - 0.5) * 20);
    }
  }
  update(dt, now) {
    for (const effect of this.effects) {
      if (!effect.active) continue;
      const life = Math.max(0, effect.expiresAt - now);
      effect.material.opacity = life;
      for (const piece of effect.pieces) {
        piece.visible = life > 0;
        piece.position.addScaledVector(piece.userData.velocity, dt);
        piece.rotation.x += dt * 4;
      }
      effect.active = life > 0;
    }
  }
  clear() {
    for (const effect of this.effects) {
      effect.active = false;
      for (const piece of effect.pieces) piece.visible = false;
    }
  }
}
