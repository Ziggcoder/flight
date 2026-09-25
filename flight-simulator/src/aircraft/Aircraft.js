import { ChaseCamera } from '../camera/ChaseCamera.js';
import * as THREE from 'three';
import { createATR72Model } from './AircraftModel.js';
import { AIRCRAFT_PROPELLER_SPEED, AIRCRAFT_SPEED, PITCH_SENSITIVITY, ROLL_SENSITIVITY, TURN_RATE } from '../utils/Constants.js';
/* Airplane geometry and deliberately simple arcade flight movement. */

export class ArcadeFlight {
  constructor(scene, camera, playerNumber) {
    this.scene = scene;
    this.camera = camera;
    this.playerNumber = playerNumber;
    this.airplane = createATR72Model(
      playerNumber === 1 ? 0x2488f5 : 0xef3d4d,
      playerNumber === 1 ? 0xf0bf43 : 0xffffff
    );
    this.object = this.airplane;
    this.mode = "airplane";
    this.collisionRadius = 0;
    this.weaponOffset = 6;
    this.scene.add(this.airplane);

    this.flightSpeed = AIRCRAFT_SPEED;
    this.startSpeed = AIRCRAFT_SPEED;
    this.minimumAltitude = 8;
    this.warningAltitude = 24;
    this.worldLimit = 690;
    this.pitchAngle = 0;
    this.rollAngle = 0;
    this.headingAngle = 0;
    this.alive = true;

    this.forward = new THREE.Vector3();
    this.chase = new ChaseCamera(camera, this.airplane);
    this.reset();
  }

  reset() {
    this.flightSpeed = this.startSpeed;
    this.pitchAngle = 0;
    this.rollAngle = 0;
    this.headingAngle = this.playerNumber === 1 ? 0 : Math.PI;
    this.airplane.position.set(
      this.playerNumber === 1 ? -8 : 8,
      70,
      this.playerNumber === 1 ? 260 : -260
    );
    this.airplane.rotation.set(0, this.headingAngle, 0);
    for (const propeller of this.airplane.userData.propellers) propeller.rotation.z = 0;
    this.setAlive(true);
    this.snapCamera();
  }

  setAlive(alive) {
    this.alive = alive;
    this.airplane.visible = alive;
  }

  snapCamera() { this.chase.snap(); }

  update(deltaTime, pitchControl, rollControl, yawRate) {
    if (!this.alive) return;

    for (const propeller of this.airplane.userData.propellers) propeller.rotation.z += AIRCRAFT_PROPELLER_SPEED * deltaTime;

    // Fast exponential response avoids stacking noticeable delay on sensor data.
    const pitchSmoothing = 1 - Math.exp(-18 * deltaTime);
    const rollSmoothing = 1 - Math.exp(-22 * deltaTime);
    this.pitchAngle = THREE.MathUtils.lerp(this.pitchAngle, pitchControl * THREE.MathUtils.degToRad(PITCH_SENSITIVITY), pitchSmoothing);
    this.rollAngle = THREE.MathUtils.lerp(this.rollAngle, rollControl * THREE.MathUtils.degToRad(ROLL_SENSITIVITY), rollSmoothing);

    const bankTurnRate = THREE.MathUtils.degToRad(TURN_RATE);
    const yawAssistance = THREE.MathUtils.degToRad(yawRate) * 0.08;
    this.headingAngle -= (rollControl * bankTurnRate + yawAssistance) * deltaTime;
    this.airplane.rotation.set(this.pitchAngle, this.headingAngle, -this.rollAngle);

    this.forward.set(0, 0, -1).applyQuaternion(this.airplane.quaternion);
    this.airplane.position.addScaledVector(this.forward, this.flightSpeed * deltaTime);

    if (this.airplane.position.y < this.minimumAltitude) {
      this.airplane.position.y = this.minimumAltitude;
      this.pitchAngle = Math.max(this.pitchAngle, 0);
    }
    if (Math.abs(this.airplane.position.x) > this.worldLimit) this.airplane.position.x *= -0.82;
    if (Math.abs(this.airplane.position.z) > this.worldLimit) this.airplane.position.z *= -0.82;

  }

  updateCamera(deltaTime) { this.chase.update(deltaTime); }

  getForward(target) {
    return target.set(0, 0, -1).applyQuaternion(this.airplane.quaternion).normalize();
  }

  isLowAltitude() { return this.airplane.position.y < this.warningAltitude; }
}
