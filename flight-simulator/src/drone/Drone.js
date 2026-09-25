import * as THREE from 'three';
import { ChaseCamera } from '../camera/ChaseCamera.js';
import { DronePhysics } from './DronePhysics.js';
import {
  DRONE_CAMERA_DISTANCE,
  DRONE_CAMERA_HEIGHT,
  DRONE_HOVER_HEIGHT,
  DRONE_MAX_VISUAL_TILT,
  DRONE_PROPELLER_SPEED
} from '../utils/Constants.js';

const BODY_GEOMETRY = new THREE.BoxGeometry(2.7, 0.75, 3.2);
const ARM_GEOMETRY = new THREE.BoxGeometry(7.3, 0.22, 0.34);
const MOTOR_GEOMETRY = new THREE.CylinderGeometry(0.48, 0.54, 0.62, 8);
const PROPELLER_GEOMETRY = new THREE.BoxGeometry(2.4, 0.08, 0.16);
const CAMERA_GEOMETRY = new THREE.BoxGeometry(0.8, 0.65, 0.7);

function createDrone(primaryColor, accentColor) {
  const drone = new THREE.Group();
  drone.name = 'drone';
  drone.rotation.order = 'YXZ';

  const primary = new THREE.MeshLambertMaterial({ color: primaryColor });
  const accent = new THREE.MeshLambertMaterial({ color: accentColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x172334 });
  const propellerMaterial = new THREE.MeshLambertMaterial({ color: 0x26384b });

  const body = new THREE.Mesh(BODY_GEOMETRY, primary);
  drone.add(body);

  const nose = new THREE.Mesh(CAMERA_GEOMETRY, dark);
  nose.position.set(0, -0.34, -1.65);
  drone.add(nose);

  for (const rotation of [-Math.PI / 4, Math.PI / 4]) {
    const arm = new THREE.Mesh(ARM_GEOMETRY, accent);
    arm.rotation.y = rotation;
    drone.add(arm);
  }

  const propellers = [];
  for (const x of [-2.5, 2.5]) {
    for (const z of [-2.5, 2.5]) {
      const motor = new THREE.Mesh(MOTOR_GEOMETRY, dark);
      motor.position.set(x, 0.1, z);
      drone.add(motor);

      const propeller = new THREE.Mesh(PROPELLER_GEOMETRY, propellerMaterial);
      propeller.position.set(x, 0.46, z);
      drone.add(propeller);
      propellers.push(propeller);
    }
  }

  drone.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  drone.userData.propellers = propellers;
  return drone;
}

export class ArcadeDrone {
  constructor(scene, camera, playerNumber) {
    this.scene = scene;
    this.camera = camera;
    this.playerNumber = playerNumber;
    this.drone = createDrone(
      playerNumber === 1 ? 0x2488f5 : 0xef3d4d,
      playerNumber === 1 ? 0xf0bf43 : 0xffffff
    );
    this.object = this.drone;
    this.mode = 'drone';
    this.collisionRadius = 3.2;
    this.weaponOffset = 3.3;
    this.scene.add(this.drone);

    this.physics = new DronePhysics(this.drone);
    this.headingAngle = 0;
    this.flightSpeed = 0;
    this.inputForward = 0;
    this.inputStrafe = 0;
    this.alive = true;
    this.forward = new THREE.Vector3();
    this.chase = new ChaseCamera(camera, this.drone, {
      headingOnly: true,
      height: DRONE_CAMERA_HEIGHT,
      distance: DRONE_CAMERA_DISTANCE,
      lookHeight: 0.6,
      lookDistance: 7
    });
    this.reset();
  }

  reset() {
    this.headingAngle = this.playerNumber === 1 ? 0 : Math.PI;
    this.drone.position.set(
      this.playerNumber === 1 ? -8 : 8,
      DRONE_HOVER_HEIGHT,
      this.playerNumber === 1 ? 260 : -260
    );
    this.drone.rotation.set(0, this.headingAngle, 0);
    this.physics.reset();
    this.flightSpeed = 0;
    this.inputForward = 0;
    this.inputStrafe = 0;
    this.setAlive(true);
    this.snapCamera();
  }

  setAlive(alive) {
    this.alive = alive;
    this.drone.visible = alive;
  }

  snapCamera() { this.chase.snap(); }

  update(deltaTime, pitchDegrees, rollDegrees) {
    if (!this.alive) return;
    this.physics.update(deltaTime, pitchDegrees, rollDegrees, this.headingAngle);
    this.flightSpeed = this.physics.speed;
    this.inputForward = this.physics.forwardInput;
    this.inputStrafe = this.physics.strafeInput;

    const maximumTilt = THREE.MathUtils.degToRad(DRONE_MAX_VISUAL_TILT);
    const visualResponse = 1 - Math.exp(-12 * deltaTime);
    this.drone.rotation.x = THREE.MathUtils.lerp(this.drone.rotation.x, -this.inputForward * maximumTilt, visualResponse);
    this.drone.rotation.z = THREE.MathUtils.lerp(this.drone.rotation.z, -this.inputStrafe * maximumTilt, visualResponse);
    this.drone.rotation.y = this.headingAngle;

    for (const propeller of this.drone.userData.propellers) propeller.rotation.y += DRONE_PROPELLER_SPEED * deltaTime;

    if (Math.abs(this.drone.position.x) > 690) this.drone.position.x *= -0.82;
    if (Math.abs(this.drone.position.z) > 690) this.drone.position.z *= -0.82;
  }

  updateCamera(deltaTime) { this.chase.update(deltaTime); }

  getForward(target) {
    return target.set(-Math.sin(this.headingAngle), 0, -Math.cos(this.headingAngle));
  }

  isLowAltitude() { return false; }

  isHovering() { return this.physics.isHovering(); }
}
