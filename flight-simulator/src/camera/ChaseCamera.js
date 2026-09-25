import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera, aircraft, options = {}) {
    this.camera = camera;
    this.aircraft = aircraft;
    this.headingOnly = options.headingOnly ?? false;
    this.height = options.height ?? 6.5;
    this.distance = options.distance ?? 17;
    this.lookHeight = options.lookHeight ?? 1.2;
    this.lookDistance = options.lookDistance ?? 9;
    this.offset = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.orientation = new THREE.Quaternion();
  }
  targets() {
    if (this.headingOnly) this.orientation.setFromAxisAngle(ChaseCamera.UP, this.aircraft.rotation.y);
    else this.orientation.copy(this.aircraft.quaternion);
    this.offset.set(0, this.height, this.distance).applyQuaternion(this.orientation);
    this.position.copy(this.aircraft.position).add(this.offset);
    this.target.set(0, this.lookHeight, -this.lookDistance).applyQuaternion(this.orientation).add(this.aircraft.position);
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

ChaseCamera.UP = new THREE.Vector3(0, 1, 0);
