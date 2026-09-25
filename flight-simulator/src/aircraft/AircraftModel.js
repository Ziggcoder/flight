import * as THREE from 'three';
import { createJetModel } from './JetModels.js';
import { createMilitaryModel } from './MilitaryModels.js';
import { scaleAirplaneToRealRatio } from './AircraftScale.js';

export const AIRCRAFT_MODELS = Object.freeze([
  { id: 'atr72', label: 'ATR 72', hudLabel: 'ATR 72' },
  { id: '777max', label: '777MAX (concept)', hudLabel: '777MAX' },
  { id: 'a350', label: 'Airbus A350', hudLabel: 'A350' },
  { id: '737', label: 'Boeing 737', hudLabel: '737' },
  { id: '747', label: 'Boeing 747', hudLabel: '747' },
  { id: 'b2', label: 'B-2 Spirit', hudLabel: 'B-2' },
  { id: 'c17', label: 'C-17 Globemaster III', hudLabel: 'C-17' },
  { id: 'f16', label: 'F-16 Fighting Falcon', hudLabel: 'F-16' }
]);

export function createAirplaneModel(modelId, primaryColor, accentColor) {
  let airplane;
  if (modelId === 'atr72') airplane = createATR72Model(primaryColor, accentColor);
  else if (modelId === 'b2' || modelId === 'c17' || modelId === 'f16') airplane = createMilitaryModel(modelId, primaryColor);
  else airplane = createJetModel(modelId, primaryColor, accentColor);
  return scaleAirplaneToRealRatio(airplane, modelId);
}

// Shared low-poly geometry keeps both player aircraft inexpensive to render.
const FUSELAGE_GEOMETRY = new THREE.CylinderGeometry(0.68, 0.78, 8.5, 10);
const NOSE_GEOMETRY = new THREE.SphereGeometry(0.7, 10, 6);
const TAIL_CONE_GEOMETRY = new THREE.ConeGeometry(0.72, 2.2, 10);
const WING_GEOMETRY = new THREE.BoxGeometry(12.4, 0.2, 1.55);
const STABILIZER_GEOMETRY = new THREE.BoxGeometry(4.1, 0.14, 0.82);
const FIN_GEOMETRY = new THREE.BoxGeometry(0.2, 2.25, 1.45);
const ENGINE_GEOMETRY = new THREE.CylinderGeometry(0.48, 0.56, 2.55, 8);
const SPINNER_GEOMETRY = new THREE.ConeGeometry(0.31, 0.72, 8);
const PROPELLER_BLADE_GEOMETRY = new THREE.BoxGeometry(2.75, 0.13, 0.08);
const WINDOW_GEOMETRY = new THREE.BoxGeometry(0.34, 0.3, 0.08);
const COCKPIT_WINDOW_GEOMETRY = new THREE.BoxGeometry(0.45, 0.38, 0.08);
const DOOR_GEOMETRY = new THREE.BoxGeometry(0.08, 0.88, 0.55);
const STRIPE_GEOMETRY = new THREE.BoxGeometry(0.06, 0.16, 6.8);
const GEAR_STRUT_GEOMETRY = new THREE.CylinderGeometry(0.055, 0.055, 0.65, 6);
const WHEEL_GEOMETRY = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 8);

function mesh(geometry, material, position, rotation) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  return object;
}

function addWindows(airplane, material) {
  const windowCountPerSide = 9;
  const windows = new THREE.InstancedMesh(WINDOW_GEOMETRY, material, windowCountPerSide * 2);
  const transform = new THREE.Matrix4();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let windowIndex = 0; windowIndex < windowCountPerSide; windowIndex++) {
      const z = -2.25 + windowIndex * 0.62;
      transform.makeRotationY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      transform.setPosition(side * 0.69, 0.23, z);
      windows.setMatrixAt(index++, transform);
    }
  }
  windows.instanceMatrix.needsUpdate = true;
  airplane.add(windows);
}

function createPropeller(material, darkMaterial, x) {
  const assembly = new THREE.Group();
  assembly.position.set(x, 0.2, -2.05);

  const spinner = mesh(SPINNER_GEOMETRY, darkMaterial, [0, 0, -0.34], [-Math.PI / 2, 0, 0]);
  assembly.add(spinner);

  const rotor = new THREE.Group();
  rotor.position.z = -0.7;
  for (let bladePair = 0; bladePair < 3; bladePair++) {
    const blades = mesh(PROPELLER_BLADE_GEOMETRY, material);
    blades.rotation.z = bladePair * Math.PI / 3;
    rotor.add(blades);
  }
  assembly.add(rotor);
  assembly.userData.rotor = rotor;
  return assembly;
}

function addLandingGear(airplane, darkMaterial) {
  for (const x of [-1.35, 1.35]) {
    airplane.add(mesh(GEAR_STRUT_GEOMETRY, darkMaterial, [x, -0.72, 0.85]));
    airplane.add(mesh(WHEEL_GEOMETRY, darkMaterial, [x, -1.08, 0.85], [0, 0, Math.PI / 2]));
  }
  airplane.add(mesh(GEAR_STRUT_GEOMETRY, darkMaterial, [0, -0.72, -2.8]));
  airplane.add(mesh(WHEEL_GEOMETRY, darkMaterial, [0, -1.08, -2.8], [0, 0, Math.PI / 2]));
}

export function createATR72Model(primaryColor, accentColor) {
  const airplane = new THREE.Group();
  airplane.name = 'airplane';
  airplane.rotation.order = 'YXZ';
  airplane.userData.modelId = 'atr72';
  airplane.userData.weaponOffset = 6;
  airplane.userData.cameraDistance = 17;

  const fuselageMaterial = new THREE.MeshLambertMaterial({ color: 0xe7edf2 });
  const primaryMaterial = new THREE.MeshLambertMaterial({ color: primaryColor });
  const accentMaterial = new THREE.MeshLambertMaterial({ color: accentColor });
  const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x172334 });
  const propellerMaterial = new THREE.MeshLambertMaterial({ color: 0x27313c });

  airplane.add(mesh(FUSELAGE_GEOMETRY, fuselageMaterial, [0, 0, 0.3], [Math.PI / 2, 0, 0]));

  const nose = mesh(NOSE_GEOMETRY, fuselageMaterial, [0, -0.02, -4.05]);
  nose.scale.set(1, 0.92, 1.38);
  airplane.add(nose);

  airplane.add(mesh(TAIL_CONE_GEOMETRY, fuselageMaterial, [0, 0.12, 5.05], [Math.PI / 2, 0, 0]));
  airplane.add(mesh(WING_GEOMETRY, primaryMaterial, [0, 0.72, -0.15]));
  airplane.add(mesh(STABILIZER_GEOMETRY, primaryMaterial, [0, 1.86, 4.2]));
  airplane.add(mesh(FIN_GEOMETRY, primaryMaterial, [0, 1.05, 4.15], [-0.15, 0, 0]));

  // Long player-colored cheat lines make each livery readable in split screen.
  airplane.add(mesh(STRIPE_GEOMETRY, primaryMaterial, [0.72, -0.06, -0.05]));
  airplane.add(mesh(STRIPE_GEOMETRY, primaryMaterial, [-0.72, -0.06, -0.05]));

  for (const side of [-1, 1]) {
    airplane.add(mesh(ENGINE_GEOMETRY, primaryMaterial, [side * 2.25, 0.18, -0.72], [Math.PI / 2, 0, 0]));
    airplane.add(mesh(DOOR_GEOMETRY, accentMaterial, [side * 0.72, -0.08, 3.05]));
  }

  const cockpitLeft = mesh(COCKPIT_WINDOW_GEOMETRY, darkMaterial, [-0.39, 0.29, -4.64], [0.08, -0.2, 0.08]);
  const cockpitRight = mesh(COCKPIT_WINDOW_GEOMETRY, darkMaterial, [0.39, 0.29, -4.64], [0.08, 0.2, -0.08]);
  airplane.add(cockpitLeft, cockpitRight);
  addWindows(airplane, darkMaterial);
  addLandingGear(airplane, darkMaterial);

  const leftPropeller = createPropeller(propellerMaterial, accentMaterial, -2.25);
  const rightPropeller = createPropeller(propellerMaterial, accentMaterial, 2.25);
  airplane.add(leftPropeller, rightPropeller);
  airplane.userData.propellers = [leftPropeller.userData.rotor, rightPropeller.userData.rotor];

  airplane.scale.setScalar(1.08);
  airplane.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  return airplane;
}
