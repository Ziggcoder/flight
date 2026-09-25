import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/* Low-poly town. Repeated shops and trees are GPU-instanced for Pi speed. */

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createCity(scene) {
  const city = new THREE.Group();
  city.name = "Low-poly town";
  city.userData.buildingColliders = [];
  scene.add(city);

  const random = createSeededRandom(6050);
  const worldSize = 1440;
  const spacing = 130;
  const roadWidth = 28;
  const blockCount = 6;
  const roadLength = spacing * (blockCount + 2);
  const shopCount = blockCount * blockCount * 2;
  const treeCount = blockCount * blockCount * 4;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldSize, worldSize),
    new THREE.MeshLambertMaterial({ color: 0x66805f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  city.add(ground);

  const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x353d45 });
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xd7c978 });
  for (let line = -blockCount / 2; line <= blockCount / 2; line++) {
    const coordinate = line * spacing;
    const horizontalRoad = new THREE.Mesh(new THREE.PlaneGeometry(roadLength, roadWidth), roadMaterial);
    horizontalRoad.rotation.x = -Math.PI / 2;
    horizontalRoad.position.set(0, 0.03, coordinate);
    city.add(horizontalRoad);
    const verticalRoad = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadLength), roadMaterial);
    verticalRoad.rotation.x = -Math.PI / 2;
    verticalRoad.position.set(coordinate, 0.04, 0);
    city.add(verticalRoad);
    const horizontalLine = new THREE.Mesh(new THREE.PlaneGeometry(roadLength, 0.65), lineMaterial);
    horizontalLine.rotation.x = -Math.PI / 2;
    horizontalLine.position.set(0, 0.06, coordinate);
    city.add(horizontalLine);
    const verticalLine = new THREE.Mesh(new THREE.PlaneGeometry(0.65, roadLength), lineMaterial);
    verticalLine.rotation.x = -Math.PI / 2;
    verticalLine.position.set(coordinate, 0.07, 0);
    city.add(verticalLine);
  }

  const shopMaterials = [0x91a5b8, 0xb79c83, 0x7fa0a0, 0xb8ad83, 0x968ca8]
    .map((color) => new THREE.MeshLambertMaterial({ color }));
  const awningMaterials = [0x397fc1, 0xc84b54, 0xd39b39]
    .map((color) => new THREE.MeshLambertMaterial({ color }));
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const shopMeshes = shopMaterials.map((material) => new THREE.InstancedMesh(unitBox, material, shopCount));
  const awningMeshes = awningMaterials.map((material) => new THREE.InstancedMesh(unitBox, material, shopCount));
  const roofMesh = new THREE.InstancedMesh(
    unitBox,
    new THREE.MeshLambertMaterial({ color: 0x4a535d }),
    shopCount
  );
  const shopCounts = new Array(shopMeshes.length).fill(0);
  const awningCounts = new Array(awningMeshes.length).fill(0);
  let roofCount = 0;

  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.7, 0.9, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0x72543c }),
    treeCount
  );
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(3.2, 7, 7),
    new THREE.MeshLambertMaterial({ color: 0x3f744b }),
    treeCount
  );
  const transform = new THREE.Matrix4();
  let treeIndex = 0;

  for (let blockX = -blockCount / 2; blockX < blockCount / 2; blockX++) {
    for (let blockZ = -blockCount / 2; blockZ < blockCount / 2; blockZ++) {
      const centreX = blockX * spacing + spacing / 2;
      const centreZ = blockZ * spacing + spacing / 2;

      for (const side of [-1, 1]) {
        const width = 31 + random() * 9;
        const depth = 34 + random() * 10;
        const height = 7 + random() * 10;
        const x = centreX + side * 25;
        const z = centreZ + (random() - 0.5) * 15;

        const materialIndex = Math.floor(random() * shopMeshes.length);
        transform.makeScale(width, height, depth);
        transform.setPosition(x, height / 2, z);
        shopMeshes[materialIndex].setMatrixAt(shopCounts[materialIndex]++, transform);

        transform.makeScale(width + 1, 0.8, depth + 1);
        transform.setPosition(x, height + 0.4, z);
        roofMesh.setMatrixAt(roofCount++, transform);

        const awningIndex = Math.floor(random() * awningMeshes.length);
        transform.makeScale(width * 0.72, 0.35, 2.3);
        transform.setPosition(x, Math.min(4.4, height - 1), z + depth / 2 + 1);
        awningMeshes[awningIndex].setMatrixAt(awningCounts[awningIndex]++, transform);

        city.userData.buildingColliders.push({
          minX: x - width / 2 - 5, maxX: x + width / 2 + 5,
          minY: 0, maxY: height + 3,
          minZ: z - depth / 2 - 5, maxZ: z + depth / 2 + 5
        });
      }

      for (const offsetX of [-47, 47]) {
        for (const offsetZ of [-47, 47]) {
          const x = centreX + offsetX;
          const z = centreZ + offsetZ;
          const scale = 0.8 + random() * 0.35;
          transform.makeScale(scale, scale, scale);
          transform.setPosition(x, 2 * scale, z);
          trunks.setMatrixAt(treeIndex, transform);
          transform.makeScale(scale, scale, scale);
          transform.setPosition(x, 7 * scale, z);
          leaves.setMatrixAt(treeIndex, transform);
          treeIndex++;
        }
      }
    }
  }

  shopMeshes.forEach((mesh, index) => {
    mesh.count = shopCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    city.add(mesh);
  });
  awningMeshes.forEach((mesh, index) => {
    mesh.count = awningCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    city.add(mesh);
  });
  roofMesh.count = roofCount;
  roofMesh.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  city.add(roofMesh, trunks, leaves);
  // Roads share two materials: merge their static geometry into two draws.
  for (const material of [roadMaterial, lineMaterial]) {
    const pieces = city.children.filter((child) => child.material === material);
    const geometries = pieces.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(geometries);
    for (const mesh of pieces) { city.remove(mesh); mesh.geometry.dispose(); }
    for (const geometry of geometries) geometry.dispose();
    city.add(new THREE.Mesh(merged, material));
  }
  return city;
}
