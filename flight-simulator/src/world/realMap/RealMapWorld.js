/**
 * RealMapWorld.js — Three.js world builder for the Kolar Road real map.
 *
 * Returns a THREE.Group whose userData carries the same interface as City.js:
 *   userData.buildingColliders   — array of { minX,maxX,minY,maxY,minZ,maxZ }
 *   userData.spawnPositions      — [{ x,y,z }, { x,y,z }]  (player spawn)
 *   userData.worldBounds         — { halfX, halfZ }  (for vehicle wrap/clamp)
 *   userData.css2dObjects        — array of CSS2DObject (for the label renderer)
 *
 * PERFORMANCE NOTES (Raspberry Pi target)
 *   - Zone polygons share one material per color (ZONE_COLORS)
 *   - Roads share one material per type (two draws total)
 *   - Trees use InstancedMesh
 *   - Buildings use InstancedMesh
 *   - CSS2D labels are culled by distance in the main game loop
 *   - No shadow casting on real-map world
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { geoToWorld, validateDistance } from './GeoUtils.js';
import { KOLAR_MAP, ROAD_WIDTHS, ZONE_COLORS, LANDMARK_COLORS } from './RealMapData.js';

/* ─────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────── */
const GROUND_Y           = 0;
const ZONE_Y             = 0.05;    // zone polygons sit 5 cm above ground
const ROAD_Y             = 0.12;    // roads sit above zones
const FIELD_Y            = 0.08;    // farmland patches
const BUILDING_Y_OFFSET  = 0;
const LABEL_HEIGHT       = 18;      // metres above building top for CSS2D label
const TREE_COUNT_GREEN   = 320;     // instanced trees in green zone
const TREE_COUNT_SCRUB   = 180;     // instanced trees in scrub zone
const BUILDING_COUNT_RES = 280;     // instanced residential blocks
const DEBUG_MAP          = false;   // set true to show grid + collider outlines

/* World half-extents (derived from reference measurement + margin) */
const HALF_W = 1800;   // east-west  half-extent in metres
const HALF_H = 1400;   // north-south half-extent in metres

/* ─────────────────────────────────────────────────────
   SHARED GEOMETRIES / MATERIALS
───────────────────────────────────────────────────── */
const UNIT_BOX      = new THREE.BoxGeometry(1, 1, 1);
const TRUNK_GEO     = new THREE.CylinderGeometry(0.6, 0.8, 4, 6);
const LEAF_GEO      = new THREE.ConeGeometry(3, 7, 7);
const SCRUB_GEO     = new THREE.SphereGeometry(2.2, 5, 4);

const MAT_GROUND    = new THREE.MeshLambertMaterial({ color: 0xc2b280 });   // base desert-tan
const MAT_ROAD_MAIN = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
const MAT_ROAD_SEC  = new THREE.MeshLambertMaterial({ color: 0x5a5a5a });
const MAT_ROAD_LOC  = new THREE.MeshLambertMaterial({ color: 0x6b6b6b });
const MAT_ROAD_LINE = new THREE.MeshLambertMaterial({ color: 0xe8d96a });
const MAT_TRUNK     = new THREE.MeshLambertMaterial({ color: 0x6d4c2a });
const MAT_LEAF      = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
const MAT_SCRUB     = new THREE.MeshLambertMaterial({ color: 0x8d7a4a });

const ZONE_MATS = {};
for (const [type, color] of Object.entries(ZONE_COLORS)) {
  ZONE_MATS[type] = new THREE.MeshLambertMaterial({ color });
}

/** Build one shared material per landmark color on demand */
const LANDMARK_MATS = {};
function getLandmarkMat(colorHex) {
  if (!LANDMARK_MATS[colorHex]) {
    LANDMARK_MATS[colorHex] = new THREE.MeshLambertMaterial({ color: parseInt(colorHex, 16) });
  }
  return LANDMARK_MATS[colorHex];
}

/* ─────────────────────────────────────────────────────
   SEEDED RANDOM (deterministic layout)
───────────────────────────────────────────────────── */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ─────────────────────────────────────────────────────
   HELPER — convert [lat, lon] pair to { x, z }
───────────────────────────────────────────────────── */
function pt(latLon) {
  const { x, z } = geoToWorld(latLon[0], latLon[1]);
  return { x, z };
}

/* ─────────────────────────────────────────────────────
   FLAT POLYGON MESH
   Triangulates a convex or simple polygon given as
   { x, z }[] and returns a THREE.Mesh at yLevel.
───────────────────────────────────────────────────── */
function buildPolygonMesh(points, yLevel, material) {
  const n = points.length;
  if (n < 3) return null;

  const positions = [];
  const indices   = [];

  for (const p of points) {
    positions.push(p.x, yLevel, p.z);
  }
  // Fan triangulation from vertex 0 (works for convex + most simple polygons)
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i, i + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = false;
  return mesh;
}

/* ─────────────────────────────────────────────────────
   ROAD SEGMENT GEOMETRY
   Builds a trapezoidal quad strip along a polyline.
───────────────────────────────────────────────────── */
function buildRoadGeometry(points2D, halfWidth) {
  const geometries = [];

  for (let i = 0; i < points2D.length - 1; i++) {
    const a = points2D[i];
    const b = points2D[i + 1];

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) continue;

    // Perpendicular direction
    const px = -dz / len;
    const pz =  dx / len;

    const v0x = a.x + px * halfWidth; const v0z = a.z + pz * halfWidth;
    const v1x = a.x - px * halfWidth; const v1z = a.z - pz * halfWidth;
    const v2x = b.x - px * halfWidth; const v2z = b.z - pz * halfWidth;
    const v3x = b.x + px * halfWidth; const v3z = b.z + pz * halfWidth;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      v0x, ROAD_Y, v0z,
      v1x, ROAD_Y, v1z,
      v2x, ROAD_Y, v2z,
      v3x, ROAD_Y, v3z
    ], 3));
    geo.setIndex([0, 1, 2,  0, 2, 3]);
    geo.computeVertexNormals();
    geometries.push(geo);
  }
  return geometries;
}

/* ─────────────────────────────────────────────────────
   ROAD CENTER-LINE MARKING
───────────────────────────────────────────────────── */
function buildRoadLineGeometry(points2D) {
  const geometries = [];
  const hw = 0.25;   // half-width of centre line stripe

  for (let i = 0; i < points2D.length - 1; i++) {
    const a = points2D[i];
    const b = points2D[i + 1];

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) continue;
    const px = -dz / len;
    const pz =  dx / len;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      a.x + px * hw, ROAD_Y + 0.02, a.z + pz * hw,
      a.x - px * hw, ROAD_Y + 0.02, a.z - pz * hw,
      b.x - px * hw, ROAD_Y + 0.02, b.z - pz * hw,
      b.x + px * hw, ROAD_Y + 0.02, b.z + pz * hw
    ], 3));
    geo.setIndex([0, 1, 2,  0, 2, 3]);
    geo.computeVertexNormals();
    geometries.push(geo);
  }
  return geometries;
}

/* ─────────────────────────────────────────────────────
   CSS2D LABEL FACTORY
───────────────────────────────────────────────────── */
function makeLabel(text, isImportant = false) {
  const div = document.createElement('div');
  div.className = isImportant ? 'map-label map-label--important' : 'map-label';
  div.textContent = text;
  return new CSS2DObject(div);
}

/* ─────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────── */
export function createRealMapWorld(scene) {
  const world = new THREE.Group();
  world.name  = 'Kolar Road Real Map';
  world.userData.buildingColliders = [];
  world.userData.css2dObjects      = [];
  scene.add(world);

  const rng            = makeRng(9977);
  const colliders      = world.userData.buildingColliders;
  const css2dObjects   = world.userData.css2dObjects;

  /* ── 1. GROUND BASE PLANE ─────────────────────── */
  const groundGeo = new THREE.PlaneGeometry(HALF_W * 2, HALF_H * 2);
  const ground    = new THREE.Mesh(groundGeo, MAT_GROUND);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = false;
  world.add(ground);

  /* ── 2. ZONE POLYGONS ─────────────────────────── */
  for (const zone of KOLAR_MAP.zones) {
    const mat = ZONE_MATS[zone.type] || ZONE_MATS.mixed;
    const pts = zone.polygon.map(pt);
    const mesh = buildPolygonMesh(pts, ZONE_Y, mat);
    if (mesh) {
      mesh.name = zone.name;
      world.add(mesh);
    }
  }

  /* ── 3. FARMLAND PATCHES ──────────────────────── */
  const farmMats = [
    new THREE.MeshLambertMaterial({ color: 0xb5a56a }),
    new THREE.MeshLambertMaterial({ color: 0xc4b080 }),
    new THREE.MeshLambertMaterial({ color: 0xa09060 }),
    new THREE.MeshLambertMaterial({ color: 0xba9e6e })
  ];

  for (const patch of KOLAR_MAP.fieldPatches) {
    const { x, z } = geoToWorld(patch.lat, patch.lon);
    const mat  = farmMats[Math.floor(rng() * farmMats.length)];
    const geo  = new THREE.PlaneGeometry(patch.w, patch.d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z =  patch.rotation;
    mesh.position.set(x, FIELD_Y, z);
    world.add(mesh);
  }

  /* ── 4. ROADS ─────────────────────────────────── */
  // Group all road segment geometries by material for one merged draw call each.
  const roadGeosMain = [];
  const roadGeosSec  = [];
  const roadGeosLoc  = [];
  const lineGeoMain  = [];
  const lineGeoLoc   = [];

  for (const road of KOLAR_MAP.roads) {
    const hw   = (ROAD_WIDTHS[road.type] ?? 4) / 2;
    const pts  = road.points.map(pt);
    const segs = buildRoadGeometry(pts, hw);

    if (road.type === 'main') {
      roadGeosMain.push(...segs);
      lineGeoMain.push(...buildRoadLineGeometry(pts));
    } else if (road.type === 'secondary' || road.type === 'tertiary') {
      roadGeosSec.push(...segs);
    } else {
      roadGeosLoc.push(...segs);
      lineGeoLoc.push(...buildRoadLineGeometry(pts));
    }
  }

  function mergeAndAdd(geos, mat) {
    if (!geos.length) return;
    const merged = mergeGeometries(geos);
    world.add(new THREE.Mesh(merged, mat));
    for (const g of geos) g.dispose();
  }

  mergeAndAdd(roadGeosMain, MAT_ROAD_MAIN);
  mergeAndAdd(roadGeosSec,  MAT_ROAD_SEC);
  mergeAndAdd(roadGeosLoc,  MAT_ROAD_LOC);
  mergeAndAdd(lineGeoMain,  MAT_ROAD_LINE);
  mergeAndAdd(lineGeoLoc,   MAT_ROAD_LINE);

  /* ── 5. INSTANCED TREES — Green Zone ─────────── */
  const trunks = new THREE.InstancedMesh(TRUNK_GEO, MAT_TRUNK, TREE_COUNT_GREEN + TREE_COUNT_SCRUB);
  const leaves = new THREE.InstancedMesh(LEAF_GEO,  MAT_LEAF,  TREE_COUNT_GREEN);
  const scrubs  = new THREE.InstancedMesh(SCRUB_GEO, MAT_SCRUB, TREE_COUNT_SCRUB);
  const mtx = new THREE.Matrix4();

  // Green zone trees — scatter inside approximate bounding box
  const gzMinLat = 23.151, gzMaxLat = 23.178;
  const gzMinLon = 77.393, gzMaxLon = 77.408;
  let ti = 0;
  for (let i = 0; i < TREE_COUNT_GREEN; i++) {
    const lat = gzMinLat + rng() * (gzMaxLat - gzMinLat);
    const lon = gzMinLon + rng() * (gzMaxLon - gzMinLon);
    const { x, z } = geoToWorld(lat, lon);
    const s = 0.7 + rng() * 0.5;
    mtx.makeScale(s, s, s);
    mtx.setPosition(x, 2 * s, z);
    trunks.setMatrixAt(ti, mtx);
    mtx.setPosition(x, 7 * s, z);
    leaves.setMatrixAt(i, mtx);
    ti++;
  }
  // Scrub zone low bushes — upper-left brown area
  const szMinLat = 23.152, szMaxLat = 23.178;
  const szMinLon = 77.379, szMaxLon = 77.393;
  for (let i = 0; i < TREE_COUNT_SCRUB; i++) {
    const lat = szMinLat + rng() * (szMaxLat - szMinLat);
    const lon = szMinLon + rng() * (szMaxLon - szMinLon);
    const { x, z } = geoToWorld(lat, lon);
    const s = 0.6 + rng() * 0.6;
    mtx.makeScale(s, s, s);
    mtx.setPosition(x, 1.5 * s, z);
    trunks.setMatrixAt(ti, mtx);
    mtx.makeScale(s * 0.9, s * 0.8, s * 0.9);
    mtx.setPosition(x, 2.5 * s, z);
    scrubs.setMatrixAt(i, mtx);
    ti++;
  }

  trunks.count = ti;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  scrubs.instanceMatrix.needsUpdate = true;
  world.add(trunks, leaves, scrubs);

  /* ── 6. INSTANCED RESIDENTIAL BUILDINGS ──────── */
  // Two building sizes: small house (type A) and medium block (type B)
  const resMatA = new THREE.MeshLambertMaterial({ color: 0xd8cfc0 }); // warm grey
  const resMatB = new THREE.MeshLambertMaterial({ color: 0xc9bfb2 });
  const resMatRoof = new THREE.MeshLambertMaterial({ color: 0x8a7f78 });
  const resA = new THREE.InstancedMesh(UNIT_BOX, resMatA, BUILDING_COUNT_RES);
  const resB = new THREE.InstancedMesh(UNIT_BOX, resMatB, BUILDING_COUNT_RES);
  const resRoof = new THREE.InstancedMesh(UNIT_BOX, resMatRoof, BUILDING_COUNT_RES * 2);
  let cntA = 0, cntB = 0, cntRoof = 0;

  // Scatter residential buildings in the residential zone bounding box
  const resMinLat = 23.151, resMaxLat = 23.178;
  const resMinLon = 77.408, resMaxLon = 77.422;

  for (let i = 0; i < BUILDING_COUNT_RES; i++) {
    const lat = resMinLat + rng() * (resMaxLat - resMinLat);
    const lon = resMinLon + rng() * (resMaxLon - resMinLon);
    const { x, z } = geoToWorld(lat, lon);
    const w = 10 + rng() * 8;
    const d = 12 + rng() * 8;
    const h =  4 + rng() * 5;

    if (rng() > 0.4) {
      // Type A — small house
      mtx.makeScale(w, h, d);
      mtx.setPosition(x, h / 2, z);
      resA.setMatrixAt(cntA++, mtx);
    } else {
      // Type B — medium block
      const bw = w * 1.4, bh = h * 1.3;
      mtx.makeScale(bw, bh, d * 1.3);
      mtx.setPosition(x, bh / 2, z);
      resB.setMatrixAt(cntB++, mtx);
      mtx.makeScale(bw + 0.5, 0.6, d * 1.3 + 0.5);
      mtx.setPosition(x, bh + 0.3, z);
      resRoof.setMatrixAt(cntRoof++, mtx);
    }

    // Lightweight collision (every 4th building to save CPU)
    if (i % 4 === 0) {
      colliders.push({
        minX: x - w / 2 - 2, maxX: x + w / 2 + 2,
        minY: 0,              maxY: h + 2,
        minZ: z - d / 2 - 2, maxZ: z + d / 2 + 2
      });
    }
  }

  resA.count = cntA; resA.instanceMatrix.needsUpdate = true;
  resB.count = cntB; resB.instanceMatrix.needsUpdate = true;
  resRoof.count = cntRoof; resRoof.instanceMatrix.needsUpdate = true;
  world.add(resA, resB, resRoof);

  /* ── 7. LANDMARK BUILDINGS + LABELS ──────────── */
  // Loaded synchronously from the embedded data — no network fetch needed.
  // landmarks.json is imported at build time via fetch; for now we inline from RealMapData.
  // (The landmarks.json in public/ serves as editable reference and matches this array.)

  const landmarks = [
    { name: 'CHC Kolar',                    shortName: 'CHC Kolar',         type: 'hospital',   lat: 23.168582, lon: 77.418417, verified: true,  color: '0xe8f5e9', height: 8,  fw: 40, fd: 30 },
    { name: 'Kolar Road Police Station',    shortName: 'Police Station',     type: 'police',    lat: 23.17012,  lon: 77.41660,  verified: false, color: '0xbbdefb', height: 7,  fw: 30, fd: 25 },
    { name: 'D Mart',                       shortName: 'D Mart',             type: 'commercial',lat: 23.16083,  lon: 77.41332,  verified: false, color: '0xfff9c4', height: 9,  fw: 55, fd: 40 },
    { name: 'Vindhyachal Academy',          shortName: 'Vindhyachal',        type: 'school',    lat: 23.16071,  lon: 77.40845,  verified: false, color: '0xf3e5f5', height: 8,  fw: 60, fd: 45 },
    { name: 'Cricket Academy of Pathans',   shortName: 'Cricket Academy',    type: 'academy',   lat: 23.1635,   lon: 77.4070,   verified: false, color: '0xe8f5e9', height: 5,  fw: 120,fd: 80 },
    { name: 'Maa Pahada Wali Mandir',       shortName: 'Pahada Mandir',      type: 'temple',    lat: 23.1650,   lon: 77.4095,   verified: false, color: '0xffe0b2', height: 6,  fw: 20, fd: 20 },
    { name: 'Dk Honey Homes Mandir',        shortName: 'DK Mandir',          type: 'temple',    lat: 23.1678,   lon: 77.4125,   verified: false, color: '0xffe0b2', height: 5,  fw: 18, fd: 18 },
    { name: 'St. Joseph Co Ed School',      shortName: 'St. Joseph School',  type: 'school',    lat: 23.1560,   lon: 77.4095,   verified: false, color: '0xf3e5f5', height: 9,  fw: 70, fd: 50 },
    { name: 'Kratika Marriage Garden',      shortName: 'Kratika Garden',     type: 'garden',    lat: 23.1575,   lon: 77.3960,   verified: false, color: '0xdcedc8', height: 4,  fw: 80, fd: 60 },
    { name: 'Castle of Dreams',             shortName: 'Castle of Dreams',   type: 'venue',     lat: 23.1540,   lon: 77.4010,   verified: false, color: '0xfce4ec', height: 10, fw: 50, fd: 40 },
    { name: 'Palash Goat Farm',             shortName: 'Palash Farm',        type: 'farm',      lat: 23.1580,   lon: 77.3880,   verified: false, color: '0xf1f8e9', height: 4,  fw: 50, fd: 40 },
    { name: 'Naag Mandir',                  shortName: 'Naag Mandir',        type: 'temple',    lat: 23.1555,   lon: 77.3885,   verified: false, color: '0xffe0b2', height: 5,  fw: 15, fd: 15 },
    { name: 'The Celebrations Resort',      shortName: 'Celebrations Resort',type: 'resort',    lat: 23.1750,   lon: 77.4210,   verified: false, color: '0xfce4ec', height: 8,  fw: 60, fd: 50 },
    { name: 'Akbarpura',                    shortName: 'Akbarpura',          type: 'area',      lat: 23.1730,   lon: 77.4110,   verified: false, color: '0x90a4ae', height: 0,  fw: 0,  fd: 0  },
    { name: 'Vashikaran Tantra (NW)',       shortName: 'Jyotish',            type: 'marker',    lat: 23.1750,   lon: 77.3980,   verified: false, color: '0x90a4ae', height: 3,  fw: 10, fd: 10 }
  ];

  // Landmark-type roof colors
  const ROOF_COLOR = {
    hospital:   0x66bb6a, police: 0x1565c0, school: 0x7b1fa2,
    academy:    0x2e7d32, temple: 0xe65100, commercial: 0xf9a825,
    resort:     0xc62828, venue: 0xad1457, garden: 0x33691e,
    farm:       0x6d4c41, marker: 0x607d8b, area: 0x607d8b
  };

  for (const lm of landmarks) {
    if (!lm.fw || !lm.fd || !lm.height) {
      // Area label only — no building mesh
      const { x, z } = geoToWorld(lm.lat, lm.lon);
      const label = makeLabel(lm.shortName, false);
      label.position.set(x, 20, z);
      world.add(label);
      css2dObjects.push(label);
      continue;
    }

    const { x, z } = geoToWorld(lm.lat, lm.lon);
    const mat  = getLandmarkMat(lm.color);
    const body = new THREE.Mesh(new THREE.BoxGeometry(lm.fw, lm.height, lm.fd), mat);
    body.position.set(x, lm.height / 2 + BUILDING_Y_OFFSET, z);
    body.castShadow = false;
    world.add(body);

    // Roof accent
    const roofColor = ROOF_COLOR[lm.type] ?? 0x607d8b;
    const roofMat   = new THREE.MeshLambertMaterial({ color: roofColor });
    const roof      = new THREE.Mesh(new THREE.BoxGeometry(lm.fw + 0.6, 0.7, lm.fd + 0.6), roofMat);
    roof.position.set(x, lm.height + 0.35 + BUILDING_Y_OFFSET, z);
    world.add(roof);

    // Building collider
    colliders.push({
      minX: x - lm.fw / 2 - 3, maxX: x + lm.fw / 2 + 3,
      minY: 0,                   maxY: lm.height + 4,
      minZ: z - lm.fd / 2 - 3,  maxZ: z + lm.fd / 2 + 3
    });

    // CSS2D label
    const isImportant = ['hospital', 'police', 'school', 'commercial', 'academy'].includes(lm.type);
    const label = makeLabel(lm.shortName, isImportant);
    label.position.set(x, lm.height + LABEL_HEIGHT, z);
    world.add(label);
    css2dObjects.push(label);
  }

  /* ── 8. ROAD LABELS (major roads only) ────────── */
  const roadLabels = [
    { text: 'Kolar Road',         lat: 23.1660, lon: 77.4173 },
    { text: 'Danish Kunj Rd',     lat: 23.1752, lon: 77.4175 },
    { text: 'Atal Bihari Rd',     lat: 23.1585, lon: 77.4155 }
  ];
  for (const rl of roadLabels) {
    const { x, z } = geoToWorld(rl.lat, rl.lon);
    const label = makeLabel(rl.text, false);
    label.position.set(x, 8, z);
    world.add(label);
    css2dObjects.push(label);
  }

  /* ── 9. SPAWN POSITIONS ───────────────────────── */
  const spawnPositions = KOLAR_MAP.spawnPoints.map((sp, i) => {
    const { x, z } = geoToWorld(sp.lat, sp.lon);
    return {
      airplane: { x, y: sp.altitudeAirplane, z },
      drone:    { x, y: sp.altitudeDrone,    z },
      headingAirplane: i === 0 ? 0 : Math.PI,
      headingDrone:    i === 0 ? 0 : Math.PI
    };
  });

  /* ── 10. WORLD BOUNDS ─────────────────────────── */
  world.userData.spawnPositions = spawnPositions;
  world.userData.worldBounds    = { halfX: HALF_W, halfZ: HALF_H };

  /* ── 11. DEBUG HELPERS ────────────────────────── */
  if (DEBUG_MAP) {
    _addDebugGrid(world);
    _addBoundsBox(world, HALF_W, HALF_H);
    _runDistanceValidations();
  }

  return world;
}

/* ─────────────────────────────────────────────────────
   DEBUG UTILITIES (only active when DEBUG_MAP = true)
───────────────────────────────────────────────────── */
function _addDebugGrid(world) {
  const gridHelper = new THREE.GridHelper(4000, 40, 0x555555, 0x333333);
  gridHelper.position.y = 0.3;
  world.add(gridHelper);

  // 500 m major lines
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff6600 });
  for (let x = -2000; x <= 2000; x += 500) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.4, -2000),
      new THREE.Vector3(x, 0.4,  2000)
    ]);
    world.add(new THREE.Line(geo, lineMat));
  }
  for (let z = -1500; z <= 1500; z += 500) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2000, 0.4, z),
      new THREE.Vector3( 2000, 0.4, z)
    ]);
    world.add(new THREE.Line(geo, lineMat));
  }
}

function _addBoundsBox(world, hw, hh) {
  const box = new THREE.Box3(
    new THREE.Vector3(-hw, 0, -hh),
    new THREE.Vector3( hw, 1,  hh)
  );
  world.add(new THREE.Box3Helper(box, 0xff0000));
}

function _runDistanceValidations() {
  const ANCHORS = {
    CHC:    { lat: 23.168582, lon: 77.418417 },
    Police: { lat: 23.17012,  lon: 77.41660  },
    DMart:  { lat: 23.16083,  lon: 77.41332  },
    Vindhyachal: { lat: 23.16071, lon: 77.40845 }
  };
  validateDistance('Police Station', ANCHORS.Police, 'CHC Kolar', ANCHORS.CHC);
  validateDistance('CHC Kolar', ANCHORS.CHC, 'D-Mart', ANCHORS.DMart);
  validateDistance('D-Mart', ANCHORS.DMart, 'Vindhyachal', ANCHORS.Vindhyachal);
}
