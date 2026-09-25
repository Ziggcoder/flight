import * as THREE from 'three';

// All displayed aircraft use the same visual conversion. Dimensions are
// published overall dimensions; geometry details remain intentionally low poly.
export const AIRCRAFT_UNITS_PER_METRE = 0.4;
export const AIRCRAFT_DIMENSIONS_METRES = Object.freeze({
  atr72: { span: 27.05, length: 27.17, height: 7.65 },
  // 777MAX is a fictional menu name, using the real 777-9 as its size reference.
  '777max': { span: 71.8, length: 76.7, height: 19.5 },
  a350: { span: 64.75, length: 66.8, height: 17.05 },
  '737': { span: 35.8, length: 39.5, height: 12.5 },
  '747': { span: 68.4, length: 76.3, height: 19.4 },
  b2: { span: 52.12, length: 20.9, height: 5.1 },
  c17: { span: 51.75, length: 53, height: 16.79 },
  f16: { span: 9.8, length: 14.8, height: 4.8 }
});

const bounds = new THREE.Box3();
const size = new THREE.Vector3();

export function scaleAirplaneToRealRatio(airplane, modelId) {
  const dimensions = AIRCRAFT_DIMENSIONS_METRES[modelId];
  if (!dimensions) throw new Error(`Missing aircraft dimensions: ${modelId}`);
  bounds.setFromObject(airplane).getSize(size);
  airplane.scale.set(
    airplane.scale.x * dimensions.span * AIRCRAFT_UNITS_PER_METRE / size.x,
    airplane.scale.y * dimensions.height * AIRCRAFT_UNITS_PER_METRE / size.y,
    airplane.scale.z * dimensions.length * AIRCRAFT_UNITS_PER_METRE / size.z
  );
  airplane.userData.weaponOffset = dimensions.length * AIRCRAFT_UNITS_PER_METRE * 0.5 + 1;
  airplane.userData.cameraDistance = Math.max(9, dimensions.span * AIRCRAFT_UNITS_PER_METRE * 1.25);
  return airplane;
}
