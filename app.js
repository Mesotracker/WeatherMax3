const TAU = Math.PI * 2;
const STEP_MINUTES = 5;
const REALTIME_STEP_MS = 60_000;
const MAX_TIME_INDEX = 72;
const REPORT_DELAY_STEPS = 2;
const RASTER_SCALE = 0.72;
const MAX_WEATHER_CACHE = 18;
const MAX_FRAME_CACHE = 40;
const MAX_HAZARD_CACHE = 96;
const MAX_REPORT_CACHE = 28;
const MAX_WEATHER_PIXELS = 250_000;
const DEFAULT_AREA_MODE = "county";
const KNOTS_TO_MPH = 1.15078;
const EARTH_RADIUS_KM = 6371;
const REFRACTION_INDEX = 4 / 3;
const NEXRAD_TILTS = [0.5, 1.5, 2.4, 3.4];
const BEAMWIDTH_DEG = 1;
const NEXRAD_REFLECTIVITY_COLORS = [
  [5, [100, 100, 100, 95]],
  [10, [4, 233, 231, 125]],
  [15, [1, 159, 244, 145]],
  [20, [3, 0, 244, 160]],
  [25, [2, 253, 2, 175]],
  [30, [1, 197, 1, 198]],
  [35, [0, 142, 0, 216]],
  [40, [253, 248, 2, 226]],
  [45, [229, 188, 0, 236]],
  [50, [253, 149, 0, 242]],
  [55, [253, 0, 0, 248]],
  [60, [212, 0, 0, 252]],
  [65, [188, 0, 0, 255]],
  [70, [248, 0, 253, 255]],
  [75, [152, 84, 198, 255]],
  [80, [253, 253, 253, 255]],
];

const CASES = [
  {
    id: "southern-plains",
    name: "Southern Plains Dryline",
    region: "OK / KS / TX Panhandle",
    start: "2026-05-18T20:00:00Z",
    briefing:
      "A deepening lee cyclone, backed surface winds, and an uncapped dryline support discrete supercells before upscale growth after sunset.",
    setup: [
      ["MLCAPE", "3100 J/kg"],
      ["0-1 km SRH", "220 m2/s2"],
      ["Deep Shear", "55 kt"],
      ["Storm Mode", "Discrete to clusters"],
    ],
    radarSite: { x: 0.34, y: 0.66 },
    mapLabels: [
      { text: "KS", x: 0.47, y: 0.12 },
      { text: "OK", x: 0.48, y: 0.52 },
      { text: "TX", x: 0.42, y: 0.86 },
      { text: "AR", x: 0.82, y: 0.62 },
    ],
    cities: [
      { name: "Wichita", x: 0.49, y: 0.18 },
      { name: "Enid", x: 0.43, y: 0.39 },
      { name: "OKC", x: 0.52, y: 0.52 },
      { name: "Tulsa", x: 0.66, y: 0.45 },
      { name: "Lawton", x: 0.42, y: 0.69 },
    ],
    storms: [
      {
        id: "a",
        mode: "supercell",
        x: 0.2,
        y: 0.74,
        vx: 0.018,
        vy: -0.018,
        angle: -0.58,
        intensity: 0.88,
        rotation: 0.95,
        hail: 0.86,
        flood: 0.38,
        seed: 11,
      },
      {
        id: "b",
        mode: "supercell",
        x: 0.26,
        y: 0.58,
        vx: 0.02,
        vy: -0.016,
        angle: -0.48,
        intensity: 0.8,
        rotation: 0.74,
        hail: 0.92,
        flood: 0.32,
        seed: 24,
      },
      {
        id: "c",
        mode: "supercell",
        x: 0.17,
        y: 0.43,
        vx: 0.019,
        vy: -0.015,
        angle: -0.52,
        intensity: 0.72,
        rotation: 0.7,
        hail: 0.76,
        flood: 0.28,
        seed: 37,
      },
      {
        id: "d",
        mode: "line",
        x: 0.08,
        y: 0.88,
        vx: 0.018,
        vy: -0.012,
        angle: -0.18,
        intensity: 0.62,
        rotation: 0.38,
        hail: 0.46,
        flood: 0.48,
        length: 0.58,
        seed: 44,
      },
    ],
  },
  {
    id: "dixie-qlcs",
    name: "Nocturnal Dixie QLCS",
    region: "MS / AL / TN",
    start: "2026-04-07T02:00:00Z",
    briefing:
      "A fast-moving squall line enters a high-shear warm sector. Embedded circulations cycle quickly within a widespread damaging wind threat.",
    setup: [
      ["MLCAPE", "1500 J/kg"],
      ["0-1 km SRH", "340 m2/s2"],
      ["Deep Shear", "68 kt"],
      ["Storm Mode", "QLCS with mesovortices"],
    ],
    radarSite: { x: 0.42, y: 0.46 },
    mapLabels: [
      { text: "MS", x: 0.27, y: 0.55 },
      { text: "AL", x: 0.55, y: 0.55 },
      { text: "TN", x: 0.55, y: 0.16 },
      { text: "GA", x: 0.83, y: 0.61 },
    ],
    cities: [
      { name: "Memphis", x: 0.34, y: 0.18 },
      { name: "Jackson", x: 0.31, y: 0.64 },
      { name: "Birmingham", x: 0.62, y: 0.47 },
      { name: "Tuscaloosa", x: 0.54, y: 0.52 },
      { name: "Huntsville", x: 0.62, y: 0.28 },
    ],
    storms: [
      {
        id: "q1",
        mode: "line",
        x: 0.18,
        y: 0.78,
        vx: 0.023,
        vy: -0.012,
        angle: -0.3,
        intensity: 0.9,
        rotation: 0.82,
        hail: 0.35,
        flood: 0.7,
        length: 0.88,
        seed: 61,
      },
      {
        id: "q2",
        mode: "line",
        x: 0.05,
        y: 0.38,
        vx: 0.025,
        vy: -0.009,
        angle: -0.22,
        intensity: 0.78,
        rotation: 0.72,
        hail: 0.3,
        flood: 0.62,
        length: 0.6,
        seed: 73,
      },
      {
        id: "pre",
        mode: "supercell",
        x: 0.48,
        y: 0.76,
        vx: 0.021,
        vy: -0.016,
        angle: -0.45,
        intensity: 0.58,
        rotation: 0.76,
        hail: 0.38,
        flood: 0.5,
        seed: 85,
      },
    ],
  },
  {
    id: "high-plains-mcs",
    name: "High Plains Derecho",
    region: "NE / IA / MO",
    start: "2026-06-22T21:00:00Z",
    briefing:
      "Elevated storms consolidate into a forward-propagating bow echo. Extreme DCAPE favors swaths of significant wind and sporadic large hail.",
    setup: [
      ["MLCAPE", "4200 J/kg"],
      ["DCAPE", "1600 J/kg"],
      ["Deep Shear", "42 kt"],
      ["Storm Mode", "Bow echo / MCS"],
    ],
    radarSite: { x: 0.53, y: 0.53 },
    mapLabels: [
      { text: "NE", x: 0.24, y: 0.28 },
      { text: "IA", x: 0.66, y: 0.31 },
      { text: "MO", x: 0.68, y: 0.72 },
      { text: "KS", x: 0.24, y: 0.73 },
    ],
    cities: [
      { name: "Omaha", x: 0.48, y: 0.38 },
      { name: "Lincoln", x: 0.37, y: 0.43 },
      { name: "Des Moines", x: 0.74, y: 0.34 },
      { name: "Kansas City", x: 0.62, y: 0.75 },
      { name: "Topeka", x: 0.46, y: 0.79 },
    ],
    storms: [
      {
        id: "m1",
        mode: "bow",
        x: 0.16,
        y: 0.46,
        vx: 0.026,
        vy: 0.004,
        angle: 0.05,
        intensity: 0.95,
        rotation: 0.42,
        hail: 0.58,
        flood: 0.48,
        length: 0.72,
        seed: 101,
      },
      {
        id: "m2",
        mode: "supercell",
        x: 0.26,
        y: 0.24,
        vx: 0.023,
        vy: 0.002,
        angle: 0.1,
        intensity: 0.7,
        rotation: 0.52,
        hail: 0.88,
        flood: 0.33,
        seed: 112,
      },
      {
        id: "m3",
        mode: "supercell",
        x: 0.28,
        y: 0.72,
        vx: 0.024,
        vy: -0.002,
        angle: -0.04,
        intensity: 0.64,
        rotation: 0.45,
        hail: 0.76,
        flood: 0.42,
        seed: 126,
      },
    ],
  },
  {
    id: "national-outbreak",
    name: "National CONUS Severe Desk",
    region: "CONUS / multi-office coordination",
    national: true,
    start: "2026-05-24T18:00:00Z",
    briefing:
      "A national desk shift with multiple severe corridors from the Plains into the Southeast and Mid-Atlantic. Coordinate broad watches, local warnings, and mesoscale discussions across the full CONUS domain.",
    setup: [
      ["MLCAPE", "2800 J/kg"],
      ["0-1 km SRH", "260 m2/s2"],
      ["Deep Shear", "58 kt"],
      ["Storm Mode", "Mixed supercells / QLCS"],
    ],
    radarSite: { x: 0.49, y: 0.55 },
    mapLabels: [
      { text: "NW", x: 0.16, y: 0.19 },
      { text: "NRN PLAINS", x: 0.48, y: 0.19 },
      { text: "OH VLY", x: 0.72, y: 0.42 },
      { text: "SOUTH", x: 0.58, y: 0.73 },
      { text: "EAST", x: 0.86, y: 0.54 },
      { text: "SW", x: 0.24, y: 0.73 },
    ],
    cities: [
      { name: "Seattle", x: 0.13, y: 0.16 },
      { name: "Los Angeles", x: 0.18, y: 0.73 },
      { name: "Denver", x: 0.39, y: 0.54 },
      { name: "Dallas", x: 0.51, y: 0.75 },
      { name: "Kansas City", x: 0.55, y: 0.52 },
      { name: "Chicago", x: 0.66, y: 0.36 },
      { name: "Atlanta", x: 0.72, y: 0.72 },
      { name: "D.C.", x: 0.84, y: 0.52 },
      { name: "New York", x: 0.88, y: 0.42 },
      { name: "Miami", x: 0.81, y: 0.91 },
    ],
    storms: [
      { id: "n-plains", mode: "supercell", x: 0.34, y: 0.46, vx: 0.017, vy: -0.009, angle: -0.3, intensity: 0.82, rotation: 0.86, hail: 0.9, flood: 0.36, seed: 171 },
      { id: "n-msvly", mode: "line", x: 0.46, y: 0.72, vx: 0.019, vy: -0.012, angle: -0.22, intensity: 0.78, rotation: 0.62, hail: 0.42, flood: 0.58, length: 0.42, seed: 182 },
      { id: "n-ohio", mode: "bow", x: 0.61, y: 0.5, vx: 0.021, vy: -0.005, angle: -0.04, intensity: 0.86, rotation: 0.48, hail: 0.5, flood: 0.46, length: 0.34, seed: 193 },
      { id: "n-se", mode: "supercell", x: 0.66, y: 0.78, vx: 0.018, vy: -0.015, angle: -0.52, intensity: 0.72, rotation: 0.82, hail: 0.5, flood: 0.64, seed: 204 },
      { id: "n-midatl", mode: "line", x: 0.72, y: 0.62, vx: 0.02, vy: -0.006, angle: -0.14, intensity: 0.68, rotation: 0.44, hail: 0.34, flood: 0.44, length: 0.32, seed: 216 },
    ],
  },
  {
    id: "great-lakes-lp",
    name: "Great Lakes LP Supercells",
    region: "WI / MI / IL / IN",
    start: "2026-07-15T19:00:00Z",
    briefing:
      "Low-precipitation supercells form near a lake-breeze boundary with steep lapse rates, long hodographs, and large hail potential before a narrow damaging wind corridor evolves.",
    setup: [
      ["MLCAPE", "2300 J/kg"],
      ["0-1 km SRH", "180 m2/s2"],
      ["Deep Shear", "64 kt"],
      ["Storm Mode", "LP supercells"],
    ],
    radarSite: { x: 0.55, y: 0.5 },
    mapLabels: [
      { text: "WI", x: 0.38, y: 0.22 },
      { text: "MI", x: 0.72, y: 0.25 },
      { text: "IL", x: 0.42, y: 0.68 },
      { text: "IN", x: 0.64, y: 0.7 },
    ],
    cities: [
      { name: "Milwaukee", x: 0.45, y: 0.43 },
      { name: "Madison", x: 0.34, y: 0.42 },
      { name: "Chicago", x: 0.49, y: 0.58 },
      { name: "Grand Rapids", x: 0.72, y: 0.44 },
      { name: "South Bend", x: 0.62, y: 0.58 },
    ],
    storms: [
      { id: "gl1", mode: "supercell", x: 0.3, y: 0.66, vx: 0.016, vy: -0.016, angle: -0.62, intensity: 0.74, rotation: 0.76, hail: 1.02, flood: 0.22, seed: 231 },
      { id: "gl2", mode: "supercell", x: 0.22, y: 0.54, vx: 0.018, vy: -0.013, angle: -0.5, intensity: 0.68, rotation: 0.64, hail: 0.94, flood: 0.2, seed: 242 },
      { id: "gl3", mode: "line", x: 0.14, y: 0.75, vx: 0.016, vy: -0.01, angle: -0.2, intensity: 0.56, rotation: 0.34, hail: 0.5, flood: 0.28, length: 0.42, seed: 253 },
    ],
  },
  {
    id: "mid-atlantic-derecho",
    name: "Mid-Atlantic Derecho",
    region: "OH / WV / PA / VA / MD",
    start: "2026-06-29T20:00:00Z",
    briefing:
      "A mature MCS accelerates east-southeast through a deeply mixed warm sector. Widespread damaging wind, embedded circulations, and fast warning handoffs dominate the shift.",
    setup: [
      ["MLCAPE", "3600 J/kg"],
      ["DCAPE", "1450 J/kg"],
      ["Deep Shear", "50 kt"],
      ["Storm Mode", "Progressive bow echo"],
    ],
    radarSite: { x: 0.45, y: 0.52 },
    mapLabels: [
      { text: "OH", x: 0.22, y: 0.44 },
      { text: "PA", x: 0.62, y: 0.31 },
      { text: "WV", x: 0.43, y: 0.59 },
      { text: "VA", x: 0.64, y: 0.73 },
      { text: "MD", x: 0.78, y: 0.55 },
    ],
    cities: [
      { name: "Columbus", x: 0.24, y: 0.48 },
      { name: "Pittsburgh", x: 0.48, y: 0.42 },
      { name: "Charleston", x: 0.38, y: 0.64 },
      { name: "Harrisburg", x: 0.7, y: 0.43 },
      { name: "D.C.", x: 0.78, y: 0.61 },
    ],
    storms: [
      { id: "ma1", mode: "bow", x: 0.12, y: 0.48, vx: 0.029, vy: 0.004, angle: 0.08, intensity: 0.96, rotation: 0.5, hail: 0.48, flood: 0.42, length: 0.76, seed: 271 },
      { id: "ma2", mode: "line", x: 0.08, y: 0.72, vx: 0.026, vy: -0.002, angle: -0.02, intensity: 0.78, rotation: 0.54, hail: 0.34, flood: 0.48, length: 0.48, seed: 282 },
    ],
  },
  {
    id: "monsoon-four-corners",
    name: "Four Corners Monsoon",
    region: "AZ / NM / CO / UT",
    start: "2026-08-04T21:00:00Z",
    briefing:
      "High-based storms pulse over terrain, then organize into outflow-driven clusters. Flash flooding and severe outflow winds compete with isolated marginal hail.",
    setup: [
      ["MLCAPE", "1400 J/kg"],
      ["DCAPE", "1850 J/kg"],
      ["Deep Shear", "28 kt"],
      ["Storm Mode", "Pulse clusters"],
    ],
    radarSite: { x: 0.5, y: 0.52 },
    mapLabels: [
      { text: "UT", x: 0.28, y: 0.2 },
      { text: "CO", x: 0.72, y: 0.22 },
      { text: "AZ", x: 0.28, y: 0.7 },
      { text: "NM", x: 0.7, y: 0.72 },
    ],
    cities: [
      { name: "Flagstaff", x: 0.31, y: 0.56 },
      { name: "Phoenix", x: 0.24, y: 0.78 },
      { name: "Albuquerque", x: 0.65, y: 0.68 },
      { name: "Durango", x: 0.55, y: 0.43 },
      { name: "Grand Junction", x: 0.52, y: 0.25 },
    ],
    storms: [
      { id: "fc1", mode: "pulse", x: 0.3, y: 0.56, vx: 0.014, vy: 0.002, angle: 0.2, intensity: 0.62, rotation: 0.32, hail: 0.42, flood: 0.82, seed: 301 },
      { id: "fc2", mode: "cluster", x: 0.48, y: 0.44, vx: 0.012, vy: 0.006, angle: 0.36, intensity: 0.66, rotation: 0.26, hail: 0.34, flood: 0.88, length: 0.42, seed: 312 },
      { id: "fc3", mode: "cluster", x: 0.58, y: 0.7, vx: 0.015, vy: -0.002, angle: 0.08, intensity: 0.58, rotation: 0.22, hail: 0.28, flood: 0.72, length: 0.36, seed: 323 },
    ],
  },
];

// Regions replace the old named case presets.  The template controls storm
// archetypes while each region supplies the map context users work in.
const REGION_PRESETS = [
  {
    id: "northeast", name: "Northeast", template: "great-lakes-lp", region: "NY / PA / NJ / New England",
    mapLabels: [{ text: "NY", x: 0.34, y: 0.42 }, { text: "PA", x: 0.31, y: 0.66 }, { text: "NJ", x: 0.57, y: 0.63 }, { text: "CT", x: 0.66, y: 0.43 }, { text: "MA", x: 0.76, y: 0.3 }],
    cities: [{ name: "Buffalo", x: 0.19, y: 0.42 }, { name: "Syracuse", x: 0.39, y: 0.4 }, { name: "Albany", x: 0.55, y: 0.36 }, { name: "New York", x: 0.58, y: 0.7 }, { name: "Boston", x: 0.8, y: 0.34 }],
  },
  {
    id: "mid-atlantic", name: "Mid-Atlantic", template: "mid-atlantic-derecho", region: "PA / MD / VA / WV / DC",
    mapLabels: [{ text: "OH", x: 0.14, y: 0.4 }, { text: "PA", x: 0.53, y: 0.31 }, { text: "WV", x: 0.38, y: 0.6 }, { text: "VA", x: 0.61, y: 0.73 }, { text: "MD", x: 0.77, y: 0.53 }],
    cities: [{ name: "Columbus", x: 0.16, y: 0.47 }, { name: "Pittsburgh", x: 0.43, y: 0.42 }, { name: "Harrisburg", x: 0.64, y: 0.42 }, { name: "D.C.", x: 0.73, y: 0.62 }, { name: "Richmond", x: 0.65, y: 0.76 }],
  },
  {
    id: "midwest", name: "Midwest", template: "high-plains-mcs", region: "IA / IL / MO / WI / MN",
    mapLabels: [{ text: "MN", x: 0.38, y: 0.18 }, { text: "WI", x: 0.7, y: 0.25 }, { text: "IA", x: 0.41, y: 0.48 }, { text: "IL", x: 0.7, y: 0.58 }, { text: "MO", x: 0.45, y: 0.78 }],
    cities: [{ name: "Minneapolis", x: 0.42, y: 0.26 }, { name: "Des Moines", x: 0.4, y: 0.55 }, { name: "Madison", x: 0.66, y: 0.38 }, { name: "Chicago", x: 0.75, y: 0.61 }, { name: "St. Louis", x: 0.55, y: 0.79 }],
  },
  {
    id: "great-lakes", name: "Great Lakes", template: "great-lakes-lp", region: "WI / MI / IL / IN / OH",
    mapLabels: [{ text: "WI", x: 0.3, y: 0.24 }, { text: "MI", x: 0.66, y: 0.23 }, { text: "IL", x: 0.33, y: 0.68 }, { text: "IN", x: 0.56, y: 0.7 }, { text: "OH", x: 0.8, y: 0.65 }],
    cities: [{ name: "Milwaukee", x: 0.33, y: 0.44 }, { name: "Chicago", x: 0.41, y: 0.61 }, { name: "Grand Rapids", x: 0.67, y: 0.43 }, { name: "Detroit", x: 0.73, y: 0.58 }, { name: "Toledo", x: 0.84, y: 0.62 }],
  },
  {
    id: "southern-plains", name: "Southern Plains", template: "southern-plains", region: "TX / OK / KS / AR",
    mapLabels: [{ text: "KS", x: 0.47, y: 0.14 }, { text: "OK", x: 0.48, y: 0.48 }, { text: "TX", x: 0.37, y: 0.82 }, { text: "AR", x: 0.79, y: 0.61 }],
    cities: [{ name: "Wichita", x: 0.47, y: 0.2 }, { name: "Enid", x: 0.39, y: 0.38 }, { name: "Oklahoma City", x: 0.49, y: 0.53 }, { name: "Tulsa", x: 0.65, y: 0.46 }, { name: "Lawton", x: 0.39, y: 0.7 }],
  },
  {
    id: "mississippi-valley", name: "Mississippi Valley", template: "dixie-qlcs", region: "MO / AR / TN / MS / LA",
    mapLabels: [{ text: "MO", x: 0.34, y: 0.2 }, { text: "AR", x: 0.38, y: 0.46 }, { text: "TN", x: 0.66, y: 0.38 }, { text: "MS", x: 0.53, y: 0.67 }, { text: "LA", x: 0.37, y: 0.83 }],
    cities: [{ name: "St. Louis", x: 0.33, y: 0.26 }, { name: "Memphis", x: 0.62, y: 0.47 }, { name: "Little Rock", x: 0.42, y: 0.52 }, { name: "Jackson", x: 0.52, y: 0.72 }, { name: "Baton Rouge", x: 0.39, y: 0.85 }],
  },
  {
    id: "dixie-alley", name: "Dixie Alley", template: "dixie-qlcs", region: "MS / AL / TN / GA",
    mapLabels: [{ text: "MS", x: 0.25, y: 0.55 }, { text: "AL", x: 0.53, y: 0.55 }, { text: "TN", x: 0.5, y: 0.16 }, { text: "GA", x: 0.8, y: 0.59 }],
    cities: [{ name: "Memphis", x: 0.33, y: 0.19 }, { name: "Jackson", x: 0.27, y: 0.66 }, { name: "Birmingham", x: 0.6, y: 0.47 }, { name: "Huntsville", x: 0.59, y: 0.3 }, { name: "Atlanta", x: 0.84, y: 0.61 }],
  },
  {
    id: "northern-plains", name: "Northern Plains", template: "high-plains-mcs", region: "ND / SD / NE / MN",
    mapLabels: [{ text: "ND", x: 0.35, y: 0.16 }, { text: "SD", x: 0.36, y: 0.42 }, { text: "NE", x: 0.36, y: 0.72 }, { text: "MN", x: 0.71, y: 0.32 }],
    cities: [{ name: "Bismarck", x: 0.31, y: 0.2 }, { name: "Fargo", x: 0.62, y: 0.2 }, { name: "Sioux Falls", x: 0.45, y: 0.53 }, { name: "Omaha", x: 0.45, y: 0.76 }, { name: "Minneapolis", x: 0.75, y: 0.38 }],
  },
  {
    id: "central-plains", name: "Central Plains", template: "southern-plains", region: "NE / KS / OK / MO",
    mapLabels: [{ text: "NE", x: 0.35, y: 0.19 }, { text: "KS", x: 0.36, y: 0.48 }, { text: "OK", x: 0.38, y: 0.76 }, { text: "MO", x: 0.73, y: 0.5 }],
    cities: [{ name: "Omaha", x: 0.4, y: 0.29 }, { name: "Topeka", x: 0.42, y: 0.52 }, { name: "Wichita", x: 0.33, y: 0.61 }, { name: "Oklahoma City", x: 0.4, y: 0.79 }, { name: "Kansas City", x: 0.63, y: 0.54 }],
  },
];

// Lightweight, regional state-line traces are kept in normalized map space so
// the canvas stays fast and sharp without loading a basemap at runtime.
const STATE_BORDER_TRACES = {
  northeast: [[[0.08, 0.58], [0.29, 0.58], [0.31, 0.47], [0.51, 0.46], [0.58, 0.54], [0.67, 0.51], [0.85, 0.43]], [[0.51, 0.19], [0.51, 0.7], [0.6, 0.74], [0.69, 0.52], [0.69, 0.3]], [[0.69, 0.3], [0.82, 0.29], [0.89, 0.39]]],
  "mid-atlantic": [[[0.07, 0.56], [0.3, 0.56], [0.39, 0.48], [0.64, 0.48], [0.84, 0.55]], [[0.38, 0.21], [0.38, 0.72]], [[0.63, 0.2], [0.63, 0.73]], [[0.64, 0.6], [0.84, 0.55], [0.92, 0.66]]],
  midwest: [[[0.12, 0.38], [0.57, 0.38], [0.86, 0.46]], [[0.1, 0.66], [0.58, 0.66], [0.89, 0.72]], [[0.35, 0.1], [0.35, 0.86]], [[0.6, 0.12], [0.6, 0.84]], [[0.78, 0.22], [0.78, 0.76]]],
  "great-lakes": [[[0.1, 0.51], [0.42, 0.5], [0.56, 0.58], [0.88, 0.56]], [[0.42, 0.18], [0.42, 0.8]], [[0.6, 0.29], [0.6, 0.78]], [[0.78, 0.42], [0.78, 0.76]], [[0.44, 0.25], [0.56, 0.17], [0.72, 0.24], [0.82, 0.39]]],
  "southern-plains": [[[0.1, 0.32], [0.66, 0.32], [0.9, 0.4]], [[0.13, 0.62], [0.62, 0.62], [0.82, 0.7]], [[0.31, 0.09], [0.31, 0.92]], [[0.65, 0.15], [0.65, 0.67]], [[0.13, 0.8], [0.29, 0.72], [0.5, 0.75], [0.6, 0.9]]],
  "mississippi-valley": [[[0.1, 0.35], [0.47, 0.35], [0.72, 0.42], [0.9, 0.41]], [[0.12, 0.61], [0.5, 0.61], [0.78, 0.57]], [[0.28, 0.12], [0.28, 0.87]], [[0.5, 0.17], [0.5, 0.85]], [[0.68, 0.34], [0.68, 0.67]]],
  "dixie-alley": [[[0.12, 0.34], [0.49, 0.34], [0.86, 0.42]], [[0.11, 0.7], [0.48, 0.7], [0.85, 0.65]], [[0.42, 0.14], [0.42, 0.84]], [[0.67, 0.32], [0.67, 0.76]]],
  "northern-plains": [[[0.1, 0.33], [0.85, 0.33]], [[0.12, 0.62], [0.86, 0.62]], [[0.58, 0.13], [0.58, 0.81]], [[0.2, 0.1], [0.2, 0.81]], [[0.36, 0.12], [0.36, 0.82]]],
  "central-plains": [[[0.1, 0.34], [0.65, 0.34], [0.89, 0.43]], [[0.1, 0.64], [0.62, 0.64], [0.83, 0.62]], [[0.26, 0.1], [0.26, 0.9]], [[0.61, 0.12], [0.61, 0.77]], [[0.76, 0.32], [0.76, 0.76]]],
};

const MODELS = [
  {
    id: "hrrr",
    name: "HRRR",
    grid: "3 km",
    note: "Fast dryline initiation",
    bias: {
      x: 0.012,
      y: -0.01,
      speed: 1.06,
      intensity: 1.04,
      spread: 0.92,
      timing: -1,
      rotation: 1.08,
      hail: 1.02,
      qpf: 0.86,
      coldPool: 0.92,
      initiation: -3,
      placementNoise: 0.014,
      falseStorms: 0.18,
      wind: 0.98,
    },
  },
  {
    id: "namnest",
    name: "NAM Nest",
    grid: "3 km",
    note: "Aggressive cold pools",
    bias: {
      x: -0.024,
      y: 0.018,
      speed: 0.9,
      intensity: 1.13,
      spread: 1.12,
      timing: -2,
      rotation: 0.86,
      hail: 0.92,
      qpf: 1.24,
      coldPool: 1.34,
      initiation: -1,
      placementNoise: 0.02,
      falseStorms: 0.24,
      wind: 1.18,
    },
  },
  {
    id: "fv3lam",
    name: "FV3-LAM",
    grid: "3 km",
    note: "Discrete bias east",
    bias: {
      x: 0.04,
      y: -0.024,
      speed: 1.12,
      intensity: 0.92,
      spread: 0.82,
      timing: 2,
      rotation: 1.18,
      hail: 1.12,
      qpf: 0.72,
      coldPool: 0.78,
      initiation: 3,
      placementNoise: 0.026,
      falseStorms: 0.12,
      wind: 0.9,
    },
  },
  {
    id: "nsslwrf",
    name: "NSSL-WRF",
    grid: "4 km",
    note: "Strong UH signal",
    bias: {
      x: 0.004,
      y: 0.022,
      speed: 0.98,
      intensity: 1.08,
      spread: 0.95,
      timing: 0,
      rotation: 1.36,
      hail: 1.04,
      qpf: 0.96,
      coldPool: 0.96,
      initiation: 0,
      placementNoise: 0.012,
      falseStorms: 0.1,
      wind: 0.94,
    },
  },
  {
    id: "wrfarw",
    name: "WRF-ARW",
    grid: "3 km",
    note: "Late upscale growth",
    bias: {
      x: -0.018,
      y: -0.012,
      speed: 0.84,
      intensity: 0.88,
      spread: 1.22,
      timing: 4,
      rotation: 0.78,
      hail: 0.82,
      qpf: 1.16,
      coldPool: 1.2,
      initiation: 5,
      placementNoise: 0.024,
      falseStorms: 0.2,
      wind: 1.08,
    },
  },
  {
    id: "wofs",
    name: "WoFS ENS",
    grid: "1 km",
    note: "Warn-on-forecast swaths",
    bias: {
      x: 0.006,
      y: -0.004,
      speed: 1,
      intensity: 1.02,
      spread: 1.38,
      timing: 0,
      rotation: 1.18,
      hail: 1,
      qpf: 1.04,
      coldPool: 1.08,
      initiation: 0,
      placementNoise: 0.032,
      falseStorms: 0.34,
      wind: 1.02,
    },
  },
  {
    id: "href",
    name: "HREF PMM",
    grid: "2-3 km",
    note: "Paintball max fields",
    bias: {
      x: 0,
      y: 0,
      speed: 1.02,
      intensity: 1.1,
      spread: 1.34,
      timing: 1,
      rotation: 1.04,
      hail: 1.12,
      qpf: 1.1,
      coldPool: 1,
      initiation: 1,
      placementNoise: 0.04,
      falseStorms: 0.42,
      wind: 1.08,
    },
  },
  {
    id: "rrfs",
    name: "RRFS",
    grid: "3 km",
    note: "Moisture-axis storms",
    bias: {
      x: -0.032,
      y: -0.018,
      speed: 1.08,
      intensity: 0.98,
      spread: 1.02,
      timing: -3,
      rotation: 1.24,
      hail: 0.96,
      qpf: 0.9,
      coldPool: 0.88,
      initiation: -4,
      placementNoise: 0.028,
      falseStorms: 0.28,
      wind: 0.96,
    },
  },
  {
    id: "mpas",
    name: "MPAS",
    grid: "3 km",
    note: "Late but intense",
    bias: {
      x: 0.026,
      y: 0.028,
      speed: 0.92,
      intensity: 1.2,
      spread: 0.88,
      timing: 5,
      rotation: 1.32,
      hail: 1.28,
      qpf: 0.82,
      coldPool: 0.84,
      initiation: 6,
      placementNoise: 0.018,
      falseStorms: 0.14,
      wind: 0.88,
    },
  },
];

const PRODUCTS = [
  {
    id: "outlook",
    label: "Day 1 Convective Outlook",
    short: "OUTLOOK",
    group: "outlook",
    hazards: ["tornado", "wind", "hail"],
    duration: MAX_TIME_INDEX,
    color: "#f4b740",
    severe: false,
  },
  {
    id: "mesoscale-discussion",
    label: "Mesoscale Discussion",
    short: "MD",
    group: "discussion",
    hazards: ["tornado", "wind", "hail", "flood"],
    duration: 18,
    color: "#9db2c7",
    severe: false,
  },
  {
    id: "tornado-watch",
    label: "Tornado Watch",
    short: "TOR WATCH",
    group: "watch",
    hazards: ["tornado"],
    duration: 24,
    color: "#e25da4",
    severe: false,
  },
  {
    id: "pds-tornado-watch",
    label: "PDS Tornado Watch",
    short: "PDS TOR WATCH",
    group: "watch",
    hazards: ["tornado"],
    duration: 24,
    color: "#e33548",
    severe: true,
  },
  {
    id: "severe-watch",
    label: "Severe Thunderstorm Watch",
    short: "SVR WATCH",
    group: "watch",
    hazards: ["wind", "hail"],
    duration: 24,
    color: "#46c6d7",
    severe: false,
  },
  {
    id: "pds-severe-watch",
    label: "PDS Severe Thunderstorm Watch",
    short: "PDS SVR WATCH",
    group: "watch",
    hazards: ["wind", "hail"],
    duration: 24,
    color: "#f36b35",
    severe: true,
  },
  {
    id: "tornado-warning",
    label: "Tornado Warning",
    short: "TOR",
    group: "warning",
    hazards: ["tornado"],
    duration: 4,
    color: "#e33548",
    severe: false,
  },
  {
    id: "pds-tornado-warning",
    label: "PDS Tornado Warning",
    short: "PDS TOR",
    group: "warning",
    hazards: ["tornado"],
    duration: 4,
    color: "#b982ff",
    severe: true,
  },
  {
    id: "severe-warning",
    label: "Severe Thunderstorm Warning",
    short: "SVR",
    group: "warning",
    hazards: ["wind", "hail"],
    duration: 4,
    color: "#f4b740",
    severe: false,
  },
  {
    id: "destructive-severe-warning",
    label: "Destructive Severe Warning",
    short: "DESTRUCTIVE",
    group: "warning",
    hazards: ["wind", "hail"],
    duration: 4,
    color: "#f36b35",
    severe: true,
  },
  {
    id: "flash-flood-warning",
    label: "Flash Flood Warning",
    short: "FFW",
    group: "warning",
    hazards: ["flood"],
    duration: 8,
    color: "#53c46f",
    severe: false,
  },
  {
    id: "special-weather",
    label: "Special Weather Statement",
    short: "SPS",
    group: "advisory",
    hazards: ["wind", "hail"],
    duration: 3,
    color: "#359DD4",
    severe: false,
  },
];

const LAYERS = {
  radar: {
    label: "Reflectivity",
    unit: "dBZ",
    legend: [
      ["0", "#1d8d42"],
      ["20", "#70c95f"],
      ["30", "#F7DB2F"],
      ["40", "#F4813F"],
      ["50", "#FF5736"],
      ["60", "#EB4BBB"],
      ["70", "#FFFFFF"],
      ["80 dBZ", "#96F8FF"],
    ],
  },
  velocity: {
    label: "Velocity",
    unit: "mph",
    legend: [
      ["−130", "#0f934c"],
      ["−45", "#74d37a"],
      ["0", "#25211e"],
      ["45", "#d86a4b"],
      ["130 mph", "#c61d2b"],
    ],
  },
  spectrum: {
    label: "Spectral Width",
    unit: "m/s",
    legend: [
      ["2", "#2d7caa"],
      ["5", "#5db373"],
      ["8", "#f4d03f"],
      ["12", "#f36b35"],
      ["15+", "#f4f0ff"],
    ],
  },
  hail: {
    label: "Hail Size",
    unit: "in",
    legend: [
      ["0.5", "#6abf69"],
      ["1.0", "#f2d15b"],
      ["2.0", "#f36b35"],
      ["4.0 in", "#e25da4"],
    ],
  },
  rotation: {
    label: "Rotation",
    unit: "0.001/s",
    legend: [
      ["0.002", "#0d4fd4"],
      ["0.005", "#24b8ff"],
      ["0.010", "#ffe45b"],
      ["0.015", "#ff7b32"],
      ["0.024+", "#fff8f0"],
    ],
  },
  qpf: {
    label: "Precipitation Accumulation",
    unit: "in",
    legend: [
      ["0.5", "#234ea8"],
      ["1.5", "#46c6d7"],
      ["3.0", "#53c46f"],
      ["12.0 in", "#f4b740"],
    ],
  },
  satellite: {
    label: "Satellite",
    unit: "enh",
    legend: [
      ["Warm / dark", "#081325"],
      ["Cumulus deck", "#21796c"],
      ["Growing towers", "#ced748"],
      ["Cold tops", "#eb8b32"],
      ["Overshooting tops", "#f9fbff"],
    ],
  },
  model: {
    label: "Model",
    unit: "dBZ",
    legend: [
      ["CAM refl", "#70c95f"],
      ["UH", "#b982ff"],
      ["Max wind", "#46c6d7"],
      ["Sig hail", "#f36b35"],
      ["Disagreement", "#f1eee5"],
    ],
  },
  reports: {
    label: "Reports",
    unit: "LSR",
    legend: [
      ["TOR", "#e33548"],
      ["HAIL", "#f4b740"],
      ["WIND", "#46c6d7"],
      ["FLOOD", "#53c46f"],
    ],
  },
};

const STORM_MODE_PROFILES = {
  supercell: {
    organization: 1.2,
    growth: 1,
    mature: 1.12,
    decay: 0.92,
    tornadoBias: 1.18,
    hailBias: 1.12,
    windBias: 0.86,
    floodBias: 0.78,
    inflow: 1.2,
    outflow: 0.82,
    precipEfficiency: 0.9,
    anvil: 1.08,
    stratiform: 0.72,
    cumulus: 0.94,
    multicycle: 0.88,
    turbulence: 1.1,
  },
  line: {
    organization: 0.92,
    growth: 0.88,
    mature: 1.06,
    decay: 1.08,
    tornadoBias: 0.64,
    hailBias: 0.78,
    windBias: 1.08,
    floodBias: 0.96,
    inflow: 0.88,
    outflow: 1.1,
    precipEfficiency: 1,
    anvil: 0.92,
    stratiform: 1.12,
    cumulus: 0.9,
    multicycle: 1.02,
    turbulence: 1,
  },
  bow: {
    organization: 1.02,
    growth: 0.92,
    mature: 1.16,
    decay: 1.06,
    tornadoBias: 0.72,
    hailBias: 0.82,
    windBias: 1.24,
    floodBias: 0.86,
    inflow: 0.84,
    outflow: 1.24,
    precipEfficiency: 0.96,
    anvil: 0.88,
    stratiform: 0.98,
    cumulus: 0.84,
    multicycle: 1.08,
    turbulence: 1.18,
  },
  cluster: {
    organization: 0.8,
    growth: 0.9,
    mature: 1.02,
    decay: 1.1,
    tornadoBias: 0.38,
    hailBias: 0.74,
    windBias: 0.92,
    floodBias: 1.08,
    inflow: 0.84,
    outflow: 1.02,
    precipEfficiency: 1.06,
    anvil: 0.98,
    stratiform: 1.14,
    cumulus: 1.12,
    multicycle: 1.22,
    turbulence: 0.92,
  },
  pulse: {
    organization: 0.52,
    growth: 1.14,
    mature: 0.76,
    decay: 0.84,
    tornadoBias: 0.16,
    hailBias: 0.62,
    windBias: 0.88,
    floodBias: 0.92,
    inflow: 0.74,
    outflow: 1.08,
    precipEfficiency: 0.78,
    anvil: 0.62,
    stratiform: 0.44,
    cumulus: 1.28,
    multicycle: 0.38,
    turbulence: 0.82,
  },
};

const els = {};
const DEFAULT_SOUNDING = { temperature: 78, dewpoint: 66, shear: 45, cape: 2400, helicity: 180 };
const state = {
  caseId: "central-plains",
  activeCase: null,
  timeIndex: 0,
  currentIndex: 0,
  followCurrent: true,
  layer: "radar",
  modelId: "hrrr",
  modelProduct: "reflectivity",
  selectedProduct: "tornado-warning",
  activeTilt: 0.5,
  selection: null,
  drawing: null,
  areaMode: DEFAULT_AREA_MODE,
  products: [],
  serial: 1,
  playTimer: null,
  missed: new Set(),
  simulationSeed: Math.floor(Math.random() * 1_000_000_000),
  manualSounding: { ...DEFAULT_SOUNDING },
  customPalettes: { radar: null, velocity: null },
  environment: null,
  stats: {
    hits: 0,
    falseAlarms: 0,
    misses: 0,
    issued: 0,
    skillPoints: 0,
    polygonSkill: 0,
    leadSkill: 0,
    hazardSkill: 0,
  },
};

const renderCache = {
  base: null,
  weather: new Map(),
  thumbs: new Map(),
  frames: new Map(),
  hazards: new Map(),
  reports: new Map(),
  lastSize: null,
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindElements();
  populateControls();
  rebuildScenarioRun();
  wireEvents();
  renderAll();
  window.addEventListener("resize", renderAll);
}

function bindElements() {
  [
    "caseSelect",
    "productSelect",
    "productOptions",
    "runBtn",
    "tempInput",
    "dewpointInput",
    "shearInput",
    "capeInput",
    "helicityInput",
    "soundingCanvas",
    "soundingMeta",
    "palTarget",
    "palFile",
    "palStatus",
    "clearPalBtn",
    "clearAreaBtn",
    "issueBtn",
    "briefing",
    "caseSubtitle",
    "validTime",
    "deskScore",
    "hitCount",
    "falseAlarmCount",
    "missCount",
    "accuracyBadge",
    "areaStatus",
    "polygonMeter",
    "leadMeter",
    "hazardMeter",
    "weatherCanvas",
    "legend",
    "cursorReadout",
    "layerTabs",
    "tiltSelect",
    "modelSelect",
    "modelProductSelect",
    "modelMeta",
    "modelGrid",
    "modelSummary",
    "productList",
    "activeCount",
    "reportList",
    "reportCount",
    "timeRange",
    "timelineLabels",
    "timelineStatus",
    "stepBackBtn",
    "stepForwardBtn",
    "playBtn",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function populateControls() {
  REGION_PRESETS.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    els.caseSelect.appendChild(option);
  });

  PRODUCTS.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = product.label;
    els.productSelect.appendChild(option);
  });

  MODELS.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.name} (${model.grid})`;
    els.modelSelect.appendChild(option);
  });

  NEXRAD_TILTS.forEach((tilt) => {
    const option = document.createElement("option");
    option.value = String(tilt);
    option.textContent = `${tilt.toFixed(1)} deg tilt`;
    els.tiltSelect.appendChild(option);
  });

  els.caseSelect.value = state.caseId;
  els.productSelect.value = state.selectedProduct;
  els.modelSelect.value = state.modelId;
  els.tiltSelect.value = String(state.activeTilt);
  els.timeRange.max = String(MAX_TIME_INDEX);
  setSoundingControls(state.manualSounding);
  populateModelProducts();
}

function wireEvents() {
  els.caseSelect.addEventListener("change", () => {
    state.caseId = els.caseSelect.value;
    resetCase();
  });

  els.productSelect.addEventListener("change", () => {
    state.selectedProduct = els.productSelect.value;
    renderProductOptions();
    renderAll();
  });

  els.modelSelect.addEventListener("change", () => {
    state.modelId = els.modelSelect.value;
    populateModelProducts();
    state.layer = "model";
    syncTimelineToLayer();
    updateLayerButtons();
    renderAll();
  });

  els.tiltSelect.addEventListener("change", () => {
    state.activeTilt = Number(els.tiltSelect.value) || 0.5;
    renderAll();
  });

  els.layerTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-layer]");
    if (!button) return;
    state.layer = button.dataset.layer;
    syncTimelineToLayer();
    updateLayerButtons();
    renderAll();
  });

  els.clearAreaBtn.addEventListener("click", () => {
    state.selection = null;
    renderAll();
  });

  els.runBtn.addEventListener("click", runManualSimulation);
  [els.tempInput, els.dewpointInput, els.shearInput, els.capeInput, els.helicityInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.manualSounding = readSoundingInputs();
      renderSkewT();
    });
    input.addEventListener("change", () => {
      state.manualSounding = readSoundingInputs();
    });
  });
  els.modelProductSelect.addEventListener("change", () => {
    state.modelProduct = els.modelProductSelect.value;
    if (state.layer === "model") renderAll();
  });
  els.palFile.addEventListener("change", handlePaletteUpload);
  els.palTarget.addEventListener("change", renderPaletteStatus);
  els.clearPalBtn.addEventListener("click", () => {
    const target = els.palTarget.value;
    state.customPalettes[target] = null;
    els.palFile.value = "";
    invalidateRenderCache();
    renderPaletteStatus();
    renderAll();
  });

  els.issueBtn.addEventListener("click", issueProduct);
  els.stepBackBtn.addEventListener("click", () => setTime(state.timeIndex - 1));
  els.stepForwardBtn.addEventListener("click", stepForward);
  els.playBtn.addEventListener("click", togglePlay);

  els.timeRange.addEventListener("input", () => {
    setTime(Number(els.timeRange.value), { fromUser: true });
  });

  els.weatherCanvas.addEventListener("pointerdown", startSelection);
  els.weatherCanvas.addEventListener("pointermove", updatePointer);
  els.weatherCanvas.addEventListener("pointerup", endSelection);
  els.weatherCanvas.addEventListener("pointerleave", () => {
    if (!state.drawing) {
      els.cursorReadout.textContent = "--";
    }
  });
}

function resetCase(options = {}) {
  stopPlay();
  if (!options.keepScenario) {
    state.caseId = els.caseSelect.value;
  }
  state.timeIndex = 0;
  state.currentIndex = 0;
  state.followCurrent = true;
  state.selection = null;
  state.drawing = null;
  state.products = [];
  state.serial = 1;
  state.missed = new Set();
  state.simulationSeed = Math.floor(Math.random() * 1_000_000_000);
  rebuildScenarioRun();
  state.stats = {
    hits: 0,
    falseAlarms: 0,
    misses: 0,
    issued: 0,
    skillPoints: 0,
    polygonSkill: 0,
    leadSkill: 0,
    hazardSkill: 0,
  };
  els.timeRange.value = "0";
  renderAll();
}

function getCase() {
  return state.activeCase || getBaseCase();
}

function getBaseCase() {
  const region = REGION_PRESETS.find((item) => item.id === state.caseId) || REGION_PRESETS[0];
  const template = CASES.find((item) => item.id === region.template) || CASES[0];
  return {
    ...JSON.parse(JSON.stringify(template)),
    id: region.id,
    name: `${region.name} Severe Desk`,
    region: region.region,
    national: false,
    mapLabels: region.mapLabels,
    cities: region.cities,
    briefing: `${template.briefing} Regional desk: ${region.name}.`,
  };
}

function rebuildScenarioRun() {
  state.activeCase = createScenarioRun(getBaseCase(), state.simulationSeed);
  state.activeCase.manualSounding = { ...state.manualSounding };
  state.environment = buildEnvironment(state.activeCase, state.simulationSeed);
  invalidateRenderCache();
}

function getProduct(id = state.selectedProduct) {
  return PRODUCTS.find((item) => item.id === id) || PRODUCTS[0];
}

function getModel(id = state.modelId) {
  return MODELS.find((item) => item.id === id) || MODELS[0];
}

function getEnvironment() {
  if (!state.environment) {
    state.environment = buildEnvironment(getCase(), state.simulationSeed);
  }
  return state.environment;
}

function readSoundingInputs() {
  const numeric = (element, fallback, min, max) => clamp(Number(element.value) || fallback, min, max);
  const temperature = numeric(els.tempInput, DEFAULT_SOUNDING.temperature, -20, 115);
  return {
    temperature,
    dewpoint: clamp(numeric(els.dewpointInput, DEFAULT_SOUNDING.dewpoint, -40, 90), -40, temperature),
    shear: numeric(els.shearInput, DEFAULT_SOUNDING.shear, 0, 120),
    cape: numeric(els.capeInput, DEFAULT_SOUNDING.cape, 0, 7000),
    helicity: numeric(els.helicityInput, DEFAULT_SOUNDING.helicity, 0, 800),
  };
}

function setSoundingControls(sounding) {
  els.tempInput.value = String(sounding.temperature);
  els.dewpointInput.value = String(sounding.dewpoint);
  els.shearInput.value = String(sounding.shear);
  els.capeInput.value = String(sounding.cape);
  els.helicityInput.value = String(sounding.helicity);
}

function runManualSimulation() {
  state.manualSounding = readSoundingInputs();
  setSoundingControls(state.manualSounding);
  resetCase({ keepScenario: true });
}

function populateModelProducts() {
  const model = getModel();
  const supported = model.id === "hrrr" || model.id === "namnest";
  const products = supported
    ? [["reflectivity", "Reflectivity"], ["satellite", "Satellite"], ["spc-outlook", "Generated SPC Outlook"]]
    : [["reflectivity", "Reflectivity"], ["satellite", "Satellite"]];
  if (!products.some(([id]) => id === state.modelProduct)) state.modelProduct = "reflectivity";
  els.modelProductSelect.innerHTML = "";
  products.forEach(([id, label]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    els.modelProductSelect.appendChild(option);
  });
  els.modelProductSelect.value = state.modelProduct;
}

function parsePal(text) {
  const entries = [];
  String(text).split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/^color\s*:\s*(-?\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+)\s+(\d+)\s+(\d+))?\s*$/i);
    if (!match) return;
    const rgb = (start) => [clamp(Number(match[start]), 0, 255), clamp(Number(match[start + 1]), 0, 255), clamp(Number(match[start + 2]), 0, 255), 255];
    entries.push({ value: Number(match[1]), start: rgb(2), end: match[5] ? rgb(5) : null });
  });
  entries.sort((a, b) => a.value - b.value);
  return entries.length >= 2 ? entries : null;
}

async function handlePaletteUpload() {
  const file = els.palFile.files?.[0];
  if (!file) return;
  const palette = parsePal(await file.text());
  const target = els.palTarget.value;
  if (!palette) {
    els.palStatus.textContent = "Invalid .pal";
    els.palStatus.classList.remove("muted");
    return;
  }
  state.customPalettes[target] = { name: file.name, entries: palette };
  invalidateRenderCache();
  renderPaletteStatus();
  renderAll();
}

function renderPaletteStatus() {
  const palette = state.customPalettes[els.palTarget.value];
  els.palStatus.textContent = palette ? `${palette.entries.length} stops` : "Default";
  els.palStatus.classList.toggle("muted", !palette);
}

function customColorForLayer(layer, value) {
  const palette = state.customPalettes[layer];
  if (!palette) return null;
  const entries = palette.entries;
  if (value <= entries[0].value) return entries[0].start;
  for (let i = 0; i < entries.length - 1; i += 1) {
    const current = entries[i];
    const next = entries[i + 1];
    if (value <= next.value) {
      const from = current.end || current.start;
      const to = next.start;
      return interpColor(from, to, (value - current.value) / Math.max(0.001, next.value - current.value));
    }
  }
  return entries[entries.length - 1].end || entries[entries.length - 1].start;
}

function createScenarioRun(base, seed) {
  const scenario = JSON.parse(JSON.stringify(base));
  scenario.runId = `${base.id}-${seed}`;
  scenario.runLabel = `RUN ${String(seed % 100000).padStart(5, "0")}`;
  scenario.briefing = `${base.briefing} This run randomizes storm timing, placement, storm mode confidence, forcing character, and thermodynamic support.`;
  scenario.radarSite = {
    x: clamp((base.radarSite?.x || 0.5) + randomBetween(seed, 31, -0.025, 0.025), 0.06, 0.94),
    y: clamp((base.radarSite?.y || 0.5) + randomBetween(seed, 32, -0.025, 0.025), 0.06, 0.94),
  };
  scenario.storms = base.storms.map((storm, index) => createVariantStorm(storm, seed, index, scenario.national));

  const extraStormCount = scenario.national ? 1 + Math.floor(randomBetween(seed, 44, 0, 2.99)) : Math.floor(randomBetween(seed, 45, 0, 1.7));
  for (let i = 0; i < extraStormCount; i += 1) {
    scenario.storms.push(createProceduralStorm(seed, i, scenario.national));
  }

  return scenario;
}

function createVariantStorm(storm, seed, index, national) {
  const runSeed = seed + storm.seed * 101 + index * 1009;
  const modeRoll = seededNoise(runSeed, 1);
  const mode = modeRoll < 0.08
    ? "pulse"
    : modeRoll < 0.18
      ? "cluster"
      : modeRoll > 0.92
        ? (storm.mode === "supercell" ? "line" : "supercell")
        : modeRoll > 0.84 && storm.mode !== "bow"
          ? "bow"
          : storm.mode;
  const speedScale = randomBetween(runSeed, 2, 0.82, 1.16);
  const angleShift = randomBetween(runSeed, 3, -0.18, 0.18);
  const placement = national ? 0.045 : 0.035;
  const vx = storm.vx * speedScale + randomBetween(runSeed, 4, -0.0032, 0.0032);
  const vy = storm.vy * speedScale + randomBetween(runSeed, 5, -0.0032, 0.0032);
  return {
    ...storm,
    mode,
    x: clamp(storm.x + randomBetween(runSeed, 6, -placement, placement), 0.05, 0.95),
    y: clamp(storm.y + randomBetween(runSeed, 7, -placement, placement), 0.06, 0.94),
    vx,
    vy,
    angle: Math.atan2(vy, vx) + angleShift,
    intensity: clamp(storm.intensity * randomBetween(runSeed, 8, 0.74, 1.08), 0.3, 0.96),
    rotation: clamp(storm.rotation * randomBetween(runSeed, 9, 0.72, 1.18), 0.12, 0.94),
    hail: clamp(storm.hail * randomBetween(runSeed, 10, 0.64, 1.14), 0.12, 0.96),
    flood: clamp(storm.flood * randomBetween(runSeed, 11, 0.68, 1.26), 0.12, 1.04),
    length: mode === "supercell" || mode === "pulse"
      ? undefined
      : clamp((storm.length || randomBetween(runSeed, 12, national ? 0.24 : 0.38, national ? 0.48 : 0.78)) * randomBetween(runSeed, 112, 0.82, 1.18), 0.22, 0.92),
    seed: Math.round(storm.seed + seededNoise(runSeed, 13) * 10000),
  };
}

function createProceduralStorm(seed, index, national) {
  const runSeed = seed + index * 7919;
  const modeRoll = seededNoise(runSeed, 50);
  const mode = modeRoll > 0.8
    ? "supercell"
    : modeRoll > 0.58
      ? "line"
      : modeRoll > 0.34
        ? "bow"
        : modeRoll > 0.16
          ? "cluster"
          : "pulse";
  const x = randomBetween(runSeed, 51, national ? 0.16 : 0.08, national ? 0.84 : 0.34);
  const y = randomBetween(runSeed, 52, 0.24, 0.82);
  const vx = randomBetween(runSeed, 53, national ? 0.014 : 0.016, national ? 0.028 : 0.023);
  const vy = randomBetween(runSeed, 54, -0.018, 0.006);
  return {
    id: `run-${index}`,
    mode,
    x,
    y,
    vx,
    vy,
    angle: Math.atan2(vy, vx) + randomBetween(runSeed, 55, -0.14, 0.14),
    intensity: randomBetween(runSeed, 56, 0.4, 0.8),
    rotation: randomBetween(runSeed, 57, 0.22, 0.74),
    hail: randomBetween(runSeed, 58, 0.22, 0.82),
    flood: randomBetween(runSeed, 59, 0.22, 0.86),
    length: mode === "supercell" || mode === "pulse" ? undefined : randomBetween(runSeed, 60, national ? 0.24 : 0.38, national ? 0.48 : 0.78),
    seed: Math.round(randomBetween(runSeed, 61, 400, 10000)),
  };
}

function invalidateRenderCache() {
  renderCache.base = null;
  renderCache.weather.clear();
  renderCache.thumbs.clear();
  renderCache.frames.clear();
  renderCache.hazards.clear();
  renderCache.reports.clear();
  renderCache.lastSize = null;
}

function buildEnvironment(scenario, seed) {
  const sounding = scenario.manualSounding || state.manualSounding || DEFAULT_SOUNDING;
  const capeBase = sounding.cape ?? setupNumber(scenario, "MLCAPE", 2400);
  const srhBase = sounding.helicity ?? setupNumber(scenario, "0-1 km SRH", 180);
  const shearBase = sounding.shear ?? setupNumber(scenario, "Deep Shear", 45);
  const dcapeBase = setupNumber(scenario, "DCAPE", 1000);
  const temperature = clamp(Number(sounding.temperature) || DEFAULT_SOUNDING.temperature, -20, 115);
  const dewpoint = clamp(Math.min(temperature, Number(sounding.dewpoint) || DEFAULT_SOUNDING.dewpoint), -40, 90);
  const dewpointSpread = Math.max(0, temperature - dewpoint);
  const run = (salt, min, max) => min + (max - min) * seededNoise(seed, scenario.id.length + salt);
  const capSign = run(1, -1, 1);
  const lowLevelJet = run(2, 28, 62);
  const boundaryFocus = run(3, 0.48, 1.24);
  const moistureQuality = clamp((dewpoint - 38) / 30 * 0.76 + run(4, 0.18, 0.42), 0.42, 1.18);
  const capStrength = clamp(run(5, 0.12, 0.92) + Math.max(0, capSign) * 0.18, 0, 1);
  const coldPool = run(6, 0.74, 1.36);
  const lapseRate = clamp(6.1 + capeBase / 3100 + run(7, -0.7, 0.7), 5.8, 9.2);
  const lcl = Math.round(clamp(125 * (dewpointSpread * 5 / 9), 250, 2600));
  const pwat = clamp(0.7 + (dewpoint - 38) / 35 + run(9, -0.14, 0.14), 0.7, 2.5);
  const stormRelativeFlow = run(10, 28, 64);
  const drylineSurge = run(11, -0.018, 0.022);
  const terrainScatter = run(12, 0.28, 0.92);
  const stormCycle = run(13, 0.78, 1.32);
  const initiationOffset = Math.round(run(14, -7, 8));
  const convectiveTemp = Math.round(clamp(temperature + 7 + capStrength * 9, 55, 105));
  const severityScale = run(21, 0.76, 1.04);
  const hailLimiter = run(22, 0.7, 1.02);
  const rotationScale = run(23, 0.8, 1.08);
  const cloudMerge = run(24, 0.84, 1.22);
  const cloudLayerDepth = run(25, 0.82, 1.18);
  const cape = Math.round(capeBase);
  const cin = Math.round(run(17, 15, 125) * (0.6 + capStrength));
  const srh1 = Math.round(srhBase);
  const shear = Math.round(shearBase);
  const dcape = Math.round(clamp(dcapeBase * (0.74 + dewpointSpread / 36) * coldPool, 350, 2600));
  const setupFlavor = boundaryFocus > 1.02
    ? capStrength < 0.34
      ? "Focused boundary initiation corridor"
      : "Narrow cap-break storm corridor"
    : coldPool > 1.14
      ? "Outflow-dominant messy convective setup"
      : drylineSurge > 0.01
        ? "Surging dryline broken-line setup"
        : "Broad warm-sector scattered setup";
  const thermoFlavor = cape > 3200 && lcl < 1100
    ? "Juiced low-LCL warm sector"
    : cape > 3000 && lapseRate > 7.6
      ? "Steep-lapse hail profile"
      : cin > 95
        ? "Capped and delayed warm sector"
        : pwat > 1.7
          ? "High-moisture loaded profile"
          : "Moderate mixed-layer thermodynamics";
  const cloudFlavor = cloudMerge > 1.06
    ? "Merged cumulus deck"
    : cloudLayerDepth > 1
      ? "Layered agitated cumulus"
      : "Broken cu field";

  return {
    seed,
    temperature,
    dewpoint,
    helicity: srhBase,
    cape,
    cin,
    srh1,
    shear,
    dcape,
    lapseRate,
    lcl,
    pwat,
    lowLevelJet,
    boundaryFocus,
    moistureQuality,
    capStrength,
    coldPool,
    stormRelativeFlow,
    drylineSurge,
    terrainScatter,
    stormCycle,
    initiationOffset,
    convectiveTemp,
    severityScale,
    hailLimiter,
    rotationScale,
    cloudMerge,
    cloudLayerDepth,
    setupFlavor,
    thermoFlavor,
    cloudFlavor,
    stormScale: clamp((0.82 + (cape - 2600) / 11000 + (shear - 42) / 300) * severityScale, 0.7, 1.08),
    mesoSupport: clamp(((srh1 / 260) * 0.54 + (shear / 60) * 0.32 + (1 - lcl / 2400) * 0.18) * rotationScale, 0.34, 1.12),
    hailSupport: clamp(((cape / 3800) * 0.46 + ((lapseRate - 6) / 3) * 0.46) * hailLimiter, 0.28, 1.08),
    floodSupport: clamp(((pwat - 0.9) / 1.24 + moistureQuality * 0.24) * (0.92 + cloudMerge * 0.08), 0.3, 1.3),
    windSupport: clamp(((dcape / 1350) * 0.48 + coldPool * 0.34 + shear / 210) * (0.88 + severityScale * 0.12), 0.36, 1.24),
  };
}

function renderAll() {
  renderProductOptions();
  renderBriefing();
  renderSkewT();
  renderPaletteStatus();
  renderTimelineLabels();
  renderMetrics();
  renderLegend();
  renderMap();
  renderModelGrid();
  renderProducts();
  renderReports();
}

function soundingProfile(sounding = state.manualSounding) {
  const surfaceC = (sounding.temperature - 32) * 5 / 9;
  const dewpointC = (sounding.dewpoint - 32) * 5 / 9;
  const lapseRate = clamp(5.2 + sounding.cape / 3200, 5.2, 8.2);
  const dewDrop = clamp(1.55 + (sounding.temperature - sounding.dewpoint) / 28, 1.35, 3.3);
  return [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100].map((pressure) => {
    const altitudeKm = 7.4 * Math.log(1000 / pressure);
    const parcelBoost = altitudeKm > 1.2 ? Math.min(3.8, sounding.cape / 1900) * Math.min(1, (altitudeKm - 1.2) / 4) : 0;
    const temperature = surfaceC - lapseRate * altitudeKm + parcelBoost;
    const dewpoint = Math.min(temperature - 0.8, dewpointC - dewDrop * altitudeKm);
    return { pressure, altitudeKm, temperature, dewpoint };
  });
}

function renderSkewT() {
  const canvas = els.soundingCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(250, Math.round(rect.width));
  const height = Math.max(190, Math.round(rect.height));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const pad = { left: 35, right: 10, top: 16, bottom: 25 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const yForPressure = (pressure) => pad.top + Math.log(1000 / pressure) / Math.log(10) * plotHeight;
  const xFor = (temperature, y) => pad.left + ((temperature + 48) / 108) * plotWidth + (1 - (y - pad.top) / plotHeight) * plotWidth * 0.24;

  ctx.fillStyle = "#0a141b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(131, 171, 183, 0.22)";
  ctx.lineWidth = 1;
  [1000, 850, 700, 500, 300, 200, 100].forEach((pressure) => {
    const y = yForPressure(pressure);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = "rgba(209, 225, 220, 0.65)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(String(pressure), pad.left - 5, y + 3);
  });
  for (let temp = -40; temp <= 50; temp += 10) {
    ctx.strokeStyle = temp === 0 ? "rgba(125, 190, 205, 0.5)" : "rgba(131, 171, 183, 0.18)";
    ctx.beginPath();
    ctx.moveTo(xFor(temp, pad.top), pad.top);
    ctx.lineTo(xFor(temp, height - pad.bottom), height - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = "rgba(209, 225, 220, 0.62)";
    ctx.textAlign = "center";
    ctx.fillText(`${temp}°`, xFor(temp, height - pad.bottom), height - 6);
  }
  const profile = soundingProfile();
  const drawTrace = (key, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.beginPath();
    profile.forEach((point, index) => {
      const y = yForPressure(point.pressure);
      const x = xFor(point[key], y);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  drawTrace("dewpoint", "#5bbdd2");
  drawTrace("temperature", "#f06f52");
  ctx.fillStyle = "rgba(231, 239, 233, 0.92)";
  ctx.font = "700 10px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText("T", width - 31, 16);
  ctx.fillStyle = "#f06f52"; ctx.fillRect(width - 41, 8, 8, 3);
  ctx.fillStyle = "#5bbdd2"; ctx.fillRect(width - 41, 19, 8, 3);
  ctx.fillStyle = "rgba(231, 239, 233, 0.92)"; ctx.fillText("Td", width - 31, 27);
  const lcl = Math.round(125 * ((state.manualSounding.temperature - state.manualSounding.dewpoint) * 5 / 9));
  els.soundingMeta.textContent = `LCL ~${clamp(lcl, 250, 2600)} m`;
}

function renderBriefing() {
  const scenario = getCase();
  els.caseSubtitle.textContent = `${scenario.region} | ${scenario.name} | ${scenario.runLabel || "LIVE RUN"}`;
  els.briefing.innerHTML = "";

  const paragraph = document.createElement("p");
  paragraph.textContent = scenario.briefing;
  els.briefing.appendChild(paragraph);

  const dl = document.createElement("dl");
  scenario.setup.forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = formatSetupValue(term, value);
    dl.append(dt, dd);
  });
  const env = getEnvironment();
  const archetypes = [...new Set(scenario.storms.map((storm) => modeDisplayName(storm.mode)))].join(", ");
  [
    ["Run MLCAPE", `${env.cape} J/kg`],
    ["MLCIN", `${env.cin} J/kg`],
    ["LCL", `${env.lcl} m`],
    ["DCAPE", `${env.dcape} J/kg`],
    ["LLJ", `${Math.round(env.lowLevelJet * KNOTS_TO_MPH)} mph`],
    ["Convective Temp", `${env.convectiveTemp}F`],
    ["Run Setup", env.setupFlavor],
    ["Thermo", env.thermoFlavor],
    ["Cloud Field", env.cloudFlavor],
    ["Archetypes", archetypes],
    ["Lifecycle", "Cu -> growth -> mature -> outflow/remnant"],
  ].forEach(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    dl.append(dt, dd);
  });
  els.briefing.appendChild(dl);
}

function renderProductOptions() {
  const product = getProduct();
  const existing = Object.fromEntries(
    [...els.productOptions.querySelectorAll("select")].map((select) => [select.id, select.value]),
  );
  els.productOptions.innerHTML = "";
  addOptionSelect("areaShape", "Area Shape", [
    ["county", "County-style"],
    ["cone", "Storm cone"],
    ["polygon", "Free polygon"],
    ["rect", "Box area"],
  ], existing.areaShape || state.areaMode || DEFAULT_AREA_MODE);

  if (product.group === "outlook") {
    addOptionSelect("riskLevel", "Risk", [
      ["MRGL", "Marginal"],
      ["SLGT", "Slight"],
      ["ENH", "Enhanced"],
      ["MDT", "Moderate"],
      ["HIGH", "High"],
    ], existing.riskLevel || "ENH");
    addOptionSelect("torProb", "Tornado", [
      ["2", "2%"],
      ["5", "5%"],
      ["10", "10%"],
      ["15", "15%"],
      ["30", "30%"],
    ], existing.torProb || "10");
    addOptionSelect("windProb", "Wind", [
      ["5", "5%"],
      ["15", "15%"],
      ["30", "30%"],
      ["45", "45%"],
      ["60", "60%"],
    ], existing.windProb || "30");
    addOptionSelect("hailProb", "Hail", [
      ["5", "5%"],
      ["15", "15%"],
      ["30", "30%"],
      ["45", "45%"],
      ["60", "60%"],
    ], existing.hailProb || "30");
  } else if (product.group === "discussion") {
    addOptionSelect("mdTorIntensity", "TOR Intensity", [
      ["brief", "Brief spinups"],
      ["organized", "Organized"],
      ["strong", "Strong"],
      ["violent", "Violent"],
    ], existing.mdTorIntensity || "organized");
    addOptionSelect("mdWindIntensity", "Wind Intensity", [
      ["marginal", "Marginal"],
      ["severe", "Severe"],
      ["significant", "Significant"],
      ["destructive", "Destructive"],
    ], existing.mdWindIntensity || "significant");
    addOptionSelect("mdHailIntensity", "Hail Intensity", [
      ["marginal", "Marginal"],
      ["severe", "Severe"],
      ["very-large", "Very large"],
      ["giant", "Giant"],
    ], existing.mdHailIntensity || "severe");
    addOptionSelect("mdFloodIntensity", "Flood Intensity", [
      ["localized", "Localized"],
      ["repeating", "Repeating"],
      ["considerable", "Considerable"],
      ["extreme", "Extreme"],
    ], existing.mdFloodIntensity || "considerable");
  } else if (product.group === "watch") {
    addOptionSelect("watchTorProb", "TOR Prob", [
      ["5", "5%"],
      ["15", "15%"],
      ["30", "30%"],
      ["45", "45%"],
      ["60", "60%"],
      ["80", "80%"],
      ["95", "95%"],
    ], existing.watchTorProb || defaultWatchThreat(product, "tornado"));
    addOptionSelect("watchWindProb", "Wind Prob", [
      ["15", "15%"],
      ["30", "30%"],
      ["45", "45%"],
      ["60", "60%"],
      ["80", "80%"],
      ["95", "95%"],
    ], existing.watchWindProb || defaultWatchThreat(product, "wind"));
    addOptionSelect("watchHailProb", "Hail Prob", [
      ["15", "15%"],
      ["30", "30%"],
      ["45", "45%"],
      ["60", "60%"],
      ["80", "80%"],
      ["95", "95%"],
    ], existing.watchHailProb || defaultWatchThreat(product, "hail"));
    addOptionSelect("watchTag", "Tag", [
      ["standard", "Standard"],
      ["enhanced", "Enhanced wording"],
      ["pds", "PDS wording"],
    ], product.severe ? "pds" : existing.watchTag || "standard");
    addOptionSelect("watchDuration", "Duration", [
      ["3", "3 hours"],
      ["4", "4 hours"],
      ["6", "6 hours"],
      ["8", "8 hours"],
    ], existing.watchDuration || "6");
  } else if (product.group === "warning") {
    addOptionSelect("warningBasis", "Basis", [
      ["radar", "Radar indicated"],
      ["observed", "Observed"],
      ["spotter", "Spotter confirmed"],
      ["emergency", "Emergency"],
    ], existing.warningBasis || "radar");
    addOptionSelect("impactTag", "Impact", [
      ["base", "Base"],
      ["considerable", "Considerable"],
      ["destructive", "Destructive"],
      ["catastrophic", "Catastrophic"],
    ], product.severe ? "destructive" : existing.impactTag || "base");
    addOptionSelect("warningDuration", "Duration", [
      ["30", "30 min"],
      ["45", "45 min"],
      ["60", "60 min"],
      ["90", "90 min"],
    ], existing.warningDuration || "60");
    if (product.hazards.includes("tornado")) {
      addOptionSelect("torThreat", "TOR Threat", [
        ["spinup", "Short-lived spinup"],
        ["tight", "Tight couplet"],
        ["strong", "Strong tornado"],
        ["violent", "Violent tornado"],
      ], existing.torThreat || "tight");
      addOptionSelect("torConfidence", "TOR Confidence", [
        ["40", "40%"],
        ["60", "60%"],
        ["80", "80%"],
        ["95", "95%"],
      ], existing.torConfidence || "80");
    }
    if (product.hazards.includes("wind")) {
      addOptionSelect("windThreat", "Wind Max", [
        ["60", "60 mph"],
        ["70", "70 mph"],
        ["80", "80 mph"],
        ["90", "90 mph"],
      ], existing.windThreat || (product.severe ? "80" : "70"));
    }
    if (product.hazards.includes("hail")) {
      addOptionSelect("hailThreat", "Hail Max", [
        ["1.00", "1.00 in"],
        ["1.75", "1.75 in"],
        ["2.50", "2.50 in"],
        ["3.50", "3.50 in"],
      ], existing.hailThreat || (product.severe ? "2.50" : "1.75"));
    }
    if (product.hazards.includes("flood")) {
      addOptionSelect("rainRate", "Rain Rate", [
        ["1.0", "1.0 in/hr"],
        ["2.0", "2.0 in/hr"],
        ["3.5", "3.5 in/hr"],
        ["5.0", "5.0 in/hr"],
      ], existing.rainRate || "2.0");
      addOptionSelect("trainingMode", "Training", [
        ["isolated", "Isolated cores"],
        ["scattered", "Scattered repeats"],
        ["repeating", "Repeating over same area"],
        ["anchored", "Anchored boundary"],
      ], existing.trainingMode || "scattered");
    }
  } else {
    addOptionSelect("statementTone", "Tone", [
      ["standard", "Standard"],
      ["strong", "Strong storm"],
      ["training", "Training cells"],
    ], existing.statementTone || "strong");
    addOptionSelect("statementDuration", "Duration", [
      ["30", "30 min"],
      ["45", "45 min"],
      ["60", "60 min"],
    ], existing.statementDuration || "45");
    addOptionSelect("windThreat", "Wind Max", [
      ["45", "45 mph"],
      ["55", "55 mph"],
      ["65", "65 mph"],
    ], existing.windThreat || "55");
    addOptionSelect("hailThreat", "Hail Max", [
      ["0.75", "0.75 in"],
      ["1.00", "1.00 in"],
      ["1.50", "1.50 in"],
    ], existing.hailThreat || "1.00");
  }
}

function addOptionSelect(id, label, options, value) {
  const wrapper = document.createElement("label");
  wrapper.className = "field-label";
  wrapper.htmlFor = id;
  wrapper.textContent = label;

  const select = document.createElement("select");
  select.id = id;
  options.forEach(([optionValue, text]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    select.appendChild(option);
  });
  select.value = value;
  select.addEventListener("change", () => {
    if (id === "areaShape") {
      state.areaMode = select.value;
      state.selection = state.selection ? reshapeSelection(state.selection, state.areaMode) : null;
      renderAll();
    }
  });
  wrapper.appendChild(select);
  els.productOptions.appendChild(wrapper);
}

function renderTimelineLabels() {
  const scenario = getCase();
  const max = timelineMaxForLayer();
  els.timeRange.max = String(max);
  const marks = max <= 0
    ? [0]
    : [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(max * fraction));
  const labels = [...new Set(marks)].map((index) => formatTime(scenario, index));
  els.timelineLabels.innerHTML = labels.map((label) => `<span>${label}</span>`).join("");
  els.timelineStatus.textContent = timelineStatus();
}

function renderMetrics() {
  const score = getDeskScore();
  els.validTime.textContent = formatTime(getCase(), state.timeIndex);
  els.deskScore.textContent = `${score}`;
  els.hitCount.textContent = String(state.stats.hits);
  els.falseAlarmCount.textContent = String(state.stats.falseAlarms);
  els.missCount.textContent = String(state.stats.misses);
  els.accuracyBadge.textContent = `${score}%`;
  els.polygonMeter.value = state.stats.polygonSkill;
  els.leadMeter.value = state.stats.leadSkill;
  els.hazardMeter.value = state.stats.hazardSkill;
  els.areaStatus.textContent = state.selection ? `${(state.selection.type || "area").toUpperCase()}` : "No Area";
  els.areaStatus.classList.toggle("muted", !state.selection);
  els.issueBtn.disabled = !state.selection;
  els.timeRange.value = String(clamp(state.timeIndex, 0, timelineMaxForLayer()));
  els.stepBackBtn.disabled = state.timeIndex <= 0;
  els.stepForwardBtn.disabled = state.layer === "model"
    ? state.timeIndex >= MAX_TIME_INDEX
    : state.currentIndex >= MAX_TIME_INDEX && state.timeIndex >= state.currentIndex;
}

function renderLegend() {
  const layer = LAYERS[state.layer];
  let legend = layer.legend;
  if (state.layer === "model" && state.modelProduct === "spc-outlook") {
    legend = [["None", "#1d2930"], ["General", "#7fbf7b"], ["Marginal", "#3daf5b"], ["Slight", "#f3d447"], ["Enhanced", "#e6813d"], ["Moderate", "#e34845"], ["High", "#bf4eea"]];
  } else if ((state.layer === "radar" || state.layer === "velocity") && state.customPalettes[state.layer]) {
    const entries = state.customPalettes[state.layer].entries;
    legend = entries.map((entry) => [String(entry.value), `rgb(${entry.start[0]}, ${entry.start[1]}, ${entry.start[2]})`]);
  } else if (state.layer === "model" && state.modelProduct === "satellite") {
    legend = LAYERS.satellite.legend;
  }
  els.legend.innerHTML = legend
    .map(
      ([label, color]) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${label}</span>`,
    )
    .join("");
}

function renderMap() {
  const canvas = els.weatherCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(260, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  drawCachedBaseMap(ctx, width, height);
  drawWeatherLayer(ctx, width, height, state.layer, state.timeIndex);
  drawTruthHints(ctx, width, height);
  drawProducts(ctx, width, height);
  drawSelection(ctx, width, height);
  drawMapLabels(ctx, width, height);
}

function rasterDimensions(width, height, layer) {
  const layerScale = layer === "satellite" ? 0.62 : layer === "qpf" ? 0.54 : layer === "velocity" ? 0.68 : RASTER_SCALE;
  const maxWidth = layer === "satellite" ? 760 : 840;
  const maxHeight = layer === "satellite" ? 540 : 620;
  let rasterWidth = Math.max(260, Math.min(maxWidth, Math.round(width * layerScale)));
  let rasterHeight = Math.max(200, Math.min(maxHeight, Math.round(height * layerScale)));
  const pixels = rasterWidth * rasterHeight;
  if (pixels > MAX_WEATHER_PIXELS) {
    const factor = Math.sqrt(MAX_WEATHER_PIXELS / pixels);
    rasterWidth = Math.max(220, Math.round(rasterWidth * factor));
    rasterHeight = Math.max(180, Math.round(rasterHeight * factor));
  }
  return { rasterWidth, rasterHeight };
}

function drawCachedBaseMap(ctx, width, height) {
  const scenario = getCase();
  const key = `${scenario.runId || scenario.id}:${Math.round(width)}x${Math.round(height)}`;
  if (!renderCache.base || renderCache.base.key !== key) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const off = canvas.getContext("2d");
    drawBaseMap(off, width, height);
    renderCache.base = { key, canvas };
  }
  ctx.drawImage(renderCache.base.canvas, 0, 0, width, height);
}

function drawBaseMap(ctx, width, height) {
  const scenario = getCase();
  ctx.fillStyle = "#071018";
  ctx.fillRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "rgba(14, 24, 31, 0.94)");
  sky.addColorStop(0.48, "rgba(10, 18, 24, 0.56)");
  sky.addColorStop(1, "rgba(4, 10, 15, 0.94)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  if (scenario.national) {
    drawNationalBase(ctx, width, height);
    ctx.save();
    traceNationalOutline(ctx, width, height);
    ctx.clip();
    drawTerrainTexture(ctx, width, height, scenario);
    drawJurisdictionMesh(ctx, width, height, scenario, { density: 0.12 });
    drawHydrology(ctx, width, height, scenario);
    drawTransitGrid(ctx, width, height, scenario, { majorOnly: true });
    ctx.restore();
  } else {
    drawRegionalBackdrop(ctx, width, height);
    drawTerrainTexture(ctx, width, height, scenario);
    drawJurisdictionMesh(ctx, width, height, scenario, { density: 0.085 });
    drawStateBorders(ctx, width, height, scenario);
    drawHydrology(ctx, width, height, scenario);
    drawTransitGrid(ctx, width, height, scenario);
  }

  drawRadarCoverageHalo(ctx, width, height, scenario);
}

function drawStateBorders(ctx, width, height, scenario) {
  const traces = STATE_BORDER_TRACES[scenario.id] || [];
  if (!traces.length) return;
  ctx.save();
  ctx.strokeStyle = "rgba(229, 235, 219, 0.7)";
  ctx.lineWidth = Math.max(1.1, Math.min(width, height) / 580);
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 2;
  traces.forEach((trace) => {
    ctx.beginPath();
    trace.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x * width, y * height);
      else ctx.lineTo(x * width, y * height);
    });
    ctx.stroke();
  });
  ctx.restore();
}

function drawNationalBase(ctx, width, height) {
  ctx.save();
  const ocean = ctx.createLinearGradient(0, 0, width, height);
  ocean.addColorStop(0, "rgba(5, 12, 18, 0.94)");
  ocean.addColorStop(0.55, "rgba(8, 18, 26, 0.82)");
  ocean.addColorStop(1, "rgba(4, 10, 15, 0.96)");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(33, 45, 41, 0.78)";
  ctx.strokeStyle = "rgba(162, 177, 163, 0.42)";
  ctx.lineWidth = 1.5;
  traceNationalOutline(ctx, width, height);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function traceNationalOutline(ctx, width, height) {
  const outline = [
    [0.11, 0.18], [0.2, 0.12], [0.34, 0.14], [0.5, 0.16], [0.64, 0.18], [0.76, 0.22],
    [0.86, 0.33], [0.91, 0.48], [0.88, 0.61], [0.83, 0.72], [0.81, 0.9], [0.74, 0.86],
    [0.67, 0.75], [0.57, 0.79], [0.45, 0.82], [0.33, 0.79], [0.22, 0.74], [0.16, 0.62],
    [0.12, 0.5], [0.09, 0.35],
  ];
  ctx.beginPath();
  outline.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x * width, y * height);
    else ctx.lineTo(x * width, y * height);
  });
  ctx.closePath();
}

function drawRegionalBackdrop(ctx, width, height) {
  const land = ctx.createLinearGradient(0, 0, width, height);
  land.addColorStop(0, "rgba(23, 34, 34, 0.74)");
  land.addColorStop(0.52, "rgba(19, 30, 27, 0.78)");
  land.addColorStop(1, "rgba(14, 24, 24, 0.88)");
  ctx.fillStyle = land;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 8; i += 1) {
    const gx = randomBetween(width + height, 300 + i, 0.05, 0.95) * width;
    const gy = randomBetween(width + height, 400 + i, 0.08, 0.92) * height;
    const radius = randomBetween(width + height, 500 + i, width * 0.08, width * 0.22);
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
    glow.addColorStop(0, "rgba(170, 145, 98, 0.18)");
    glow.addColorStop(1, "rgba(170, 145, 98, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(gx - radius, gy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

function drawTerrainTexture(ctx, width, height, scenario) {
  const env = getEnvironment();
  const step = scenario.national ? 7 : 6;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const nx = x / width;
      const ny = y / height;
      const ridges = smoothNoise(nx * 6.4 + 4, ny * 6.8 - 3, env.seed % 383);
      const terrain = smoothNoise(nx * 15 + env.drylineSurge * 18, ny * 14 - env.boundaryFocus * 3, env.seed % 811);
      const moisture = smoothNoise(nx * 8 - 5, ny * 8 + 7, env.seed % 563);
      const blend = clamp(ridges * 0.52 + terrain * 0.34 + moisture * 0.14, 0, 1);
      const r = Math.round(22 + blend * 30 + moisture * 9);
      const g = Math.round(32 + blend * 38 + moisture * 14);
      const b = Math.round(26 + ridges * 20 + (1 - moisture) * 10);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + blend * 0.18})`;
      ctx.fillRect(x, y, step + 1, step + 1);
    }
  }
}

function drawJurisdictionMesh(ctx, width, height, scenario, options = {}) {
  const density = options.density || 0.085;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(164, 177, 160, 0.42)";
  ctx.lineWidth = 1;
  for (let i = density; i < 0.98; i += density) {
    ctx.beginPath();
    for (let p = 0; p <= 1; p += 0.03) {
      const x = (i + Math.sin(p * TAU * 1.4 + i * 14) * 0.008) * width;
      const y = p * height;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = density; i < 0.98; i += density) {
    ctx.beginPath();
    for (let p = 0; p <= 1; p += 0.03) {
      const x = p * width;
      const y = (i + Math.cos(p * TAU * 1.6 + i * 16) * 0.008) * height;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = "rgba(226, 204, 154, 0.26)";
  ctx.lineWidth = 1.4;
  for (let i = 0.18; i < 0.9; i += 0.22) {
    ctx.beginPath();
    for (let p = 0; p <= 1; p += 0.025) {
      const x = p * width;
      const y = (i + Math.sin(p * TAU * 1.05 + i * 8) * 0.02) * height;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawHydrology(ctx, width, height, scenario) {
  ctx.save();
  ctx.globalAlpha = scenario.national ? 0.42 : 0.52;
  ctx.strokeStyle = "rgba(78, 155, 181, 0.58)";
  ctx.lineWidth = scenario.national ? 1.5 : 1.9;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    for (let p = 0; p <= 1; p += 0.02) {
      const x = (0.08 + p * 0.86) * width;
      const y = (0.74 - i * 0.2 - p * 0.24 + Math.sin(p * TAU * (1.7 + i * 0.18) + i) * 0.028) * height;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (!scenario.national) {
    ctx.fillStyle = "rgba(76, 134, 152, 0.22)";
    ctx.beginPath();
    ctx.ellipse(width * 0.78, height * 0.22, width * 0.08, height * 0.04, -0.42, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawTransitGrid(ctx, width, height, scenario, options = {}) {
  ctx.save();
  ctx.globalAlpha = options.majorOnly ? 0.22 : 0.3;
  ctx.strokeStyle = "rgba(204, 176, 120, 0.38)";
  ctx.lineWidth = options.majorOnly ? 1.3 : 1.6;
  const corridors = options.majorOnly ? 3 : 5;
  for (let i = 0; i < corridors; i += 1) {
    ctx.beginPath();
    for (let p = 0; p <= 1; p += 0.025) {
      const x = (0.06 + p * 0.9) * width;
      const y = (0.2 + i * 0.16 + Math.sin(p * TAU * (0.8 + i * 0.08) + i * 1.7) * 0.018) * height;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawRadarCoverageHalo(ctx, width, height, scenario) {
  const x = scenario.radarSite.x * width;
  const y = scenario.radarSite.y * height;
  ctx.save();
  const halo = ctx.createRadialGradient(x, y, 0, x, y, Math.min(width, height) * 0.78);
  halo.addColorStop(0, "rgba(126, 190, 214, 0.1)");
  halo.addColorStop(0.4, "rgba(126, 190, 214, 0.03)");
  halo.addColorStop(1, "rgba(126, 190, 214, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawMapLabels(ctx, width, height) {
  const scenario = getCase();
  ctx.save();
  scenario.mapLabels.forEach((label) => {
    ctx.fillStyle = "rgba(241,238,229,0.18)";
    ctx.font = `800 ${clamp(Math.round(width / 23), 21, 34)}px 'Avenir Next', 'IBM Plex Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label.text, label.x * width, label.y * height);
  });

  ctx.font = "700 11px 'IBM Plex Sans', 'Avenir Next', sans-serif";
  ctx.textAlign = "left";
  scenario.cities.forEach((city) => {
    const x = city.x * width;
    const y = city.y * height;
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 3;
    ctx.fillStyle = "rgba(241,238,229,0.88)";
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, TAU);
    ctx.fill();
    ctx.fillText(city.name, x + 6, y + 4);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

function drawWeatherLayer(ctx, width, height, layer, timeIndex) {
  if (layer === "reports") {
    drawReportsLayer(ctx, width, height, timeIndex);
    return;
  }
  if (layer === "model" && state.modelProduct === "spc-outlook") {
    drawSpcOutlookGrid(ctx, width, height, timeIndex, getModel());
    return;
  }
  const { rasterWidth, rasterHeight } = rasterDimensions(width, height, layer);
  const scenario = getCase();
  const model = layer === "model" ? getModel() : null;
  const sampleLayer = layer === "model" ? state.modelProduct : layer;
  const modelTime = model ? timeIndex + model.bias.timing : timeIndex;
  const cacheKey = [
    scenario.runId || scenario.id,
    layer,
    sampleLayer,
    model ? model.id : "obs",
    modelTime,
    state.activeTilt,
    rasterWidth,
    rasterHeight,
  ].join(":");
  let offscreen = renderCache.weather.get(cacheKey);
  if (!offscreen) {
    offscreen = renderWeatherRaster(scenario, model, sampleLayer, modelTime, rasterWidth, rasterHeight, state.activeTilt);
    renderCache.weather.set(cacheKey, offscreen);
    pruneWeatherCache();
  }

  ctx.save();
  ctx.imageSmoothingEnabled = sampleLayer === "satellite";
  ctx.globalCompositeOperation = sampleLayer === "satellite" ? "source-over" : "screen";
  ctx.drawImage(offscreen, 0, 0, width, height);
  ctx.restore();

  if (layer === "radar" || layer === "velocity" || layer === "spectrum") {
    drawRadarArtifacts(ctx, width, height, layer, timeIndex);
  }
  if (layer === "velocity" || layer === "spectrum") {
    drawRadarSite(ctx, width, height);
  }
  if (layer === "model" && state.modelProduct === "reflectivity") {
    drawModelSwaths(ctx, width, height, timeIndex);
  }
}

function drawSpcOutlookGrid(ctx, width, height, timeIndex, model) {
  const cellSize = clamp(Math.round(Math.min(width, height) / 28), 12, 20);
  const frame = getStormFrame(getCase(), timeIndex + model.bias.timing, model);
  const labels = ["None", "General", "Marginal", "Slight", "Enhanced", "Moderate", "High"];
  const colors = ["#1d2930", "#7fbf7b", "#3daf5b", "#f3d447", "#e6813d", "#e34845", "#bf4eea"];
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const nx = (x + cellSize * 0.5) / width;
      const ny = (y + cellSize * 0.5) / height;
      const risk = spcRiskAt(frame, nx, ny);
      ctx.fillStyle = colors[risk];
      ctx.globalAlpha = risk === 0 ? 0.18 : 0.34 + risk * 0.08;
      ctx.fillRect(x, y, cellSize + 0.5, cellSize + 0.5);
      ctx.strokeStyle = "rgba(229, 238, 231, 0.08)";
      ctx.globalAlpha = 0.38;
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(233, 241, 236, 0.82)";
  ctx.font = "700 11px ui-monospace, monospace";
  ctx.fillText(`${model.name} GENERATED SPC OUTLOOK`, 12, 20);
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(`pixel-grid probabilities | ${labels.slice(2).join(" / ")}`, 12, 34);
  ctx.restore();
}

function spcRiskAt(frame, x, y) {
  const env = frame.env;
  let stormSignal = 0;
  frame.storms.forEach(({ pos, dynamics, storm }) => {
    const stretch = storm.mode === "bow" || storm.mode === "line" ? 0.18 : 0.1;
    const dx = x - pos.x;
    const dy = y - pos.y;
    const footprint = Math.exp(-0.5 * ((dx * dx) / (stretch * stretch) + (dy * dy) / (0.12 * 0.12)));
    const severe = dynamics.intensity * 0.42 + dynamics.wind * 0.24 + dynamics.hail * 0.18 + dynamics.rotation * 0.22;
    stormSignal = Math.max(stormSignal, footprint * severe);
  });
  const environment = clamp((env.cape / 4200) * 0.38 + (env.shear / 70) * 0.28 + (env.srh1 / 380) * 0.2 + (1 - env.lcl / 2500) * 0.14, 0, 1);
  const score = clamp(stormSignal * 0.75 + environment * 0.22, 0, 1);
  if (score < 0.1) return 0;
  if (score < 0.22) return 1;
  if (score < 0.36) return 2;
  if (score < 0.52) return 3;
  if (score < 0.68) return 4;
  if (score < 0.84) return 5;
  return 6;
}

function renderWeatherRaster(scenario, model, sampleLayer, modelTime, rasterWidth, rasterHeight, tiltDeg = 0.5) {
  const offscreen = document.createElement("canvas");
  offscreen.width = rasterWidth;
  offscreen.height = rasterHeight;
  const off = offscreen.getContext("2d");
  const image = off.createImageData(rasterWidth, rasterHeight);
  getStormFrame(scenario, modelTime, model);

  for (let y = 0; y < rasterHeight; y += 1) {
    for (let x = 0; x < rasterWidth; x += 1) {
      const nx = x / (rasterWidth - 1);
      const ny = y / (rasterHeight - 1);
      const value = sampleField(scenario, modelTime, nx, ny, sampleLayer, model, tiltDeg);
      const color = colorForLayer(sampleLayer, value);
      const index = (y * rasterWidth + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = color[3];
    }
  }
  off.putImageData(image, 0, 0);
  return offscreen;
}

function pruneWeatherCache() {
  pruneCache(renderCache.weather, MAX_WEATHER_CACHE);
}

function drawRadarSite(ctx, width, height) {
  const site = getCase().radarSite;
  const x = site.x * width;
  const y = site.y * height;
  ctx.save();
  ctx.strokeStyle = "rgba(241,238,229,0.42)";
  ctx.lineWidth = 1;
  [0.18, 0.36, 0.54, 0.72].forEach((radius) => {
    ctx.beginPath();
    ctx.arc(x, y, Math.min(width, height) * radius, 0, TAU);
    ctx.stroke();
  });
  ctx.fillStyle = "#f1eee5";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawRadarArtifacts(ctx, width, height, layer, timeIndex) {
  const scenario = getCase();
  const site = scenario.radarSite;
  const sx = site.x * width;
  const sy = site.y * height;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = 1;
  ctx.strokeStyle = layer === "velocity" ? "rgba(241,238,229,0.08)" : "rgba(241,238,229,0.05)";
  for (let a = 0; a < TAU; a += TAU / 48) {
    const shimmer = 0.4 + hashNoise(Math.round(a * 1000), timeIndex, scenario.id.length, 7) * 0.6;
    ctx.globalAlpha = layer === "velocity" ? 0.03 * shimmer : 0.035 * shimmer;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * width * 1.3, sy + Math.sin(a) * height * 1.3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawReportsLayer(ctx, width, height, timeIndex) {
  const reports = getReports(timeIndex, { includeMeta: true });
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  reports.forEach((report) => {
    const x = report.x * width;
    const y = report.y * height;
    const age = Math.max(0, state.currentIndex - report.observedIndex);
    const radius = clamp(9 - age * 0.18, 5.5, 9);
    ctx.fillStyle = hexToRgba(report.color, 0.16);
    ctx.strokeStyle = report.color;
    ctx.lineWidth = 1.8;
    if (report.kind === "tornado" && report.track?.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(227, 53, 72, 0.94)";
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      report.track.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x * width, point.y * height);
        else ctx.lineTo(point.x * width, point.y * height);
      });
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 235, 232, 0.72)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = report.color;
    ctx.beginPath();
    if (report.kind === "tornado") {
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius * 0.9, y + radius * 0.6);
      ctx.lineTo(x - radius * 0.9, y + radius * 0.6);
      ctx.closePath();
    } else if (report.kind === "hail") {
      ctx.arc(x, y, radius * 0.75, 0, TAU);
    } else if (report.kind === "wind") {
      ctx.rect(x - radius * 0.85, y - radius * 0.42, radius * 1.7, radius * 0.84);
    } else {
      ctx.moveTo(x, y - radius);
      ctx.quadraticCurveTo(x + radius, y, x, y + radius);
      ctx.quadraticCurveTo(x - radius, y, x, y - radius);
    }
    ctx.fill();
  });
  ctx.restore();
}

function drawModelSwaths(ctx, width, height, timeIndex) {
  const scenario = getCase();
  const model = getModel();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  scenario.storms.forEach((storm) => {
    for (let t = timeIndex; t <= Math.min(MAX_TIME_INDEX, timeIndex + 10); t += 2) {
      const pos = stormPosition(storm, t, model);
      const intensity = stormDynamics(storm, t, model).intensity;
      if (intensity < 0.48) continue;
      const alpha = 0.05 + ((t - timeIndex) / 10) * 0.04;
      ctx.fillStyle = `rgba(185,130,255,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(pos.x * width, pos.y * height, 32 * model.bias.spread, 17 * model.bias.spread, storm.angle, 0, TAU);
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawTruthHints(ctx, width, height) {
  const layer = state.layer;
  if (layer !== "rotation" && layer !== "hail" && layer !== "qpf") return;
  const hazards = truthHazards(getCase(), state.timeIndex);
  ctx.save();
  hazards.forEach((hazard) => {
    if ((layer === "rotation" && hazard.kind !== "tornado") || (layer === "hail" && hazard.kind !== "hail") || (layer === "qpf" && hazard.kind !== "flood")) {
      return;
    }
    ctx.strokeStyle = hazard.kind === "tornado" ? "rgba(241,238,229,0.72)" : "rgba(244,183,64,0.58)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(hazard.x * width, hazard.y * height, hazard.w * width, hazard.h * height, hazard.angle, 0, TAU);
    ctx.stroke();
  });
  ctx.restore();
}

function drawProducts(ctx, width, height) {
  ctx.save();
  state.products.forEach((product) => {
    const catalog = getProduct(product.productId);
    const active = product.start <= state.timeIndex && product.end >= state.timeIndex;
    const area = product.area || rectToArea(product.rect);
    const bounds = areaBounds(area);
    const x = bounds.x1 * width;
    const y = bounds.y1 * height;
    ctx.globalAlpha = active ? 1 : 0.42;
    ctx.strokeStyle = catalog.color;
    ctx.fillStyle = hexToRgba(catalog.color, catalog.group === "warning" ? 0.12 : 0.08);
    ctx.lineWidth = catalog.group === "warning" ? 2.5 : catalog.group === "discussion" ? 2 : 2;
    ctx.setLineDash(catalog.group === "outlook" ? [10, 5] : catalog.group === "watch" ? [6, 4] : catalog.group === "discussion" ? [2, 4] : []);
    drawAreaPath(ctx, area, width, height);
    ctx.fill();
    drawAreaPath(ctx, area, width, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = catalog.color;
    ctx.font = "800 12px 'IBM Plex Mono', 'SFMono-Regular', monospace";
    ctx.fillText(`${catalog.short} #${product.number}`, x + 8, y + 16);
  });
  ctx.restore();
}

function drawSelection(ctx, width, height) {
  if (!state.selection) return;
  const area = state.selection;
  const product = getProduct();
  ctx.save();
  ctx.strokeStyle = product.color;
  ctx.fillStyle = hexToRgba(product.color, 0.1);
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  drawAreaPath(ctx, area, width, height);
  ctx.fill();
  drawAreaPath(ctx, area, width, height);
  ctx.stroke();
  ctx.restore();
}

function renderModelGrid() {
  const selected = getModel();
  els.modelMeta.textContent = selected.grid;
  renderModelSummary();
  if (!els.modelGrid.dataset.ready) {
    els.modelGrid.innerHTML = "";
    MODELS.forEach((model) => {
      const button = document.createElement("button");
      button.className = "model-card";
      button.type = "button";
      button.dataset.model = model.id;
      button.innerHTML = `
        <canvas width="130" height="84"></canvas>
        <span><strong>${model.name}</strong><span>${model.grid} | ${model.note}</span><span class="model-stat"></span></span>
      `;
      button.addEventListener("click", () => {
        state.modelId = model.id;
        populateModelProducts();
        state.layer = "model";
        els.modelSelect.value = model.id;
        syncTimelineToLayer();
        updateLayerButtons();
        renderAll();
      });
      els.modelGrid.appendChild(button);
    });
    els.modelGrid.dataset.ready = "true";
  }

  els.modelGrid.querySelectorAll(".model-card").forEach((card) => {
    const model = getModel(card.dataset.model);
    card.classList.toggle("active", model.id === state.modelId);
    drawModelThumb(card.querySelector("canvas"), model);
    const metric = modelMetric(model);
    card.querySelector(".model-stat").textContent = metric;
  });
}

function renderModelSummary() {
  const summary = modelControversy();
  els.modelSummary.innerHTML = `
    <div><strong>${summary.score}% disagreement</strong><span>${summary.placement} mi placement spread</span></div>
    <div><strong>${summary.solution}</strong><span>${summary.timing} min timing range | ${summary.mode}</span></div>
  `;
}

function drawModelThumb(canvas, model) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const scenario = getCase();
  const key = `${scenario.runId || scenario.id}:${model.id}:${state.timeIndex}:${width}x${height}`;
  const cached = renderCache.thumbs.get(key);
  if (cached) {
    ctx.drawImage(cached, 0, 0);
    return;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#090b09";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "screen";

  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / (width - 1);
      const ny = y / (height - 1);
      const refl = sampleField(scenario, state.timeIndex + 3 + model.bias.timing, nx, ny, "radar", model);
      const rot = sampleField(scenario, state.timeIndex + 3 + model.bias.timing, nx, ny, "rotation", model);
      const color = refl > 48 && rot > 0.4 ? [185, 130, 255, 210] : colorForLayer("radar", refl);
      const index = (y * width + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = color[3];
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  const cacheCanvas = document.createElement("canvas");
  cacheCanvas.width = width;
  cacheCanvas.height = height;
  cacheCanvas.getContext("2d").drawImage(canvas, 0, 0);
  renderCache.thumbs.set(key, cacheCanvas);
  while (renderCache.thumbs.size > MODELS.length * 4) {
    renderCache.thumbs.delete(renderCache.thumbs.keys().next().value);
  }
}

function modelMetric(model) {
  const leadSteps = Math.max(0, state.timeIndex - state.currentIndex);
  const valid = clamp(state.timeIndex + Math.max(3, Math.round(leadSteps * 0.35)), 0, MAX_TIME_INDEX);
  const metrics = sampleModelMetrics(model, valid);
  return `F+${Math.max(0, (valid - state.currentIndex) * STEP_MINUTES)}m CREF ${metrics.dbz} | UH ${metrics.uh} | wind ${metrics.wind} mph | STP ${metrics.stp}`;
}

function sampleModelMetrics(model, validIndex) {
  const scenario = getCase();
  let maxUh = 0;
  let maxRefl = 0;
  let maxWind = 0;
  let maxHail = 0;
  let maxQpf = 0;
  for (let y = 0.08; y <= 0.92; y += 0.055) {
    for (let x = 0.08; x <= 0.92; x += 0.055) {
      maxUh = Math.max(maxUh, sampleField(scenario, validIndex, x, y, "rotation", model));
      maxRefl = Math.max(maxRefl, sampleField(scenario, validIndex, x, y, "radar", model));
      maxWind = Math.max(maxWind, Math.abs(sampleField(scenario, validIndex, x, y, "velocity", model)));
      maxHail = Math.max(maxHail, sampleField(scenario, validIndex, x, y, "hail", model));
      maxQpf = Math.max(maxQpf, sampleField(scenario, validIndex, x, y, "qpf", model));
    }
  }
  const env = getEnvironment();
  const stp = clamp((maxUh * 1.9 + env.srh1 / 310 + env.cape / 5200 - env.lcl / 3400) * (model.bias.rotation || 1), 0, 9.9);
  return {
    uh: Math.round(maxUh * 125),
    dbz: Math.round(maxRefl),
    wind: Math.round(maxWind),
    hail: maxHail.toFixed(1),
    qpf: maxQpf.toFixed(1),
    stp: stp.toFixed(1),
  };
}

function modelControversy() {
  const lead = Math.min(MAX_TIME_INDEX, state.currentIndex + 12);
  const scenario = getCase();
  const points = MODELS.map((model) => {
    let best = { x: 0.5, y: 0.5, refl: 0, timing: model.bias.timing + model.bias.initiation };
    for (let y = 0.1; y <= 0.9; y += 0.08) {
      for (let x = 0.1; x <= 0.9; x += 0.08) {
        const refl = sampleField(scenario, lead, x, y, "radar", model);
        if (refl > best.refl) {
          best = { x, y, refl, timing: model.bias.timing + model.bias.initiation };
        }
      }
    }
    return best;
  });
  const centroid = points.reduce((acc, item) => ({ x: acc.x + item.x / points.length, y: acc.y + item.y / points.length }), { x: 0, y: 0 });
  const spread = points.reduce((max, item) => Math.max(max, Math.hypot(item.x - centroid.x, item.y - centroid.y)), 0);
  const timingValues = points.map((item) => item.timing * STEP_MINUTES);
  const timing = Math.round(Math.max(...timingValues) - Math.min(...timingValues));
  const reflSpread = Math.max(...points.map((item) => item.refl)) - Math.min(...points.map((item) => item.refl));
  const score = clamp(Math.round(spread * 170 + timing * 0.75 + reflSpread * 0.9), 0, 100);
  const active = points.filter((item) => item.refl >= 45).length;
  const solution = active >= MODELS.length * 0.7 ? "Noisy consensus" : active <= MODELS.length * 0.35 ? "Split initiation" : "Mixed modes";
  const mode = active >= MODELS.length * 0.55 ? "storms favored" : "cap failure risk";
  return {
    score,
    placement: Math.round(spread * 155),
    timing,
    solution,
    mode,
  };
}

function renderProducts() {
  const products = state.products
    .slice()
    .sort((a, b) => b.number - a.number)
    .slice(0, 12);
  const activeCount = state.products.filter((product) => product.start <= state.currentIndex && product.end >= state.currentIndex).length;
  els.activeCount.textContent = String(activeCount);
  els.productList.innerHTML = "";
  if (!products.length) {
    els.productList.innerHTML = `<div class="empty-state">No issued products.</div>`;
    return;
  }

  products.forEach((product) => {
    const catalog = getProduct(product.productId);
    const item = document.createElement("div");
    item.className = "product-item";
    item.style.borderLeftColor = catalog.color;
    const verdict = product.verification.hit ? "Verified" : "Unverified";
    const score = product.verification.score;
    const threatSummary = productIntensitySummary(catalog, product.options);
    item.innerHTML = `
      <strong>${catalog.short} #${product.number} | ${verdict} ${score > 0 ? "+" : ""}${score}</strong>
      <span>${formatTime(getCase(), product.start)}-${formatTime(getCase(), product.end)}${threatSummary} | ${product.verification.summary}</span>
      ${product.text ? `<details class="warn-output"><summary>AWIPS text</summary><pre>${escapeHtml(product.text)}</pre></details>` : ""}
    `;
    els.productList.appendChild(item);
  });
}

function renderReports() {
  const reports = getReports();
  els.reportCount.textContent = String(reports.length);
  els.reportList.innerHTML = "";
  if (!reports.length) {
    els.reportList.innerHTML = `<div class="empty-state">No delayed reports yet.</div>`;
    return;
  }

  reports.slice(-12).reverse().forEach((report) => {
    const item = document.createElement("div");
    item.className = "report-item";
    item.style.borderLeftColor = report.color;
    item.innerHTML = `<strong>${report.time} | ${report.title}</strong><span>${report.text}</span>`;
    els.reportList.appendChild(item);
  });
}

function issueProduct() {
  if (!state.selection) return;
  const product = getProduct();
  const options = getProductOptionValues();
  const duration = getDurationSteps(product, options);
  const issuedAt = state.currentIndex;
  const verification = verifyProduct(product, state.selection, issuedAt, duration, options);
  const area = cloneArea(state.selection);
  const issued = {
    number: state.serial,
    productId: product.id,
    start: issuedAt,
    end: Math.min(MAX_TIME_INDEX, issuedAt + duration),
    rect: areaBounds(area),
    area,
    options,
    verification,
    text: product.group === "warning" ? generateWarnGenText(product, area, issuedAt, Math.min(MAX_TIME_INDEX, issuedAt + duration), options, verification, state.serial) : "",
  };

  state.serial += 1;
  state.products.push(issued);
  state.stats.issued += 1;
  state.stats.skillPoints += verification.score;
  if (verification.hit) state.stats.hits += 1;
  else state.stats.falseAlarms += 1;
  state.stats.polygonSkill = rollingMetric(state.stats.polygonSkill, verification.polygon, state.stats.issued);
  state.stats.leadSkill = rollingMetric(state.stats.leadSkill, verification.lead, state.stats.issued);
  state.stats.hazardSkill = rollingMetric(state.stats.hazardSkill, verification.hazard, state.stats.issued);

  renderAll();
}

function getProductOptionValues() {
  const values = Object.fromEntries(
    [...els.productOptions.querySelectorAll("select")].map((select) => [select.id, select.value]),
  );
  state.areaMode = values.areaShape || state.areaMode;
  return values;
}

function getDurationSteps(product, options) {
  if (product.group === "watch") {
    return Math.round((Number(options.watchDuration || 6) * 60) / STEP_MINUTES);
  }
  if (product.group === "warning") {
    return Math.round(Number(options.warningDuration || 60) / STEP_MINUTES);
  }
  if (product.group === "advisory") {
    return Math.round(Number(options.statementDuration || 45) / STEP_MINUTES);
  }
  if (product.group === "discussion") {
    return product.duration;
  }
  return product.duration;
}

function verifyProduct(product, area, start, duration, options) {
  const scenario = getCase();
  const end = Math.min(MAX_TIME_INDEX, start + duration);
  let best = null;
  let expectedHazards = 0;

  for (let t = start; t <= end; t += 1) {
    const hazards = truthHazards(scenario, t).filter((hazard) => product.hazards.includes(hazard.kind));
    expectedHazards += hazards.length;
    hazards.forEach((hazard) => {
      const overlap = areaHazardOverlap(area, hazard);
      const centerCovered = pointInArea(hazard.x, hazard.y, area) ? 1 : 0;
      const spatial = Math.max(overlap, centerCovered * 0.72);
      if (spatial <= 0.04) return;
      const leadSteps = Math.max(0, t - start);
      const leadScore = product.group === "warning"
        ? clamp(100 - Math.abs(leadSteps - 2) * 16, 35, 100)
        : product.group === "watch"
          ? clamp(58 + leadSteps * 2.4, 40, 100)
          : clamp(66 + leadSteps * 1.2, 45, 100);
      const severityFit = severityFitness(product, hazard, options);
      const hazardFit = hazardFitness(product, hazard, options);
      const raw = spatial * 0.46 + (leadScore / 100) * 0.24 + severityFit * 0.18 + hazardFit * 0.12;
      const score = Math.round(raw * 100);
      if (!best || score > best.score) {
        best = {
          hazard,
          t,
          score,
          spatial,
          leadScore,
          severityFit,
          hazardFit,
        };
      }
    });
  }

  if (!best) {
    const penalty = product.group === "warning" ? -38 : product.group === "watch" ? -26 : -18;
    return {
      hit: false,
      score: penalty,
      polygon: 0,
      lead: 0,
      hazard: expectedHazards ? 20 : 0,
      summary: expectedHazards ? "area missed the primary hazard corridor" : "no matching severe hazard in the valid window",
    };
  }

  const overWarning = product.severe && best.hazard.severity < 0.74 ? 14 : 0;
  const tinyPolygon = areaSize(area) < 0.01 ? 8 : 0;
  const score = Math.round(best.score - overWarning - tinyPolygon);
  const delta = Math.max(8, score - 45);
  return {
    hit: score >= 44,
    score: delta,
    polygon: Math.round(best.spatial * 100),
    lead: Math.round(best.leadScore),
    hazard: Math.round(best.hazardFit * 100),
    summary: `${hazardLabel(best.hazard.kind)} match at ${formatTime(scenario, best.t)} | severity ${Math.round(best.hazard.severity * 100)}%`,
  };
}

function severityFitness(product, hazard, options) {
  let severeIntent = product.severe;
  if (options.impactTag === "destructive" || options.impactTag === "catastrophic" || options.watchTag === "pds") {
    severeIntent = true;
  }
  if (product.group === "discussion") {
    const target = mesoIntensityTarget(hazard.kind, options);
    return 1 - Math.min(0.42, Math.abs(target - hazard.severity));
  }
  if (product.group === "watch") {
    const target = clamp(watchThreatProbability(hazard.kind, options, product) * 0.92 + (options.watchTag === "pds" ? 0.08 : 0), 0.28, 0.98);
    let score = 1 - Math.min(0.5, Math.abs(target - hazard.severity));
    if (options.watchTag === "pds" && hazard.severity < 0.82) score -= 0.18;
    return clamp(score, 0.18, 1);
  }
  if (product.group === "warning" || product.group === "advisory") {
    const target = severityTargetForOptions(hazard.kind, options);
    let score = 1 - Math.min(0.58, Math.abs(target - hazard.severity));
    if (options.warningBasis === "observed" && hazard.severity < 0.56) score -= 0.12;
    if (options.warningBasis === "spotter" && hazard.severity < 0.66) score -= 0.16;
    if (options.warningBasis === "emergency" && hazard.severity < 0.9) score -= 0.28;
    return clamp(score, 0.18, 1);
  }
  if (severeIntent && hazard.severity >= 0.76) return 1;
  if (severeIntent && hazard.severity < 0.62) return 0.42;
  if (!severeIntent && hazard.severity >= 0.9) return 0.72;
  return 0.86 + hazard.severity * 0.14;
}

function hazardFitness(product, hazard, options) {
  if (product.group === "outlook") {
    const risk = { MRGL: 0.48, SLGT: 0.6, ENH: 0.74, MDT: 0.86, HIGH: 0.96 }[options.riskLevel || "ENH"];
    return 1 - Math.min(0.55, Math.abs(risk - hazard.severity));
  }
  if (product.group === "discussion") {
    return product.hazards.includes(hazard.kind) ? 1 : 0.1;
  }
  if (product.group === "watch") {
    return 1 - Math.min(0.48, Math.abs(watchThreatProbability(hazard.kind, options, product) - hazard.severity));
  }
  if (product.id === "special-weather") {
    return hazard.severity < 0.62 ? 0.92 : 0.48;
  }
  return product.hazards.includes(hazard.kind) ? 1 : 0.1;
}

function severityTargetForOptions(kind, options) {
  if (kind === "tornado") {
    const threat = { spinup: 0.52, tight: 0.68, strong: 0.84, violent: 0.97 }[options.torThreat || "tight"];
    const confidence = clamp((Number(options.torConfidence || 80) - 40) / 220, 0, 0.18);
    return clamp(threat + confidence, 0.38, 0.98);
  }
  if (kind === "wind") {
    return clamp((Number(options.windThreat || 70) - 35) / 60, 0.18, 0.98);
  }
  if (kind === "hail") {
    return clamp((Number(options.hailThreat || 1.75) - 0.5) / 3.2, 0.22, 0.98);
  }
  if (kind === "flood") {
    const training = { isolated: 0, scattered: 0.06, repeating: 0.12, anchored: 0.18 }[options.trainingMode || "scattered"];
    return clamp((Number(options.rainRate || 2) - 0.5) / 5 + training, 0.24, 0.98);
  }
  return 0.7;
}

function productIntensitySummary(product, options) {
  if (product.group === "watch") {
    return ` | TOR ${Math.round(watchThreatProbability("tornado", options, product) * 100)}% | WIND ${Math.round(watchThreatProbability("wind", options, product) * 100)}% | HAIL ${Math.round(watchThreatProbability("hail", options, product) * 100)}%`;
  }
  if (product.group === "discussion") {
    return ` | TOR ${mesoIntensityLabel("tornado", options)} | WIND ${mesoIntensityLabel("wind", options)} | HAIL ${mesoIntensityLabel("hail", options)} | FLOOD ${mesoIntensityLabel("flood", options)}`;
  }
  const parts = [];
  if (product.hazards.includes("tornado") && options.torThreat) {
    const torLabel = {
      spinup: "spinup",
      tight: "tight couplet",
      strong: "strong tornado",
      violent: "violent tornado",
    }[options.torThreat] || options.torThreat;
    parts.push(`TOR ${options.torConfidence || "80"}% ${torLabel}`);
  }
  if (product.hazards.includes("wind") && options.windThreat) {
    parts.push(`wind ${options.windThreat} mph`);
  }
  if (product.hazards.includes("hail") && options.hailThreat) {
    parts.push(`hail ${options.hailThreat} in`);
  }
  if (product.hazards.includes("flood") && options.rainRate) {
    const training = {
      isolated: "isolated cells",
      scattered: "scattered repeats",
      repeating: "repeating cores",
      anchored: "anchored band",
    }[options.trainingMode || "scattered"];
    parts.push(`rain ${options.rainRate} in/hr ${training}`);
  }
  return parts.length ? ` | ${parts.join(" | ")}` : "";
}

function generateWarnGenText(product, area, startIndex, endIndex, options, verification, eventNumber) {
  const scenario = getCase();
  const office = officeForScenario(scenario);
  const issue = warningDateParts(scenario, startIndex);
  const expire = warningDateParts(scenario, endIndex);
  const bounds = areaBounds(area);
  const center = { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 };
  const primary = primaryHazardForArea(product, area, startIndex) || nearestHazard(product, center, startIndex);
  const storm = nearestStormToPoint(center, startIndex);
  const motion = stormMotionSummary(storm);
  const nearestCity = nearestCityToPoint(scenario, primary || center);
  const counties = warningCountyLines(scenario, area);
  const latLon = area.points.map((point) => normalizedToLatLon(scenario, point)).map(([lat, lon]) => `${Math.round(lat * 100).toString().padStart(4, "0")} ${Math.abs(Math.round(lon * 100)).toString().padStart(4, "0")}`).join(" ");
  const threat = warningThreatBlock(product, options, verification, primary);
  const impacts = projectedCityImpacts(scenario, area, motion, startIndex).join(". ");
  const productCode = { "tornado-warning": "TOR", "pds-tornado-warning": "TOR", "severe-warning": "SVR", "destructive-severe-warning": "SVR", "flash-flood-warning": "FFW" }[product.id] || "SVR";
  const wmo = productCode === "TOR" ? "WFUS53" : productCode === "SVR" ? "WUUS53" : "WGUS53";
  const vtecHazard = productCode === "TOR" ? "TO" : productCode === "SVR" ? "SV" : "FF";
  const warningName = productCode === "TOR" ? "TORNADO WARNING" : productCode === "SVR" ? "SEVERE THUNDERSTORM WARNING" : "FLASH FLOOD WARNING";
  const ugc = counties.map((county) => county.code).join("-") + `-${expire.ddhhmm}-`;
  const vtec = `/O.NEW.${office.id}.${vtecHazard}.W.${String(eventNumber).padStart(4, "0")}.${issue.vtec}-${expire.vtec}/`;
  const sourceLine = productCode === "TOR" && threat.tornadoTag === "OBSERVED"
    ? "A CONFIRMED TORNADO"
    : productCode === "TOR"
      ? "A SEVERE THUNDERSTORM CAPABLE OF PRODUCING A TORNADO"
      : productCode === "FFW"
        ? "THUNDERSTORMS PRODUCING HEAVY RAIN"
        : "A SEVERE THUNDERSTORM";
  return [
    `${wmo} ${office.id} ${issue.ddhhmm}`,
    `${productCode}${office.id.slice(1)}`,
    "",
    "BULLETIN - EAS ACTIVATION REQUESTED",
    warningName,
    `NATIONAL WEATHER SERVICE ${office.name} ${office.state}`,
    issue.local,
    "",
    ugc,
    vtec,
    "",
    `THE NATIONAL WEATHER SERVICE IN ${office.name} HAS ISSUED A`,
    `${warningName} FOR...`,
    ...counties.map((county) => `* ${county.label}...`),
    "",
    `* UNTIL ${expire.shortLocal}.`,
    "",
    `* AT ${issue.shortLocal}, ${sourceLine} WAS LOCATED NEAR ${nearestCity.name.toUpperCase()}, MOVING ${motion.word} AT ${motion.speedKt} KNOTS.`,
    "",
    `  HAZARD...${threat.hazard}.`,
    `  SOURCE...${threat.source}.`,
    `  IMPACT...${threat.impact}.`,
    "",
    "LOCATIONS IMPACTED INCLUDE...",
    `${impacts || nearestCity.name.toUpperCase()}.`,
    "",
    "PRECAUTIONARY/PREPAREDNESS ACTIONS...",
    preparednessText(productCode),
    "",
    "&&",
    "",
    `LAT...LON ${latLon}`,
    `TIME...MOT...LOC ${issue.hhmmz} ${motion.fromDeg}DEG ${motion.speedKt}KT ${Math.round(normalizedToLatLon(scenario, center)[0] * 100).toString().padStart(4, "0")} ${Math.abs(Math.round(normalizedToLatLon(scenario, center)[1] * 100)).toString().padStart(4, "0")}`,
    ...threat.tags,
  ].join("\n");
}

function officeForScenario(scenario) {
  if (scenario.id === "southern-plains") return { id: "KOUN", name: "NORMAN", state: "OK" };
  if (scenario.id === "dixie-qlcs") return { id: "KBMX", name: "BIRMINGHAM", state: "AL" };
  if (scenario.id === "high-plains-mcs") return { id: "KOAX", name: "OMAHA", state: "NE" };
  if (scenario.id === "great-lakes-hail") return { id: "KGRR", name: "GRAND RAPIDS", state: "MI" };
  if (scenario.id === "monsoon-flash") return { id: "KFGZ", name: "FLAGSTAFF", state: "AZ" };
  return { id: "KPAH", name: "PADUCAH", state: "KY" };
}

function warningDateParts(scenario, index) {
  const date = new Date(new Date(scenario.start).getTime() + index * STEP_MINUTES * 60000);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return {
    ddhhmm: `${dd}${hh}${mm}`,
    hhmmz: `${hh}${mm}Z`,
    vtec: `${String(date.getUTCFullYear()).slice(2)}${String(date.getUTCMonth() + 1).padStart(2, "0")}${dd}T${hh}${mm}Z`,
    shortLocal: `${hh}${mm}Z`,
    local: `${hh}${mm}Z ${date.toUTCString().slice(0, 16).toUpperCase()}`,
  };
}

function primaryHazardForArea(product, area, startIndex) {
  const scenario = getCase();
  let best = null;
  for (let t = startIndex; t <= Math.min(MAX_TIME_INDEX, startIndex + 12); t += 1) {
    truthHazards(scenario, t)
      .filter((hazard) => product.hazards.includes(hazard.kind))
      .forEach((hazard) => {
        const overlap = areaHazardOverlap(area, hazard);
        if (!best || overlap * hazard.severity > best.score) {
          best = { ...hazard, score: overlap * hazard.severity };
        }
      });
  }
  return best;
}

function nearestHazard(product, point, startIndex) {
  const hazards = truthHazards(getCase(), startIndex).filter((hazard) => product.hazards.includes(hazard.kind));
  return hazards.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0] || null;
}

function nearestStormToPoint(point, timeIndex) {
  const scenario = getCase();
  return scenario.storms
    .map((storm) => ({ storm, pos: stormPosition(storm, timeIndex, null) }))
    .sort((a, b) => Math.hypot(a.pos.x - point.x, a.pos.y - point.y) - Math.hypot(b.pos.x - point.x, b.pos.y - point.y))[0]?.storm || scenario.storms[0];
}

function stormMotionSummary(storm) {
  if (!storm) return { fromDeg: "245", speedKt: 35, word: "NORTHEAST", dx: 0.018, dy: -0.012 };
  const dx = storm.vx;
  const dy = storm.vy;
  const toward = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  const from = (toward + 180) % 360;
  const speedKt = Math.round(clamp(Math.hypot(dx, dy) * 1850, 25, 75));
  return { fromDeg: String(Math.round(from)).padStart(3, "0"), speedKt, word: compassWord(toward), dx, dy };
}

function compassWord(degrees) {
  return ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"][Math.floor((degrees + 22.5) / 45) % 8];
}

function scenarioGeoBounds(scenario) {
  const bounds = {
    "southern-plains": [33.8, 38.6, -101.2, -94.0],
    "dixie-qlcs": [31.4, 36.2, -91.6, -84.0],
    "high-plains-mcs": [38.0, 42.8, -99.8, -91.2],
    "national-outbreak": [25.0, 49.0, -124.0, -67.0],
    "great-lakes-hail": [40.5, 45.6, -90.2, -82.0],
    "mid-atlantic-wind": [36.0, 41.5, -82.0, -73.0],
    "monsoon-flash": [33.0, 37.5, -114.5, -108.5],
  };
  return bounds[scenario.id] || [35.5, 39.5, -91.0, -86.5];
}

function normalizedToLatLon(scenario, point) {
  const [south, north, west, east] = scenarioGeoBounds(scenario);
  return [north - point.y * (north - south), west + point.x * (east - west)];
}

function warningCountyLines(scenario, area) {
  const center = areaBounds(area);
  const candidates = scenario.cities
    .map((city, index) => {
      const covered = pointInArea(city.x, city.y, area);
      const distance = Math.hypot(city.x - (center.x1 + center.x2) / 2, city.y - (center.y1 + center.y2) / 2);
      const state = nearestMapLabel(scenario, city);
      return {
        code: `${state}C${String(100 + index).padStart(3, "0")}`,
        label: `${covered ? "" : "PORTIONS OF "}${city.name.toUpperCase()} COUNTY IN ${stateName(state)}`,
        distance,
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  return candidates.length ? candidates : [{ code: "KYC145", label: "THE WARNED AREA" }];
}

function nearestMapLabel(scenario, city) {
  return scenario.mapLabels
    .slice()
    .sort((a, b) => Math.hypot(a.x - city.x, a.y - city.y) - Math.hypot(b.x - city.x, b.y - city.y))[0]?.text || "KY";
}

function stateName(abbrev) {
  return {
    AL: "CENTRAL ALABAMA",
    AR: "WESTERN ARKANSAS",
    AZ: "NORTHERN ARIZONA",
    GA: "WESTERN GEORGIA",
    IA: "WESTERN IOWA",
    IL: "SOUTHERN ILLINOIS",
    IN: "INDIANA",
    KS: "SOUTHERN KANSAS",
    KY: "WESTERN KENTUCKY",
    MI: "LOWER MICHIGAN",
    MO: "NORTHERN MISSOURI",
    MS: "NORTHERN MISSISSIPPI",
    NE: "EASTERN NEBRASKA",
    OK: "CENTRAL OKLAHOMA",
    PA: "WESTERN PENNSYLVANIA",
    TN: "WESTERN TENNESSEE",
    TX: "NORTH TEXAS",
    VA: "VIRGINIA",
    WV: "WEST VIRGINIA",
  }[abbrev] || abbrev;
}

function nearestCityToPoint(scenario, point) {
  return scenario.cities
    .slice()
    .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0] || { name: "THE STORM" };
}

function projectedCityImpacts(scenario, area, motion, startIndex) {
  const impacts = [];
  for (let lead = 0; lead <= 60; lead += 5) {
    const shifted = areaFromPoints(area.type || "polygon", area.points.map((point) => ({
      x: clamp(point.x + motion.dx * (lead / STEP_MINUTES) * 0.34, 0, 1),
      y: clamp(point.y + motion.dy * (lead / STEP_MINUTES) * 0.34, 0, 1),
    })));
    scenario.cities.forEach((city) => {
      const label = `${city.name.toUpperCase()} AROUND ${formatTime(scenario, startIndex + Math.round(lead / STEP_MINUTES))}`;
      if (pointInArea(city.x, city.y, shifted) && !impacts.includes(label)) impacts.push(label);
    });
  }
  return impacts.slice(0, 10);
}

function warningThreatBlock(product, options, verification, hazard) {
  const severity = hazard?.severity || 0.62;
  const windMph = product.hazards.includes("wind") ? Number(options.windThreat || (product.severe ? 80 : 70)) : Math.round(60 + severity * 35);
  const hailIn = product.hazards.includes("hail") ? Number(options.hailThreat || (product.severe ? 2.5 : 1.75)) : (0.75 + severity * 2.2);
  const torObserved = options.warningBasis === "observed" || options.warningBasis === "spotter" || options.warningBasis === "emergency" || severity > 0.84;
  if (product.hazards.includes("tornado")) {
    const destructive = options.impactTag === "catastrophic" || options.torThreat === "violent" || torObserved;
    return {
      tornadoTag: torObserved ? "OBSERVED" : "RADAR INDICATED",
      hazard: destructive ? `DAMAGING TORNADO AND ${hailIn.toFixed(2)} INCH HAIL` : "TORNADO",
      source: torObserved ? "RADAR CONFIRMED TORNADO DEBRIS SIGNATURE" : "RADAR INDICATED ROTATION",
      impact: destructive ? "FLYING DEBRIS WILL BE DANGEROUS TO THOSE CAUGHT WITHOUT SHELTER" : "MOBILE HOMES MAY BE DAMAGED OR DESTROYED",
      tags: [`TORNADO...${torObserved ? "OBSERVED" : "RADAR INDICATED"}`, `MAX HAIL SIZE...${hailIn.toFixed(2)} IN`],
    };
  }
  if (product.hazards.includes("wind") || product.hazards.includes("hail")) {
    return {
      tornadoTag: "NONE",
      hazard: `${windMph} MPH WIND GUSTS AND ${hailIn.toFixed(2)} INCH HAIL`,
      source: "RADAR INDICATED",
      impact: windMph >= 80 ? "EXPECT CONSIDERABLE TREE DAMAGE AND DAMAGE TO ROOFS" : "HAIL DAMAGE TO VEHICLES IS EXPECTED AND WIND DAMAGE TO TREES IS LIKELY",
      tags: [`WIND...${windMph}MPH`, `HAIL...${hailIn.toFixed(2)}IN`],
    };
  }
  return {
    tornadoTag: "NONE",
    hazard: `FLASH FLOODING FROM RAIN RATES NEAR ${options.rainRate || "2.0"} INCHES PER HOUR`,
    source: "RADAR INDICATED",
    impact: "LOW WATER CROSSINGS MAY BECOME IMPASSABLE",
    tags: ["FLASH FLOOD...RADAR INDICATED"],
  };
}

function preparednessText(productCode) {
  if (productCode === "TOR") return "TAKE COVER NOW! MOVE TO A BASEMENT OR AN INTERIOR ROOM ON THE LOWEST FLOOR OF A STURDY BUILDING.";
  if (productCode === "FFW") return "TURN AROUND, DO NOT DROWN WHEN ENCOUNTERING FLOODED ROADS.";
  return "FOR YOUR PROTECTION MOVE TO AN INTERIOR ROOM ON THE LOWEST FLOOR OF A BUILDING.";
}

function timelineMaxForLayer(layer = state.layer) {
  return layer === "model" ? MAX_TIME_INDEX : state.currentIndex;
}

function syncTimelineToLayer() {
  const max = timelineMaxForLayer();
  if (state.timeIndex > max) {
    state.timeIndex = max;
  }
  state.followCurrent = state.layer !== "model" && state.timeIndex === state.currentIndex;
}

function timelineStatus() {
  if (state.layer === "model") {
    const delta = state.timeIndex - state.currentIndex;
    if (delta > 0) return `CAM forecast ${delta * STEP_MINUTES} min ahead of current scan`;
    if (delta < 0) return `CAM valid ${Math.abs(delta) * STEP_MINUTES} min before current scan`;
    return "CAM valid at current scan";
  }
  const age = (state.currentIndex - state.timeIndex) * STEP_MINUTES;
  if (state.layer === "reports") {
    return age > 0 ? `Reports through ${age} min ago` : "Reports through current delayed LSR window";
  }
  return age > 0 ? `Viewing ${age} min of history` : "Current scan";
}

function setTime(next, options = {}) {
  const clamped = clamp(Math.round(next), 0, timelineMaxForLayer());
  state.timeIndex = clamped;
  state.followCurrent = state.layer !== "model" && state.timeIndex === state.currentIndex;
  if (options.fromUser && state.timeIndex < state.currentIndex) {
    state.followCurrent = false;
  }
  renderAll();
}

function stepForward() {
  if (state.layer !== "model" && state.timeIndex >= state.currentIndex && state.currentIndex < MAX_TIME_INDEX) {
    advanceRealtime(1, { forceView: true });
    return;
  }
  setTime(state.timeIndex + 1);
}

function togglePlay() {
  if (state.playTimer) {
    stopPlay();
    return;
  }
  els.playBtn.textContent = "Pause";
  state.playTimer = window.setInterval(() => {
    advanceRealtime(1);
  }, REALTIME_STEP_MS);
}

function stopPlay() {
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
  els.playBtn.textContent = "Play";
}

function advanceRealtime(steps = 1, options = {}) {
  const previousCurrent = state.currentIndex;
  state.currentIndex = clamp(state.currentIndex + steps, 0, MAX_TIME_INDEX);
  for (let t = previousCurrent + 1; t <= state.currentIndex; t += 1) {
    checkMisses(t);
  }
  if (options.forceView || (state.followCurrent && state.layer !== "model")) {
    state.timeIndex = state.currentIndex;
  } else if (state.layer !== "model" && state.timeIndex > state.currentIndex) {
    state.timeIndex = state.currentIndex;
  }
  state.followCurrent = state.layer !== "model" && state.timeIndex === state.currentIndex;
  if (state.currentIndex === MAX_TIME_INDEX) stopPlay();
  renderAll();
}

function checkMisses(timeIndex = state.currentIndex) {
  const hazards = truthHazards(getCase(), timeIndex).filter((hazard) => hazard.severity >= 0.66);
  hazards.forEach((hazard) => {
    if (hazard.kind === "flood" && hazard.severity < 0.78) return;
    const missKey = `${hazard.id}-${Math.floor(timeIndex / 6)}`;
    if (state.missed.has(missKey)) return;
    const covered = state.products.some((product) => {
      const catalog = getProduct(product.productId);
      if (catalog.group !== "warning") return false;
      if (product.start > timeIndex || product.end < timeIndex) return false;
      if (!catalog.hazards.includes(hazard.kind)) return false;
      const area = product.area || rectToArea(product.rect);
      return pointInArea(hazard.x, hazard.y, area) || areaHazardOverlap(area, hazard) > 0.16;
    });
    if (!covered) {
      state.missed.add(missKey);
      state.stats.misses += 1;
      state.stats.skillPoints -= 32;
    }
  });
}

function startSelection(event) {
  const point = canvasPoint(event);
  state.areaMode = getAreaMode();
  state.drawing = { start: point, current: point, mode: state.areaMode };
  state.selection = selectionFromDrag(point, point, state.areaMode);
  els.weatherCanvas.setPointerCapture(event.pointerId);
  renderMap();
}

function updatePointer(event) {
  const point = canvasPoint(event);
  if (state.layer === "reports") {
    const reports = getReports(state.timeIndex, { includeMeta: true });
    const nearby = reports.filter((report) => Math.hypot(report.x - point.x, report.y - point.y) < 0.045).length;
    els.cursorReadout.textContent = `${Math.round(point.x * 100)}, ${Math.round(point.y * 100)} | ${nearby} nearby reports`;
  } else {
    const value = sampleField(getCase(), state.timeIndex, point.x, point.y, state.layer === "model" ? "radar" : state.layer, state.layer === "model" ? getModel() : null, state.activeTilt);
    els.cursorReadout.textContent = `${Math.round(point.x * 100)}, ${Math.round(point.y * 100)} | ${formatValue(state.layer, value)}`;
  }
  if (!state.drawing) return;
  state.drawing.current = point;
  state.selection = selectionFromDrag(state.drawing.start, point, state.drawing.mode);
  renderMap();
  renderMetrics();
}

function endSelection(event) {
  if (!state.drawing) return;
  const point = canvasPoint(event);
  state.selection = selectionFromDrag(state.drawing.start, point, state.drawing.mode);
  if (areaSize(state.selection) < 0.0025) {
    const size = getProduct().group === "warning" ? 0.08 : 0.18;
    state.selection = selectionFromRect(normalizeRect(point.x - size, point.y - size * 0.65, point.x + size, point.y + size * 0.65), state.drawing.mode, state.drawing.start, point);
  }
  state.drawing = null;
  renderAll();
}

function canvasPoint(event) {
  const rect = els.weatherCanvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function pruneCache(map, maxSize) {
  while (map.size > maxSize) {
    map.delete(map.keys().next().value);
  }
}

function stormInfluenceRadius(storm) {
  switch (storm.mode) {
    case "supercell":
      return 0.46;
    case "bow":
      return Math.max(0.42, (storm.length || 0.7) * 0.7 + 0.18);
    case "line":
      return Math.max(0.38, (storm.length || 0.62) * 0.66 + 0.16);
    case "cluster":
      return Math.max(0.28, (storm.length || 0.46) * 0.52 + 0.12);
    default:
      return 0.22;
  }
}

function getStormFrame(scenario, timeIndex, model = null) {
  const t = clamp(timeIndex + (model ? model.bias.initiation : 0), 0, MAX_TIME_INDEX);
  const key = `${scenario.runId || scenario.id}:${model ? model.id : "obs"}:${t}`;
  let frame = renderCache.frames.get(key);
  if (frame) return frame;
  const env = getEnvironment();
  const storms = scenario.storms
    .map((storm) => {
      const dynamics = stormDynamics(storm, t, model);
      if (dynamics.intensity < 0.08 && dynamics.cumulusField < 0.08 && dynamics.remnant < 0.06) return null;
      return {
        storm,
        pos: stormPosition(storm, t, model),
        dynamics,
        cos: Math.cos(storm.angle),
        sin: Math.sin(storm.angle),
        influenceRadius: stormInfluenceRadius(storm),
      };
    })
    .filter(Boolean);
  frame = { scenario, env, model, t, storms };
  renderCache.frames.set(key, frame);
  pruneCache(renderCache.frames, MAX_FRAME_CACHE);
  return frame;
}

function stormLocalCoordsForFrame(stormData, x, y) {
  const dx = x - stormData.pos.x;
  const dy = y - stormData.pos.y;
  return {
    rx: dx * stormData.cos + dy * stormData.sin,
    ry: -dx * stormData.sin + dy * stormData.cos,
  };
}

function sampleField(scenario, timeIndex, x, y, layer, model = null, tiltDeg = state.activeTilt || 0.5) {
  if (layer === "reports") return 0;
  if (layer === "qpf") return accumulatedPrecipitationField(scenario, timeIndex, x, y, model);
  const frame = getStormFrame(scenario, timeIndex, model);
  const { env, t } = frame;
  const tilt = tiltSamplingContext(scenario, x, y, tiltDeg);
  const gateNoise = (hashNoise(Math.floor(x * 150), Math.floor(y * 150), Math.floor(t), env.seed % 997) - 0.5) * 2;
  const broadNoise = (smoothNoise(x * 9 + t * 0.05, y * 9 - t * 0.03, env.seed % 337) - 0.5) * 2;
  if (layer === "spectrum") {
    return spectralWidthField(frame, x, y, tilt, gateNoise, broadNoise);
  }
  let value = layer === "satellite" ? environmentalCloudField(scenario, x, y, t, env) : 0;

  if (layer === "velocity") {
    value = ambientVelocity(scenario, x, y, t) + groundScatterVelocity(scenario, x, y, t, gateNoise);
  }
  if (layer === "radar" && !model) {
    value = groundScatterReflectivity(scenario, x, y, t, gateNoise, broadNoise);
  }

  frame.storms.forEach((stormData) => {
    const { storm, pos, dynamics, influenceRadius } = stormData;
    if (Math.abs(x - pos.x) > influenceRadius || Math.abs(y - pos.y) > influenceRadius) return;
    const local = stormLocalCoordsForFrame(stormData, x, y);
    const context = {
      scenario,
      model,
      env,
      t,
      x,
      y,
      pos,
      stormData,
      tilt,
      gateNoise,
      broadNoise,
    };
    let next = 0;
    switch (storm.mode) {
      case "supercell":
        next = supercellField(storm, local, dynamics, layer, context);
        break;
      case "bow":
        next = bowField(storm, local, dynamics, layer, context);
        break;
      case "cluster":
        next = clusterField(storm, local, dynamics, layer, context);
        break;
      case "pulse":
        next = pulseField(storm, local, dynamics, layer, context);
        break;
      default:
        next = lineField(storm, local, dynamics, layer, context);
        break;
    }
    value = combineField(value, next, layer);
  });

  if (model) {
    value = combineField(value, modelFalseConvectionField(scenario, t, x, y, layer, model, gateNoise), layer);
  }

  if (layer === "radar" && !model) {
    const range = Math.hypot(x - scenario.radarSite.x, y - scenario.radarSite.y);
    const rangeLoss = 1 - smoothStep(0.82, 0.34, range) * 0.22;
    const speckle = Math.max(0, gateNoise) * clamp(value / 44, 0, 1) * 2.4;
    value = value * rangeLoss + speckle + Math.max(0, broadNoise) * 0.8;
  }
  if (layer === "velocity") {
    value += gateNoise * 1.2 + broadNoise * 1.6;
    value *= KNOTS_TO_MPH;
  }
  if (layer === "satellite") {
    value += 4.5 * smoothNoise(x * 4 + t * 0.06, y * 4 - t * 0.02, scenario.id.length);
  }
  return capLayerValue(layer, value);
}

function accumulatedPrecipitationField(scenario, timeIndex, x, y, model = null) {
  let total = 0;
  const step = 3;
  for (let t = 0; t <= timeIndex; t += step) {
    scenario.storms.forEach((storm) => {
      const dynamics = stormDynamics(storm, t, model);
      if (dynamics.precip < 0.05 && dynamics.stratiform < 0.05) return;
      const pos = stormPosition(storm, t, model);
      const local = stormLocalCoords(storm, pos, x, y);
      let footprint;
      if (storm.mode === "supercell") {
        footprint = gaussian(local.rx - 0.018, local.ry, 0.09, 0.07);
      } else if (storm.mode === "bow") {
        const curve = 0.08 * Math.cos((local.ry / (storm.length || 0.7)) * Math.PI);
        footprint = gaussian(local.rx + 0.06 - curve, local.ry, 0.17, (storm.length || 0.7) * 0.7);
      } else if (storm.mode === "line") {
        footprint = gaussian(local.rx + 0.075, local.ry, 0.16, (storm.length || 0.62) * 0.72);
      } else if (storm.mode === "cluster") {
        footprint = gaussian(local.rx + 0.025, local.ry, 0.14, (storm.length || 0.46) * 0.72);
      } else {
        footprint = gaussian(local.rx + 0.018, local.ry, 0.07, 0.07);
      }
      total += (dynamics.precip * 0.7 + dynamics.stratiform * 0.52) * dynamics.flood * footprint * (STEP_MINUTES * step / 60) * 1.55;
    });
  }
  return capLayerValue("qpf", total);
}

function supercellField(storm, local, dynamics, layer, context) {
  const shearStretch = clamp(context.env.shear / 55, 0.82, 1.34);
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed, storm.angle);
  const tower = gaussian(local.rx - 0.008, local.ry + 0.002, 0.028, 0.022);
  const core = gaussian(local.rx - 0.012, local.ry + 0.004, 0.036, 0.026);
  const hailCore = gaussian(local.rx - 0.006, local.ry - 0.006, 0.024, 0.018);
  const forwardFlank = gaussian(local.rx + 0.044, local.ry - 0.018, 0.118 * shearStretch, 0.046);
  const rearFlank = gaussian(local.rx - 0.04, local.ry + 0.036, 0.056, 0.035);
  const hookBase = gaussian(local.rx - 0.056, local.ry + 0.03, 0.028, 0.019);
  const hookTail = gaussian(local.rx - 0.071, local.ry + 0.041, 0.018, 0.03);
  const hookRadius = Math.hypot(local.rx + 0.053, local.ry - 0.024);
  const hookAngle = Math.atan2(local.ry - 0.024, local.rx + 0.053);
  const wrappingRain = gaussian(hookRadius, 0, 0.018, 1) * smoothStep(-2.72, 0.78, hookAngle) * (1 - smoothStep(1.2, 0.7, hookAngle));
  const hook = (hookBase + hookTail * 0.82 + wrappingRain * 0.92) * (0.5 + dynamics.rotation * 0.44);
  const inflowNotch = gaussian(local.rx - 0.025, local.ry + 0.015, 0.048, 0.02);
  const weakEcho = gaussian(local.rx + 0.004, local.ry + 0.003, 0.027, 0.021);
  const outflowArc = gaussian(local.rx + 0.072, local.ry + 0.005, 0.018, 0.1) * dynamics.outflow;
  const anvil = gaussian(local.rx + 0.118, local.ry - 0.08, 0.22, 0.112);
  const remnantShield = gaussian(local.rx + 0.154, local.ry - 0.05, 0.28, 0.14);
  const textureGain = 0.72 + texture * 0.62;
  const low = context.tilt.low;
  const mid = context.tilt.mid;
  const upper = context.tilt.upper;

  if (layer === "radar") {
    const growthEcho = 14 * dynamics.cumulusField * tower * textureGain;
    const precip = 42 * dynamics.precip * forwardFlank + 44 * dynamics.updraft * core * textureGain + 15 * dynamics.stratiform * rearFlank;
    const bwerVault = gaussian(local.rx + 0.002, local.ry + 0.006, 0.031, 0.024);
    const overhang = hailCore * (9 * mid + 15 * upper) * dynamics.hail;
    const structure = precip + 16 * dynamics.hail * hailCore + 23 * hook * (0.7 + low * 0.42) + 10 * outflowArc + 8 * dynamics.remnant * remnantShield + overhang;
    const voids = 20 * dynamics.inflow * inflowNotch + 9 * weakEcho * dynamics.mesoCycle + bwerVault * 19 * low;
    return Math.max(0, growthEcho + structure - voids + Math.max(0, context.gateNoise) * 2.2);
  }
  if (layer === "velocity") {
    return supercellVelocity(storm, local, dynamics, context);
  }
  if (layer === "hail") {
    return dynamics.hail * (2.2 * hailCore * (0.72 + mid * 0.35) + 0.92 * core + 0.42 * forwardFlank);
  }
  if (layer === "rotation") {
    const meso = gaussian(local.rx - 0.043, local.ry + 0.026, 0.024, 0.019);
    const occlusion = gaussian(local.rx - 0.058, local.ry + 0.042, 0.018, 0.015);
    const tvs = gaussian(local.rx - 0.047, local.ry + 0.031, 0.01, 0.008);
    return dynamics.rotation * (1.18 * meso * (0.55 + mid * 0.52) + 0.7 * occlusion * (0.65 + low * 0.42) + tvs * low * 1.15 + 0.08 * tower * dynamics.updraft);
  }
  if (layer === "qpf") {
    return dynamics.flood * (2.12 * forwardFlank + 1.06 * core + 0.94 * rearFlank + 0.7 * outflowArc);
  }
  if (layer === "satellite") {
    const cu = 16 * dynamics.cumulusField * tower * (0.72 + texture * 0.28);
    const ice = dynamics.anvil * (48 * anvil * (0.74 + upper * 0.38) + 26 * forwardFlank + 20 * core + 18 * remnantShield);
    return cu + ice;
  }
  return 0;
}

function lineField(storm, local, dynamics, layer, context) {
  const length = storm.length || 0.62;
  const along = Math.abs(local.ry) / length;
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed + 17, storm.angle, 1.34, 0.88);
  const segmentWave = (texture - 0.5) * 0.04 + Math.sin((local.ry * 28 + storm.seed + context.t * 0.45) * 1.1) * 0.012;
  const lineMask = 1 - smoothStep(0.56, 0.08, along);
  const leading = gaussian(local.rx - segmentWave, 0, 0.024, 1) * lineMask;
  const coldPoolShelf = gaussian(local.rx - 0.036 - segmentWave, local.ry * 0.28, 0.052, length * 0.76);
  const stratiform = gaussian(local.rx + 0.088, local.ry, 0.17, length * 0.78);
  const inflowLane = gaussian(local.rx - 0.07, local.ry * 0.58, 0.052, length * 0.62);
  const cells = clamp(Math.sin(local.ry * 58 + storm.seed + context.t * 0.4) * 0.5 + 0.5, 0, 1) * leading;
  const wakeNotches = clamp(Math.cos(local.ry * 42 + storm.seed) * 0.5 + 0.5, 0, 1) * gaussian(local.rx + 0.01, 0, 0.021, 1) * lineMask;

  if (layer === "radar") {
    const growthEcho = 11 * dynamics.cumulusField * coldPoolShelf * (0.52 + texture * 0.48);
    const reflectivity = 38 * dynamics.precip * leading + 14 * dynamics.precip * cells + 20 * dynamics.stratiform * stratiform + 14 * dynamics.outflow * coldPoolShelf - 10 * wakeNotches - 7 * dynamics.inflow * inflowLane;
    return Math.max(0, reflectivity + growthEcho + Math.max(0, context.gateNoise) * 2);
  }
  if (layer === "velocity") {
    return lineVelocity(storm, local, dynamics, context, leading, segmentWave);
  }
  if (layer === "hail") {
    return dynamics.hail * (0.96 * leading + 0.74 * cells);
  }
  if (layer === "rotation") {
    const [packetA, packetB] = lineRotationCenters(storm, context.t, length);
    const mesoA = gaussian(local.rx - segmentWave, local.ry - packetA, 0.024, 0.055);
    const mesoB = gaussian(local.rx - segmentWave, local.ry - packetB, 0.024, 0.07);
    return dynamics.rotation * (mesoA * 0.98 + mesoB * 0.72);
  }
  if (layer === "qpf") {
    return dynamics.flood * (1.92 * stratiform + 1.34 * leading + 0.96 * coldPoolShelf);
  }
  if (layer === "satellite") {
    return 15 * dynamics.cumulusField * coldPoolShelf + dynamics.anvil * (42 * stratiform + 22 * leading);
  }
  return 0;
}

function bowField(storm, local, dynamics, layer, context) {
  const length = storm.length || 0.7;
  const bowing = smoothStep(0.32, 0.28, dynamics.phase);
  const bowCurve = 0.08 * bowing * Math.cos((local.ry / length) * Math.PI);
  const distance = local.rx - bowCurve;
  const lineMask = 1 - smoothStep(0.58, 0.08, Math.abs(local.ry) / length);
  const leading = gaussian(distance, 0, 0.03, 1) * lineMask;
  const rear = gaussian(local.rx + 0.086, local.ry, 0.15, length * 0.78);
  const apex = gaussian(local.rx - 0.038, local.ry, 0.052, 0.18);
  const rearInflowNotch = gaussian(local.rx + 0.03, local.ry, 0.052, 0.12);
  const bookendNorth = gaussian(local.rx - 0.045, local.ry - length * 0.38, 0.036, 0.06);
  const bookendSouth = gaussian(local.rx - 0.045, local.ry + length * 0.38, 0.036, 0.06);
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed + 43, storm.angle, 1.3, 0.82);

  if (layer === "radar") {
    const growthEcho = 10 * dynamics.cumulusField * leading * (0.48 + texture * 0.52);
    const reflectivity = 40 * dynamics.precip * leading + 22 * dynamics.stratiform * rear + 20 * apex * bowing + 13 * dynamics.outflow * (bookendNorth + bookendSouth) - 15 * rearInflowNotch;
    return Math.max(0, reflectivity + growthEcho + Math.max(0, context.gateNoise) * 1.8);
  }
  if (layer === "velocity") {
    return bowVelocity(storm, local, dynamics, context, leading, apex, bookendNorth, bookendSouth);
  }
  if (layer === "hail") {
    return dynamics.hail * (1.18 * leading + 0.74 * apex);
  }
  if (layer === "rotation") {
    return dynamics.rotation * (bookendNorth * 0.94 + bookendSouth * 0.94 + apex * 0.14) * 0.72;
  }
  if (layer === "qpf") {
    return dynamics.flood * (2.04 * rear + 1.46 * leading + 0.76 * apex);
  }
  if (layer === "satellite") {
    return 14 * dynamics.cumulusField * leading + dynamics.anvil * (48 * rear + 18 * leading + 14 * apex);
  }
  return 0;
}

function pulseField(storm, local, dynamics, layer, context) {
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed + 67, storm.angle, 1.22, 1.18);
  const tower = gaussian(local.rx, local.ry, 0.028, 0.024);
  const precipCore = gaussian(local.rx + 0.01, local.ry - 0.002, 0.036, 0.028);
  const outflowRing = gaussian(local.rx + 0.04, local.ry, 0.02, 0.095);
  const shadow = gaussian(local.rx + 0.062, local.ry, 0.042, 0.08);

  if (layer === "radar") {
    const cu = 15 * dynamics.cumulusField * tower * (0.7 + texture * 0.3);
    const core = 34 * dynamics.precip * precipCore + 11 * dynamics.outflow * outflowRing - 8 * shadow;
    return Math.max(0, cu + core + Math.max(0, context.gateNoise) * 1.4);
  }
  if (layer === "velocity") {
    return pulseVelocity(storm, local, dynamics, context, tower, outflowRing);
  }
  if (layer === "hail") {
    return dynamics.hail * (1.02 * tower + 0.84 * precipCore);
  }
  if (layer === "rotation") {
    return dynamics.rotation * tower * 0.38;
  }
  if (layer === "qpf") {
    return dynamics.flood * (1.18 * precipCore + 0.72 * outflowRing);
  }
  if (layer === "satellite") {
    return 18 * dynamics.cumulusField * tower + dynamics.anvil * (18 * precipCore + 10 * outflowRing);
  }
  return 0;
}

function clusterField(storm, local, dynamics, layer, context) {
  const length = storm.length || 0.46;
  const focusIndex = clusterFocusIndex(storm, context.t);
  let radar = 0;
  let velocity = 0;
  let hail = 0;
  let rotation = 0;
  let qpf = 0;
  let satellite = 0;

  for (let i = 0; i < 4; i += 1) {
    const frac = (i / 3 - 0.5) * length;
    const wave = Math.sin(context.t * 0.22 + i * 1.5 + storm.seed) * 0.024;
    const subX = frac * 0.35 + wave;
    const subY = frac;
    const subRx = local.rx - subX;
    const subRy = local.ry - subY;
    const cell = gaussian(subRx, subRy, 0.03, 0.024);
    const rain = gaussian(subRx + 0.016, subRy, 0.046, 0.03);
    const anvil = gaussian(subRx + 0.05, subRy - 0.008, 0.09, 0.05);
    const gust = gaussian(subRx + 0.038, subRy, 0.02, 0.08);
    const texture = stormFlowTexture(subRx, subRy, context.t, storm.seed + i * 13, storm.angle, 1.16, 1.04);

    radar += 13 * dynamics.cumulusField * cell * (0.7 + texture * 0.3);
    radar += 24 * dynamics.precip * rain + 9 * dynamics.outflow * gust;
    velocity += clusterVelocity(storm, { rx: subRx, ry: subRy }, dynamics, context, cell, gust);
    hail += dynamics.hail * (0.42 * cell + 0.3 * rain);
    rotation += dynamics.rotation * cell * (i === focusIndex ? 0.54 : 0.12);
    qpf += dynamics.flood * (0.62 * rain + 0.42 * anvil);
    satellite += 13 * dynamics.cumulusField * cell + dynamics.anvil * (12 * rain + 12 * anvil);
  }

  const trailingStratiform = gaussian(local.rx + 0.09, local.ry, 0.16, length * 0.82);
  const leadingMerge = gaussian(local.rx - 0.012, local.ry, 0.055, length * 0.72);
  radar += 19 * dynamics.precip * leadingMerge + 12 * dynamics.stratiform * trailingStratiform;
  qpf += dynamics.flood * (1.1 * trailingStratiform + 0.68 * leadingMerge);
  satellite += dynamics.anvil * (22 * trailingStratiform + 10 * leadingMerge);

  if (layer === "radar") return Math.max(0, radar);
  if (layer === "velocity") return velocity;
  if (layer === "hail") return hail;
  if (layer === "rotation") return rotation;
  if (layer === "qpf") return qpf;
  if (layer === "satellite") return satellite;
  return 0;
}

function supercellVelocity(storm, local, dynamics, context) {
  const mesoCenter = { x: -0.04, y: 0.026 };
  const dx = local.rx - mesoCenter.x;
  const dy = local.ry - mesoCenter.y;
  const r = Math.max(0.006, Math.hypot(dx, dy));
  const mesoEnvelope = gaussian(dx, dy, 0.027, 0.022);
  const tvsEnvelope = gaussian(dx + 0.006, dy - 0.004, 0.011, 0.009) * context.tilt.low;
  const tangentSpeed = dynamics.rotation * (mesoEnvelope * (56 + context.tilt.mid * 38 + dynamics.mature * 18) + tvsEnvelope * 62);
  const tangent = velocityFromLocalWind(storm, context, -dy / r * tangentSpeed, dx / r * tangentSpeed);
  const rearFlank = gaussian(local.rx - 0.035, local.ry + 0.036, 0.08, 0.04);
  const gustFront = gaussian(local.rx + 0.048, local.ry + 0.01, 0.018, 0.12);
  const secondaryFront = gaussian(local.rx + 0.074, local.ry - 0.01, 0.014, 0.16);
  const inflow = gaussian(local.rx - 0.08, local.ry + 0.015, 0.08, 0.045);
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed + 71, storm.angle);
  const rearFlankWind = velocityFromLocalWind(storm, context, -42 * rearFlank * dynamics.outflow, 18 * rearFlank);
  const gustWind = velocityFromLocalWind(storm, context, (48 * gustFront + 24 * secondaryFront) * dynamics.outflow * (0.65 + context.tilt.low * 0.45), -8 * gustFront);
  const inflowWind = velocityFromLocalWind(storm, context, 34 * inflow * dynamics.inflow, -18 * inflow);
  const turbulent = velocityFromLocalWind(storm, context, 0, (texture - 0.5) * dynamics.turbulence * 10);
  return tangent + rearFlankWind + gustWind + inflowWind + turbulent;
}

function lineVelocity(storm, local, dynamics, context, leading, segmentWave) {
  const gustFront = gaussian(local.rx - segmentWave - 0.012, 0, 0.014, 1) * clamp(leading * 1.5, 0, 1);
  const gust = velocityFromLocalWind(storm, context, 42 * leading * dynamics.outflow + 26 * gustFront * dynamics.outflow, 6 * leading);
  const rearInflow = gaussian(local.rx + 0.055, local.ry, 0.08, (storm.length || 0.62) * 0.72);
  const rearJet = velocityFromLocalWind(storm, context, -34 * rearInflow * dynamics.wind, 0);
  const [packetA, packetB] = lineRotationCenters(storm, context.t, storm.length || 0.62);
  const vortexA = velocityFromLocalWind(storm, context, 0, gaussian(local.rx - segmentWave, local.ry - packetA, 0.022, 0.06) * dynamics.rotation * 46);
  const vortexB = velocityFromLocalWind(storm, context, 0, gaussian(local.rx - segmentWave, local.ry - packetB, 0.022, 0.075) * dynamics.rotation * -34);
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed + 79, storm.angle);
  const turbulent = velocityFromLocalWind(storm, context, 0, (texture - 0.5) * dynamics.turbulence * 8);
  return gust + rearJet + vortexA + vortexB + turbulent;
}

function bowVelocity(storm, local, dynamics, context, leading, apex, bookendNorth, bookendSouth) {
  const surgeFront = gaussian(local.rx - 0.014, local.ry, 0.015, (storm.length || 0.7) * 0.82);
  const bowOutflow = velocityFromLocalWind(storm, context, 56 * leading * dynamics.outflow + 22 * surgeFront * dynamics.outflow, local.ry * 14 * leading);
  const apexJet = velocityFromLocalWind(storm, context, 58 * apex * dynamics.wind, 0);
  const bookendSpin = velocityFromLocalWind(storm, context, 0, (bookendNorth - bookendSouth) * dynamics.rotation * 72);
  const rearInflow = gaussian(local.rx + 0.05, local.ry, 0.09, (storm.length || 0.7) * 0.54);
  const rearJet = velocityFromLocalWind(storm, context, -44 * rearInflow * dynamics.wind, 0);
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed + 83, storm.angle);
  const turbulent = velocityFromLocalWind(storm, context, 0, (texture - 0.5) * dynamics.turbulence * 9);
  return bowOutflow + apexJet + bookendSpin + rearJet + turbulent;
}

function pulseVelocity(storm, local, dynamics, context, tower, outflowRing) {
  const updraft = velocityFromLocalWind(storm, context, 0, tower * dynamics.rotation * 16);
  const gust = velocityFromLocalWind(storm, context, 40 * outflowRing * dynamics.outflow, 0);
  const texture = stormFlowTexture(local.rx, local.ry, context.t, storm.seed + 97, storm.angle);
  const turbulent = velocityFromLocalWind(storm, context, 0, (texture - 0.5) * dynamics.turbulence * 10);
  return updraft + gust + turbulent;
}

function clusterVelocity(storm, local, dynamics, context, cell, gust) {
  const convergence = velocityFromLocalWind(storm, context, 18 * cell * dynamics.inflow, -10 * cell);
  const outflow = velocityFromLocalWind(storm, context, 28 * gust * dynamics.outflow, 0);
  return convergence + outflow;
}

function velocityFromLocalWind(storm, context, localX, localY) {
  const cos = context.stormData ? context.stormData.cos : Math.cos(storm.angle);
  const sin = context.stormData ? context.stormData.sin : Math.sin(storm.angle);
  const worldX = localX * cos - localY * sin;
  const worldY = localX * sin + localY * cos;
  return radialVelocity(context.scenario.radarSite, context.x, context.y, worldX, worldY);
}

function ambientVelocity(scenario, x, y, timeIndex) {
  const env = getEnvironment();
  const angle = -0.68 + env.drylineSurge * 5 + Math.sin(timeIndex * 0.05 + env.seed) * 0.08;
  const speed = 18 + env.stormRelativeFlow * 0.42 + (y - 0.5) * 12;
  const shear = (1 - y) * env.shear * 0.32;
  const windX = Math.cos(angle) * speed + shear;
  const windY = Math.sin(angle) * speed - env.lowLevelJet * 0.12;
  return radialVelocity(scenario.radarSite, x, y, windX, windY);
}

function groundScatterVelocity(scenario, x, y, timeIndex, gateNoise) {
  const env = getEnvironment();
  const range = Math.hypot(x - scenario.radarSite.x, y - scenario.radarSite.y);
  const nearRadar = 1 - smoothStep(0.24, 0.22, range);
  const drylineFineLine = gaussian(x - (0.18 + timeIndex * 0.003 + env.drylineSurge), y - 0.62, 0.018, 0.5);
  const clutter = (nearRadar * env.terrainScatter + drylineFineLine * 0.72) * gateNoise * 6.4;
  return clutter;
}

function groundScatterReflectivity(scenario, x, y, timeIndex, gateNoise, broadNoise) {
  const env = getEnvironment();
  const dx = x - scenario.radarSite.x;
  const dy = y - scenario.radarSite.y;
  const range = Math.hypot(dx, dy);
  const azimuth = Math.atan2(dy, dx);
  const nearRadar = 1 - smoothStep(0.22, 0.24, range);
  const drylineFineLine = gaussian(x - (0.18 + timeIndex * 0.003 + env.drylineSurge), y - 0.62, 0.015, 0.48);
  const convergenceBand = gaussian(x - (0.28 + Math.sin(timeIndex * 0.03) * 0.05), y - 0.44, 0.018, 0.34);
  const spokeTexture = clamp(Math.cos(azimuth * 18 + timeIndex * 0.1) * 0.5 + 0.5, 0, 1);
  const clutter = nearRadar * env.terrainScatter * (8 + spokeTexture * 7 + Math.max(0, gateNoise) * 10);
  const boundary = drylineFineLine * clamp(0.34 + env.boundaryFocus * 0.46 + Math.max(0, broadNoise) * 0.18, 0, 1.2) * 18;
  return clutter + boundary + convergenceBand * env.moistureQuality * 6;
}

function radialVelocity(site, x, y, windX, windY) {
  const dx = x - site.x;
  const dy = y - site.y;
  const range = Math.max(0.01, Math.hypot(dx, dy));
  return (windX * dx + windY * dy) / range;
}

function environmentalCloudField(scenario, x, y, timeIndex, env) {
  const boundaryX = 0.18 + timeIndex * 0.003 + env.drylineSurge;
  const primaryBoundary = gaussian(x - boundaryX, y - 0.58, 0.065, 0.44);
  const secondaryBoundary = gaussian(x - boundaryX - 0.05, y - 0.54, 0.088, 0.34) * env.cloudMerge;
  const cumulusTexture = Math.max(0, stormFlowTexture(x - boundaryX, y - 0.58, timeIndex * 0.35, env.seed + 401, -0.52, 2.2, 0.72) - 0.38);
  const terrainCu = Math.max(0, smoothNoise(x * 18 - 2, y * 18 + 5, env.seed % 271) - 0.64) * env.terrainScatter * 0.44;
  const cirrus = Math.max(0, smoothNoise(x * 5 + timeIndex * 0.02, y * 5 - timeIndex * 0.01, env.seed % 977) - 0.72) * (7 + env.cloudLayerDepth * 2);
  const mergedDeck = (primaryBoundary * 0.7 + secondaryBoundary * 0.4) * clamp(0.44 + cumulusTexture * 0.84, 0, 1.42);
  const lowClouds = mergedDeck * clamp(0.34 + env.cloudLayerDepth * 0.5 + env.boundaryFocus * 0.16 - env.capStrength * 0.16, 0.18, 1.12);
  return lowClouds * 30 + terrainCu * 14 + cirrus;
}

function stormFlowTexture(x, y, timeIndex, seed, angle, stretchX = 1, stretchY = 1) {
  const p1 = rotatePoint((x + timeIndex * 0.0018) * 38 * stretchX, (y - timeIndex * 0.0012) * 46 * stretchY, angle);
  const p2 = rotatePoint((x - timeIndex * 0.0026) * 24 * stretchX, (y + timeIndex * 0.0018) * 28 * stretchY, -angle * 0.62);
  const p3 = rotatePoint((x + timeIndex * 0.001) * 60 * stretchX, (y + timeIndex * 0.0014) * 18 * stretchY, angle * 0.35);
  const n1 = smoothNoise(p1.x + seed * 0.0011, p1.y - seed * 0.0017, seed % 991);
  const n2 = smoothNoise(p2.x - seed * 0.0019, p2.y + seed * 0.0013, seed % 673);
  const n3 = smoothNoise(p3.x + seed * 0.0009, p3.y - seed * 0.0011, seed % 503);
  return clamp(n1 * 0.56 + n2 * 0.29 + n3 * 0.15, 0, 1);
}

function modelFalseConvectionField(scenario, timeIndex, x, y, layer, model, gateNoise) {
  if (!model.bias.falseStorms || layer === "velocity") return 0;
  let value = layer === "satellite" ? 0 : 0;
  for (let i = 0; i < 3; i += 1) {
    const seed = model.id.length * 101 + i * 37 + scenario.id.length;
    const start = 12 + Math.round(hashNoise(seed, i, 2, 3) * 28) + model.bias.initiation;
    const life = smoothStep(start, 8, timeIndex) * (1 - smoothStep(start + 22, 10, timeIndex));
    if (life <= 0) continue;
    const cx = 0.12 + hashNoise(seed, 4, 5, 6) * 0.76 + Math.sin(timeIndex * 0.04 + seed) * model.bias.placementNoise;
    const cy = 0.14 + hashNoise(seed, 7, 8, 9) * 0.72 + Math.cos(timeIndex * 0.035 + seed) * model.bias.placementNoise;
    const core = gaussian(x - cx, y - cy, 0.035 + model.bias.spread * 0.012, 0.028 + model.bias.spread * 0.01);
    const strength = model.bias.falseStorms * life * (0.7 + Math.max(0, gateNoise) * 0.25);
    if (layer === "radar") value = Math.max(value, strength * core * 54);
    if (layer === "rotation") value = Math.max(value, strength * core * 0.34 * (model.bias.rotation || 1));
    if (layer === "hail") value = Math.max(value, strength * core * 1.2 * (model.bias.hail || 1));
    if (layer === "qpf") value = Math.max(value, strength * core * 1.5 * (model.bias.qpf || 1));
    if (layer === "satellite") value = Math.max(value, strength * core * 34);
  }
  return value;
}

function combineField(current, next, layer) {
  if (layer === "velocity") {
    return Math.abs(next) > Math.abs(current) ? next : current;
  }
  if (layer === "satellite") {
    return Math.min(92, current + next * (current > 14 ? 0.72 : 1));
  }
  return Math.max(current, next);
}

function colorForLayer(layer, value) {
  if (layer === "radar") {
    const custom = customColorForLayer("radar", value);
    if (custom) return custom;
    if (value < 5) return [0, 0, 0, 0];
    for (let i = 0; i < NEXRAD_REFLECTIVITY_COLORS.length - 1; i += 1) {
      const [threshold, color] = NEXRAD_REFLECTIVITY_COLORS[i];
      const [nextThreshold, nextColor] = NEXRAD_REFLECTIVITY_COLORS[i + 1];
      if (value <= nextThreshold) {
        return interpColor(color, nextColor, clamp((value - threshold) / Math.max(1, nextThreshold - threshold), 0, 1));
      }
    }
    return NEXRAD_REFLECTIVITY_COLORS[NEXRAD_REFLECTIVITY_COLORS.length - 1][1];
  }
  if (layer === "velocity") {
    const custom = customColorForLayer("velocity", value);
    if (custom) return custom;
    const clamped = clamp(value, -130, 130);
    if (Math.abs(clamped) < 5) return [0, 0, 0, 0];
    if (clamped < 0) {
      if (clamped > -32) return interpColor([36, 53, 30, 145], [17, 147, 76, 220], Math.abs(clamped) / 32);
      return interpColor([17, 147, 76, 220], [145, 255, 157, 248], clamp((Math.abs(clamped) - 32) / 98, 0, 1));
    }
    if (clamped < 32) return interpColor([58, 39, 30, 145], [210, 106, 76, 220], clamped / 32);
    return interpColor([210, 106, 76, 220], [198, 29, 43, 248], clamp((clamped - 32) / 98, 0, 1));
  }
  if (layer === "hail") {
    if (value < 0.35) return [0, 0, 0, 0];
    if (value < 1.0) return interpColor([83, 196, 111, 105], [244, 208, 63, 200], (value - 0.35) / 0.65);
    if (value < 1.9) return interpColor([244, 208, 63, 215], [243, 107, 53, 240], (value - 1.0) / 0.9);
    return interpColor([243, 107, 53, 245], [226, 93, 164, 255], clamp((value - 1.9) / 1.1, 0, 1));
  }
  if (layer === "spectrum") {
    if (value < 1.2) return [0, 0, 0, 0];
    if (value < 4) return interpColor([45, 124, 170, 105], [93, 179, 115, 190], value / 4);
    if (value < 8) return interpColor([93, 179, 115, 195], [244, 208, 63, 225], (value - 4) / 4);
    if (value < 12) return interpColor([244, 208, 63, 230], [243, 107, 53, 245], (value - 8) / 4);
    return interpColor([243, 107, 53, 248], [246, 240, 255, 255], clamp((value - 12) / 6, 0, 1));
  }
  if (layer === "rotation") {
    if (value < 0.08) return [0, 0, 0, 0];
    if (value < 0.22) return interpColor([13, 79, 212, 110], [36, 184, 255, 190], (value - 0.08) / 0.14);
    if (value < 0.42) return interpColor([36, 184, 255, 195], [255, 228, 91, 225], (value - 0.22) / 0.2);
    if (value < 0.62) return interpColor([255, 228, 91, 225], [255, 123, 50, 245], (value - 0.42) / 0.2);
    return interpColor([255, 123, 50, 245], [255, 248, 240, 255], clamp((value - 0.62) / 0.36, 0, 1));
  }
  if (layer === "qpf") {
    if (value < 0.25) return [0, 0, 0, 0];
    if (value < 1.4) return interpColor([35, 78, 168, 110], [70, 198, 215, 210], (value - 0.25) / 1.15);
    if (value < 3.2) return interpColor([70, 198, 215, 210], [83, 196, 111, 235], (value - 1.4) / 1.8);
    return interpColor([83, 196, 111, 245], [244, 183, 64, 255], clamp((value - 3.2) / 2.4, 0, 1));
  }
  if (layer === "satellite") {
    if (value < 7) return [0, 0, 0, 0];
    if (value < 20) return interpColor([6, 12, 24, 28], [18, 48, 122, 146], (value - 7) / 13);
    if (value < 36) return interpColor([18, 48, 122, 152], [34, 145, 96, 186], (value - 20) / 16);
    if (value < 54) return interpColor([34, 145, 96, 192], [214, 216, 78, 226], (value - 36) / 18);
    if (value < 74) return interpColor([214, 216, 78, 230], [235, 136, 42, 245], (value - 54) / 20);
    return interpColor([235, 136, 42, 248], [249, 251, 255, 255], clamp((value - 74) / 18, 0, 1));
  }
  return [0, 0, 0, 0];
}

function truthHazards(scenario, timeIndex) {
  const cacheKey = `${scenario.runId || scenario.id}:${timeIndex}`;
  const cached = renderCache.hazards.get(cacheKey);
  if (cached) return cached;
  const hazards = [];
  const frame = getStormFrame(scenario, timeIndex, null);
  frame.storms.forEach(({ storm, pos, dynamics }) => {
    const intensity = dynamics.intensity;
    if (!insideMap(pos.x, pos.y) || (intensity < 0.26 && dynamics.cumulusField < 0.18)) return;

    if (storm.mode === "supercell") {
      const torPhase = Math.sin(timeIndex * 0.62 + storm.seed * 0.37);
      if (dynamics.rotation > 0.44 && dynamics.mature > 0.3 && torPhase > -0.16) {
        const anchor = rotatePoint(-0.046 - dynamics.mesoCycle * 0.008, 0.024 + dynamics.mesoCycle * 0.01, storm.angle);
        hazards.push({
          id: `${storm.id}-tor`,
          kind: "tornado",
          x: clamp(pos.x + anchor.x, 0, 1),
          y: clamp(pos.y + anchor.y, 0, 1),
          w: 0.04,
          h: 0.025,
          angle: storm.angle,
          severity: clamp(dynamics.rotation * (0.72 + torPhase * 0.24), 0, 1),
        });
      }
      if (dynamics.hail > 0.46 && (dynamics.developing > 0.24 || dynamics.mature > 0.14)) {
        hazards.push({
          id: `${storm.id}-hail`,
          kind: "hail",
          x: clamp(pos.x + 0.012, 0, 1),
          y: clamp(pos.y - 0.006, 0, 1),
          w: 0.07,
          h: 0.045,
          angle: storm.angle,
          severity: clamp(dynamics.hail, 0, 1),
        });
      }
      if (dynamics.wind > 0.56 && dynamics.outflow > 0.42) {
        hazards.push({
          id: `${storm.id}-wind`,
          kind: "wind",
          x: clamp(pos.x + 0.044, 0, 1),
          y: clamp(pos.y - 0.01, 0, 1),
          w: 0.075,
          h: 0.05,
          angle: storm.angle,
          severity: clamp(0.42 + dynamics.wind * 0.5, 0, 1),
        });
      }
      if (dynamics.flood > 0.42 && (dynamics.dissipating > 0.22 || timeIndex > 24)) {
        hazards.push({
          id: `${storm.id}-flood`,
          kind: "flood",
          x: clamp(pos.x - 0.015, 0, 1),
          y: clamp(pos.y + 0.04, 0, 1),
          w: 0.09,
          h: 0.075,
          angle: storm.angle,
          severity: clamp(dynamics.flood * 1.12, 0, 1),
        });
      }
    } else if (storm.mode === "pulse") {
      if (dynamics.hail > 0.48 && dynamics.mature > 0.2) {
        hazards.push({
          id: `${storm.id}-hail`,
          kind: "hail",
          x: clamp(pos.x + 0.006, 0, 1),
          y: clamp(pos.y - 0.004, 0, 1),
          w: 0.055,
          h: 0.04,
          angle: storm.angle,
          severity: clamp(dynamics.hail * 0.94, 0, 1),
        });
      }
      if (dynamics.wind > 0.54 && dynamics.outflow > 0.52) {
        hazards.push({
          id: `${storm.id}-wind`,
          kind: "wind",
          x: clamp(pos.x + 0.036, 0, 1),
          y: clamp(pos.y, 0, 1),
          w: 0.065,
          h: 0.04,
          angle: storm.angle,
          severity: clamp(dynamics.wind * 0.92, 0, 1),
        });
      }
      if (dynamics.flood > 0.56 && dynamics.dissipating > 0.18) {
        hazards.push({
          id: `${storm.id}-flood`,
          kind: "flood",
          x: clamp(pos.x + 0.01, 0, 1),
          y: clamp(pos.y + 0.02, 0, 1),
          w: 0.07,
          h: 0.055,
          angle: storm.angle,
          severity: clamp(dynamics.flood * 0.88, 0, 1),
        });
      }
    } else if (storm.mode === "cluster") {
      const cells = 4;
      for (let i = 0; i < cells; i += 1) {
        const frac = (i / (cells - 1) - 0.5) * (storm.length || 0.44);
        const x = clamp(pos.x + frac * 0.32 + Math.sin(timeIndex * 0.18 + i + storm.seed) * 0.02, 0, 1);
        const y = clamp(pos.y + frac, 0, 1);
        const cellPulse = clamp(0.74 + Math.sin(timeIndex * 0.46 + i * 1.7 + storm.seed) * 0.22, 0.24, 1.08);
        if (dynamics.wind * cellPulse > 0.54) {
          hazards.push({
            id: `${storm.id}-wind-${i}`,
            kind: "wind",
            x,
            y,
            w: 0.062,
            h: 0.042,
            angle: storm.angle,
            severity: clamp(dynamics.wind * cellPulse * 0.92, 0, 1),
          });
        }
        if (dynamics.hail * cellPulse > 0.48) {
          hazards.push({
            id: `${storm.id}-hail-${i}`,
            kind: "hail",
            x: clamp(x + 0.006, 0, 1),
            y: clamp(y - 0.004, 0, 1),
            w: 0.055,
            h: 0.038,
            angle: storm.angle,
            severity: clamp(dynamics.hail * cellPulse * 0.84, 0, 1),
          });
        }
      }
      if (dynamics.rotation > 0.54 && dynamics.mature > 0.32) {
        const focusIndex = clusterFocusIndex(storm, timeIndex);
        const frac = (focusIndex / 3 - 0.5) * (storm.length || 0.46);
        const wave = Math.sin(timeIndex * 0.22 + focusIndex * 1.5 + storm.seed) * 0.024;
        const offset = rotatePoint(frac * 0.35 + wave, frac, storm.angle);
        hazards.push({
          id: `${storm.id}-tor`,
          kind: "tornado",
          x: clamp(pos.x + offset.x, 0, 1),
          y: clamp(pos.y + offset.y, 0, 1),
          w: 0.03,
          h: 0.022,
          angle: storm.angle,
          severity: clamp(dynamics.rotation * 0.76, 0, 1),
        });
      }
      if (dynamics.flood > 0.5 && dynamics.stratiform > 0.28) {
        hazards.push({
          id: `${storm.id}-flood`,
          kind: "flood",
          x: clamp(pos.x + 0.02, 0, 1),
          y: clamp(pos.y, 0, 1),
          w: 0.11,
          h: 0.08,
          angle: storm.angle,
          severity: clamp(dynamics.flood * 0.92, 0, 1),
        });
      }
    } else {
      const segments = storm.mode === "bow" ? 5 : 6;
      for (let i = 0; i < segments; i += 1) {
        const frac = (i / Math.max(1, segments - 1) - 0.5) * (storm.length || 0.68);
        const offset = rotatePoint(0, frac, storm.angle);
        const wave = Math.sin(timeIndex * 0.5 + i + storm.seed) * 0.02;
        const x = pos.x + offset.x + wave;
        const y = pos.y + offset.y;
        if (!insideMap(x, y)) continue;
        const segIntensity = intensity * (0.78 + 0.18 * Math.sin(i * 1.7 + timeIndex * 0.35));
        if (segIntensity > 0.5 && dynamics.outflow > 0.36) {
          hazards.push({
            id: `${storm.id}-wind-${i}`,
            kind: "wind",
            x,
            y,
            w: storm.mode === "bow" ? 0.09 : 0.07,
            h: 0.05,
            angle: storm.angle,
            severity: clamp(segIntensity * dynamics.wind * (storm.mode === "bow" ? 1.04 : 0.92), 0, 1),
          });
        }
        const torPulse = Math.sin(timeIndex * 0.85 + i * 1.9 + storm.seed);
        if (dynamics.rotation * segIntensity > 0.42 && dynamics.mature > 0.2 && torPulse > 0.42) {
          hazards.push({
            id: `${storm.id}-tor-${i}`,
            kind: "tornado",
            x: clamp(x - 0.018, 0, 1),
            y: clamp(y + 0.006, 0, 1),
            w: 0.032,
            h: 0.023,
            angle: storm.angle,
            severity: clamp(dynamics.rotation * segIntensity * 0.78, 0, 1),
          });
        }
      }
      if (dynamics.flood > 0.42 && (dynamics.stratiform > 0.28 || timeIndex > 18)) {
        hazards.push({
          id: `${storm.id}-flood`,
          kind: "flood",
          x: pos.x - 0.02,
          y: pos.y,
          w: 0.14,
          h: (storm.length || 0.66) * 0.42,
          angle: storm.angle,
          severity: clamp(dynamics.flood, 0, 1),
        });
      }
    }
  });
  const filtered = hazards.filter((hazard) => insideMap(hazard.x, hazard.y));
  renderCache.hazards.set(cacheKey, filtered);
  pruneCache(renderCache.hazards, MAX_HAZARD_CACHE);
  return filtered;
}

function getReports(timeIndex = state.timeIndex, options = {}) {
  const scenario = getCase();
  const latestObserved = Math.max(0, Math.min(timeIndex, state.currentIndex) - REPORT_DELAY_STEPS);
  const cacheKey = `${scenario.runId || scenario.id}:${latestObserved}`;
  const cached = renderCache.reports.get(cacheKey);
  if (cached) return cached;
  const reports = [];
  for (let t = 0; t <= latestObserved; t += 1) {
    truthHazards(scenario, t)
      .filter((hazard) => hazard.severity >= (hazard.kind === "wind" ? 0.52 : 0.68))
      .forEach((hazard) => {
        const keyNoise = hashNoise(Math.round(hazard.x * 100), Math.round(hazard.y * 100), t, hazard.kind.length);
        if (keyNoise < (hazard.kind === "wind" ? 0.2 : 0.45)) return;
        reports.push(reportForHazard(scenario, hazard, t, options));
      });
  }
  renderCache.reports.set(cacheKey, reports);
  pruneCache(renderCache.reports, MAX_REPORT_CACHE);
  return reports;
}

function reportForHazard(scenario, hazard, t, options = {}) {
  const nearest = scenario.cities
    .map((city) => ({
      city,
      dist: Math.hypot(city.x - hazard.x, city.y - hazard.y),
    }))
    .sort((a, b) => a.dist - b.dist)[0].city;
  const direction = bearingWord(hazard.x - nearest.x, hazard.y - nearest.y);
  const miles = Math.max(2, Math.round(Math.hypot(nearest.x - hazard.x, nearest.y - hazard.y) * 140));
  const time = formatTime(scenario, t + REPORT_DELAY_STEPS);
  const base = {
    time,
    x: hazard.x,
    y: hazard.y,
    kind: hazard.kind,
    observedIndex: t,
  };
  if (hazard.kind === "tornado") {
    const damageIntensity = tornadoDamageIntensity(hazard.severity);
    return {
      ...base,
      time,
      title: "Tornado report",
      text: `${miles} mi ${direction} of ${nearest.name}; ${damageIntensity}; confidence ${Math.round(hazard.severity * 100)}%.`,
      color: "#e33548",
      track: tornadoTrackForReport(hazard, t),
    };
  }
  if (hazard.kind === "hail") {
    const radarEstimate = clamp(0.5 + hazard.severity * 3.5, 0.5, 4);
    const variance = 0.65 + hashNoise(Math.round(hazard.x * 1000), Math.round(hazard.y * 1000), t, 35) * 0.7;
    const size = clamp(radarEstimate * variance, 0.5, 4).toFixed(2);
    return {
      ...base,
      time,
      title: `Radar-est. ${size} in hail`,
      text: `${miles} mi ${direction} of ${nearest.name}; radar hail estimate carries ±35% uncertainty.`,
      color: "#f4b740",
    };
  }
  if (hazard.kind === "wind") {
    const gust = Math.round(40 + hazard.severity * 80);
    return {
      ...base,
      time,
      title: `${gust >= 100 ? "100+" : gust} mph wind gust`,
      text: `${miles} mi ${direction} of ${nearest.name}; ${gust >= 80 ? "widespread" : "scattered"} tree and power damage.`,
      color: "#46c6d7",
    };
  }
  return {
    ...base,
    time,
    title: "Flash flooding",
    text: `${miles} mi ${direction} of ${nearest.name}; water over low crossings.`,
    color: "#53c46f",
  };
}

function tornadoTrackForReport(hazard, t) {
  const length = 0.035 + hazard.severity * 0.1;
  const heading = hazard.angle || -0.5;
  return Array.from({ length: 9 }, (_, index) => {
    const fraction = index / 8;
    const back = (1 - fraction) * length;
    const wobble = Math.sin((t + index) * 1.17) * 0.005 * (1 - fraction);
    return {
      x: clamp(hazard.x - Math.cos(heading) * back - Math.sin(heading) * wobble, 0, 1),
      y: clamp(hazard.y - Math.sin(heading) * back + Math.cos(heading) * wobble, 0, 1),
    };
  });
}

function stormPosition(storm, timeIndex, model = null) {
  const speed = model ? model.bias.speed : 1;
  const spread = model ? model.bias.spread : 1;
  const xBias = model ? model.bias.x : 0;
  const yBias = model ? model.bias.y : 0;
  const minuteScale = STEP_MINUTES / 15;
  const modelNoise = model ? model.bias.placementNoise || 0 : 0;
  const wobble = {
    x: Math.sin(timeIndex * 0.23 + storm.seed) * (0.008 * spread + modelNoise),
    y: Math.cos(timeIndex * 0.19 + storm.seed * 0.4) * (0.006 * spread + modelNoise * 0.76),
  };
  const vx = storm.mode === "supercell" ? Math.max(0.014, storm.vx) : storm.vx;
  const vy = storm.mode === "supercell" ? Math.min(-0.008, storm.vy) : storm.vy;
  return {
    x: storm.x + vx * timeIndex * minuteScale * speed + xBias + wobble.x,
    y: storm.y + vy * timeIndex * minuteScale * speed + yBias + wobble.y,
  };
}

function getModeProfile(mode) {
  return STORM_MODE_PROFILES[mode] || STORM_MODE_PROFILES.supercell;
}

function modeDisplayName(mode) {
  return {
    supercell: "Supercell",
    line: "Line",
    bow: "Bow echo",
    cluster: "Multicell cluster",
    pulse: "Pulse storm",
  }[mode] || mode;
}

function stormLifecycle(storm, timeIndex, env, model = null) {
  const profile = getModeProfile(storm.mode);
  const stormRandom = seededNoise(env.seed + storm.seed * 997, 21);
  const initiation = 3 + env.initiationOffset + Math.round((stormRandom - 0.5) * 8) + (model ? model.bias.initiation : 0);
  const sharedCumulusStart = env.initiationOffset - Math.round(4 + env.cloudLayerDepth * 2);
  const cumulusStart = sharedCumulusStart + Math.round((stormRandom - 0.5) * 4);
  const growth = storm.mode === "pulse"
    ? 3 + Math.round(seededNoise(env.seed + storm.seed, 22) * 2)
    : 7 + Math.round(seededNoise(env.seed + storm.seed, 22) * 7 * profile.growth);
  const precipStart = initiation + 3 + Math.round(profile.growth * 3);
  const matureStart = precipStart + 5 + Math.round(env.boundaryFocus * 4);
  const matureWindow = storm.mode === "pulse"
    ? 3 + Math.round(stormRandom * 3)
    : storm.mode === "supercell"
      ? 20 + Math.round(profile.mature * 8)
      : storm.mode === "bow"
        ? 9 + Math.round(profile.mature * 5)
        : 10 + Math.round(profile.mature * 7);
  const matureEnd = matureStart + matureWindow;
  const collapseStart = matureEnd + (storm.mode === "pulse" ? 1 : 4 + Math.round((1 - env.capStrength) * 6));
  const remnantEnd = collapseStart + 14 + Math.round(profile.decay * 8 + env.coldPool * 3);
  const cumulus = smoothStep(cumulusStart, 6, timeIndex) * (1 - smoothStep(matureStart, 8, timeIndex));
  const developing = smoothStep(initiation, growth, timeIndex) * (1 - smoothStep(matureEnd, 6, timeIndex));
  const mature = smoothStep(precipStart, 6, timeIndex) * (1 - smoothStep(collapseStart, 6, timeIndex));
  const dissipating = smoothStep(collapseStart, 6, timeIndex) * (1 - smoothStep(remnantEnd, 8, timeIndex));
  const remnant = smoothStep(collapseStart + 3, 8, timeIndex) * (1 - smoothStep(remnantEnd + 10, 10, timeIndex));
  const phases = { cumulus, developing, mature, dissipating, remnant };
  const phaseName = Object.entries(phases).sort((a, b) => b[1] - a[1])[0][0];
  return {
    initiation,
    cumulusStart,
    matureStart,
    collapseStart,
    remnantEnd,
    cumulus,
    developing,
    mature,
    dissipating,
    remnant,
    phase: clamp((timeIndex - initiation) / Math.max(1, remnantEnd - initiation), 0, 1),
    phaseName,
  };
}

function stormDynamics(storm, timeIndex, model = null) {
  const env = getEnvironment();
  const profile = getModeProfile(storm.mode);
  const modelIntensity = model ? model.bias.intensity : 1;
  const modelRotation = model ? model.bias.rotation || 1 : 1;
  const modelHail = model ? model.bias.hail || 1 : 1;
  const modelQpf = model ? model.bias.qpf || 1 : 1;
  const modelWind = model ? model.bias.wind || 1 : 1;
  const modelColdPool = model ? model.bias.coldPool || 1 : 1;
  const life = stormLifecycle(storm, timeIndex, env, model);
  const pulse = 0.88 + 0.16 * Math.sin(timeIndex * 0.23 * env.stormCycle + storm.seed * 0.7);
  const cellPulse = 0.92 + 0.14 * Math.sin(timeIndex * 0.42 * env.stormCycle + storm.seed * 0.19);
  const capPenalty = 1 - env.capStrength * 0.2 * (1 - life.developing);
  const organization = clamp(profile.organization * (0.74 + env.shear / 72 * 0.28 + env.boundaryFocus * 0.14), 0.42, 1.24);
  const base = storm.intensity * env.stormScale * env.severityScale * modelIntensity * capPenalty;
  const updraft = clamp(base * (0.18 * life.cumulus + 0.7 * life.developing + 0.8 * life.mature) * organization * pulse, 0, 1.42);
  const precip = clamp(base * (0.14 * life.cumulus + 0.5 * life.developing + 0.8 * life.mature + 0.62 * life.dissipating) * profile.precipEfficiency * cellPulse, 0, 1.34);
  const anvil = clamp((0.24 * life.cumulus + 0.7 * life.developing + 0.9 * life.mature + 0.84 * life.remnant) * profile.anvil * env.cloudLayerDepth * (0.78 + env.shear / 92), 0, 1.42);
  const stratiform = clamp((0.18 * life.developing + 0.56 * life.mature + 0.88 * life.dissipating + 0.72 * life.remnant) * profile.stratiform * precip, 0, 1.48);
  const outflow = clamp(env.coldPool * modelColdPool * profile.outflow * (0.12 * life.developing + 0.5 * life.mature + 0.88 * life.dissipating + 0.7 * life.remnant), 0.16, 1.56);
  const inflow = clamp((env.stormRelativeFlow / 45) * profile.inflow * (0.36 * life.cumulus + 0.78 * life.developing + 0.94 * life.mature + 0.28 * life.dissipating), 0.15, 1.8);
  const intensity = clamp(base * (0.16 * life.cumulus + 0.68 * life.developing + 0.88 * life.mature + 0.5 * life.dissipating) * pulse + profile.multicycle * stratiform * 0.06, 0, 1.08);
  const mesoCycle = clamp(0.5 + 0.5 * Math.sin(timeIndex * 0.36 + storm.seed * 0.31), 0, 1);
  const rotation = clamp(storm.rotation * env.mesoSupport * modelRotation * profile.tornadoBias * (0.24 * life.developing + 0.72 * life.mature + 0.48 * life.dissipating) * (0.76 + mesoCycle * 0.34) * organization, 0, 1.02);
  const hail = clamp(storm.hail * env.hailSupport * modelHail * profile.hailBias * (updraft * 0.74 + precip * 0.16) * (0.82 + mesoCycle * 0.14), 0, 1.16);
  const flood = clamp(storm.flood * env.floodSupport * modelQpf * profile.floodBias * (0.24 * life.developing + precip * 0.46 + stratiform * 0.32), 0, 1.52);
  const bowSurge = storm.mode === "bow" ? 0.82 + Math.exp(-0.5 * ((life.phase - 0.52) / 0.2) ** 2) * 0.52 : 1;
  const wind = clamp(env.windSupport * modelWind * profile.windBias * (0.22 * life.developing + outflow * 0.56 + intensity * 0.2) * bowSurge, 0, 1.34);
  const cumulusField = clamp(profile.cumulus * env.cloudLayerDepth * (0.58 * life.cumulus + 0.36 * life.developing + 0.18 * life.mature) * (0.78 + env.boundaryFocus * 0.2 + env.cloudMerge * 0.16), 0, 1.18);
  const turbulence = clamp(profile.turbulence * (0.22 * updraft + 0.18 * outflow + 0.12 * organization), 0, 1.18);

  return {
    intensity,
    rotation,
    hail,
    flood,
    coldPool: outflow,
    wind,
    inflow,
    mesoCycle,
    phase: life.phase,
    phaseName: life.phaseName,
    cumulus: life.cumulus,
    cumulusField,
    developing: life.developing,
    mature: life.mature,
    dissipating: life.dissipating,
    remnant: life.remnant,
    outflow,
    updraft,
    precip,
    anvil,
    stratiform,
    organization,
    turbulence,
  };
}

function stormIntensity(storm, timeIndex, model = null) {
  return stormDynamics(storm, timeIndex, model).intensity;
}

function stormLocalCoords(storm, pos, x, y) {
  const dx = x - pos.x;
  const dy = y - pos.y;
  const cos = Math.cos(-storm.angle);
  const sin = Math.sin(-storm.angle);
  return {
    rx: dx * cos - dy * sin,
    ry: dx * sin + dy * cos,
  };
}

function rectHazardOverlap(rect, hazard) {
  const hazardRect = {
    x1: clamp(hazard.x - hazard.w, 0, 1),
    y1: clamp(hazard.y - hazard.h, 0, 1),
    x2: clamp(hazard.x + hazard.w, 0, 1),
    y2: clamp(hazard.y + hazard.h, 0, 1),
  };
  const ix = Math.max(0, Math.min(rect.x2, hazardRect.x2) - Math.max(rect.x1, hazardRect.x1));
  const iy = Math.max(0, Math.min(rect.y2, hazardRect.y2) - Math.max(rect.y1, hazardRect.y1));
  const intersection = ix * iy;
  const hazardArea = rectArea(hazardRect);
  if (!hazardArea) return 0;
  const containment = intersection / hazardArea;
  const sizePenalty = clamp(hazardArea / Math.max(rectArea(rect), hazardArea), 0.34, 1);
  return containment * sizePenalty;
}

function pointInRect(x, y, rect) {
  return x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;
}

function rectArea(rect) {
  return Math.max(0, rect.x2 - rect.x1) * Math.max(0, rect.y2 - rect.y1);
}

function normalizeRect(x1, y1, x2, y2) {
  return {
    x1: clamp(Math.min(x1, x2), 0, 1),
    y1: clamp(Math.min(y1, y2), 0, 1),
    x2: clamp(Math.max(x1, x2), 0, 1),
    y2: clamp(Math.max(y1, y2), 0, 1),
  };
}

function getAreaMode() {
  const select = document.getElementById("areaShape");
  return select?.value || state.areaMode || DEFAULT_AREA_MODE;
}

function selectionFromDrag(start, current, mode) {
  const rect = normalizeRect(start.x, start.y, current.x, current.y);
  return selectionFromRect(rect, mode, start, current);
}

function selectionFromRect(rect, mode = DEFAULT_AREA_MODE, start = null, current = null) {
  if (mode === "cone" && start && current) {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const dist = Math.max(0.025, Math.hypot(dx, dy));
    const nx = -dy / dist;
    const ny = dx / dist;
    const startWidth = clamp(dist * 0.18, 0.015, 0.055);
    const endWidth = clamp(dist * 0.38, 0.045, 0.16);
    return areaFromPoints("cone", [
      { x: start.x + nx * startWidth, y: start.y + ny * startWidth },
      { x: current.x + nx * endWidth, y: current.y + ny * endWidth },
      { x: current.x - nx * endWidth, y: current.y - ny * endWidth },
      { x: start.x - nx * startWidth, y: start.y - ny * startWidth },
    ]);
  }

  if (mode === "county") {
    const seed = state.simulationSeed + Math.round((rect.x1 + rect.y1 + rect.x2 + rect.y2) * 10000);
    const notch = (salt, scale) => randomBetween(seed, salt, -scale, scale);
    return areaFromPoints("county", [
      { x: rect.x1 + notch(1, 0.012), y: rect.y1 + notch(2, 0.01) },
      { x: rect.x1 + (rect.x2 - rect.x1) * 0.42, y: rect.y1 + notch(3, 0.018) },
      { x: rect.x2 + notch(4, 0.012), y: rect.y1 + (rect.y2 - rect.y1) * 0.18 },
      { x: rect.x2 + notch(5, 0.012), y: rect.y1 + (rect.y2 - rect.y1) * 0.62 },
      { x: rect.x1 + (rect.x2 - rect.x1) * 0.68, y: rect.y2 + notch(6, 0.014) },
      { x: rect.x1 + (rect.x2 - rect.x1) * 0.22, y: rect.y2 + notch(7, 0.012) },
      { x: rect.x1 + notch(8, 0.012), y: rect.y1 + (rect.y2 - rect.y1) * 0.6 },
    ]);
  }

  if (mode === "polygon") {
    const width = rect.x2 - rect.x1;
    const height = rect.y2 - rect.y1;
    return areaFromPoints("polygon", [
      { x: rect.x1 + width * 0.1, y: rect.y1 },
      { x: rect.x2, y: rect.y1 + height * 0.16 },
      { x: rect.x2 - width * 0.08, y: rect.y1 + height * 0.62 },
      { x: rect.x1 + width * 0.66, y: rect.y2 },
      { x: rect.x1, y: rect.y2 - height * 0.12 },
      { x: rect.x1 + width * 0.08, y: rect.y1 + height * 0.36 },
    ]);
  }

  return rectToArea(rect);
}

function areaFromPoints(type, points) {
  const clamped = points.map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }));
  return { ...areaBounds({ points: clamped }), type, points: clamped };
}

function rectToArea(rect) {
  return areaFromPoints("rect", [
    { x: rect.x1, y: rect.y1 },
    { x: rect.x2, y: rect.y1 },
    { x: rect.x2, y: rect.y2 },
    { x: rect.x1, y: rect.y2 },
  ]);
}

function reshapeSelection(area, mode) {
  const bounds = areaBounds(area);
  return selectionFromRect(bounds, mode, { x: bounds.x1, y: bounds.y1 }, { x: bounds.x2, y: bounds.y2 });
}

function cloneArea(area) {
  return { ...area, points: area.points.map((point) => ({ ...point })) };
}

function areaBounds(area) {
  if (!area?.points?.length) return normalizeRect(area.x1, area.y1, area.x2, area.y2);
  const xs = area.points.map((point) => point.x);
  const ys = area.points.map((point) => point.y);
  return normalizeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

function areaSize(area) {
  if (!area?.points?.length) return rectArea(area);
  let sum = 0;
  for (let i = 0; i < area.points.length; i += 1) {
    const a = area.points[i];
    const b = area.points[(i + 1) % area.points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

function pointInArea(x, y, area) {
  if (!area?.points?.length) return pointInRect(x, y, area);
  return pointInPolygon(x, y, area.points);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const pi = points[i];
    const pj = points[j];
    const intersect = pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / Math.max(0.000001, pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function areaHazardOverlap(area, hazard) {
  let insideHazard = 0;
  let covered = 0;
  const samples = 7;
  for (let iy = 0; iy < samples; iy += 1) {
    for (let ix = 0; ix < samples; ix += 1) {
      const x = hazard.x - hazard.w + (ix / (samples - 1)) * hazard.w * 2;
      const y = hazard.y - hazard.h + (iy / (samples - 1)) * hazard.h * 2;
      const local = stormLocalCoords({ angle: hazard.angle || 0 }, { x: hazard.x, y: hazard.y }, x, y);
      const inHazard = (local.rx * local.rx) / Math.max(0.0001, hazard.w * hazard.w) + (local.ry * local.ry) / Math.max(0.0001, hazard.h * hazard.h) <= 1;
      if (!inHazard) continue;
      insideHazard += 1;
      if (pointInArea(x, y, area)) covered += 1;
    }
  }
  if (!insideHazard) return 0;
  const containment = covered / insideHazard;
  const hazardArea = Math.PI * hazard.w * hazard.h;
  const sizePenalty = clamp(hazardArea / Math.max(areaSize(area), hazardArea), 0.34, 1);
  return containment * sizePenalty;
}

function drawAreaPath(ctx, area, width, height) {
  const points = area?.points?.length ? area.points : rectToArea(area).points;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function rollingMetric(current, next, count) {
  return Math.round((current * Math.max(0, count - 1) + next) / Math.max(1, count));
}

function getDeskScore() {
  const attempts = Math.max(1, state.stats.issued + state.stats.misses);
  return clamp(Math.round(72 + state.stats.skillPoints / attempts), 0, 100);
}

function updateLayerButtons() {
  els.layerTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.layer === state.layer);
  });
}

function formatTime(scenario, index) {
  const date = new Date(new Date(scenario.start).getTime() + index * STEP_MINUTES * 60000);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}${minutes}Z`;
}

function formatValue(layer, value) {
  if (layer === "reports") return "delayed LSR layer";
  if (layer === "velocity") return `${Math.round(value)} mph`;
  if (layer === "spectrum") return `${Math.max(0, value).toFixed(1)} m/s SW`;
  if (layer === "hail") return `${Math.max(0, value).toFixed(1)} in`;
  if (layer === "rotation") return `${(Math.max(0, value) * 0.024).toFixed(3)} /s`;
  if (layer === "qpf") return `${Math.max(0, value).toFixed(1)} in`;
  if (layer === "satellite") return `${Math.round(value)} cloud enh`;
  return `${Math.round(value)} dBZ`;
}

function formatSetupValue(term, value) {
  const text = String(value);
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*kt\b/i);
  if (!match) return text;
  const mph = Math.round(Number(match[1]) * KNOTS_TO_MPH);
  return text.replace(match[0], `${mph} mph`);
}

function capLayerValue(layer, value) {
  if (layer === "radar") return clamp(value, 0, 80);
  if (layer === "velocity") return clamp(value, -130, 130);
  if (layer === "spectrum") return clamp(value, 0, 18);
  if (layer === "hail") return clamp(value, 0, 4);
  if (layer === "rotation") return clamp(value, 0, 0.94);
  if (layer === "qpf") return clamp(value, 0, 12);
  if (layer === "satellite") return clamp(value, 0, 92);
  return value;
}

function tiltSamplingContext(scenario, x, y, tiltDeg) {
  const dx = x - scenario.radarSite.x;
  const dy = y - scenario.radarSite.y;
  const rangeKm = clamp(Math.hypot(dx, dy) * 230, 0.25, 230);
  const theta = (tiltDeg * Math.PI) / 180;
  const effectiveRadius = REFRACTION_INDEX * EARTH_RADIUS_KM;
  const heightKm = Math.sqrt(rangeKm * rangeKm + effectiveRadius * effectiveRadius + 2 * rangeKm * effectiveRadius * Math.sin(theta)) - effectiveRadius + 0.3;
  const beamWidthKm = 2 * rangeKm * Math.tan((BEAMWIDTH_DEG * Math.PI) / 360);
  return {
    tiltDeg,
    rangeKm,
    heightKm,
    beamWidthKm,
    low: gaussian(heightKm - 1.1, 0, Math.max(0.9, beamWidthKm * 0.55 + 0.8), 1),
    mid: gaussian(heightKm - 4.5, 0, Math.max(1.4, beamWidthKm * 0.7 + 1.2), 1),
    upper: gaussian(heightKm - 9.5, 0, Math.max(2.2, beamWidthKm + 2.4), 1),
  };
}

function spectralWidthField(frame, x, y, tilt, gateNoise, broadNoise) {
  let value = Math.abs(gateNoise) * 0.8 + Math.abs(broadNoise) * 0.9;
  frame.storms.forEach((stormData) => {
    const { storm, pos, dynamics, influenceRadius } = stormData;
    if (Math.abs(x - pos.x) > influenceRadius || Math.abs(y - pos.y) > influenceRadius) return;
    const local = stormLocalCoordsForFrame(stormData, x, y);
    if (storm.mode === "supercell") {
      const meso = gaussian(local.rx + 0.043, local.ry - 0.026, 0.026, 0.022);
      const tvs = gaussian(local.rx + 0.049, local.ry - 0.032, 0.012, 0.01);
      const hailCore = gaussian(local.rx - 0.006, local.ry - 0.006, 0.024, 0.018);
      const outflowEdge = gaussian(local.rx + 0.062, local.ry + 0.002, 0.016, 0.12);
      value = Math.max(value, dynamics.rotation * (meso * 8 * tilt.mid + tvs * 15 * tilt.low) + dynamics.hail * hailCore * 7 + dynamics.outflow * outflowEdge * 6);
    } else {
      const edge = gaussian(local.rx, 0, 0.024, 1);
      const vort = Math.abs(Math.sin(local.ry * 46 + storm.seed + frame.t * 0.8));
      value = Math.max(value, dynamics.outflow * edge * 6 * tilt.low + dynamics.rotation * vort * edge * 9 * (tilt.low + tilt.mid * 0.6));
    }
  });
  return capLayerValue("spectrum", value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function defaultWatchThreat(product, kind) {
  const defaults = {
    "tornado-watch": { tornado: "80", wind: "60", hail: "45" },
    "pds-tornado-watch": { tornado: "95", wind: "80", hail: "60" },
    "severe-watch": { tornado: "15", wind: "80", hail: "60" },
    "pds-severe-watch": { tornado: "30", wind: "95", hail: "80" },
  };
  return defaults[product.id]?.[kind] || (kind === "tornado" ? "15" : "45");
}

function watchThreatProbability(kind, options, product = getProduct()) {
  const key = kind === "tornado" ? "watchTorProb" : kind === "wind" ? "watchWindProb" : "watchHailProb";
  return Number(options[key] || defaultWatchThreat(product, kind)) / 100;
}

function mesoIntensityTarget(kind, options) {
  return {
    tornado: { brief: 0.46, organized: 0.62, strong: 0.8, violent: 0.95 }[options.mdTorIntensity || "organized"],
    wind: { marginal: 0.44, severe: 0.58, significant: 0.76, destructive: 0.92 }[options.mdWindIntensity || "significant"],
    hail: { marginal: 0.4, severe: 0.58, "very-large": 0.78, giant: 0.92 }[options.mdHailIntensity || "severe"],
    flood: { localized: 0.44, repeating: 0.58, considerable: 0.76, extreme: 0.9 }[options.mdFloodIntensity || "considerable"],
  }[kind] || 0.68;
}

function mesoIntensityLabel(kind, options) {
  return {
    tornado: { brief: "brief", organized: "organized", strong: "strong", violent: "violent" }[options.mdTorIntensity || "organized"],
    wind: { marginal: "marginal", severe: "severe", significant: "significant", destructive: "destructive" }[options.mdWindIntensity || "significant"],
    hail: { marginal: "marginal", severe: "severe", "very-large": "very large", giant: "giant" }[options.mdHailIntensity || "severe"],
    flood: { localized: "localized", repeating: "repeating", considerable: "considerable", extreme: "extreme" }[options.mdFloodIntensity || "considerable"],
  }[kind] || "focused";
}

function lineRotationCenters(storm, timeIndex, length = storm.length || 0.62) {
  return [
    Math.sin(timeIndex * 0.24 + storm.seed * 0.31) * length * 0.34,
    Math.sin(timeIndex * 0.19 + storm.seed * 0.47 + 1.6) * length * 0.22,
  ];
}

function clusterFocusIndex(storm, timeIndex) {
  return Math.round(clamp((Math.sin(timeIndex * 0.22 + storm.seed * 0.41) + 1) * 1.5, 0, 3));
}

function tornadoDamageIntensity(severity) {
  if (severity >= 0.94) return "violent EF4-EF5 damage";
  if (severity >= 0.84) return "major EF3 damage";
  if (severity >= 0.72) return "considerable EF2 damage";
  if (severity >= 0.58) return "moderate EF1 damage";
  return "minor EF0 damage";
}

function hazardLabel(kind) {
  return {
    tornado: "tornado",
    wind: "damaging wind",
    hail: "large hail",
    flood: "flash flood",
  }[kind] || kind;
}

function bearingWord(dx, dy) {
  const east = dx >= 0 ? "E" : "W";
  const north = dy <= 0 ? "N" : "S";
  if (Math.abs(dx) < 0.025) return north;
  if (Math.abs(dy) < 0.025) return east;
  return `${north}${east}`;
}

function gaussian(x, y, sx, sy) {
  return Math.exp(-0.5 * ((x * x) / (sx * sx) + (y * y) / (sy * sy)));
}

function smoothStep(edge, width, value) {
  if (width === 0) return value >= edge ? 1 : 0;
  const t = clamp((value - edge) / width, 0, 1);
  return t * t * (3 - 2 * t);
}

function rotatePoint(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function insideMap(x, y) {
  return x >= -0.08 && x <= 1.08 && y >= -0.08 && y <= 1.08;
}

function interpColor(a, b, t) {
  const mix = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * mix),
    Math.round(a[1] + (b[1] - a[1]) * mix),
    Math.round(a[2] + (b[2] - a[2]) * mix),
    Math.round(a[3] + (b[3] - a[3]) * mix),
  ];
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function setupNumber(scenario, term, fallback) {
  const match = scenario.setup.find(([label]) => label === term);
  if (!match) return fallback;
  const value = Number.parseFloat(String(match[1]).replace(/,/g, ""));
  return Number.isFinite(value) ? value : fallback;
}

function seededNoise(seed, salt) {
  return hashNoise(seed % 1009, Math.floor(seed / 1009) % 1009, salt, Math.floor(seed / 1_000_000));
}

function randomBetween(seed, salt, min, max) {
  return min + (max - min) * seededNoise(seed, salt);
}

function hashNoise(x, y, z, seed) {
  let n = x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695041;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return ((n >>> 0) % 10000) / 10000;
}

function smoothNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hashNoise(ix, iy, 0, seed);
  const b = hashNoise(ix + 1, iy, 0, seed);
  const c = hashNoise(ix, iy + 1, 0, seed);
  const d = hashNoise(ix + 1, iy + 1, 0, seed);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
