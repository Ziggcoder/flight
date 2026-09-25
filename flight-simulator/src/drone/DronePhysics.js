import * as THREE from 'three';
import {
  DRONE_ACCELERATION,
  DRONE_ALTITUDE_CORRECTION,
  DRONE_DEAD_ZONE,
  DRONE_DECELERATION,
  DRONE_FORWARD_INVERSION,
  DRONE_HOVER_HEIGHT,
  DRONE_INPUT_EXPONENT,
  DRONE_MAX_CONTROLLER_ANGLE,
  DRONE_MAX_SPEED,
  DRONE_MINIMUM_ALTITUDE,
  DRONE_STRAFE_INVERSION
} from '../utils/Constants.js';

export function normalizeDroneAxis(angle, inversion = 1) {
  const signedAngle = THREE.MathUtils.clamp(angle * inversion, -DRONE_MAX_CONTROLLER_ANGLE, DRONE_MAX_CONTROLLER_ANGLE);
  const magnitude = Math.abs(signedAngle);
  if (magnitude <= DRONE_DEAD_ZONE) return 0;
  const normalized = (magnitude - DRONE_DEAD_ZONE) / (DRONE_MAX_CONTROLLER_ANGLE - DRONE_DEAD_ZONE);
  return Math.sign(signedAngle) * Math.pow(normalized, DRONE_INPUT_EXPONENT);
}

export class DronePhysics {
  constructor(object) {
    this.object = object;
    this.horizontalVelocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.velocityDelta = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.forwardInput = 0;
    this.strafeInput = 0;
    this.speed = 0;
  }

  reset() {
    this.horizontalVelocity.set(0, 0, 0);
    this.targetVelocity.set(0, 0, 0);
    this.forwardInput = 0;
    this.strafeInput = 0;
    this.speed = 0;
  }

  update(deltaTime, pitchDegrees, rollDegrees, headingAngle) {
    this.forwardInput = normalizeDroneAxis(pitchDegrees, DRONE_FORWARD_INVERSION);
    this.strafeInput = normalizeDroneAxis(rollDegrees, DRONE_STRAFE_INVERSION);

    const inputLength = Math.hypot(this.forwardInput, this.strafeInput);
    if (inputLength > 1) {
      this.forwardInput /= inputLength;
      this.strafeInput /= inputLength;
    }

    const sine = Math.sin(headingAngle);
    const cosine = Math.cos(headingAngle);
    this.forward.set(-sine, 0, -cosine);
    this.right.set(cosine, 0, -sine);
    this.targetVelocity.copy(this.forward).multiplyScalar(this.forwardInput * DRONE_MAX_SPEED);
    this.targetVelocity.addScaledVector(this.right, this.strafeInput * DRONE_MAX_SPEED);

    const acceleration = this.targetVelocity.lengthSq() < 0.0001 ? DRONE_DECELERATION : DRONE_ACCELERATION;
    this.moveVelocityTowardTarget(acceleration * deltaTime);
    this.object.position.addScaledVector(this.horizontalVelocity, deltaTime);

    const altitudeResponse = 1 - Math.exp(-DRONE_ALTITUDE_CORRECTION * deltaTime);
    this.object.position.y = THREE.MathUtils.lerp(this.object.position.y, DRONE_HOVER_HEIGHT, altitudeResponse);
    if (this.object.position.y < DRONE_MINIMUM_ALTITUDE) this.object.position.y = DRONE_MINIMUM_ALTITUDE;
    this.speed = this.horizontalVelocity.length();
    return this;
  }

  moveVelocityTowardTarget(maxChange) {
    this.velocityDelta.subVectors(this.targetVelocity, this.horizontalVelocity);
    const distance = this.velocityDelta.length();
    if (distance <= maxChange || distance === 0) this.horizontalVelocity.copy(this.targetVelocity);
    else this.horizontalVelocity.addScaledVector(this.velocityDelta, maxChange / distance);
  }

  isHovering() {
    return this.forwardInput === 0 && this.strafeInput === 0 && this.horizontalVelocity.lengthSq() < 0.04;
  }
}
