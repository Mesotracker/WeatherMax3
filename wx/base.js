/* ============================================================================
 * WeatherMax :: wx/base.js
 * Shared constants, numerics, map projection and the real WSR-88D site table.
 *
 * Everything downstream (NWP core, radar forward operator, warn engine) works
 * in kilometres on a Lambert conformal conic projection so that distances,
 * beam geometry and storm motion are real-world quantities, not pixel space.
 * ========================================================================== */
(function (global) {
  const WX = (global.WX = global.WX || {});

  /* ------------------------------------------------------------- constants */
  const C = {
    G: 9.80665, // m s-2
    RD: 287.05, // dry air gas constant  J kg-1 K-1
    RV: 461.51, // water vapour gas constant
    CP: 1004.0, // dry air specific heat
    LV: 2.501e6, // latent heat of vaporisation J kg-1
    LS: 2.834e6, // latent heat of sublimation
    LF: 3.34e5, // latent heat of fusion
    T0: 273.15,
    EARTH_R_KM: 6371.0,
    KE: 4 / 3, // standard refraction effective-earth factor
    BEAMWIDTH_DEG: 0.96, // WSR-88D one-way 3 dB beamwidth
    MPS_TO_KT: 1.94384,
    MPS_TO_MPH: 2.236936,
    KT_TO_MPS: 0.514444,
    MPH_TO_MPS: 0.44704,
    IN_TO_MM: 25.4,
  };
  C.EPS = C.RD / C.RV;
  WX.C = C;

  /* ----------------------------------------------------------------- maths */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge, width, v) => {
    const t = clamp((v - edge) / (width || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const gaussian = (x, y, sx, sy) => Math.exp(-0.5 * ((x * x) / (sx * sx) + (y * y) / (sy * sy)));

  /** Deterministic hash noise in [0,1). Integer inputs only. */
  function hash(x, y, z, seed) {
    let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1442695041 + (seed | 0) * 1274126177;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = n ^ (n >>> 16);
    return ((n >>> 0) % 1000003) / 1000003;
  }

  /** Value noise, bilinear + smoothstep, in [0,1). */
  function valueNoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, 0, seed);
    const b = hash(ix + 1, iy, 0, seed);
    const c = hash(ix, iy + 1, 0, seed);
    const d = hash(ix + 1, iy + 1, 0, seed);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  }

  /** Fractal value noise (3 octaves) — used for turbulent sub-grid texture. */
  function fbm(x, y, seed, octaves = 3) {
    let amp = 0.5;
    let sum = 0;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * valueNoise(fx, fy, seed + o * 977);
      norm += amp;
      amp *= 0.5;
      fx *= 2.03;
      fy *= 2.01;
    }
    return sum / norm;
  }

  /** Bilinear sample of a flat row-major 2D array. */
  function bilinear(arr, nx, ny, x, y) {
    const gx = clamp(x, 0, nx - 1.001);
    const gy = clamp(y, 0, ny - 1.001);
    const i0 = gx | 0;
    const j0 = gy | 0;
    const i1 = i0 + 1 < nx ? i0 + 1 : i0;
    const j1 = j0 + 1 < ny ? j0 + 1 : j0;
    const tx = gx - i0;
    const ty = gy - j0;
    const a = arr[j0 * nx + i0];
    const b = arr[j0 * nx + i1];
    const c = arr[j1 * nx + i0];
    const d = arr[j1 * nx + i1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  WX.clamp = clamp;
  WX.lerp = lerp;
  WX.smoothstep = smoothstep;
  WX.deg = deg;
  WX.rad = rad;
  WX.gaussian = gaussian;
  WX.hash = hash;
  WX.valueNoise = valueNoise;
  WX.fbm = fbm;
  WX.bilinear = bilinear;

  /* --------------------------------------------------- Lambert conformal conic
   * Tangent/secant conic used by the NWS mesoscale analysis grids. All x/y in
   * km, y positive northward. */
  function makeProjection(lat0, lon0, lat1 = 33, lat2 = 45) {
    const Re = C.EARTH_R_KM;
    const p1 = rad(lat1);
    const p2 = rad(lat2);
    const p0 = rad(lat0);
    const l0 = rad(lon0);
    const n = Math.log(Math.cos(p1) / Math.cos(p2)) / Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
    const F = (Math.cos(p1) * Math.pow(Math.tan(Math.PI / 4 + p1 / 2), n)) / n;
    const rho0 = F / Math.pow(Math.tan(Math.PI / 4 + p0 / 2), n);

    function toXY(lat, lon) {
      const rho = F / Math.pow(Math.tan(Math.PI / 4 + rad(lat) / 2), n);
      const th = n * rad(lon - lon0);
      return { x: Re * rho * Math.sin(th), y: Re * (rho0 - rho * Math.cos(th)) };
    }

    function toLatLon(x, y) {
      const xr = x / Re;
      const yr = rho0 - y / Re;
      const rho = Math.sign(n) * Math.sqrt(xr * xr + yr * yr);
      const th = Math.atan2(Math.sign(n) * xr, Math.sign(n) * yr);
      const lat = deg(2 * Math.atan(Math.pow(F / rho, 1 / n)) - Math.PI / 2);
      const lon = deg(th / n + l0);
      return { lat, lon };
    }

    /** Great-circle distance in km. */
    function distance(lat1, lon1, lat2, lon2) {
      const dLat = rad(lat2 - lat1);
      const dLon = rad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * Re * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    return { lat0, lon0, n, toXY, toLatLon, distance, kmPerDegLat: 111.13 };
  }
  WX.makeProjection = makeProjection;

  /* ------------------------------------------------------ WSR-88D site table
   * Real NEXRAD locations (lat/lon are approximate to a few km, elevation is
   * tower/feedhorn height above MSL). Coverage is CONUS plus a few anchors so
   * every case has plausible neighbouring radars for the MRMS mosaic. */
  const S = (id, name, city, state, lat, lon, elevM) => ({ id, name, city, state, lat, lon, elevM });
  WX.RADAR_SITES = [
    S('KTLX', 'Twin Lakes', 'Oklahoma City', 'OK', 35.333, -97.278, 382),
    S('KVNX', 'Vance AFB', 'Enid', 'OK', 36.741, -98.128, 369),
    S('KINX', 'Inola', 'Tulsa', 'OK', 36.175, -95.564, 204),
    S('KFDR', 'Frederick', 'Altus', 'OK', 34.362, -98.977, 386),
    S('KSRX', 'Western Arkansas', 'Fort Smith', 'AR', 35.291, -94.362, 195),
    S('KLZK', 'North Little Rock', 'Little Rock', 'AR', 34.836, -92.262, 173),
    S('KSHV', 'Shreveport', 'Shreveport', 'LA', 32.451, -93.841, 83),
    S('KLCH', 'Lake Charles', 'Lake Charles', 'LA', 30.125, -93.216, 4),
    S('KLIX', 'Slidell', 'New Orleans', 'LA', 30.337, -89.826, 7),
    S('KPOE', 'Fort Polk', 'Alexandria', 'LA', 31.156, -92.976, 124),
    S('KFWS', 'Dallas–Fort Worth', 'Fort Worth', 'TX', 32.573, -97.303, 208),
    S('KHGX', 'Houston/Galveston', 'Houston', 'TX', 29.472, -95.079, 5),
    S('KEWX', 'Austin/San Antonio', 'New Braunfels', 'TX', 29.704, -98.029, 193),
    S('KAMA', 'Amarillo', 'Amarillo', 'TX', 35.166, -101.709, 1093),
    S('KLBB', 'Lubbock', 'Lubbock', 'TX', 33.654, -101.814, 993),
    S('KMAF', 'Midland/Odessa', 'Midland', 'TX', 31.943, -102.189, 877),
    S('KSJT', 'San Angelo', 'San Angelo', 'TX', 31.371, -100.493, 576),
    S('KDYX', 'Dyess AFB', 'Abilene', 'TX', 32.539, -99.254, 462),
    S('KGRK', 'Fort Cavazos', 'Killeen', 'TX', 30.722, -97.383, 164),
    S('KDFX', 'Laughlin AFB', 'Del Rio', 'TX', 29.273, -100.280, 345),
    S('KBRO', 'Brownsville', 'Brownsville', 'TX', 25.916, -97.419, 7),
    S('KCRP', 'Corpus Christi', 'Corpus Christi', 'TX', 27.784, -97.511, 14),
    S('KICT', 'Wichita', 'Wichita', 'KS', 37.655, -97.443, 407),
    S('KDDC', 'Dodge City', 'Dodge City', 'KS', 37.761, -99.969, 790),
    S('KGLD', 'Goodland', 'Goodland', 'KS', 39.367, -101.700, 1113),
    S('KTWX', 'Topeka', 'Topeka', 'KS', 38.997, -96.233, 417),
    S('KUEX', 'Hastings', 'Grand Island', 'NE', 40.321, -98.442, 603),
    S('KOAX', 'Omaha/Valley', 'Omaha', 'NE', 41.320, -96.367, 350),
    S('KLSX', 'St. Louis', 'St. Louis', 'MO', 38.699, -90.683, 185),
    S('KSGF', 'Springfield', 'Springfield', 'MO', 37.235, -93.400, 390),
    S('KEAX', 'Pleasant Hill', 'Kansas City', 'MO', 38.810, -94.264, 303),
    S('KMPX', 'Chanhassen', 'Minneapolis', 'MN', 44.849, -93.565, 288),
    S('KDLH', 'Duluth', 'Duluth', 'MN', 46.837, -92.209, 432),
    S('KDMX', 'Des Moines', 'Des Moines', 'IA', 41.731, -93.723, 310),
    S('KDVN', 'Quad Cities', 'Davenport', 'IA', 41.612, -90.580, 230),
    S('KARX', 'La Crosse', 'La Crosse', 'WI', 43.823, -91.191, 389),
    S('KMKX', 'Sullivan', 'Milwaukee', 'WI', 42.968, -88.550, 292),
    S('KGRB', 'Green Bay', 'Green Bay', 'WI', 44.499, -88.111, 208),
    S('KILX', 'Lincoln', 'Springfield', 'IL', 39.754, -89.337, 177),
    S('KLOT', 'Chicago/Romeoville', 'Chicago', 'IL', 41.604, -88.085, 202),
    S('KIND', 'Indianapolis', 'Indianapolis', 'IN', 39.708, -86.280, 241),
    S('KJKL', 'Jackson', 'Jackson', 'KY', 37.591, -83.313, 415),
    S('KLVX', 'Knob Lick', 'Louisville', 'KY', 37.975, -85.944, 348),
    S('KPAH', 'Paducah', 'Paducah', 'KY', 37.068, -88.772, 119),
    S('KHTX', 'Hytop', 'Huntsville', 'AL', 34.931, -86.083, 537),
    S('KBMX', 'Hytop', 'Birmingham', 'AL', 34.263, -86.601, 196),
    S('KMOB', 'Mobile', 'Mobile', 'AL', 30.679, -88.240, 63),
    S('KGWX', 'Columbus AFB', 'Columbus', 'MS', 33.897, -88.329, 144),
    S('KDGX', 'Jackson/Brandon', 'Jackson', 'MS', 32.280, -89.984, 91),
    S('KMEG', 'Memphis', 'Memphis', 'TN', 35.345, -89.873, 86),
    S('KOHX', 'Old Hickory', 'Nashville', 'TN', 36.247, -86.562, 179),
    S('KMRX', 'Morristown', 'Knoxville', 'TN', 36.169, -83.402, 408),
    S('KFFC', 'Peachtree City', 'Atlanta', 'GA', 33.363, -84.566, 262),
    S('KJGX', 'Robins AFB', 'Macon', 'GA', 32.675, -83.351, 159),
    S('KVAX', 'Moody AFB', 'Valdosta', 'GA', 30.890, -83.002, 54),
    S('KEVX', 'Eglin AFB', 'Panama City', 'FL', 30.564, -85.921, 43),
    S('KTLH', 'Tallahassee', 'Tallahassee', 'FL', 30.398, -84.329, 19),
    S('KTBW', 'Ruskin', 'Tampa', 'FL', 27.706, -82.402, 12),
    S('KMLB', 'Melbourne', 'Melbourne', 'FL', 28.113, -80.654, 11),
    S('KAMX', 'Miami', 'Miami', 'FL', 25.611, -80.413, 4),
    S('KBYX', 'Key West', 'Key West', 'FL', 24.597, -81.703, 2),
    S('KJAX', 'Jacksonville', 'Jacksonville', 'FL', 30.485, -81.702, 10),
    S('KLWX', 'Sterling', 'Washington DC', 'VA', 38.975, -77.478, 83),
    S('KAKQ', 'Wakefield', 'Norfolk', 'VA', 36.984, -77.007, 34),
    S('KFCX', 'Roanoke', 'Roanoke', 'VA', 37.024, -80.274, 874),
    S('KRLX', 'Charleston', 'Charleston', 'WV', 38.311, -81.723, 329),
    S('KPBZ', 'Pittsburgh', 'Pittsburgh', 'PA', 40.532, -80.218, 361),
    S('KCCX', 'State College', 'State College', 'PA', 40.923, -78.004, 733),
    S('KDOX', 'Dover AFB', 'Dover', 'DE', 38.826, -75.440, 15),
    S('KDIX', 'Mount Holly', 'Philadelphia', 'NJ', 39.947, -74.411, 45),
    S('KOKX', 'Brookhaven', 'New York', 'NY', 40.865, -72.864, 26),
    S('KBOX', 'Taunton', 'Boston', 'MA', 41.955, -71.137, 36),
    S('KENX', 'East Berne', 'Albany', 'NY', 42.587, -74.064, 557),
    S('KBGM', 'Binghamton', 'Binghamton', 'NY', 42.280, -75.985, 488),
    S('KCLE', 'Cleveland', 'Cleveland', 'OH', 41.413, -81.860, 233),
    S('KILN', 'Wilmington', 'Cincinnati', 'OH', 39.420, -83.822, 322),
    S('KGRR', 'Grand Rapids', 'Grand Rapids', 'MI', 42.894, -85.545, 237),
    S('KAPX', 'Gaylord', 'Gaylord', 'MI', 44.907, -84.720, 447),
    S('KDTX', 'White Lake', 'Detroit', 'MI', 42.699, -83.472, 327),
    S('KMVX', 'Fargo', 'Fargo', 'ND', 47.529, -97.326, 297),
    S('KABR', 'Aberdeen', 'Aberdeen', 'SD', 45.456, -98.413, 397),
    S('KUDX', 'Rapid City', 'Rapid City', 'SD', 44.125, -102.830, 919),
    S('KMBX', 'Minot AFB', 'Minot', 'ND', 48.392, -100.864, 456),
    S('KCYS', 'Cheyenne', 'Cheyenne', 'WY', 41.152, -104.806, 1868),
    S('KRIW', 'Riverton', 'Riverton', 'WY', 43.066, -108.477, 1697),
    S('KFTG', 'Front Range', 'Denver', 'CO', 39.787, -104.546, 1675),
    S('KPUB', 'Pueblo', 'Pueblo', 'CO', 38.459, -104.181, 1600),
    S('KGJX', 'Grand Junction', 'Grand Junction', 'CO', 39.062, -108.214, 3046),
    S('KMTX', 'Salt Lake City', 'Salt Lake City', 'UT', 41.263, -112.447, 1969),
    S('KCBX', 'Boise', 'Boise', 'ID', 43.491, -116.235, 947),
    S('KLRX', 'Elko', 'Elko', 'NV', 40.740, -116.803, 2056),
    S('KESX', 'Las Vegas', 'Las Vegas', 'NV', 35.701, -114.892, 1483),
    S('KIWA', 'Phoenix', 'Phoenix', 'AZ', 33.289, -111.670, 412),
    S('KEMX', 'Tucson', 'Tucson', 'AZ', 31.894, -110.630, 1586),
    S('KHNX', 'San Joaquin Valley', 'Fresno', 'CA', 36.314, -119.632, 74),
    S('KMUX', 'Mount Umunhum', 'San Jose', 'CA', 37.155, -121.898, 1057),
    S('KBBX', 'Beale AFB', 'Sacramento', 'CA', 39.496, -121.632, 308),
    S('KDAX', 'Sacramento', 'Sacramento', 'CA', 38.501, -121.678, 9),
    S('KSOX', 'Santa Ana Mtn', 'Los Angeles', 'CA', 33.818, -117.636, 923),
    S('KNKX', 'San Diego', 'San Diego', 'CA', 32.919, -117.042, 291),
    S('KBHX', 'Eureka', 'Eureka', 'CA', 40.499, -124.292, 732),
    S('KRTX', 'Portland', 'Portland', 'OR', 45.715, -122.965, 479),
    S('KMAX', 'Medford', 'Medford', 'OR', 42.081, -122.716, 2264),
    S('KATX', 'Seattle/Tacoma', 'Seattle', 'WA', 48.194, -122.495, 151),
    S('KOTX', 'Spokane', 'Spokane', 'WA', 47.680, -117.626, 728),
    S('KTFX', 'Great Falls', 'Great Falls', 'MT', 47.460, -111.385, 1132),
    S('KBLX', 'Billings', 'Billings', 'MT', 45.854, -108.607, 1097),
    S('KGGW', 'Glasgow', 'Glasgow', 'MT', 48.206, -106.625, 694),
    S('KLNX', 'North Platte', 'North Platte', 'NE', 41.958, -100.576, 906),
  ];

  WX.siteById = function (id) {
    return WX.RADAR_SITES.find((s) => s.id === id) || WX.RADAR_SITES[0];
  };

  /** N nearest sites to a lat/lon, sorted by great-circle distance. */
  WX.nearestSites = function (lat, lon, n = 6) {
    return WX.RADAR_SITES
      .map((s) => ({ site: s, km: makeProjection(lat, lon).distance(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, n);
  };
})(typeof self !== 'undefined' ? self : globalThis);
