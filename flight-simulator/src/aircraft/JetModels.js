import * as THREE from 'three';

// The dimensions are tuned to the game's world, not a real-world scale.
const JETS = {
  '777max': { length: 16.8, span: 18.8, radius: 0.98, engineRadius: 0.88, engineX: [5.1], sweep: 1.7, tip: 'raked', windows: 13 },
  a350: { length: 16.2, span: 19.5, radius: 0.92, engineRadius: 0.76, engineX: [5], sweep: 2.15, tip: 'winglet', windows: 13 },
  '737': { length: 12.5, span: 13.1, radius: 0.7, engineRadius: 0.52, engineX: [3.5], sweep: 1.15, tip: 'winglet', windows: 9 },
  '747': { length: 18.5, span: 20.4, radius: 1.02, engineRadius: 0.61, engineX: [3.7, 7.1], sweep: 1.75, tip: 'plain', windows: 14, upperDeck: true }
};

const geometryCache = new Map();
function geometry(key, create) {
  if (!geometryCache.has(key)) geometryCache.set(key, create());
  return geometryCache.get(key);
}
function box(width, height, depth) {
  return geometry(`box:${width}:${height}:${depth}`, () => new THREE.BoxGeometry(width, height, depth));
}
function cylinder(radius, length, segments = 10) {
  return geometry(`cylinder:${radius}:${length}:${segments}`, () => new THREE.CylinderGeometry(radius, radius, length, segments));
}
function cone(radius, length) {
  return geometry(`cone:${radius}:${length}`, () => new THREE.ConeGeometry(radius, length, 10));
}
function sphere(radius) {
  return geometry(`sphere:${radius}`, () => new THREE.SphereGeometry(radius, 10, 6));
}
function wing(halfSpan, rootFront, tipFront, tipBack, rootBack, thickness) {
  const key = `wing:${halfSpan}:${rootFront}:${tipFront}:${tipBack}:${rootBack}:${thickness}`;
  return geometry(key, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-halfSpan, tipFront);
    shape.lineTo(0, rootFront);
    shape.lineTo(halfSpan, tipFront);
    shape.lineTo(halfSpan, tipBack);
    shape.lineTo(0, rootBack);
    shape.lineTo(-halfSpan, tipBack);
    shape.closePath();
    const result = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1, steps: 1 });
    result.rotateX(Math.PI / 2);
    return result;
  });
}
function add(parent, shape, material, x = 0, y = 0, z = 0, rotationX = 0) {
  const part = new THREE.Mesh(shape, material);
  part.position.set(x, y, z);
  part.rotation.x = rotationX;
  parent.add(part);
  return part;
}

function addWindows(airplane, config, dark) {
  const rows = config.upperDeck ? 2 : 1;
  const count = config.windows * 2 + (rows === 2 ? 12 : 0);
  const windows = new THREE.InstancedMesh(box(0.07, 0.24, 0.26), dark, count);
  const matrix = new THREE.Matrix4();
  let instance = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < config.windows; index++) {
      matrix.makeTranslation(side * config.radius * 1.01, 0.23, -config.length * 0.28 + index * config.length * 0.62 / (config.windows - 1));
      windows.setMatrixAt(instance++, matrix);
    }
    if (config.upperDeck) {
      for (let index = 0; index < 6; index++) {
        matrix.makeTranslation(side * config.radius * 0.75, config.radius + 0.55, -config.length * 0.27 + index * 0.43);
        windows.setMatrixAt(instance++, matrix);
      }
    }
  }
  windows.instanceMatrix.needsUpdate = true;
  airplane.add(windows);
}

export function createJetModel(modelId, primaryColor, accentColor) {
  const config = JETS[modelId];
  if (!config) throw new Error(`Unknown airplane model: ${modelId}`);
  const airplane = new THREE.Group();
  airplane.name = 'airplane';
  airplane.rotation.order = 'YXZ';
  airplane.userData.modelId = modelId;
  airplane.userData.propellers = [];
  airplane.userData.weaponOffset = config.length * 0.5 + 1;
  airplane.userData.cameraDistance = config.span > 18 ? 27 : 19;

  const body = new THREE.MeshLambertMaterial({ color: 0xe7edf2 });
  const primary = new THREE.MeshLambertMaterial({ color: primaryColor });
  const accent = new THREE.MeshLambertMaterial({ color: accentColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x172334 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x566273 });
  const { length, span, radius } = config;

  add(airplane, cylinder(radius, length * 0.78), body, 0, 0, 0.15, Math.PI / 2);
  const nose = add(airplane, sphere(radius), body, 0, 0, -length * 0.39);
  nose.scale.z = 1.65;
  add(airplane, cone(radius * 0.97, length * 0.18), body, 0, 0.04, length * 0.46, Math.PI / 2);

  add(airplane, wing(span / 2, -1.65, config.sweep - 1.1, config.sweep - 0.45, 2.1, 0.17), primary, 0, 0.38, 0);
  add(airplane, wing(span * 0.22, -0.55, 0.6, 1.05, 1.1, 0.11), primary, 0, 0.55, length * 0.39);
  add(airplane, box(0.2, radius * 2.5, 1.8), primary, 0, radius * 1.05, length * 0.42);
  add(airplane, box(0.08, 0.14, length * 0.67), primary, radius * 0.99, -0.08, 0);
  add(airplane, box(0.08, 0.14, length * 0.67), primary, -radius * 0.99, -0.08, 0);

  if (config.upperDeck) {
    const hump = add(airplane, cylinder(radius * 0.71, length * 0.28), body, 0, radius * 0.78, -length * 0.19, Math.PI / 2);
    hump.scale.y = 0.75;
  }

  for (const side of [-1, 1]) {
    for (const x of config.engineX) {
      const engine = add(airplane, cylinder(config.engineRadius, config.engineRadius * 2.8, 10), body,
        side * x, -0.5, -0.65, Math.PI / 2);
      engine.name = 'jet-engine';
      add(airplane, cylinder(config.engineRadius * 0.72, 0.08, 10), dark,
        side * x, -0.5, -0.65 - config.engineRadius * 1.4, Math.PI / 2);
      add(airplane, box(0.2, 0.5, 0.72), metal, side * x, -0.08, -0.45);
    }
    if (config.tip === 'winglet') {
      add(airplane, box(0.16, config.upperDeck ? 1.0 : 0.85, 0.52), accent,
        side * (span / 2 - 0.14), 0.8, config.sweep - 0.78);
    } else if (config.tip === 'raked') {
      const tip = add(airplane, box(1.15, 0.12, 0.43), accent,
        side * (span / 2 + 0.4), 0.43, config.sweep - 0.7);
      tip.rotation.y = side * 0.25;
    }
    add(airplane, box(0.08, 0.45, 0.5), dark, side * radius * 0.75, 0.33, -length * 0.45);
  }
  addWindows(airplane, config, dark);
  airplane.traverse((part) => { if (part.isMesh) part.castShadow = true; });
  return airplane;
}
