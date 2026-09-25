import * as THREE from 'three';
import { PERFORMANCE } from '../utils/Constants.js';

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERFORMANCE.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setScissorTest(true);
  renderer.shadowMap.enabled = PERFORMANCE.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Game resets once before both views, so diagnostics include the whole frame.
  renderer.info.autoReset = false;
  return renderer;
}

export function updateAspect(camera, aspect) {
  if (camera.aspect === aspect) return;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
