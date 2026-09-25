import * as THREE from 'three';

const geometryCache = new Map();
function geometry(key, make) {
  if (!geometryCache.has(key)) geometryCache.set(key, make());
  return geometryCache.get(key);
}
function box(x, y, z) {
  return geometry(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
}
function cylinder(radius, length) {
  return geometry(`cylinder:${radius}:${length}`, () => new THREE.CylinderGeometry(radius, radius, length, 10));
}
function cone(radius, length) {
  return geometry(`cone:${radius}:${length}`, () => new THREE.ConeGeometry(radius, length, 10));
}
function sphere(radius) {
  return geometry(`sphere:${radius}`, () => new THREE.SphereGeometry(radius, 10, 6));
}
function planform(key, points, thickness) {
  return geometry(key, () => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const result = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
    result.rotateX(Math.PI / 2);
    return result;
  });
}
function part(parent, shape, material, x = 0, y = 0, z = 0, rotationX = 0) {
  const object = new THREE.Mesh(shape, material);
  object.position.set(x, y, z);
  object.rotation.x = rotationX;
  parent.add(object);
  return object;
}
function base(modelId) {
  const airplane = new THREE.Group();
  airplane.name = 'airplane';
  airplane.rotation.order = 'YXZ';
  airplane.userData.modelId = modelId;
  airplane.userData.propellers = [];
  return airplane;
}
function finish(airplane) {
  airplane.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  return airplane;
}

function createB2(primaryColor) {
  const airplane = base('b2');
  const charcoal = new THREE.MeshLambertMaterial({ color: 0x29333c });
  const top = new THREE.MeshLambertMaterial({ color: 0x39444e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x101820 });
  const player = new THREE.MeshLambertMaterial({ color: primaryColor });
  const outline = [
    [-10.4, 0.7], [-7.8, -0.35], [-3.2, -2.75], [0, -4.1],
    [3.2, -2.75], [7.8, -0.35], [10.4, 0.7],
    [8.4, 1.2], [6.2, 0.5], [4.2, 1.6], [2.2, 0.9],
    [0, 2.3], [-2.2, 0.9], [-4.2, 1.6], [-6.2, 0.5], [-8.4, 1.2]
  ];
  part(airplane, planform('b2:wing', outline, 0.33), charcoal, 0, 0.15);
  const center = part(airplane, sphere(1.4), top, 0, 0.32, -0.9);
  center.scale.set(2.0, 0.36, 1.7);
  const canopy = part(airplane, sphere(0.62), dark, 0, 0.73, -2.45);
  canopy.scale.set(1.12, 0.48, 1.4);
  for (const side of [-1, 1]) {
    part(airplane, box(1.35, 0.07, 0.16), player, side * 7.7, 0.26, 0.7);
    for (const x of [0.75, 1.65]) {
      const exhaust = part(airplane, box(0.53, 0.18, 0.12), dark, side * x, 0.3, 1.72);
      exhaust.name = 'jet-engine';
    }
  }
  return finish(airplane);
}

function createC17(primaryColor) {
  const airplane = base('c17');
  const gray = new THREE.MeshLambertMaterial({ color: 0x929ca2 });
  const primary = new THREE.MeshLambertMaterial({ color: primaryColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1b2833 });
  part(airplane, cylinder(1.3, 16.6), gray, 0, 0, 0, Math.PI / 2);
  const nose = part(airplane, sphere(1.3), gray, 0, 0, -8.2);
  nose.scale.z = 1.4;
  part(airplane, cone(1.25, 2.3), gray, 0, 0.12, 9.0, Math.PI / 2);
  part(airplane, planform('c17:wing', [
    [-9.15, 0.7], [-1.4, -1.35], [0, -1.35], [1.4, -1.35], [9.15, 0.7],
    [9.15, 1.65], [0, 2.45], [-9.15, 1.65]
  ], 0.25), gray, 0, 1.36);
  part(airplane, box(0.28, 3.1, 2.1), primary, 0, 2.3, 8.25);
  part(airplane, box(7.0, 0.16, 1.1), gray, 0, 3.8, 8.1);
  part(airplane, box(1.8, 0.12, 0.14), dark, 0, -0.35, 9.28);
  for (const side of [-1, 1]) {
    for (const x of [3.5, 6.55]) {
      const engine = part(airplane, cylinder(0.57, 1.75), gray, side * x, 0.45, 0.25, Math.PI / 2);
      engine.name = 'jet-engine';
      part(airplane, cylinder(0.44, 0.07), dark, side * x, 0.45, -0.65, Math.PI / 2);
    }
    part(airplane, box(0.1, 0.5, 0.75), dark, side * 0.64, 0.64, -8.72);
    part(airplane, box(0.08, 0.17, 5.0), primary, side * 1.27, 0.13, 0);
  }
  return finish(airplane);
}

function createF16(primaryColor) {
  const airplane = base('f16');
  const body = new THREE.MeshLambertMaterial({ color: 0xb8c0c4 });
  const primary = new THREE.MeshLambertMaterial({ color: primaryColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x182333 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x5e6c73 });
  part(airplane, cylinder(0.55, 7.6), body, 0, 0, 0, Math.PI / 2);
  part(airplane, cone(0.55, 2.9), body, 0, 0, -4.85, -Math.PI / 2);
  part(airplane, planform('f16:wing', [
    [-3.55, 0.75], [-0.9, -1.6], [0, -1.6], [0.9, -1.6], [3.55, 0.75],
    [3.55, 1.35], [0, 2.0], [-3.55, 1.35]
  ], 0.17), primary, 0, 0.03);
  part(airplane, box(3.6, 0.12, 0.85), body, 0, 0.25, 3.7);
  part(airplane, box(0.18, 2.1, 1.55), primary, 0, 1.07, 3.72);
  const canopy = part(airplane, sphere(0.59), dark, 0, 0.52, -2.36);
  canopy.scale.set(0.85, 0.65, 1.8);
  part(airplane, box(0.8, 0.35, 1.2), dark, 0, -0.61, -0.73);
  const nozzle = part(airplane, cylinder(0.43, 0.55), metal, 0, 0, 3.8, Math.PI / 2);
  nozzle.name = 'jet-engine';
  part(airplane, cylinder(0.32, 0.08), dark, 0, 0, 4.11, Math.PI / 2);
  return finish(airplane);
}

export function createMilitaryModel(modelId, primaryColor) {
  if (modelId === 'b2') return createB2(primaryColor);
  if (modelId === 'c17') return createC17(primaryColor);
  if (modelId === 'f16') return createF16(primaryColor);
  throw new Error(`Unknown airplane model: ${modelId}`);
}
