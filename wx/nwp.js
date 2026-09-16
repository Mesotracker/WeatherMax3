/* ============================================================================
 * WeatherMax :: wx/nwp.js
 * A three-dimensional, hydrostatic-balance, bulk-microphysics atmospheric
 * model. This is the "real" atmosphere the radar looks at:
 *
 *   - semi-Lagrangian advection of momentum, potential temperature and five
 *     hydrometeor classes (vapour, cloud water, rain, snow/ice, hail)
 *   - saturation adjustment + Kessler warm rain + ice/hail accretion,
 *     deposition, melting and sedimentation (Lin/Kessler style)
 *   - buoyancy from virtual potential temperature perturbation and
 *     hydrometeor loading -> explicit vertical motion
 *   - divergence damping (the MPAS-style compressible-solver filter) so
 *     density currents, gust fronts and rear-inflow jets propagate properly
 *   - sub-grid turbulent diffusion, surface drag and sensible/latent flux
 *   - a convective trigger driven by low-level convergence along boundaries
 *
 * The domain translates with the Bunkers right-mover storm motion, so storms
 * stay in view for a full shift while the base flow streams through.
 * All fields are stored as perturbations from the 1-D base sounding.
 * ========================================================================== */
(function (global) {
  const WX = (global.WX = global.WX || {});
  const C = WX.C;
  const { clamp, lerp } = WX;

  const FIELDS = ['u', 'v', 'w', 'thp', 'qv', 'qc', 'qr', 'qs', 'qh'];
  // Only the dynamically important scalars get explicit diffusion; the
  // heavier hydrometeor classes are handled by sedimentation alone.
  const DIFFUSE_FIELDS = ['thp', 'qv', 'qc', 'qr'];

  function createNWP(cfg) {
    const nx = cfg.nx;
    const ny = cfg.ny;
    const nz = cfg.nz;
    const dx = cfg.dx; // m
    const n2d = nx * ny;
    const n3d = n2d * nz;
    const sounding = cfg.sounding;
    const seed = cfg.seed || 1;

    /* ---------------------------------------------------- vertical stagger */
    const dz = new Float64Array(nz);
    const zc = new Float64Array(nz); // cell centres (m AGL)
    const pi = new Float64Array(nz); // Exner function
    const T0 = new Float64Array(nz); // base temperature (K)
    const Th0 = new Float64Array(nz); // base potential temperature (K)
    const Qv0 = new Float64Array(nz); // base vapour mixing ratio
    const U0 = new Float64Array(nz); // base u in the moving frame
    const V0 = new Float64Array(nz); // base v in the moving frame
    const P0 = new Float64Array(nz); // base pressure (hPa)
    {
      let z = 0;
      let d = cfg.dz0 || 250;
      const ratio = cfg.dzRatio || 1.3;
      const dzMax = cfg.dzMax || 1400;
      for (let k = 0; k < nz; k += 1) {
        dz[k] = Math.min(dzMax, d);
        zc[k] = z + dz[k] / 2;
        z += dz[k];
        d *= ratio;
      }
      for (let k = 0; k < nz; k += 1) {
        const s = sounding.at(zc[k]);
        T0[k] = s.T;
        P0[k] = s.p;
        Th0[k] = s.T / Math.pow(s.p / 1000, C.RD / C.CP);
        Qv0[k] = s.qv;
        pi[k] = Math.pow(s.p / 1000, C.RD / C.CP);
        U0[k] = s.u - cfg.motion.u;
        V0[k] = s.v - cfg.motion.v;
      }
    }
    const zTop = zc[nz - 1] + dz[nz - 1] / 2;

    /* ------------------------------------------------------------ fields */
    const f = {};
    FIELDS.forEach((name) => {
      f[name] = new Float32Array(n3d);
    });
    const rainAccum = new Float32Array(n2d); // mm, running accumulation
    const snowAccum = new Float32Array(n2d); // mm water equivalent
    const surfaceGust = new Float32Array(n2d); // m/s, peak 10 m wind
    const surfaceWind = new Float32Array(n2d * 2); // u,v at 10 m
    const coldPool = new Float32Array(n2d); // K, deepest negative thp near sfc
    const convect = new Float32Array(n2d); // convective mass-flux proxy
    const cloudBase = new Float32Array(n2d); // m AGL
    const cloudTop = new Float32Array(n2d); // m AGL
    const maxUpdraft = new Float32Array(n2d);
    const maxReflectivity = new Float32Array(n2d);
    const colHail = new Float32Array(n2d); // MESH, metres
    const helicity = new Float32Array(n2d); // 0-3 km relative helicity proxy
    const vortZ = new Float32Array(n3d); // vertical vorticity

    const IX = (i, j, k) => (k * ny + j) * nx + i;

    /* ------------------------------------------------------- initial state
     * Random thermal noise so the solver has something to amplify, plus any
     * warm/moist bubbles the case asks for. */
    function initialise(bubbles) {
      for (let k = 0; k < nz; k += 1) {
        for (let j = 0; j < ny; j += 1) {
          for (let i = 0; i < nx; i += 1) {
            const idx = IX(i, j, k);
            const amp = Math.exp(-zc[k] / 4000);
            f.thp[idx] = (WX.hash(i, j, k, seed) - 0.5) * 0.35 * amp;
            const q0 = Qv0[k];
            f.qv[idx] = (WX.hash(i, j, k + 41, seed) - 0.5) * Math.min(3e-4, 0.06 * q0) * amp;
            f.u[idx] = (WX.hash(i, j, k + 83, seed) - 0.5) * 0.8 * amp;
            f.v[idx] = (WX.hash(i, j, k + 127, seed) - 0.5) * 0.8 * amp;
          }
        }
      }
      (bubbles || []).forEach((b) => addBubble(b));
    }

    /** Warm, moist bubble (the classic idealized-CAPE trigger). */
    function addBubble(b) {
      const { x, y, radius, dTheta = 1.5, dQv = 1e-3, zBase = 0, zTop: bTop = 3000 } = b;
      const i0 = Math.round(x / dx);
      const j0 = Math.round(y / dx);
      const r = Math.max(1, Math.round(radius / dx));
      for (let j = Math.max(0, j0 - r); j <= Math.min(ny - 1, j0 + r); j += 1) {
        for (let i = Math.max(0, i0 - r); i <= Math.min(nx - 1, i0 + r); i += 1) {
          const rr = Math.hypot((i - i0) * dx, (j - j0) * dx);
          if (rr > radius) continue;
          const w = 0.5 * (1 + Math.cos((Math.PI * rr) / radius));
          for (let k = 0; k < nz; k += 1) {
            if (zc[k] < zBase || zc[k] > bTop) continue;
            const wz = Math.sin(Math.PI * clamp((zc[k] - zBase) / (bTop - zBase), 0, 1));
            const idx = IX(i, j, k);
            f.thp[idx] += dTheta * w * wz;
            f.qv[idx] += dQv * w * wz;
          }
        }
      }
    }

    /* --------------------------------------------------------- advection */
    const tmp = new Float32Array(n3d);
    const i0a = new Int32Array(n3d);
    const j0a = new Int32Array(n3d);
    const k0a = new Int32Array(n3d);
    const txa = new Float32Array(n3d);
    const tya = new Float32Array(n3d);
    const tza = new Float32Array(n3d);
    const ADV_NAMES = ['u', 'v', 'w', 'thp', 'qv', 'qc', 'qr', 'qs', 'qh'];
    let tmpArr = null;

    /**
     * Semi-Lagrangian advection of every prognostic by the full 3-D wind.
     * One common trajectory per grid column (the standard SL "shared
     * departure point" trick) keeps this cheap: geometry is computed once and
     * reused for all nine tracers. Departure points are sampled with
     * bilinear-in-horizontal / linear-in-vertical interpolation, which is
     * bounded by the stencil corners, so no limiter is required. Anything
     * outside the domain is base state, i.e. zero perturbation.
     */
    function advectAll(dt) {
      if (!tmpArr) tmpArr = ADV_NAMES.map(() => new Float32Array(n3d));
      const invdx = 1 / dx;
      const U = f.u;
      const V = f.v;
      const W = f.w;

      // ---- shared trajectory geometry (reused buffers) ----------------
      for (let k = 0; k < nz; k += 1) {
        const u0 = U0[k];
        const v0 = V0[k];
        for (let j = 0; j < ny; j += 1) {
          for (let i = 0; i < nx; i += 1) {
            const idx = IX(i, j, k);
            const xd = i - (u0 + U[idx]) * dt * invdx;
            const yd = j - (v0 + V[idx]) * dt * invdx;
            const zd = zc[k] - W[idx] * dt;
            let i0 = Math.floor(xd);
            let j0 = Math.floor(yd);
            let tx = xd - i0;
            let ty = yd - j0;
            if (i0 < 0) { i0 = 0; tx = 0; }
            if (j0 < 0) { j0 = 0; ty = 0; }
            if (i0 > nx - 2) { i0 = nx - 2; tx = 1; }
            if (j0 > ny - 2) { j0 = ny - 2; ty = 1; }
            i0a[idx] = i0;
            j0a[idx] = j0;
            txa[idx] = tx;
            tya[idx] = ty;
            if (zd <= zc[0]) {
              k0a[idx] = 0;
              tza[idx] = 0;
            } else if (zd >= zc[nz - 1]) {
              k0a[idx] = nz - 2;
              tza[idx] = 1;
            } else {
              // |w| is small, so start the search two levels below the
              // arrival level instead of scanning from the ground
              let kk = k > 1 ? k - 2 : 0;
              while (kk < nz - 2 && zc[kk + 1] < zd) kk += 1;
              while (kk > 0 && zc[kk] > zd) kk -= 1;
              k0a[idx] = kk;
              tza[idx] = (zd - zc[kk]) / (zc[kk + 1] - zc[kk]);
            }
          }
        }
      }

      // ---- interpolate every tracer along those trajectories ----------
      // Cells are the outer loop: the six geometry arrays are read once and
      // reused by all nine tracers, and each tracer stream stays sequential.
      // The tracer loop is fully unrolled so V8 sees plain local arrays.
      const Au = f.u, Av = f.v, Aw = f.w, At = f.thp, Aq = f.qv;
      const Ac = f.qc, Ar = f.qr, As = f.qs, Ah = f.qh;
      const Tu = tmpArr[0], Tv = tmpArr[1], Tw = tmpArr[2], Tt = tmpArr[3], Tq = tmpArr[4];
      const Tc2 = tmpArr[5], Tr = tmpArr[6], Ts = tmpArr[7], Th = tmpArr[8];
      for (let k = 0; k < nz; k += 1) {
        const off = k * n2d;
        const U0k = U0[k];
        const V0k = V0[k];
        for (let j = 0; j < ny; j += 1) {
          const rowOff = off + j * nx;
          for (let i = 0; i < nx; i += 1) {
            const idx = rowOff + i;
            const r0 = j0a[idx] * nx + i0a[idx];
            const r1 = r0 + nx;
            const b0 = k0a[idx] * n2d;
            const b1 = b0 + n2d;
            const tx = txa[idx];
            const omt = 1 - tya[idx];
            const ty = tya[idx];
            const tz = tza[idx];
            const omtz = 1 - tz;
            const p00 = b0 + r0;
            const p01 = b0 + r1;
            const p10 = b1 + r0;
            const p11 = b1 + r1;
            {
              const c00 = Au[p00]; const c10 = Au[p00 + 1]; const c01 = Au[p01]; const c11 = Au[p01 + 1];
              const d00 = Au[p10]; const d10 = Au[p10 + 1]; const d01 = Au[p11]; const d11 = Au[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              // Momentum is advected as the TOTAL wind: a parcel carries the
              // environmental shear of its origin level with it, so the
              // perturbation must be re-based onto the arrival level. Omitting
              // this leaks the whole deep-layer shear into u' every step.
              const kdU = k0a[idx];
              Tu[idx] = low * omtz + high * tz + (U0[kdU] * omtz + U0[kdU + 1] * tz - U0k);
            }
            {
              const c00 = Av[p00]; const c10 = Av[p00 + 1]; const c01 = Av[p01]; const c11 = Av[p01 + 1];
              const d00 = Av[p10]; const d10 = Av[p10 + 1]; const d01 = Av[p11]; const d11 = Av[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              const kdV = k0a[idx];
              Tv[idx] = low * omtz + high * tz + (V0[kdV] * omtz + V0[kdV + 1] * tz - V0k);
            }
            {
              const c00 = Aw[p00]; const c10 = Aw[p00 + 1]; const c01 = Aw[p01]; const c11 = Aw[p01 + 1];
              const d00 = Aw[p10]; const d10 = Aw[p10 + 1]; const d01 = Aw[p11]; const d11 = Aw[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              Tw[idx] = low * omtz + high * tz;
            }
            {
              const c00 = At[p00]; const c10 = At[p00 + 1]; const c01 = At[p01]; const c11 = At[p01 + 1];
              const d00 = At[p10]; const d10 = At[p10 + 1]; const d01 = At[p11]; const d11 = At[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              Tt[idx] = low * omtz + high * tz;
            }
            {
              const c00 = Aq[p00]; const c10 = Aq[p00 + 1]; const c01 = Aq[p01]; const c11 = Aq[p01 + 1];
              const d00 = Aq[p10]; const d10 = Aq[p10 + 1]; const d01 = Aq[p11]; const d11 = Aq[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              Tq[idx] = low * omtz + high * tz;
            }
            {
              const c00 = Ac[p00]; const c10 = Ac[p00 + 1]; const c01 = Ac[p01]; const c11 = Ac[p01 + 1];
              const d00 = Ac[p10]; const d10 = Ac[p10 + 1]; const d01 = Ac[p11]; const d11 = Ac[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              Tc2[idx] = low * omtz + high * tz;
            }
            {
              const c00 = Ar[p00]; const c10 = Ar[p00 + 1]; const c01 = Ar[p01]; const c11 = Ar[p01 + 1];
              const d00 = Ar[p10]; const d10 = Ar[p10 + 1]; const d01 = Ar[p11]; const d11 = Ar[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              Tr[idx] = low * omtz + high * tz;
            }
            {
              const c00 = As[p00]; const c10 = As[p00 + 1]; const c01 = As[p01]; const c11 = As[p01 + 1];
              const d00 = As[p10]; const d10 = As[p10 + 1]; const d01 = As[p11]; const d11 = As[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              Ts[idx] = low * omtz + high * tz;
            }
            {
              const c00 = Ah[p00]; const c10 = Ah[p00 + 1]; const c01 = Ah[p01]; const c11 = Ah[p01 + 1];
              const d00 = Ah[p10]; const d10 = Ah[p10 + 1]; const d01 = Ah[p11]; const d11 = Ah[p11 + 1];
              const low = (c00 + (c10 - c00) * tx) * omt + (c01 + (c11 - c01) * tx) * ty;
              const high = (d00 + (d10 - d00) * tx) * omt + (d01 + (d11 - d01) * tx) * ty;
              Th[idx] = low * omtz + high * tz;
            }
          }
        }
      }
      Au.set(Tu); Av.set(Tv); Aw.set(Tw); At.set(Tt); Aq.set(Tq);
      Ac.set(Tc2); Ar.set(Tr); As.set(Ts); Ah.set(Th);
    }

    /* ------------------------------------------------------ microphysics */
    /* Five-class bulk microphysics (vapour, cloud water, rain, snow/ice,
     * hail) following the Kessler warm-rain scheme plus Lin-style ice and
     * hail accretion, deposition/sublimation, melting and sedimentation.
     * Written with the vertical level as the outer loop so every inner pass
     * is contiguous in memory. */
    const incomingA = new Float32Array(n2d);
    // x^0.2 for x in [0, 24] via a linear table (Math.log in this loop cost
    // more than the whole rest of the microphysics scheme).
    const POW02_N = 1024;
    const POW02_MAX = 24;
    const pow02Tab = new Float32Array(POW02_N + 2);
    for (let i = 0; i <= POW02_N + 1; i += 1) pow02Tab[i] = Math.pow((i * POW02_MAX) / POW02_N, 0.2);
    const POW02_SCALE = POW02_N / POW02_MAX;
    function pow02(x) {
      const fi = x * POW02_SCALE;
      if (!(fi > 0)) return 0;
      if (fi >= POW02_N) return pow02Tab[POW02_N];
      const i = fi | 0;
      return pow02Tab[i] + (pow02Tab[i + 1] - pow02Tab[i]) * (fi - i);
    }
    const esatF = WX.esatFast;
    const esatIceF = WX.esatIceFast;
    // x^0.875 table (rain mixing ratio, kg/kg) - Math.pow costs ~30 ns and
    // sits in the hottest loop in the model, so it is tabulated instead.
    const POW875_N = 1024;
    const POW875_MAX = 0.02;
    const pow875Tab = new Float64Array(POW875_N + 2);
    for (let i = 0; i <= POW875_N + 1; i += 1) pow875Tab[i] = Math.pow((i * POW875_MAX) / POW875_N, 0.875);
    const POW875_SCALE = POW875_N / POW875_MAX;
    function pow875(x) {
      const fi = x * POW875_SCALE;
      if (!(fi > 0)) return 0;
      if (fi >= POW875_N) return pow875Tab[POW875_N];
      const i = fi | 0;
      return pow875Tab[i] + (pow875Tab[i + 1] - pow875Tab[i]) * (fi - i);
    }
    const qsatBase = new Float64Array(nz);
    const rhoBase = new Float64Array(nz);
    for (let k = 0; k < nz; k += 1) {
      qsatBase[k] = WX.qsat(T0[k] - C.T0, P0[k]);
      rhoBase[k] = (P0[k] * 100) / (C.RD * T0[k]);
    }

    const microTimings = { sed: 0, thermo: 0 };
    function microphysics(dt) {
      const K1 = 1.0e-3; // Kessler autoconversion (1/s)
      const QC_THRESH = 1.0e-3;
      const K2 = 2.2; // accretion of cloud water by rain
      const K3I = 1.6; // riming: snow collecting cloud water
      const KACC_H = 0.16; // hail accreting cloud water + snow
      const KEV = 3.5e-5; // rain evaporation (Kessler form, SI)
      const KMELT = 6.0e-2; // melting per K per second
      const KDEP = 3.0e-4; // vapour deposition on ice
      const LV = C.LV;
      const LS = C.LS;
      const LF = C.LF;
      const CP = C.CP;
      const RV = C.RV;
      const RDgas = C.RD;
      const EPS = C.EPS;
      const T0K = C.T0;
      const rho0 = (P0[0] * 100) / (C.RD * Th0[0]);

      /* ---- sedimentation, top to bottom, contiguous in (j,i) -------- */
      const __s0 = clock ? clock() : 0;
      const SPEC = [f.qr, f.qs, f.qh];
      const VT = [5.0, 1.3, 12.0];
      const SUB = 2;
      const subDt = dt / SUB;
      for (let c = 0; c < 3; c += 1) {
        const q = SPEC[c];
        const vtBase = VT[c];
        for (let sub = 0; sub < SUB; sub += 1) {
          incomingA.fill(0);
          // eslint-disable-next-line no-empty
          for (let k = nz - 1; k >= 0; k -= 1) {
            const base = k * n2d;
            const invdz = 1 / dz[k];
            for (let idx = 0; idx < n2d; idx += 1) {
              const o = base + idx;
              const total = q[o] + incomingA[idx];
              if (total <= 1e-9) {
                q[o] = 0;
                incomingA[idx] = 0;
                continue;
              }
              const vt = vtBase * pow02(total * 1000);
              const frac = vt * subDt * invdz;
              const remain = frac >= 0.95 ? total * 0.05 : total * (1 - frac);
              q[o] = remain;
              incomingA[idx] = total - remain;
            }
          }
          // whatever is left in `incomingA` fell out of the bottom layer
          const mm = rho0 * dz[0];
          if (c === 0) {
            for (let idx = 0; idx < n2d; idx += 1) {
              if (incomingA[idx] > 0) rainAccum[idx] += incomingA[idx] * mm;
            }
          } else {
            for (let idx = 0; idx < n2d; idx += 1) {
              if (incomingA[idx] > 0) snowAccum[idx] += incomingA[idx] * mm;
            }
          }
        }
      }

      const __s1 = clock ? clock() : 0;
      /* ---- thermodynamics and phase change ------------------------- */
      const thp = f.thp;
      const qvA = f.qv;
      const qcA = f.qc;
      const qrA = f.qr;
      const qsA = f.qs;
      const qhA = f.qh;
      for (let k = 0; k < nz; k += 1) {
        const base = k * n2d;
        const p = P0[k];
        const exner = pi[k];
        const Th0k = Th0[k];
        const Qv0k = Qv0[k];
        const invCPex = 1 / (CP * exner);
        const qsBase = qsatBase[k];
        const rhoK = rhoBase[k];
        for (let idx = 0; idx < n2d; idx += 1) {
          const o = base + idx;
          let qc = qcA[o];
          let qr = qrA[o];
          let qs = qsA[o];
          let qh = qhA[o];
          const qv = Qv0k + qvA[o];
          // Cheap activity test: skip cells that are far from saturation and
          // hold no condensate. In a domain with a few storms this removes
          // most of the grid from the expensive path.
          if (qc + qr + qs + qh < 1e-8 && qv < 0.72 * qsBase) continue;
          let T = (Th0k + thp[o]) * exner;
          const Tc = T - T0K;
          const es = esatF(Tc);
          const eStar = Tc > 0 ? es : Tc < -40 ? esatIceF(Tc) : es + (esatIceF(Tc) - es) * (-Tc / 40);
          const qsat = (EPS * eStar) / (p > eStar + 1e-3 ? p - eStar : 1e-3);

          // saturation adjustment with latent heating feedback
          const denom = 1 + (LV * LV * qsat) / (CP * RV * T * T);
          const dq = (qv - qsat) / denom;
          let qvNew = qv;
          if (dq > 0) {
            const cond = dq < qv ? dq : qv;
            qvNew -= cond;
            if (Tc > 0) qc += cond;
            else qs += cond;
            thp[o] += cond * LV * invCPex;
            T += cond * LV / CP;
          } else if (dq < 0 && qc > 0) {
            const evap = -dq < qc ? -dq : qc;
            qc -= evap;
            qvNew += evap;
            thp[o] -= evap * LV * invCPex;
            T -= evap * LV / CP;
          }

          // warm rain: autoconversion then accretion
          if (qc > QC_THRESH) {
            const conv = K1 * (qc - QC_THRESH) * dt;
            qc -= conv;
            qr += conv;
            const accr = K2 * pow875(qr > 1e-9 ? qr : 1e-9) * qc * dt;
            const a2 = accr < qc ? accr : qc;
            qc -= a2;
            qr += a2;
          }

          // Rain evaporation in subsaturated air (Kessler 1969 form,
          // E = K (1-RH) (rho*qr)^0.5) - this is what builds the cold pool.
          const rh = qvNew / (qsat > 1e-12 ? qsat : 1e-12);
          if (qr > 1e-7 && rh < 0.999) {
            let evap = KEV * (1 - rh) * Math.sqrt(qr * rhoK) * dt;
            if (evap > qr) evap = qr;
            if (evap > 0) {
              qr -= evap;
              qvNew += evap;
              thp[o] -= evap * LV * invCPex;
            }
          }

          if (Tc < 0) {
            // vapour deposition / sublimation on ice
            const dep = KDEP * (qvNew - qsat) * dt;
            const depC = dep < 0 ? (dep > -qs ? dep : -qs) : dep < qvNew * 0.5 ? dep : qvNew * 0.5;
            if (depC !== 0 && (qvNew > qsat || qs > 1e-8)) {
              qvNew -= depC;
              qs += depC;
              thp[o] += depC * LS * invCPex;
            }
            // riming: snow collecting supercooled cloud water
            if (qs > 1e-6 && qc > 0) {
              let rim = K3I * qs * qc * dt * 40;
              if (rim > qc) rim = qc;
              qc -= rim;
              qs += rim;
              thp[o] += rim * LF * invCPex;
            }
            // hail growth by accreting supercooled water and snow
            const avail = qc + qs;
            if (avail > 1e-5) {
              let acc = KACC_H * pow02(qh > 1e-7 ? qh * 1000 : 1e-4) * avail * dt;
              if (acc > avail) acc = avail;
              const fc = qc / avail;
              const fromC = acc * fc;
              const fromS = acc - fromC;
              qc -= fromC;
              qs -= fromS;
              qh += acc;
              thp[o] += acc * LF * invCPex;
            }
          } else {
            // melting of snow and hail, sublimation of leftover ice
            if (qs > 1e-8) {
              let melt = KMELT * Tc * qs * dt;
              if (melt > qs) melt = qs;
              qs -= melt;
              qr += melt;
              thp[o] -= melt * LF * invCPex;
            }
            if (qh > 1e-8) {
              let melt = KMELT * 0.6 * Tc * qh * dt;
              if (melt > qh) melt = qh;
              qh -= melt;
              qr += melt;
              thp[o] -= melt * LF * invCPex;
            }
          }

          qvA[o] = qvNew - Qv0k;
          qcA[o] = qc > 0 ? qc : 0;
          qrA[o] = qr > 0 ? qr : 0;
          qsA[o] = qs > 0 ? qs : 0;
          qhA[o] = qh > 0 ? qh : 0;
        }
      }
      if (clock) {
        microTimings.sed += __s1 - __s0;
        microTimings.thermo += clock() - __s1;
      }
    }


    /* --------------------------------------------------- pressure projection
     * Jacobi solution of   div( (1/rho_bar) grad phi ) = D/dt   with rigid
     * surface and lid (Neumann) and open lateral boundaries (Dirichlet). */
    const rhobar = new Float64Array(nz);
    for (let k = 0; k < nz; k += 1) rhobar[k] = (P0[k] * 100) / (C.RD * T0[k]);
    const dU0dz = new Float64Array(nz);
    const dV0dz = new Float64Array(nz);
    for (let k = 0; k < nz; k += 1) {
      const km = k > 0 ? k - 1 : 0;
      const kp = k < nz - 1 ? k + 1 : nz - 1;
      dU0dz[k] = (U0[kp] - U0[km]) / Math.max(1, zc[kp] - zc[km]);
      dV0dz[k] = (V0[kp] - V0[km]) / Math.max(1, zc[kp] - zc[km]);
    }
    const phi = new Float32Array(n3d);
    const rhs = new Float32Array(n3d);

    function project(dt) {
      const invdx = 1 / dx;
      const ax = invdx * invdx;
      const invDt = 1 / dt;
      // --- divergence D = du/dx + dv/dy + (1/rho) d(rho w)/dz -------------
      for (let k = 0; k < nz; k += 1) {
        const base = k * n2d;
        const rk = rhobar[k];
        for (let j = 0; j < ny; j += 1) {
          const row = base + j * nx;
          for (let i = 0; i < nx; i += 1) {
            const o = row + i;
            const ip = i > 0 ? o - 1 : o;
            const im = i < nx - 1 ? o + 1 : o;
            const jp = j > 0 ? o - nx : o;
            const jm = j < ny - 1 ? o + nx : o;
            const dudx = (f.u[im] - f.u[ip]) * 0.5 * invdx * (i > 0 && i < nx - 1 ? 1 : 2);
            const dvdy = (f.v[jm] - f.v[jp]) * 0.5 * invdx * (j > 0 && j < ny - 1 ? 1 : 2);
            let dwdz = 0;
            if (k === 0) dwdz = (rhobar[1] * f.w[o + n2d] - rk * f.w[o]) / (rk * (zc[1] - zc[0])) * 2;
            else if (k === nz - 1) dwdz = (rk * f.w[o] - rhobar[k - 1] * f.w[o - n2d]) / (rk * (zc[k] - zc[k - 1])) * 2;
            else dwdz = (rhobar[k + 1] * f.w[o + n2d] - rhobar[k - 1] * f.w[o - n2d]) / (rk * (zc[k + 1] - zc[k - 1]));
            rhs[o] = (dudx + dvdy + dwdz) * invDt;
          }
        }
      }
      // --- Jacobi iterations ---------------------------------------------
      const iters = cfg.projIters ?? 8;
      for (let it = 0; it < iters; it += 1) {
        for (let k = 0; k < nz; k += 1) {
          const base = k * n2d;
          const rk = rhobar[k];
          let vzLo = 0;
          let vzHi = 0;
          let dzC = zc[0] * 2;
          if (k > 0 && k < nz - 1) {
            vzLo = rhobar[k - 1] / (zc[k] - zc[k - 1]);
            vzHi = rhobar[k + 1] / (zc[k + 1] - zc[k]);
            dzC = 0.5 * (zc[k + 1] - zc[k - 1]);
          } else if (k === 0) {
            vzHi = rhobar[1] / (zc[1] - zc[0]);
            dzC = zc[1] - zc[0];
          } else {
            vzLo = rhobar[k - 1] / (zc[k] - zc[k - 1]);
            dzC = zc[k] - zc[k - 1];
          }
          const czLo = vzLo / (rk * dzC);
          const czHi = vzHi / (rk * dzC);
          const diag = -2 * ax - 2 * ax - czLo - czHi;
          const invDiag = 1 / diag;
          for (let j = 0; j < ny; j += 1) {
            const row = base + j * nx;
            for (let i = 0; i < nx; i += 1) {
              const o = row + i;
              if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) {
                phi[o] = 0;
                continue;
              }
              let num = ax * (phi[o + 1] + phi[o - 1] + phi[o + nx] + phi[o - nx]);
              if (czLo > 0) num += czLo * phi[o - n2d];
              if (czHi > 0) num += czHi * phi[o + n2d];
              phi[o] = (rhs[o] - num) * invDiag;
            }
          }
        }
      }
      // --- remove the pressure gradient ---------------------------------
      // phi is the pressure perturbation divided by the base density
      // (pi = p'/rho_bar), so the momentum correction is simply -dt*grad(phi).
      for (let k = 0; k < nz; k += 1) {
        const base = k * n2d;
        const invRhoDt = dt;
        for (let j = 1; j < ny - 1; j += 1) {
          const row = base + j * nx;
          for (let i = 1; i < nx - 1; i += 1) {
            const o = row + i;
            f.u[o] -= invRhoDt * (phi[o + 1] - phi[o - 1]) * 0.5 * invdx;
            f.v[o] -= invRhoDt * (phi[o + nx] - phi[o - nx]) * 0.5 * invdx;
          }
        }
        let dzInv = 0;
        if (k > 0 && k < nz - 1) dzInv = 1 / (zc[k + 1] - zc[k - 1]);
        else if (k === 0) dzInv = 2 / (zc[1] - zc[0]);
        else dzInv = 2 / (zc[k] - zc[k - 1]);
        for (let j = 1; j < ny - 1; j += 1) {
          const row = base + j * nx;
          for (let i = 1; i < nx - 1; i += 1) {
            const o = row + i;
            const up = k < nz - 1 ? phi[o + n2d] : phi[o];
            const dn = k > 0 ? phi[o - n2d] : phi[o];
            f.w[o] -= invRhoDt * (up - dn) * dzInv;
          }
        }
      }
    }

    /* ------------------------------------------------------------ dynamics
     * Buoyancy from virtual potential temperature perturbation and
     * hydrometeor loading, Coriolis, MPAS-style divergence damping (which is
     * what lets density currents and gust fronts propagate), sub-grid
     * turbulent diffusion, and the surface layer. */
    function dynamics(dt, doDiffusion) {
      const invdx = 1 / dx;
      const fCor = cfg.coriolis ?? 9.5e-5;
      const G = C.G;
      const CDW = 0.00015; // m-1, quadratic updraft drag
      // The shear-tilting term is only partly represented because the
      // approximate pressure projection does not return the full balancing
      // pressure gradient; the remainder is handled by the storm-scale
      // vorticity equation in wx/storms.js.
      const tiltFactor = cfg.tiltFactor ?? 0.0;

      // --- buoyancy + Coriolis ----------------------------------------
      const U = f.u;
      const V = f.v;
      const W = f.w;
      const THP = f.thp;
      const QV = f.qv;
      const QC = f.qc;
      const QR = f.qr;
      const QS = f.qs;
      const QH = f.qh;
      for (let k = 0; k < nz; k += 1) {
        const base = k * n2d;
        const invTh0 = G / Th0[k];
        const q0 = Qv0[k];
        const th0 = Th0[k];
        for (let idx = 0; idx < n2d; idx += 1) {
          const o = base + idx;
          const thvP = THP[o] * (1 + 0.61 * q0) + th0 * 0.61 * QV[o];
          const hyd = QC[o] + QR[o] + QS[o] + QH[o];
          const wOld = W[o];
          // -w' dU0/dz : tilting the environmental shear into perturbation
          // momentum. This is what generates the rotating updraft.
          U[o] -= tiltFactor * wOld * dU0dz[k] * dt;
          V[o] -= tiltFactor * wOld * dV0dz[k] * dt;
          // quadratic drag standing in for the unresolved non-hydrostatic
          // pressure response; caps w near 0.6*sqrt(2*CAPE) as observed
          W[o] = wOld + (thvP * invTh0 - G * hyd - CDW * Math.abs(wOld) * wOld) * dt;
          const up = U[o];
          const vp = V[o];
          U[o] = up + fCor * vp * dt;
          V[o] = vp - fCor * up * dt;
        }
      }

      // --- anelastic pressure projection -------------------------------
      // Enforces mass continuity  div(rho_bar * V) = 0  by solving a 3-D
      // Poisson problem for the non-hydrostatic pressure perturbation with
      // Jacobi iterations, then removing the resulting gradient from the
      // wind. This is what turns a buoyant column into a real convective
      // circulation: low-level inflow, upper-level outflow, and a mass sink
      // that keeps feeding the updraft with moist boundary-layer air.
      project(dt);

      // --- turbulent diffusion (every other substep) ------------------
      if (doDiffusion) {
        const kh = (cfg.nuH ?? 120) * dt / (dx * dx);
        const kv = (cfg.nuV ?? 4.0) * dt;
        for (let n = 0; n < DIFFUSE_FIELDS.length; n += 1) {
          const a = f[DIFFUSE_FIELDS[n]];
          for (let k = 0; k < nz; k += 1) {
            const base = k * n2d;
            let invDz2 = 0;
            if (k > 0 && k < nz - 1) {
              const dzm = zc[k] - zc[k - 1];
              const dzp = zc[k + 1] - zc[k];
              invDz2 = 1 / (0.5 * (dzm + dzp));
            }
            for (let j = 1; j < ny - 1; j += 1) {
              const row = base + j * nx;
              for (let i = 1; i < nx - 1; i += 1) {
                const o = row + i;
                const c = a[o];
                const lapH = a[o + 1] + a[o - 1] + a[o + nx] + a[o - nx] - 4 * c;
                let lapV = 0;
                if (k > 0 && k < nz - 1) lapV = ((a[o + n2d] - c) / (zc[k + 1] - zc[k]) - (c - a[o - n2d]) / (zc[k] - zc[k - 1])) * invDz2;
                tmp[o] = c + kh * lapH + kv * lapV;
              }
            }
          }
          for (let k = 0; k < nz; k += 1) {
            const base = k * n2d;
            for (let j = 1; j < ny - 1; j += 1) {
              const row = base + j * nx;
              for (let i = 1; i < nx - 1; i += 1) {
                const o = row + i;
                a[o] = tmp[o];
              }
            }
          }
        }
      }

      boundaries(dt);
    }

    /* --------------------------------------------------------- boundaries */
    function boundaries(dt) {
      const sponge = cfg.sponge || 7;
      const rayTop = 3;
      const dampRow = new Float32Array(n2d);
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const edge = Math.min(i, j, nx - 1 - i, ny - 1 - j);
          dampRow[j * nx + i] = edge < sponge ? Math.pow(1 - edge / sponge, 2) : 0;
        }
      }
      const w = clamp(dt * 0.25, 0, 1);
      const U = f.u;
      const V = f.v;
      const W = f.w;
      const THP = f.thp;
      const QV = f.qv;
      const QC = f.qc;
      const QR = f.qr;
      const QS = f.qs;
      const QH = f.qh;
      for (let k = 0; k < nz; k += 1) {
        const base = k * n2d;
        const topDamp = k >= nz - rayTop ? (k - (nz - rayTop - 1)) / (rayTop + 1) : 0;
        for (let idx = 0; idx < n2d; idx += 1) {
          let d = dampRow[idx];
          if (topDamp > d) d = topDamp;
          if (d <= 0) continue;
          const wd = clamp(d * w, 0, 0.9);
          const o = base + idx;
          const keep = 1 - wd;
          U[o] *= keep;
          V[o] *= keep;
          W[o] *= keep;
          THP[o] *= keep;
          QV[o] *= 1 - wd * 0.6;
          QC[o] *= keep;
          QR[o] *= keep;
          QS[o] *= keep;
          QH[o] *= keep;
        }
      }
      // rigid lid and impermeable surface
      for (let idx = 0; idx < n2d; idx += 1) {
        W[(nz - 1) * n2d + idx] = 0;
        W[idx] = 0;
      }
      // Surface drag plus sensible/latent flux. Heating is suppressed under
      // rain and cloud, which is what lets an evaporatively driven cold pool
      // survive instead of being erased by daytime insolation.
      const Cd = cfg.Cd ?? 2.0e-3;
      const heat = (cfg.heatFlux ?? 0.02) * dt * 0.02;
      const moist = (cfg.moistFlux ?? 2.5e-5) * dt * 0.02;
      const dragK = clamp((Cd * dt) / dz[0], 0, 0.4);
      const u0 = U0[0];
      const v0 = V0[0];
      for (let idx = 0; idx < n2d; idx += 1) {
        const sp = Math.hypot(u0 + U[idx], v0 + V[idx]);
        const drag = clamp(dragK * sp, 0, 0.4);
        U[idx] -= U[idx] * drag;
        V[idx] -= V[idx] * drag;
        const wet = clamp((QR[idx] + QC[idx]) * 4000, 0, 1);
        THP[idx] += heat * (1 - wet);
        QV[idx] += moist * (1 - wet * 0.5);
      }

      /* Boundary-layer momentum relaxation. Descending air conserves its
       * momentum in the free atmosphere; in the real boundary layer the
       * pressure gradient and friction remove it. Without this the model's
       * outflow jets run away. Timescale 20 min below 500 m, ramping off by
       * 2 km. */
      // Rayleigh relaxation of the momentum perturbation: short near the
      // surface (friction + the unresolved pressure adjustment), long aloft.
      // Without it the perturbation winds run away from anything a real
      // supercell produces.
      const tauSfc = cfg.tauSfc ?? 850;
      const tauTop = cfg.tauAloft ?? 3000;
      for (let k = 0; k < nz; k += 1) {
        const base = k * n2d;
        const tau = k < 5 ? tauSfc * (1 + 2.2 * k) : lerp(tauSfc * 11, tauTop, clamp((k - 5) / (nz - 5), 0, 1));
        const rate = clamp(dt / tau, 0, 0.25);
        for (let idx = 0; idx < n2d; idx += 1) {
          U[base + idx] *= 1 - rate;
          V[base + idx] *= 1 - rate;
        }
      }
    }

    /* ------------------------------------------------- convective trigger */
    /**
     * Initiation: where low-level convergence piles air up along a boundary
     * and the cap is weak, inject a buoyancy/moisture impulse. This is the
     * standard "convergence + weak CIN" trigger used by parameterized
     * convection schemes; the resolved model then takes over.
     */
    function trigger(dt, t, boundaryForcing) {
      const M = sounding.metrics;
      const capeOk = M.cape > 400 && M.cin < 220;
      if (!capeOk) return;
      const convThresh = 1.6e-4; // 1/s
      for (let j = 2; j < ny - 2; j += 1) {
        for (let i = 2; i < nx - 2; i += 1) {
          const col = j * nx + i;
          let conv = 0;
          for (let k = 0; k < 4; k += 1) {
            const dudx = (f.u[IX(i + 1, j, k)] - f.u[IX(i - 1, j, k)]) * 0.5 / dx;
            const dvdy = (f.v[IX(i, j + 1, k)] - f.v[IX(i, j - 1, k)]) * 0.5 / dx;
            conv += -(dudx + dvdy) * dz[k];
          }
          conv /= 3000;
          convect[col] = conv;
          const boundaryBoost = boundaryForcing ? boundaryForcing(i * dx, j * dx, t) : 0;
          const already = f.qc[IX(i, j, 3)] + f.qr[IX(i, j, 3)];
          if (already > 5e-5) continue;
          const signal = clamp((conv - convThresh) / 4e-4 + boundaryBoost, 0, 1.4);
          if (signal <= 0.02) continue;
          const noise = WX.hash(i, j, Math.floor(t / 300), seed + 7);
          if (noise > 0.12 + signal * 0.2) continue;
          for (let k = 0; k < Math.min(6, nz); k += 1) {
            const idx = IX(i, j, k);
            f.thp[idx] += signal * 0.16 * dt * 0.1;
            f.qv[idx] += signal * 4e-6 * dt * 0.1;
          }
        }
      }
    }

    /* ------------------------------------------------------- diagnostics */
    function computeVorticity() {
      for (let j = 1; j < ny - 1; j += 1) {
        for (let i = 1; i < nx - 1; i += 1) {
          for (let k = 0; k < nz; k += 1) {
            const dvdx = (f.v[IX(i + 1, j, k)] - f.v[IX(i - 1, j, k)]) * 0.5 / dx;
            const dudy = (f.u[IX(i, j + 1, k)] - f.u[IX(i, j - 1, k)]) * 0.5 / dx;
            vortZ[IX(i, j, k)] = dvdx - dudy;
          }
        }
      }
    }

    /** Updraft helicity over a layer (m2/s2), the standard UH diagnostic. */
    function updraftHelicity(kBottom, kTop) {
      const out = new Float32Array(n2d);
      for (let j = 1; j < ny - 1; j += 1) {
        for (let i = 1; i < nx - 1; i += 1) {
          let uh = 0;
          for (let k = kBottom; k < kTop; k += 1) {
            const w = f.w[IX(i, j, k)];
            if (w <= 1) continue;
            const dzk = k < nz - 1 ? zc[k + 1] - zc[k] : dz[k];
            uh += Math.max(0, w - 1) * Math.max(0, vortZ[IX(i, j, k)]) * dzk;
          }
          out[j * nx + i] = uh;
        }
      }
      return out;
    }

    /** Refresh all 2-D diagnostics used by the radar operator and the UI. */
    function updateDerived(dt) {
      computeVorticity();
      const uh = updraftHelicity(2, 8);
      // MESH (Witt et al. 1998): the operational Maximum Expected Size of Hail
      // algorithm, built from the height-weighted severe-hail index.
      const H0 = Math.max(1200, sounding.metrics.freezing);
      const dbzOf = (zmm) => (zmm > 1e-6 ? 10 * Math.log10(zmm) : -99);
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const col = j * nx + i;
          let wmax = 0;
          let cb = 0;
          let ct = 0;
          let zmax = 0;
          let shi = 0;
          for (let k = 0; k < nz; k += 1) {
            const idx = IX(i, j, k);
            const w = f.w[idx];
            if (w > wmax) wmax = w;
            const hyd = f.qc[idx] + f.qr[idx] + f.qs[idx] + f.qh[idx];
            if (hyd > 1.5e-4) {
              if (!cb) cb = zc[k];
              ct = zc[k] + dz[k] / 2;
            }
            const Z = reflectivityFromMixing(idx, k);
            if (Z > zmax) zmax = Z;
            const dzDbz = dbzOf(Z);
            if (dzDbz >= 20) {
              const L = dzDbz < 50 ? (dzDbz - 20) / 30 : 1;
              const zBase = zc[k] - dz[k] / 2;
              let WT = 0;
              if (zc[k] >= H0) WT = 1;
              else if (zc[k] >= H0 - 2400) WT = -0.2 + 0.04 * (zBase / 1000);
              if (WT > 0) shi += L * WT * (dz[k] / 1000);
            }
          }
          cloudBase[col] = cb;
          cloudTop[col] = ct;
          maxUpdraft[col] = wmax;
          maxReflectivity[col] = zmax;
          // MESH in metres: (SHI/50)*(H0 in km) - 0.5 cm
          colHail[col] = Math.max(0, ((shi * 10) / 50) * (H0 / 1000) - 0.5) / 100;
          helicity[col] = uh[col];
          const idx0 = IX(i, j, 0);
          const uu = U0[0] + f.u[idx0] + cfg.motion.u;
          const vv = V0[0] + f.v[idx0] + cfg.motion.v;
          surfaceWind[col * 2] = uu;
          surfaceWind[col * 2 + 1] = vv;
          // 1.25 is the standard 10 m -> peak gust factor; 36 m/s (80 mph) is
        // a physical ceiling for a convective gust outside a tornado
        surfaceGust[col] = Math.min(36, Math.max(surfaceGust[col] * 0.97, Math.hypot(uu, vv) * 1.25));
          coldPool[col] = Math.min(coldPool[col] * 0.99, f.thp[idx0]);
        }
      }
    }

    /**
     * Equivalent reflectivity (mm6/m3, linear) from the hydrometeor mixing
     * ratios at one grid point. Z-M relations are calibrated against
     * Marshall-Palmer spectra with a mixing-ratio-dependent intercept:
     *   rain  Z = 4.0e4 * M^2      (M in g/m3)
     *   snow  Z = 2.0e3 * M^2
     *   hail  Z = 2.6e5 * M^2   (dry hail; ~10x reduction when melting)
     */
    function reflectivityFromMixing(idx, k) {
      const rho = (P0[k] * 100) / (C.RD * ((Th0[k] + f.thp[idx]) * pi[k]));
      const mr = rho * 1000; // kg/m3 -> g/m3 per unit mixing ratio
      const Tc = (Th0[k] + f.thp[idx]) * pi[k] - C.T0;
      const qr = f.qr[idx] * mr;
      const qc = f.qc[idx] * mr;
      const qs = f.qs[idx] * mr;
      const qh = f.qh[idx] * mr;
      let Z = 4.0e4 * qr * qr + 4.0e4 * 0.02 * qc * qc + 2.0e3 * qs * qs + 2.6e5 * qh * qh;
      if (Tc > 0 && qh > 0.05) Z *= 0.25; // melting hail scatters much less
      return Z;
    }

    /* -------------------------------------------------------------- step */
    const timings = { advect: 0, micro: 0, dyn: 0, trig: 0 };
    let stepCount = 0;
    const clock = cfg.clock || null;
    function step(dt, t, boundaryForcing) {
      if (!clock) {
        advectAll(dt);
        microphysics(dt);
        stepCount += 1;
        dynamics(dt, stepCount % 2 === 0);
        trigger(dt, t, boundaryForcing);
        return;
      }
      let a = clock();
      advectAll(dt);
      let b = clock();
      microphysics(dt);
      let c = clock();
      stepCount += 1;
      dynamics(dt, stepCount % 2 === 0);
      let d = clock();
      trigger(dt, t, boundaryForcing);
      let e = clock();
      timings.advect += b - a;
      timings.micro += c - b;
      timings.dyn += d - c;
      timings.trig += e - d;
    }

    /* ------------------------------------------------------------ sampling
     * Trilinear sample of a perturbation field at (x, y) km, z m AGL. */
    function sample(field, x, y, z) {
      const a = typeof field === 'string' ? f[field] : field;
      const gx = x / dx;
      const gy = y / dx;
      if (gx < 0 || gy < 0 || gx > nx - 1 || gy > ny - 1) return 0;
      // vertical weights
      let k0 = 0;
      while (k0 < nz - 2 && zc[k0 + 1] < z) k0 += 1;
      const k1 = Math.min(nz - 1, k0 + 1);
      const tz = clamp((z - zc[k0]) / Math.max(1, zc[k1] - zc[k0]), 0, 1);
      let val = 0;
      for (let kk = k0; kk <= k1; kk += 1) {
        const wz = kk === k0 ? 1 - tz : tz;
        if (wz === 0) continue;
        const base = kk * n2d;
        const i0 = Math.floor(gx);
        const j0 = Math.floor(gy);
        const i1 = Math.min(nx - 1, i0 + 1);
        const j1 = Math.min(ny - 1, j0 + 1);
        const tx = gx - i0;
        const ty = gy - j0;
        const c00 = a[base + j0 * nx + i0];
        const c10 = a[base + j0 * nx + i1];
        const c01 = a[base + j1 * nx + i0];
        const c11 = a[base + j1 * nx + i1];
        val += wz * ((c00 + (c10 - c00) * tx) * (1 - ty) + (c01 + (c11 - c01) * tx) * ty);
      }
      return val;
    }

    /** Full atmospheric state at (x, y) km and z m AGL (real units). */

    /** Level index and interpolation weight for a height (m AGL). */
    function levelAt(z) {
      let k0 = 0;
      while (k0 < nz - 2 && zc[k0 + 1] < z) k0 += 1;
      return k0;
    }
    function levelWeight(z, k0) {
      const k1 = k0 < nz - 1 ? k0 + 1 : nz - 1;
      return clamp((z - zc[k0]) / Math.max(1, zc[k1] - zc[k0]), 0, 1);
    }

    /**
     * Full state at one point using a pre-resolved level, filling `out`.
     * Used by the radar forward operator, which samples hundreds of thousands
     * of gates per scan and cannot afford six independent bilinear searches.
     */
    /* Shared trilinear weights. Allocating a closure per sample cost ~1 us per
     * call, which dominated the radar forward operator; hoisting the weights
     * to module scope and using a plain function makes it ~30 ns. */
    let W0 = 0;
    let W1 = 0;
    let W2 = 0;
    let W3 = 0;
    let W4 = 0;
    let W5 = 0;
    let W6 = 0;
    let W7 = 0;
    function setWeights(i0, j0, tx, ty, wz0, wz1) {
      const cx = 1 - tx;
      const cy = 1 - ty;
      const a = cx * cy;
      const b = tx * cy;
      const c = cx * ty;
      const d = tx * ty;
      W0 = a * wz0;
      W1 = b * wz0;
      W2 = c * wz0;
      W3 = d * wz0;
      W4 = a * wz1;
      W5 = b * wz1;
      W6 = c * wz1;
      W7 = d * wz1;
    }
    function MIX(a, b0, b1, p00, p10, p01, p11) {
      return (
        a[b0 + p00] * W0 +
        a[b0 + p10] * W1 +
        a[b0 + p01] * W2 +
        a[b0 + p11] * W3 +
        a[b1 + p00] * W4 +
        a[b1 + p10] * W5 +
        a[b1 + p01] * W6 +
        a[b1 + p11] * W7
      );
    }

    const _hydOut = { qc: 0, qr: 0, qs: 0, qh: 0, u: 0, v: 0, rho: 0, Tc: 0 };
    /** Only the condensate fields - used by the radar's beam-broadening pass. */
    function hydroFast(gx, gy, k0, tz, out) {
      const o = out || _hydOut;
      const i0 = gx | 0;
      const j0 = gy | 0;
      const i1 = i0 < nx - 1 ? i0 + 1 : i0;
      const j1 = j0 < ny - 1 ? j0 + 1 : j0;
      const tx = gx - i0;
      const ty = gy - j0;
      const k1 = k0 < nz - 1 ? k0 + 1 : nz - 1;
      const b0 = k0 * n2d;
      const b1 = k1 * n2d;
      const p00 = j0 * nx + i0;
      const p10 = j0 * nx + i1;
      const p01 = j1 * nx + i0;
      const p11 = j1 * nx + i1;
      setWeights(i0, j0, tx, ty, 1 - tz, tz);
      o.qc = MIX(f.qc, b0, b1, p00, p10, p01, p11);
      o.qr = MIX(f.qr, b0, b1, p00, p10, p01, p11);
      o.qs = MIX(f.qs, b0, b1, p00, p10, p01, p11);
      o.qh = MIX(f.qh, b0, b1, p00, p10, p01, p11);
      o.u = U0[k0] * (1 - tz) + U0[k1] * tz + MIX(f.u, b0, b1, p00, p10, p01, p11) + cfg.motion.u;
      o.v = V0[k0] * (1 - tz) + V0[k1] * tz + MIX(f.v, b0, b1, p00, p10, p01, p11) + cfg.motion.v;
      const thp = MIX(f.thp, b0, b1, p00, p10, p01, p11);
      const wz0 = 1 - tz;
      const T = (Th0[k0] * wz0 + Th0[k1] * tz + thp) * (pi[k0] * wz0 + pi[k1] * tz);
      o.Tc = T - C.T0;
      o.rho = ((P0[k0] * wz0 + P0[k1] * tz) * 100) / (C.RD * T);
      return o;
    }

    const _fastOut = { T: 0, Tc: 0, p: 0, qv: 0, qc: 0, qr: 0, qs: 0, qh: 0, u: 0, v: 0, w: 0, rho: 0, z: 0 };
    function stateFast(gx, gy, k0, tz, out) {
      const o = out || _fastOut;
      const i0 = gx | 0;
      const j0 = gy | 0;
      const i1 = i0 < nx - 1 ? i0 + 1 : i0;
      const j1 = j0 < ny - 1 ? j0 + 1 : j0;
      const tx = gx - i0;
      const ty = gy - j0;
      const k1 = k0 < nz - 1 ? k0 + 1 : nz - 1;
      const wz0 = 1 - tz;
      const wz1 = tz;
      const b0 = k0 * n2d;
      const b1 = k1 * n2d;
      const p00 = j0 * nx + i0;
      const p10 = j0 * nx + i1;
      const p01 = j1 * nx + i0;
      const p11 = j1 * nx + i1;
      setWeights(i0, j0, tx, ty, wz0, wz1);
      const thp = MIX(f.thp, b0, b1, p00, p10, p01, p11);
      const thBase = Th0[k0] * wz0 + Th0[k1] * wz1;
      const piBase = pi[k0] * wz0 + pi[k1] * wz1;
      const qvBase = Qv0[k0] * wz0 + Qv0[k1] * wz1;
      const pBase = P0[k0] * wz0 + P0[k1] * wz1;
      const T = (thBase + thp) * piBase;
      o.T = T;
      o.Tc = T - C.T0;
      o.p = pBase;
      o.qv = Math.max(0, qvBase + MIX(f.qv, b0, b1, p00, p10, p01, p11));
      o.qc = Math.max(0, MIX(f.qc, b0, b1, p00, p10, p01, p11));
      o.qr = Math.max(0, MIX(f.qr, b0, b1, p00, p10, p01, p11));
      o.qs = Math.max(0, MIX(f.qs, b0, b1, p00, p10, p01, p11));
      o.qh = Math.max(0, MIX(f.qh, b0, b1, p00, p10, p01, p11));
      o.u = U0[k0] * wz0 + U0[k1] * wz1 + MIX(f.u, b0, b1, p00, p10, p01, p11) + cfg.motion.u;
      o.v = V0[k0] * wz0 + V0[k1] * wz1 + MIX(f.v, b0, b1, p00, p10, p01, p11) + cfg.motion.v;
      o.w = MIX(f.w, b0, b1, p00, p10, p01, p11);
      o.rho = (pBase * 100) / (C.RD * T);
      o.z = zc[k0] + (zc[k1] - zc[k0]) * tz;
      return o;
    }

    function stateAt(x, y, z) {
      let k0 = 0;
      while (k0 < nz - 2 && zc[k0 + 1] < z) k0 += 1;
      const k1 = Math.min(nz - 1, k0 + 1);
      const tz = clamp((z - zc[k0]) / Math.max(1, zc[k1] - zc[k0]), 0, 1);
      const mix = (arr) => lerp(arr[k0], arr[k1], tz);
      const thp = sample('thp', x, y, z);
      const qvp = sample('qv', x, y, z);
      const Th = mix(Th0) + thp;
      const ex = mix(pi);
      const T = Th * ex;
      const qv = Math.max(0, mix(Qv0) + qvp);
      const rho = (mix(P0) * 100) / (C.RD * T);
      return {
        T,
        Tc: T - C.T0,
        p: mix(P0),
        qv,
        qc: Math.max(0, sample('qc', x, y, z)),
        qr: Math.max(0, sample('qr', x, y, z)),
        qs: Math.max(0, sample('qs', x, y, z)),
        qh: Math.max(0, sample('qh', x, y, z)),
        u: mix(U0) + sample('u', x, y, z) + cfg.motion.u,
        v: mix(V0) + sample('v', x, y, z) + cfg.motion.v,
        w: sample('w', x, y, z),
        rho,
        z,
      };
    }

    function colIndex(x, y) {
      const i = Math.round(x / dx);
      const j = Math.round(y / dx);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return -1;
      return j * nx + i;
    }

    return {
      nx,
      ny,
      nz,
      dx,
      n2d,
      n3d,
      zc,
      dz,
      zTop,
      T0,
      Th0,
      Qv0,
      U0,
      V0,
      P0,
      pi,
      fields: f,
      rainAccum,
      snowAccum,
      surfaceGust,
      surfaceWind,
      coldPool,
      convect,
      cloudBase,
      cloudTop,
      maxUpdraft,
      maxReflectivity,
      colHail,
      helicity,
      vortZ,
      IX,
      initialise,
      addBubble,
      step,
      updateDerived,
      sample,
      stateAt,
      stateFast,
      hydroFast,
      levelAt,
      levelWeight,
      colIndex,
      reflectivityFromMixing,
      timings,
      microTimings,
    };
  }

  WX.createNWP = createNWP;
})(typeof self !== 'undefined' ? self : globalThis);
