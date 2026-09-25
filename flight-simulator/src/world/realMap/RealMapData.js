/**
 * RealMapData.js — Geographic data for the Kolar Road, Bhopal real-world map.
 *
 * All positions are stored as [latitude, longitude] decimal degree pairs.
 * RealMapWorld.js converts them to Three.js coordinates using GeoUtils.geoToWorld().
 *
 * COORDINATE SOURCE LEGEND
 * "screenshot-visible"  — coordinate was directly readable on the reference screenshots
 * "screenshot-traced"   — position estimated by anchoring screenshot to visible coordinates
 * "inferred"            — derived from road network / area context
 *
 * VERIFICATION
 * verified: true  → coordinate obtained from a readable source in the screenshots
 * verified: false → traced or inferred; mark for future manual refinement
 *
 * EDITING GUIDE
 * - To move a road: edit the points[] array (each point is [lat, lon])
 * - To move a zone: edit the polygon[] array
 * - To add a landmark: add an entry to the landmarks[] array (see existing format)
 * - All values must use [lat, lon] order (NOT lon, lat)
 */

export const KOLAR_MAP = {

  /* ──────────────────────────────────────────────
     WORLD SIZE
     These are reference values derived from the
     3.28 km horizontal measurement in the screenshots.
     Actual Three.js extent is calculated from geoToWorld().
  ────────────────────────────────────────────── */
  referenceWidth:  3280,   // metres (horizontal extent from screenshot measurement)
  referenceHeight: 2560,   // metres (north-south extent estimated from screenshots)

  /* ──────────────────────────────────────────────
     SPAWN POSITIONS
     Drone/aircraft start here.  Must be in open
     space above the Cricket Academy / central road zone.
  ────────────────────────────────────────────── */
  spawnPoints: [
    // Player 1 — above central open area near Cricket Academy
    { lat: 23.1640, lon: 77.4065, altitudeAirplane: 200, altitudeDrone: 80 },
    // Player 2 — slightly offset north-east
    { lat: 23.1660, lon: 77.4090, altitudeAirplane: 200, altitudeDrone: 80 }
  ],

  /* ──────────────────────────────────────────────
     ROADS
     Each road has:
       name     — display name
       type     — "main" | "secondary" | "tertiary" | "local"
       points   — [lat, lon] polyline (north to south preferred)
     Road widths are resolved in RealMapWorld.js based on type.
  ────────────────────────────────────────────── */
  roads: [
    {
      name: 'Kolar Road',
      type: 'main',
      source: 'screenshot-traced',
      // The main north-south corridor along the right side of the map.
      points: [
        [23.1780, 77.4185],
        [23.1740, 77.4183],
        [23.1700, 77.4178],
        [23.1660, 77.4170],
        [23.1630, 77.4162],
        [23.1600, 77.4155],
        [23.1570, 77.4150],
        [23.1540, 77.4148],
        [23.1510, 77.4145]
      ]
    },
    {
      name: 'Danish Kunj Kolar Road',
      type: 'secondary',
      source: 'screenshot-traced',
      // East-west connector near the top-right of the visible area.
      points: [
        [23.1755, 77.4145],
        [23.1752, 77.4175],
        [23.1750, 77.4210]
      ]
    },
    {
      name: 'Atal Bihari Road',
      type: 'secondary',
      source: 'screenshot-traced',
      // Lower horizontal road near D-Mart area.
      points: [
        [23.1590, 77.4100],
        [23.1585, 77.4145],
        [23.1583, 77.4185],
        [23.1580, 77.4215]
      ]
    },
    {
      name: 'Diagonal Road (Central)',
      type: 'secondary',
      source: 'screenshot-traced',
      // The diagonal road cutting from upper-centre toward Cricket Academy / D-Mart.
      points: [
        [23.1690, 77.4100],
        [23.1670, 77.4090],
        [23.1650, 77.4078],
        [23.1635, 77.4070],
        [23.1620, 77.4075],
        [23.1605, 77.4090],
        [23.1590, 77.4105],
        [23.1575, 77.4125],
        [23.1570, 77.4145]
      ]
    },
    {
      name: 'Western Access Road (NW)',
      type: 'local',
      source: 'screenshot-traced',
      // Road running through the western open area toward Palash Farm.
      points: [
        [23.1700, 77.3980],
        [23.1670, 77.3970],
        [23.1640, 77.3960],
        [23.1610, 77.3950],
        [23.1580, 77.3945]
      ]
    },
    {
      name: 'Local Road — Central North',
      type: 'local',
      source: 'screenshot-traced',
      points: [
        [23.1720, 77.4100],
        [23.1700, 77.4095],
        [23.1680, 77.4090]
      ]
    },
    {
      name: 'Local Road — Residential East 1',
      type: 'local',
      source: 'screenshot-traced',
      points: [
        [23.1720, 77.4155],
        [23.1700, 77.4152],
        [23.1680, 77.4150],
        [23.1650, 77.4148]
      ]
    },
    {
      name: 'Local Road — Residential East 2',
      type: 'local',
      source: 'screenshot-traced',
      points: [
        [23.1680, 77.4180],
        [23.1660, 77.4175],
        [23.1640, 77.4170]
      ]
    },
    {
      name: 'Road to Cricket Academy',
      type: 'local',
      source: 'screenshot-traced',
      points: [
        [23.1650, 77.4050],
        [23.1638, 77.4060],
        [23.1630, 77.4070]
      ]
    },
    {
      name: 'Local Road — South 1',
      type: 'local',
      source: 'screenshot-traced',
      points: [
        [23.1570, 77.4095],
        [23.1565, 77.4120],
        [23.1562, 77.4148]
      ]
    }
  ],

  /* ──────────────────────────────────────────────
     LAND USE ZONES
     Each zone has:
       name     — description
       type     — "green" | "scrub" | "farmland" | "residential" | "commercial" | "mixed"
       polygon  — [lat, lon] polygon (closed automatically in builder)
     Colors resolved in RealMapWorld.js from type.
  ────────────────────────────────────────────── */
  zones: [
    {
      name: 'Green / Open Area (West)',
      type: 'green',
      source: 'screenshot-traced',
      // The large light-green/open zone on the left side of all reference screenshots.
      polygon: [
        [23.1780, 77.3930],
        [23.1780, 77.4010],
        [23.1750, 77.4020],
        [23.1720, 77.4035],
        [23.1700, 77.4030],
        [23.1680, 77.4020],
        [23.1660, 77.4015],
        [23.1640, 77.4025],
        [23.1620, 77.4035],
        [23.1600, 77.4050],
        [23.1580, 77.4040],
        [23.1560, 77.4020],
        [23.1540, 77.3990],
        [23.1520, 77.3960],
        [23.1510, 77.3930]
      ]
    },
    {
      name: 'Dry Scrubland / Brown Area (North-West)',
      type: 'scrub',
      source: 'screenshot-traced',
      // Brown hilly area visible in the satellite view (upper-left).
      polygon: [
        [23.1780, 77.3930],
        [23.1780, 77.3790],
        [23.1650, 77.3790],
        [23.1510, 77.3930],
        [23.1520, 77.3960],
        [23.1540, 77.3990],
        [23.1560, 77.4020],
        [23.1580, 77.4040],
        [23.1600, 77.4050],
        [23.1620, 77.4035],
        [23.1640, 77.4025],
        [23.1660, 77.4015],
        [23.1680, 77.4020],
        [23.1700, 77.4030],
        [23.1720, 77.4035],
        [23.1750, 77.4020],
        [23.1780, 77.4010]
      ]
    },
    {
      name: 'Farmland / Field Patches (Central)',
      type: 'farmland',
      source: 'screenshot-traced',
      // Patchwork agricultural area visible in satellite view.
      polygon: [
        [23.1700, 77.4030],
        [23.1720, 77.4035],
        [23.1700, 77.4060],
        [23.1680, 77.4075],
        [23.1660, 77.4080],
        [23.1640, 77.4070],
        [23.1620, 77.4060],
        [23.1600, 77.4060],
        [23.1580, 77.4050],
        [23.1600, 77.4050],
        [23.1620, 77.4035],
        [23.1640, 77.4025],
        [23.1660, 77.4015],
        [23.1680, 77.4020]
      ]
    },
    {
      name: 'Residential Area (Central-East)',
      type: 'residential',
      source: 'screenshot-traced',
      // Mixed residential zone between the diagonal road and Kolar Road.
      polygon: [
        [23.1720, 77.4095],
        [23.1720, 77.4150],
        [23.1690, 77.4148],
        [23.1660, 77.4145],
        [23.1640, 77.4150],
        [23.1610, 77.4140],
        [23.1590, 77.4110],
        [23.1605, 77.4090],
        [23.1620, 77.4075],
        [23.1640, 77.4070],
        [23.1660, 77.4080],
        [23.1680, 77.4075],
        [23.1700, 77.4060]
      ]
    },
    {
      name: 'Dense Residential (East — along Kolar Road)',
      type: 'residential',
      source: 'screenshot-traced',
      // The dense settlement on the right side of the map.
      polygon: [
        [23.1780, 77.4140],
        [23.1780, 77.4220],
        [23.1510, 77.4220],
        [23.1510, 77.4145],
        [23.1540, 77.4148],
        [23.1570, 77.4150],
        [23.1600, 77.4155],
        [23.1630, 77.4162],
        [23.1660, 77.4170],
        [23.1700, 77.4178],
        [23.1740, 77.4183],
        [23.1780, 77.4185]
      ]
    }
  ],

  /* ──────────────────────────────────────────────
     FARMLAND PATCHES
     Individual patchwork fields visible in satellite.
     Simple sub-rectangles within the farmland zone.
  ────────────────────────────────────────────── */
  fieldPatches: [
    { lat: 23.1695, lon: 77.4050, w: 120, d: 100, rotation: 0.3 },
    { lat: 23.1680, lon: 77.4030, w: 100, d: 90,  rotation: -0.2 },
    { lat: 23.1665, lon: 77.4055, w: 110, d: 85,  rotation: 0.5 },
    { lat: 23.1650, lon: 77.4042, w: 95,  d: 80,  rotation: 0.1 },
    { lat: 23.1635, lon: 77.4055, w: 105, d: 90,  rotation: -0.3 },
    { lat: 23.1620, lon: 77.4045, w: 90,  d: 75,  rotation: 0.4 },
    { lat: 23.1608, lon: 77.4065, w: 100, d: 80,  rotation: 0.2 }
  ]
};

/**
 * Road widths in metres by type.
 * Edit here to visually widen/narrow road categories.
 */
export const ROAD_WIDTHS = {
  main:      12,
  secondary:  8,
  tertiary:   6,
  local:      4
};

/**
 * Zone surface colors.
 * Edit hex values here to restyle land-use zones.
 */
export const ZONE_COLORS = {
  green:       0x8bc34a,   // light green
  scrub:       0x9e8b6e,   // brown-tan
  farmland:    0xb5a56a,   // golden-tan
  residential: 0xd8cfc0,   // warm grey
  commercial:  0xbdbdbd,   // grey
  mixed:       0xc8bfb0    // light warm grey
};

/**
 * Landmark type colours (building material color).
 * Edit to restyle individual landmark categories.
 */
export const LANDMARK_COLORS = {
  hospital:   0xe8f5e9,
  police:     0xbbdefb,
  school:     0xf3e5f5,
  academy:    0xdcedc8,
  temple:     0xffe0b2,
  commercial: 0xfff9c4,
  resort:     0xfce4ec,
  venue:      0xfce4ec,
  garden:     0xdcedc8,
  farm:       0xf1f8e9,
  marker:     0x90a4ae,
  area:       0x90a4ae
};
