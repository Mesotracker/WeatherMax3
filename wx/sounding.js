/* ============================================================================
 * WeatherMax :: wx/sounding.js
 * Real thermodynamics. Builds a full 3-D-ready environmental sounding from a
 * handful of forecaster inputs, solving for the mid-level lapse rate that
 * reproduces the requested MLCAPE and for the mid-level dry slot that
 * reproduces the requested DCAPE. Everything (LCL, LFC, EL, CAPE, CIN, SRH,
 * STP, SCP, DCAPE, wet-bulb zero) is integrated from the profile — nothing is
 * looked up from a table.
 * ========================================================================== */
(function (global) {
  const WX = (global.WX = global.WX || {});
  const C = WX.C;
  const { clamp, lerp, smoothstep, rad, deg } = WX;

  /* --------------------------------------------------------- vapour physics */
  /** Saturation vapour pressure over water (hPa), Magnus/Alduchov-Eskridge. */
  function esat(Tc) {
    return 6.112 * Math.exp((17.67 * Tc) / (Tc + 243.5));
  }
  /** Saturation vapour pressure over ice (hPa). */
  function esatIce(Tc) {
    return 6.112 * Math.exp((22.46 * Tc) / (Tc + 272.62));
  }
  function qsat(Tc, p_hPa) {
    const e = esat(Tc);
    return (C.EPS * e) / Math.max(1e-3, p_hPa - e);
  }
  /** Inverse Magnus: dewpoint (deg C) from vapour pressure (hPa). */
  function dewpointFromE(e) {
    const l = Math.log(Math.max(1e-9, e) / 6.112);
    return (243.5 * l) / (17.67 - l);
  }
  function dewpointFromQ(q, p_hPa) {
    const e = (q * p_hPa) / (C.EPS + q);
    return dewpointFromE(e);
  }
  function tv(T, qv) {
    return T * (1 + 0.61 * qv);
  }
  /** Equivalent potential temperature (Bolton 1980 eq. 39). */
  function thetaE(T, p_hPa, qv) {
    const tl = lclTemperature(T, qv, p_hPa);
    const theta = T * Math.pow(1000 / p_hPa, 0.2854 * (1 - 0.28 * qv));
    return theta * Math.exp(((3.376 / tl - 0.00254) * 1000 * qv * (1 + 0.81 * qv)));
  }
  /** Bolton (1980) LCL temperature from T (K), qv (kg/kg), p (hPa). */
  function lclTemperature(T, qv, p_hPa) {
    const e = Math.max(1e-4, (qv * p_hPa) / (C.EPS + qv));
    return 55 + 2840 / (3.5 * Math.log(T) - Math.log(e) - 4.805);
  }

  /* -------------------------------------------------- saturated pseudo-adiabat
   * dT/dp for a saturated parcel with pseudoadiabatic condensate removal. */
  function dTdP_saturated(T, p_hPa) {
    const Tc = T - C.T0;
    const e = esat(Tc);
    const qs = (C.EPS * e) / Math.max(1e-3, p_hPa - e);
    const num = (C.RD * T) / p_hPa + (C.LV * qs) / p_hPa;
    const den = C.CP + (C.LV * C.LV * qs * (C.EPS + qs)) / (C.RD * T * T);
    return num / den;
  }

  /**
   * Lift (dp<0) or lower (dp>0) a saturated parcel from p0 to p1.
   * Returns the temperature at p1.
   */
  function moistAdiabat(p0, p1, T0, steps = 40) {
    let T = T0;
    let p = p0;
    const dp = (p1 - p0) / steps;
    for (let i = 0; i < steps; i += 1) {
      T += dTdP_saturated(T, p) * dp;
      p += dp;
    }
    return T;
  }

  /* ------------------------------------------------------- profile generation
   * The temperature profile is described by a height-dependent lapse rate:
   *   Gamma(z) = Gl*exp(-z/zm) + Gm*(1-exp(-z/zm))          z < 8 km
   *   Gamma(z) = Gm - (Gm-Gs)*smoothstep(8km,4km,z)         z >= 8 km
   * Gm is bisected until the mixed-layer CAPE equals the target. */
  function lapseRate(z, Gl, Gm, Gs) {
    const zm = 1400;
    const w = Math.exp(-z / zm);
    let g = Gl * w + Gm * (1 - w);
    if (z > 8000) g = Gm - (Gm - Gs) * smoothstep(8000, 4000, z);
    return g;
  }

  const PROFILE_DZ = 200; // m
  const PROFILE_ZMAX = 16000; // m
  const PROFILE_N = Math.round(PROFILE_ZMAX / PROFILE_DZ) + 1;

  /**
   * Build the environmental profile on fixed height levels.
   * options: { Gl, Gm, Gs, qvML, qScaleHeight, dryness, wind params ... }
   */
  function buildProfile(opts) {
    const n = PROFILE_N;
    const z = new Float64Array(n);
    const T = new Float64Array(n);
    const Td = new Float64Array(n);
    const qv = new Float64Array(n);
    const p = new Float64Array(n);
    const u = new Float64Array(n);
    const v = new Float64Array(n);

    const zML = 1200;
    const qvML = opts.qvML;
    for (let k = 0; k < n; k += 1) {
      const zk = k * PROFILE_DZ;
      z[k] = zk;
      // temperature by integrating the lapse rate
      if (k === 0) T[k] = opts.Tsfc;
      else T[k] = T[k - 1] - 0.5 * (lapseRate(z[k - 1], opts.Gl, opts.Gm, opts.Gs) + lapseRate(z[k], opts.Gl, opts.Gm, opts.Gs)) * PROFILE_DZ / 1000;
      // moisture: constant mixing ratio through the mixed layer, exponential
      // decay above, with a mid-level dry slot whose depth sets DCAPE.
      let q;
      if (zk <= zML) {
        q = qvML;
      } else {
        q = qvML * Math.exp(-(zk - zML) / opts.qScaleHeight);
        const slot = Math.exp(-Math.pow((zk - 3800) / 1900, 2));
        q *= 1 - clamp(opts.dryness, 0, 0.96) * slot;
      }
      qv[k] = Math.max(1e-7, q);
      // pressure from the hypsometric equation
      if (k === 0) p[k] = opts.psfc;
      else {
        const tvMean = 0.5 * (tv(T[k - 1], qv[k - 1]) + tv(T[k], qv[k]));
        p[k] = p[k - 1] * Math.exp((-C.G * PROFILE_DZ) / (C.RD * tvMean));
      }
      const Tdc = dewpointFromQ(qv[k], p[k]);
      Td[k] = Math.min(T[k] - 0.6, Tdc + C.T0);
      qv[k] = Math.min(qv[k], qsat(Td[k] - C.T0, p[k]));
    }

    // winds on the same levels
    const wind = opts.windAt;
    for (let k = 0; k < n; k += 1) {
      const w = wind(z[k]);
      u[k] = w.u;
      v[k] = w.v;
    }
    return { n, dz: PROFILE_DZ, z, T, Td, qv, p, u, v };
  }

  /* ------------------------------------------------------------------ parcel
   * Mixed-layer parcel: mean theta and qv of the lowest 100 hPa, lifted dry
   * adiabatically to the LCL then pseudoadiabatically. Returns the parcel
   * temperature on every profile level (NaN below the LCL). */
  function liftParcel(prof) {
    const { n, z, T, Td, qv, p } = prof;
    // mixed layer = lowest 100 hPa
    const pSfc = p[0];
    let sumT = 0;
    let sumQ = 0;
    let count = 0;
    for (let k = 0; k < n && p[k] > pSfc - 100; k += 1) {
      sumT += T[k];
      sumQ += qv[k];
      count += 1;
    }
    const Tml = sumT / count;
    const qml = sumQ / count;
    // pressure of the mixed-layer mean state
    let pml = 0;
    let c2 = 0;
    for (let k = 0; k < n && p[k] > pSfc - 100; k += 1) {
      pml += p[k];
      c2 += 1;
    }
    pml /= c2;

    const eSfc = (qml * pml) / (C.EPS + qml);
    const TdmlC = dewpointFromE(eSfc);
    const TlclK = 55 + 2840 / (3.5 * Math.log(Tml) - Math.log(eSfc) - 4.805);
    const zlcl = Math.max(0, ((Tml - TlclK) / 8.0) * 1000);

    const parcelT = new Float64Array(n);
    let Tsat = TlclK;
    let pPrev = null;
    for (let k = 0; k < n; k += 1) {
      if (z[k] < zlcl) {
        // dry adiabat: theta constant
        const theta = Tml * Math.pow(1000 / pml, C.RD / C.CP);
        parcelT[k] = theta * Math.pow(p[k] / 1000, C.RD / C.CP);
      } else {
        if (pPrev === null) {
          Tsat = TlclK;
          pPrev = p[k] || pml;
        }
        if (k > 0) Tsat = moistAdiabat(pPrev, p[k], Tsat, 4);
        parcelT[k] = Tsat;
        pPrev = p[k];
      }
    }
    return { parcelT, zlcl, Tml, qml, TlclK, TdmlC };
  }

  /* --------------------------------------------------------------- buoyancy */
  function buoyancy(prof, parcelT, k) {
    const qvs = qsat(parcelT[k] - C.T0, prof.p[k]);
    const tvPar = parcelT[k] * (1 + 0.61 * qvs);
    const tvEnv = tv(prof.T[k], prof.qv[k]);
    return C.G * (tvPar / tvEnv - 1);
  }

  function capeCin(prof, parcel) {
    const { n, z } = prof;
    let cape = 0;
    let cin = 0;
    let lfc = null;
    let el = null;
    let inCloud = false;
    for (let k = 0; k < n - 1; k += 1) {
      if (z[k] < parcel.zlcl) continue;
      const B = 0.5 * (buoyancy(prof, parcel.parcelT, k) + buoyancy(prof, parcel.parcelT, k + 1));
      const dz = z[k + 1] - z[k];
      if (B > 0) {
        if (!inCloud) {
          inCloud = true;
          lfc = z[k];
        }
        el = z[k + 1];
        cape += B * dz;
      } else if (inCloud) {
        // continue through small negative layers inside the cloud layer
        if (B < -2.0) inCloud = false;
      } else {
        cin += -B * dz;
      }
    }
    return { cape, cin, lfc, el };
  }

  function dcape(prof) {
    /* Downdraft CAPE. The source level is the minimum theta-e level between
     * 700 and 400 hPa (Rasmussen & Blanchard 1998). The parcel that descends
     * is the *wet bulb* at that level: the saturated temperature whose theta-e
     * equals the environmental theta-e. That is what a real downdraft does -
     * it evaporates only as much water as the environment can supply - and it
     * is what makes DCAPE respond to a dry mid-level slot. */
    const { n, z, T, qv, p } = prof;
    let kMin = -1;
    let minTe = Infinity;
    for (let k = 0; k < n; k += 1) {
      if (p[k] > 700 || p[k] < 400) continue;
      const te = thetaE(T[k], p[k], qv[k]);
      if (te < minTe) {
        minTe = te;
        kMin = k;
      }
    }
    if (kMin < 1) return 0;

    const TdEnv = dewpointFromQ(qv[kMin], p[kMin]) + C.T0;
    let lo = TdEnv - 2;
    let hi = T[kMin];
    for (let i = 0; i < 24; i += 1) {
      const mid = 0.5 * (lo + hi);
      const te = thetaE(mid, p[kMin], qsat(mid - C.T0, p[kMin]));
      if (te < minTe) lo = mid;
      else hi = mid;
    }
    let Tp = 0.5 * (lo + hi);

    let total = 0;
    for (let k = kMin; k > 0; k -= 1) {
      Tp = moistAdiabat(p[k], p[k - 1], Tp, 4);
      const qs = qsat(Tp - C.T0, p[k - 1]);
      const tvPar = Tp * (1 + 0.61 * qs);
      const tvEnv = tv(prof.T[k - 1], prof.qv[k - 1]);
      const B = C.G * (tvEnv / tvPar - 1);
      if (B > 0) total += B * (z[k] - z[k - 1]);
    }
    return total;
  }

  /* ---------------------------------------------------------- wind/hodograph
   * Curved hodograph through four control points (0, 1, 3, 6 km). The 1 km
   * wind is found by a small search over speed and direction so that the
   * 0-1 km storm-relative helicity matches the requested value while the
   * low-level jet stays physically plausible. */
  function meanWind(wind, zBottom, zTop) {
    let su = 0;
    let sv = 0;
    let n = 0;
    for (let z = zBottom; z <= zTop; z += 100) {
      const w = wind(z);
      su += w.u;
      sv += w.v;
      n += 1;
    }
    return { u: su / n, v: sv / n };
  }

  /** Bunkers et al. (2000) right-moving supercell motion: the 0-6 km mean
   *  wind plus 7.5 m/s to the right of the 0-6 km bulk shear vector. */
  function bunkersRight(wind) {
    const m = meanWind(wind, 0, 6000);
    const s = meanWind(wind, 0, 500);
    const s6 = wind(6000);
    const du = s6.u - s.u;
    const dv = s6.v - s.v;
    const mag = Math.hypot(du, dv) || 1;
    const rx = dv / mag;
    const ry = -du / mag;
    return { u: m.u + 7.5 * rx, v: m.v + 7.5 * ry };
  }

  /**
   * Storm-relative helicity (m2 s-2) over a layer using the discrete form of
   * integral (V - C) x dV/dz dz  ==  sum (va*du - ua*dv).
   */
  function srhBetween(wind, uC, vC, zBottom, zTop, dz = 100) {
    let srh = 0;
    for (let z = zBottom; z < zTop; z += dz) {
      const a = wind(z);
      const b = wind(z + dz);
      const ua = a.u - uC;
      const va = a.v - vC;
      const ub = b.u - uC;
      const vb = b.v - vC;
      srh += va * (ub - ua) - ua * (vb - va);
    }
    return srh;
  }

  function makeWind(cp) {
    const { u0, v0, u6, v6, u1, v1, u3, v3 } = cp;
    const zs = [0, 1000, 3000, 6000, 12000, 16000];
    const us = [u0, u1, u3, u6, u6 * 1.06, u6 * 1.06];
    const vs = [v0, v1, v3, v6, v6 * 1.06, v6 * 1.06];
    return function (z) {
      for (let i = 0; i < zs.length - 1; i += 1) {
        if (z <= zs[i + 1]) {
          const t = (z - zs[i]) / (zs[i + 1] - zs[i]);
          return { u: lerp(us[i], us[i + 1], t), v: lerp(vs[i], vs[i + 1], t) };
        }
      }
      return { u: us[5], v: vs[5] };
    };
  }

  /** Meteorological "wind from" azimuth (deg) for a u/v vector. */
  function metFrom(u, v) {
    return (deg(Math.atan2(-u, -v)) + 360) % 360;
  }
  function angLerp(a, b, t) {
    const d = (((b - a + 540) % 360) - 180);
    return a + d * t;
  }
  function uvFromMet(dirFrom, speed) {
    return { u: -Math.sin(rad(dirFrom)) * speed, v: -Math.cos(rad(dirFrom)) * speed };
  }

  /**
   * Fit the 1 km / 3 km hodograph control points to a target 0-1 km SRH.
   * Returns { cp, srh, motion }.
   */
  function fitHodograph(u0, v0, u6, v6, srhTarget) {
    const S6 = Math.hypot(u6 - u0, v6 - v0);
    const d6 = metFrom(u6, v6);
    const sp6 = Math.hypot(u6, v6);
    const lljTarget = clamp(0.42 * S6 + 9, 11, 32);
    const d0 = metFrom(u0, v0);
    let best = null;
    for (let si = 0; si < 7; si += 1) {
      const s1 = clamp(S6 * (0.3 + 0.09 * si), 8, 42);
      for (let di = 0; di < 11; di += 1) {
        const d1 = d6 - 110 + 14 * di;
        const a = uvFromMet(d1, s1);
        // 3 km point: interpolate the "from" direction and speed toward 6 km
        const d3 = angLerp(angLerp(d0, d1, 1), d6, 0.6);
        const s3 = lerp(s1, sp6, 0.58);
        const b = uvFromMet(d3, s3);
        const cp = { u0, v0, u6, v6, u1: a.u, v1: a.v, u3: b.u, v3: b.v };
        const wind = makeWind(cp);
        const m = bunkersRight(wind);
        const srh = srhBetween(wind, m.u, m.v, 0, 1000);
        const score = Math.pow((srh - srhTarget) / 55, 2) + Math.pow((s1 - lljTarget) / 3.5, 2) * 0.35;
        if (!best || score < best.score) best = { cp, srh, motion: m, score, s1, d1 };
      }
    }
    // Local refinement: scale the 1 km wind about its best guess.
    for (let i = 0; i < 22; i += 1) {
      const f = 0.82 + i * 0.018;
      const s1 = best.s1 * f;
      const a = uvFromMet(best.d1, s1);
      const d3 = angLerp(angLerp(metFrom(u0, v0), best.d1, 1), d6, 0.6);
      const b = uvFromMet(d3, lerp(s1, sp6, 0.58));
      const cp = { u0, v0, u6, v6, u1: a.u, v1: a.v, u3: b.u, v3: b.v };
      const wind = makeWind(cp);
      const m = bunkersRight(wind);
      const srh = srhBetween(wind, m.u, m.v, 0, 1000);
      const score = Math.pow((srh - srhTarget) / 55, 2) + Math.pow((s1 - lljTarget) / 3.5, 2) * 0.35;
      if (score < best.score) best = { cp, srh, motion: m, score, s1, d1: best.d1 };
    }
    return best;
  }

  /* ---------------------------------------------------------------- builder
   * Solves for Gm (CAPE) and dryness (DCAPE) with bisection, then fits the
   * hodograph curvature to the requested 0-1 km SRH. */
  function buildSounding(input) {
    const TsfcF = clamp(input.temperature ?? 78, -20, 115);
    const TdSfcF = clamp(Math.min(input.dewpoint ?? 66, TsfcF), -40, 95);
    const Tsfc = ((TsfcF - 32) * 5) / 9 + C.T0;
    const TdSfc = ((TdSfcF - 32) * 5) / 9 + C.T0;
    const psfc = clamp(input.pressure ?? 990, 900, 1050);
    const capeTarget = clamp(input.cape ?? 2400, 0, 7000);
    const shear06Target = clamp(input.shear ?? 45, 5, 130) * C.KT_TO_MPS;
    const srhTarget = clamp(input.helicity ?? 180, 0, 900);
    const dcapeTarget = clamp(input.dcape ?? 1100, 100, 3000);

    // Surface mixing ratio from the surface dewpoint.
    const esfc = esat(TdSfc - C.T0);
    const qvML = (C.EPS * esfc) / (psfc - esfc);
    const Gl = 8.6;
    const Gs = 3.2;

    // --- wind hodograph end points ---------------------------------------
    // The 0-6 km shear vector points toward `shearAzimuthTo` (meteorological
    // "toward" azimuth); the default is a southwest flow aloft over backed
    // surface southeasterlies, the classic Plains severe setup.
    const shearTo = rad(input.shearAzimuthTo ?? 55);
    const du = Math.sin(shearTo) * shear06Target;
    const dv = Math.cos(shearTo) * shear06Target;
    const sfc = uvFromMet(input.sfcWindDir ?? 195, clamp(input.sfcWindSpeed ?? 6.5, 1, 20));
    const u0 = sfc.u;
    const v0 = sfc.v;
    const u6 = u0 + du;
    const v6 = v0 + dv;

    // Fit the 1 km / 3 km hodograph shape to the requested 0-1 km SRH.
    const fit = fitHodograph(u0, v0, u6, v6, srhTarget);
    const wind = makeWind(fit.cp);

    // --- mid-level lapse rate that reproduces the target MLCAPE -----------
    function solve(Gm, dryness) {
      const prof = buildProfile({ Tsfc, psfc, Gl, Gm, Gs, qvML, qScaleHeight: 2200, dryness, windAt: wind });
      const parcel = liftParcel(prof);
      const cc = capeCin(prof, parcel);
      return { prof, parcel, cape: cc.cape, cin: cc.cin, lfc: cc.lfc, el: cc.el };
    }
    let lo = 4.2;
    let hi = 9.6;
    let sol = solve(0.5 * (lo + hi), 0.25);
    for (let i = 0; i < 18; i += 1) {
      const mid = 0.5 * (lo + hi);
      sol = solve(mid, 0.25);
      if (sol.cape < capeTarget) lo = mid;
      else hi = mid;
    }
    const Gm = 0.5 * (lo + hi);

    // --- mid-level dry slot that reproduces the target DCAPE --------------
    let dlo = 0;
    let dhi = 0.96;
    let dcapeVal = dcape(solve(Gm, 0.5 * (dlo + dhi)).prof);
    for (let i = 0; i < 12; i += 1) {
      const mid = 0.5 * (dlo + dhi);
      dcapeVal = dcape(solve(Gm, mid).prof);
      if (dcapeVal < dcapeTarget) dlo = mid;
      else dhi = mid;
    }
    const dryness = 0.5 * (dlo + dhi);

    const prof = buildProfile({ Tsfc, psfc, Gl, Gm, Gs, qvML, qScaleHeight: 2200, dryness, windAt: wind });
    const parcel = liftParcel(prof);
    const cc = capeCin(prof, parcel);
    dcapeVal = dcape(prof);
    const stormMotion = bunkersRight(wind);
    const srh01 = srhBetween(wind, stormMotion.u, stormMotion.v, 0, 1000);
    const srh03 = srhBetween(wind, stormMotion.u, stormMotion.v, 0, 3000);
    const shear06 = Math.hypot(wind(6000).u - wind(0).u, wind(6000).v - wind(0).v);
    const shear01 = Math.hypot(wind(1000).u - wind(0).u, wind(1000).v - wind(0).v);
    const shear03 = Math.hypot(wind(3000).u - wind(0).u, wind(3000).v - wind(0).v);
    const mean05 = meanWind(wind, 0, 500);
    const brnShear = 0.5 * Math.hypot(wind(6000).u - mean05.u, wind(6000).v - mean05.v);

    // --- derived levels ---------------------------------------------------
    let freezing = 0;
    for (let k = 0; k < prof.n - 1; k += 1) {
      if (prof.T[k] > C.T0 && prof.T[k + 1] <= C.T0) {
        freezing = lerp(prof.z[k], prof.z[k + 1], (prof.T[k] - C.T0) / Math.max(0.01, prof.T[k] - prof.T[k + 1]));
      }
    }
    // Wet-bulb zero: follow the saturated moist adiabat upward from the LCL
    // until it crosses 0 degC, then map that pressure onto the profile.
    let wbz = 0;
    {
      let pPrev = prof.p[0] - parcel.zlcl * 0.11; // ~ hydrostatic, 0.11 hPa/m
      let Tp = parcel.TlclK;
      for (let dp = 20; pPrev > 60; dp = 20) {
        const pNext = pPrev - dp;
        const Tn = moistAdiabat(pPrev, pNext, Tp, 3);
        if (Tn < C.T0) {
          const frac = (Tp - C.T0) / Math.max(0.01, Tp - Tn);
          const pWbz = lerp(pPrev, pNext, frac);
          let kk = 0;
          for (let k = 0; k < prof.n - 1; k += 1) if (prof.p[k] > pWbz) kk = k;
          const t = (prof.p[kk] - pWbz) / Math.max(0.01, prof.p[kk] - prof.p[kk + 1]);
          wbz = lerp(prof.z[kk], prof.z[kk + 1], clamp(t, 0, 1));
          break;
        }
        Tp = Tn;
        pPrev = pNext;
      }
    }
    let k700 = 0;
    let k500 = 0;
    for (let k = 0; k < prof.n; k += 1) {
      if (prof.p[k] > 700) k700 = k;
      if (prof.p[k] > 500) k500 = k;
    }
    const lapse700500 = ((prof.T[k700] - prof.T[k500]) / Math.max(1, prof.z[k500] - prof.z[k700])) * 1000;

    // Precipitable water (inches).
    let pwat = 0;
    for (let k = 0; k < prof.n - 1; k += 1) {
      const rho = (prof.p[k] * 100) / (C.RD * prof.T[k]);
      pwat += 0.5 * (prof.qv[k] + prof.qv[k + 1]) * rho * PROFILE_DZ;
    }
    pwat /= C.IN_TO_MM;

    // --- composite indices (published fixed-layer formulations) -----------
    const mllcl = parcel.zlcl;
    const esrh = clamp(srh01, 0, 600);
    const ebwd = clamp(shear06 * C.MPS_TO_KT, 5, 80);
    const capeN = clamp(cc.cape / 1500, 0, 2.2);
    const srhN = clamp(esrh / 150, 0, 2.0);
    const lclN = clamp((2000 - mllcl) / 1000, 0, 1);
    const shearN = clamp((ebwd - 12.5) / 20, 0, 1.5);
    const cinPenalty = cc.cin > 200 ? clamp((200 - cc.cin) / 150, 0, 1) : 1;
    const stp = capeN * srhN * lclN * shearN * cinPenalty;
    const scp =
      clamp(cc.cape / 1000, 0, 4) *
      clamp(esrh / 50, 0, 3) *
      clamp((lapse700500 - 4) / 5.5, 0, 3) *
      (mllcl < 1200 ? 1 : 0.5);

    return {
      profile: prof,
      input: { temperature: TsfcF, dewpoint: TdSfcF, shear: shear06Target * C.MPS_TO_KT, cape: capeTarget, helicity: srhTarget, dcape: dcapeTarget },
      Gm,
      dryness,
      hodograph: fit.cp,
      metrics: {
        cape: Math.round(cc.cape),
        cin: Math.round(cc.cin),
        lcl: Math.round(mllcl),
        lfc: Math.round(cc.lfc ?? 0),
        el: Math.round(cc.el ?? 0),
        dcape: Math.round(dcapeVal),
        srh01: Math.round(srh01),
        srh03: Math.round(srh03),
        shear01: Math.round(shear01 * C.MPS_TO_KT),
        shear03: Math.round(shear03 * C.MPS_TO_KT),
        shear06: Math.round(shear06 * C.MPS_TO_KT),
        brnShear: Math.round(brnShear * C.MPS_TO_KT),
        stp: Math.round(stp * 10) / 10,
        scp: Math.round(scp * 10) / 10,
        lapse700500: Math.round(lapse700500 * 10) / 10,
        freezing: Math.round(freezing),
        wbz: Math.round(wbz),
        pwat: Math.round(pwat * 10) / 10,
        motion: {
          u: stormMotion.u,
          v: stormMotion.v,
          speed: Math.hypot(stormMotion.u, stormMotion.v),
          // meteorological direction the storm moves TOWARD is the vector
          // direction; "from" is the convention used on the hodograph
          met: (((Math.atan2(stormMotion.u, stormMotion.v) * 180) / Math.PI + 360) % 360),
        },
        parcelT: parcel.parcelT,
        Tml: parcel.Tml,
        qml: parcel.qml,
        windAtKm1: (() => { const w = wind(1000); return { speed: Math.hypot(w.u, w.v), from: metFrom(w.u, w.v) }; })(),
      },
      windAt: wind,
      at(z) {
        const f = clamp(z / PROFILE_DZ, 0, prof.n - 1.001);
        const k = f | 0;
        const t = f - k;
        return {
          z,
          p: lerp(prof.p[k], prof.p[k + 1], t),
          T: lerp(prof.T[k], prof.T[k + 1], t),
          Td: lerp(prof.Td[k], prof.Td[k + 1], t),
          qv: lerp(prof.qv[k], prof.qv[k + 1], t),
          u: lerp(prof.u[k], prof.u[k + 1], t),
          v: lerp(prof.v[k], prof.v[k + 1], t),
        };
      },
    };
  }

  /* Fast table lookups (0.25 degC resolution) used inside the model's
   * microphysics inner loop, where Math.exp would dominate the cost. */
  const ES_MIN = -80;
  const ES_MAX = 50;
  const ES_STEP = 0.25;
  const ES_TAB = new Float64Array(Math.round((ES_MAX - ES_MIN) / ES_STEP) + 2);
  const ESI_TAB = new Float64Array(ES_TAB.length);
  for (let i = 0; i < ES_TAB.length; i += 1) {
    const t = ES_MIN + i * ES_STEP;
    ES_TAB[i] = esat(t);
    ESI_TAB[i] = esatIce(t);
  }
  function esatFast(Tc) {
    const f = (Tc - ES_MIN) / ES_STEP;
    if (f <= 0) return ES_TAB[0];
    if (f >= ES_TAB.length - 2) return ES_TAB[ES_TAB.length - 1];
    const i = f | 0;
    return ES_TAB[i] + (ES_TAB[i + 1] - ES_TAB[i]) * (f - i);
  }
  function esatIceFast(Tc) {
    const f = (Tc - ES_MIN) / ES_STEP;
    if (f <= 0) return ESI_TAB[0];
    if (f >= ESI_TAB.length - 2) return ESI_TAB[ESI_TAB.length - 1];
    const i = f | 0;
    return ESI_TAB[i] + (ESI_TAB[i + 1] - ESI_TAB[i]) * (f - i);
  }
  WX.esatFast = esatFast;
  WX.esatIceFast = esatIceFast;
  WX.esatIce = esatIce;
  WX.esat = esat;
  WX.qsat = qsat;
  WX.dewpointFromQ = dewpointFromQ;
  WX.moistAdiabat = moistAdiabat;
  WX.buildSounding = buildSounding;
  WX.srhBetween = srhBetween;
  WX.bunkersRight = bunkersRight;
  WX.thetaE = thetaE;
})(typeof self !== 'undefined' ? self : globalThis);
