/**
 * GeoUtils.js — Geographic coordinate ↔ Three.js world meter conversion.
 *
 * Convention:
 *   +X  = east
 *   -X  = west
 *   -Z  = north
 *   +Z  = south
 *   +Y  = altitude (always metres above local ground)
 *
 *  1 Three.js world unit = 1 real-world metre.
 *
 * The equirectangular local-tangent projection used here is accurate to
 * within ~1 m across a 4 km area — sufficient for a school simulator.
 */

const EARTH_RADIUS_M = 6_378_137;

/**
 * World origin – geographic centre of the reconstructed area.
 * Changing these two values shifts the entire map.
 */
export const ORIGIN_LAT = 23.166;   // degrees
export const ORIGIN_LON = 77.408;   // degrees

const ORIGIN_LAT_RAD = ORIGIN_LAT * (Math.PI / 180);
const ORIGIN_LON_RAD = ORIGIN_LON * (Math.PI / 180);
const COS_LAT0       = Math.cos(ORIGIN_LAT_RAD);

/**
 * Convert geographic coordinates to local Three.js world coordinates.
 *
 * @param {number} lat  Latitude  in decimal degrees
 * @param {number} lon  Longitude in decimal degrees
 * @param {number} alt  Altitude  in metres above local ground (default 0)
 * @returns {{ x: number, y: number, z: number }}
 */
export function geoToWorld(lat, lon, alt = 0) {
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  const x =  EARTH_RADIUS_M * (lonRad - ORIGIN_LON_RAD) * COS_LAT0;
  const z = -EARTH_RADIUS_M * (latRad - ORIGIN_LAT_RAD); // -Z = north
  return { x, y: alt, z };
}

/**
 * Convert local Three.js world coordinates back to geographic coordinates.
 * Useful for debug / distance-check tools.
 *
 * @param {number} x  World X (metres, east positive)
 * @param {number} z  World Z (metres, south positive)
 * @returns {{ lat: number, lon: number }}
 */
export function worldToGeo(x, z) {
  const lonRad = x / (EARTH_RADIUS_M * COS_LAT0) + ORIGIN_LON_RAD;
  const latRad = -z / EARTH_RADIUS_M + ORIGIN_LAT_RAD;
  return {
    lat: latRad * (180 / Math.PI),
    lon: lonRad * (180 / Math.PI)
  };
}

/**
 * Haversine distance between two geographic points (metres).
 * Used only for validation / debug output.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Validate that the Three.js XZ distance between two geo-anchors matches
 * real geographic distance.  Prints to console in development.
 *
 * @param {string} nameA
 * @param {{ lat, lon }} a
 * @param {string} nameB
 * @param {{ lat, lon }} b
 */
export function validateDistance(nameA, a, nameB, b) {
  const geoDist   = haversineDistance(a.lat, a.lon, b.lat, b.lon);
  const wa        = geoToWorld(a.lat, a.lon);
  const wb        = geoToWorld(b.lat, b.lon);
  const sceneDist = Math.sqrt((wb.x - wa.x) ** 2 + (wb.z - wa.z) ** 2);
  const errorM    = Math.abs(geoDist - sceneDist);
  // eslint-disable-next-line no-console
  console.log(
    `[GeoValidation] ${nameA} ↔ ${nameB}` +
    `  geo: ${geoDist.toFixed(1)} m` +
    `  scene: ${sceneDist.toFixed(1)} m` +
    `  error: ${errorM.toFixed(2)} m`
  );
}
