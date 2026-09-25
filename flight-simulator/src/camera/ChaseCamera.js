import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera, aircraft) {
    this.camera = camera;
    this.aircraft = aircraft;
    this.offset = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.look = new THREE.Vector3();
  }
  targets() {
    this.offset.set(0, 6.5, 17).applyQuaternion(this.aircraft.quaternion);
    this.position.copy(this.aircraft.position).add(this.offset);
    this.target.set(0, 1.2, -9).applyQuaternion(this.aircraft.quaternion).add(this.aircraft.position);
  }
  snap() {
    this.targets();
    this.camera.position.copy(this.position);
    this.look.copy(this.target);
    this.camera.lookAt(this.look);
  }
  update(dt) {
    this.targets();
    this.camera.position.lerp(this.position, 1 - Math.exp(-16 * dt));
    this.look.lerp(this.target, 1 - Math.exp(-20 * dt));
    this.camera.lookAt(this.look);
  }
}
