/* ============================================================================
 * WeatherMax :: wx/storms.js
 * Convective-scale elements diagnosed from, and coupled back to, the NWP core.
 * A 5 km grid cannot resolve a 6 km updraft, so each convective element is
 * carried as an explicit object whose properties obey real relationships:
 *
 *   mesocyclone  d(zeta)/dt = tilting(streamwise vorticity) + stretching
 *                             - frictional spin-down
 *   hail         D_max from the suspension criterion w_up = Vt(D),
 *                Vt = 126 D^0.567 (observed dry-hail fall speeds)
 *   downburst    gust = 0.75 * sqrt(2 * DCAPE) + precipitation loading
 *   tornado      low-level vorticity threshold + STP-style modulation
 *
 * Elements are found at updraft maxima in the model, advected by the
 * Bunkers storm-relative flow plus a propagation term, and clustered into
 * systems (isolated / multicell / line / bow) whose geometry drives the
 * leading-edge segments, bookend vortices and mesovortices.
 * ========================================================================== */
(function (global) {
  const WX = (global.WX = global.WX || {});
  const C = WX.C;
  const { clamp, lerp, hash } = WX;

  const HAIL_VT_A = 126; // Vt = A * D^B, D in metres
  const HAIL_VT_B = 0.567;
  const MSL_TO_MPH = C.MPS_TO_MPH;

  /** Fall speed (m/s) of a hailstone of diameter D (m). */
  function hailFallSpeed(D) {
    return HAIL_VT_A * Math.pow(Math.max(D, 1e-4), HAIL_VT_B);
  }
  /** Largest hailstone an updraft of w (m/s) can suspend, in metres. */
  function hailSizeFromUpdraft(w) {
    if (w <= 2) return 0;
    return Math.pow(w / HAIL_VT_A, 1 / HAIL_VT_B);
  }

  function createStormField(cfg) {
    const grid = cfg.grid;
    const sounding = cfg.sounding;
    const metrics = sounding.metrics;
    const motion = metrics.motion;
    const dx = grid.dx;
    const elements = [];
    const systems = [];
    let nextId = 1;
    let time = 0;

    const meanFlow = {
      u3: (sounding.windAt(3000).u + sounding.windAt(6000).u) / 2,
      v3: (sounding.windAt(3000).v + sounding.windAt(6000).v) / 2,
    };
    const shear06 = (metrics.shear06 || 40) * C.KT_TO_MPS;
    const shearRate = shear06 / 6000; // s-1
    const srh01 = Math.max(0, metrics.srh01);
    const streamwiseFrac = clamp(srh01 / Math.max(1, 150 + 8 * metrics.shear06), 0.05, 1.6);

    /* ------------------------------------------------ element lifecycle */
    function findElements() {
      const w = grid.maxUpdraft;
      const cb = grid.cloudBase;
      const step = 2;
      const candidates = [];
      for (let j = 2; j < grid.ny - 2; j += step) {
        for (let i = 2; i < grid.nx - 2; i += step) {
          const c = j * grid.nx + i;
          if (w[c] < 10 || cb[c] < 100) continue;
          let isMax = true;
          for (let dj = -1; dj <= 1 && isMax; dj += 1) {
            for (let di = -1; di <= 1; di += 1) {
              if (!di && !dj) continue;
              if (w[(j + dj) * grid.nx + (i + di)] > w[c]) isMax = false;
            }
          }
          if (!isMax) continue;
          candidates.push({ x: i * dx, y: j * dx, w: w[c], col: c });
        }
      }
      return candidates;
    }

    function elementNear(x, y, radius) {
      let best = null;
      let bestD = radius * radius;
      for (const el of elements) {
        const d = (el.x - x) ** 2 + (el.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = el;
        }
      }
      return best;
    }

    function createElement(x, y, w, col) {
      const el = {
        id: nextId++,
        x,
        y,
        age: 0,
        life: 0,
        w,
        wPeak: w,
        zeta: 0,
        zetaLow: 0,
        tilt: 0,
        rotationSign: hash(Math.round(x), Math.round(y), 3, cfg.seed || 1) > 0.5 ? 1 : -1,
        hail: 0,
        hailSize: 0,
        precip: 0,
        gust: 0,
        tornado: null,
        tornadoHistory: [],
        dead: false,
        hookPhase: 0,
        rfd: 0,
        system: null,
        seed: (Math.round(x * 13 + y * 7) % 100000) + 1,
        track: [],
      };
      el.rotationSign = srh01 >= 0 ? 1 : -1; // positive SRH -> cyclonic (NH)
      elements.push(el);
      return el;
    }

    /* --------------------------------------------------------- systems */
    /** Single-linkage clustering of elements into convective systems. */
    function clusterSystems(linkKm = 18) {
      systems.length = 0;
      const link = linkKm * 1000;
      const visited = new Set();
      for (const el of elements) {
        if (visited.has(el.id)) continue;
        const members = [el];
        visited.add(el.id);
        let grew = true;
        while (grew) {
          grew = false;
          for (const other of elements) {
            if (visited.has(other.id)) continue;
            for (const m of members) {
              if (Math.hypot(other.x - m.x, other.y - m.y) < link) {
                members.push(other);
                visited.add(other.id);
                grew = true;
                break;
              }
            }
          }
        }
        systems.push(buildSystem(members));
      }
      for (const sys of systems) for (const m of sys.members) m.system = sys;
    }

    function buildSystem(members) {
      let cx = 0;
      let cy = 0;
      let wsum = 0;
      for (const m of members) {
        cx += m.x * m.w;
        cy += m.y * m.w;
        wsum += m.w;
      }
      cx /= wsum || 1;
      cy /= wsum || 1;
      // principal axis via the covariance of member positions
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (const m of members) {
        const a = m.x - cx;
        const b = m.y - cy;
        sxx += a * a;
        syy += b * b;
        sxy += a * b;
      }
      const n = members.length;
      sxx /= n;
      syy /= n;
      sxy /= n;
      const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const extent = Math.sqrt(Math.max(sxx, syy));
      // bowing: project members onto the axis normal to the direction of
      // motion and see whether the centre leads the flanks
      const mdirX = motion.u / (motion.speed || 1);
      const mdirY = motion.v / (motion.speed || 1);
      let bowAmount = 0;
      if (n >= 3) {
        const along = [];
        for (const m of members) along.push({ p: (m.x - cx) * mdirX + (m.y - cy) * mdirY, cross: -(m.x - cx) * mdirY + (m.y - cy) * mdirX });
        along.sort((a, b) => a.cross - b.cross);
        const mid = along[Math.floor(along.length / 2)];
        const flanks = (along[0].p + along[along.length - 1].p) / 2;
        bowAmount = clamp((mid.p - flanks) / Math.max(5000, extent), -0.6, 1.4);
      }
      let type = 'isolated';
      if (n === 1) type = Math.abs(members[0].zetaLow) > 0.0055 && members[0].age > 1500 ? 'supercell' : 'pulse';
      else if (n <= 3) type = 'multicell';
      else if (bowAmount > 0.25) type = 'bow';
      else type = extent > 45000 ? 'line' : 'cluster';
      // bookend vortices (line ends) and mesovortices (along the leading edge)
      const bookends = [];
      if (n >= 4) {
        const along = members
          .map((m) => ({ m, t: -(m.x - cx) * mdirY + (m.y - cy) * mdirX }))
          .sort((a, b) => a.t - b.t);
        const a = along[0].m;
        const b = along[along.length - 1].m;
        bookends.push({ x: a.x, y: a.y, sign: 1 }, { x: b.x, y: b.y, sign: -1 });
      }
      return {
        id: members[0].id,
        members,
        x: cx,
        y: cy,
        angle,
        extent,
        bowAmount,
        type,
        bookends,
        length: 2 * extent,
        motionDir: Math.atan2(mdirY, mdirX),
      };
    }


    /* ------------------------------------------------ sub-grid overlay grid
     * The analytic convective structures are splatted once per update onto a
     * coarse 3-D grid so the radar operator can sample them at hundreds of
     * thousands of gates without re-running the element loop each time. */
    const OV_DX = 4000;
    const OV_Z = [500, 1500, 3000, 5000, 7000, 9000, 11500];
    const OV_NZ = OV_Z.length;
    const ovNx = Math.ceil((grid.nx * dx) / OV_DX) + 1;
    const ovNy = Math.ceil((grid.ny * dx) / OV_DX) + 1;
    const ovN2 = ovNx * ovNy;
    const ovQc = new Float32Array(ovN2 * OV_NZ);
    const ovQr = new Float32Array(ovN2 * OV_NZ);
    const ovQh = new Float32Array(ovN2 * OV_NZ);
    const ovU = new Float32Array(ovN2 * OV_NZ);
    const ovV = new Float32Array(ovN2 * OV_NZ);

    function buildOverlay() {
      ovQc.fill(0);
      ovQr.fill(0);
      ovQh.fill(0);
      ovU.fill(0);
      ovV.fill(0);
      const spd = motion.speed || 15;
      const sx = motion.u / spd;
      const sy = motion.v / spd;
      const REACH = 60000;
      for (const el of elements) {
        const rot = Math.abs(el.zetaLow) > 0.004;
        const strength = clamp(el.w / 30, 0.1, 1.6);
        const i0 = Math.max(0, Math.floor((el.x - REACH) / OV_DX));
        const i1 = Math.min(ovNx - 1, Math.ceil((el.x + REACH) / OV_DX));
        const j0 = Math.max(0, Math.floor((el.y - REACH) / OV_DX));
        const j1 = Math.min(ovNy - 1, Math.ceil((el.y + REACH) / OV_DX));
        for (let k = 0; k < OV_NZ; k += 1) {
          const z = OV_Z[k];
          const kBase = k * ovN2;
          const zCore = Math.exp(-0.5 * Math.pow((z - 5500) / 4200, 2));
          const zPrecip = z > 400 ? Math.exp(-0.5 * Math.pow((z - 4200) / 3800, 2)) : 0;
          const zHail = Math.exp(-0.5 * Math.pow((z - 7200) / 2600, 2));
          const zHook = z > 300 && z < 5000 ? Math.exp(-0.5 * Math.pow((z - 2200) / 2000, 2)) : 0;
          const zFac = Math.exp(-0.5 * Math.pow((z - 3500) / 4200, 2));
          const zLow = Math.exp(-0.5 * Math.pow((z - 1200) / 2200, 2));
          for (let j = j0; j <= j1; j += 1) {
            const base = kBase + j * ovNx;
            const dym0 = (j + 0.5) * OV_DX - el.y;
            for (let i = i0; i <= i1; i += 1) {
              const dxm = (i + 0.5) * OV_DX - el.x;
              const d2 = dxm * dxm + dym0 * dym0;
              if (d2 > REACH * REACH) continue;
              const d = Math.sqrt(d2);
              const along = dxm * sx + dym0 * sy;
              const cross = -dxm * sy + dym0 * sx;
              const o = base + i;
              // updraft core
              ovQc[o] += 0.9e-3 * strength * Math.exp(-0.5 * d2 / (3200 * 3200)) * zCore;
              // forward-flank precipitation
              const ffx = along - 9000;
              const ffy = cross + 5000 * (el.rotationSign > 0 ? 1 : -1);
              ovQr[o] +=
                2.6e-3 * strength * Math.exp(-0.5 * ((ffx * ffx) / (9000 * 9000) + (ffy * ffy) / (6500 * 6500))) * zPrecip;
              // hail core
              ovQh[o] += el.hailSize * 9e-3 * Math.exp(-0.5 * d2 / (3600 * 3600)) * zHail;
              if (rot) {
                const hookR = 4200;
                const ang = Math.atan2(cross, along) - el.rotationSign * (el.hookPhase * Math.PI * 0.5);
                const hx = d * Math.cos(ang) - hookR;
                const hy = d * Math.sin(ang);
                ovQr[o] += 2.2e-3 * clamp(Math.abs(el.zetaLow) * 260, 0, 1.2) * Math.exp(-0.5 * (hx * hx + hy * hy) / (2200 * 2200)) * zHook;
                if (z > 4000 && z < 10000) ovQc[o] -= 0.5e-3 * clamp(Math.abs(el.zetaLow) * 230, 0, 1) * Math.exp(-0.5 * d2 / (3800 * 3800));
              }
              // rear-flank downdraft arc
              if (-along > 0) {
                ovQr[o] += 0.7e-3 * el.rfd * Math.exp(-0.5 * Math.pow((d - (12000 + el.rfd * 4000)) / 3500, 2)) * zPrecip;
              }
              // Rankine-combined mesocyclone / TVS wind
              const rmax = 3600;
              const vTan = Math.abs(el.zeta) * (d < rmax ? d * 0.5 : (rmax * rmax) / (2 * Math.max(d, 1))) * (el.zeta >= 0 ? 1 : -1);
              const nx1 = d > 1 ? -dym0 / d : 0;
              const ny1 = d > 1 ? dxm / d : 0;
              ovU[o] += nx1 * vTan * zFac;
              ovV[o] += ny1 * vTan * zFac;
              if (el.tornado) {
                const tdx = (i + 0.5) * OV_DX - el.tornado.x;
                const tdy = (j + 0.5) * OV_DX - el.tornado.y;
                const td = Math.hypot(tdx, tdy) || 1;
                const trm = 400 + el.tornado.ef * 220;
                const tv = el.tornado.intensity * 0.09 * (td < trm ? td * 0.5 : (trm * trm) / (2 * td));
                ovU[o] += (-tdy / td) * tv * zLow;
                ovV[o] += (tdx / td) * tv * zLow;
              }
              // inflow/outflow and the downburst outflow
              if (d < 22000) {
                const inflow = 1 - d / 22000;
                ovU[o] += (dxm / d) * -6 * inflow * (z < 3000 ? 1 : -0.4);
                ovV[o] += (dym0 / d) * -6 * inflow * (z < 3000 ? 1 : -0.4);
              }
              if (el.gust > 12 && d < 25000 && z < 2500) {
                const outF = Math.exp(-0.5 * Math.pow((d - 6000) / 7000, 2)) * (z < 1200 ? 1 : 0.4);
                ovU[o] += (dxm / d) * el.gust * 0.55 * outF;
                ovV[o] += (dym0 / d) * el.gust * 0.55 * outF;
              }
            }
          }
        }
        // bookend vortices
        if (el.system && (el.system.type === 'bow' || el.system.type === 'line')) {
          for (const be of el.system.bookends) {
            if (be.owner === el.id) continue;
            be.owner = el.id;
            const bi0 = Math.max(0, Math.floor((be.x - 40000) / OV_DX));
            const bi1 = Math.min(ovNx - 1, Math.ceil((be.x + 40000) / OV_DX));
            const bj0 = Math.max(0, Math.floor((be.y - 40000) / OV_DX));
            const bj1 = Math.min(ovNy - 1, Math.ceil((be.y + 40000) / OV_DX));
            for (let k = 0; k < OV_NZ; k += 1) {
              const z = OV_Z[k];
              const zFac = Math.exp(-0.5 * Math.pow((z - 3000) / 3500, 2));
              const kBase = k * ovN2;
              for (let j = bj0; j <= bj1; j += 1) {
                const base = kBase + j * ovNx;
                const dym0 = (j + 0.5) * OV_DX - be.y;
                for (let i = bi0; i <= bi1; i += 1) {
                  const dxm = (i + 0.5) * OV_DX - be.x;
                  const d2 = dxm * dxm + dym0 * dym0;
                  if (d2 > 40000 * 40000) continue;
                  const d = Math.sqrt(d2) || 1;
                  const rmax = 9000;
                  const zeta = 0.006 * el.system.bowAmount * be.sign;
                  const vTan = zeta * (d < rmax ? d * 0.5 : (rmax * rmax) / (2 * d));
                  ovU[base + i] += (-dym0 / d) * vTan * zFac;
                  ovV[base + i] += (dxm / d) * vTan * zFac;
                }
              }
            }
          }
        }
      }
      // clamp cloud water
      for (let i = 0; i < ovQc.length; i += 1) if (ovQc[i] < 0) ovQc[i] = 0;
    }

    function overlayAt(x, y, z, out) {
      const o = out || OV_TMP;
      const gx = x / OV_DX;
      const gy = y / OV_DX;
      if (gx < 0 || gy < 0 || gx > ovNx - 1 || gy > ovNy - 1) {
        o.qc = 0;
        o.qr = 0;
        o.qh = 0;
        o.u = 0;
        o.v = 0;
        return o;
      }
      let k0 = 0;
      while (k0 < OV_NZ - 2 && OV_Z[k0 + 1] < z) k0 += 1;
      const k1 = k0 < OV_NZ - 1 ? k0 + 1 : OV_NZ - 1;
      const tz = clamp((z - OV_Z[k0]) / Math.max(1, OV_Z[k1] - OV_Z[k0]), 0, 1);
      const i0 = gx | 0;
      const j0 = gy | 0;
      const i1 = i0 < ovNx - 1 ? i0 + 1 : i0;
      const j1 = j0 < ovNy - 1 ? j0 + 1 : j0;
      const tx = gx - i0;
      const ty = gy - j0;
      const b0 = k0 * ovN2;
      const b1 = k1 * ovN2;
      const p00 = j0 * ovNx + i0;
      const p10 = j0 * ovNx + i1;
      const p01 = j1 * ovNx + i0;
      const p11 = j1 * ovNx + i1;
      const cx = 1 - tx;
      const cy = 1 - ty;
      const cz = 1 - tz;
      const a0 = cx * cy;
      const a1 = tx * cy;
      const a2 = cx * ty;
      const a3 = tx * ty;
      OVW0 = a0 * cz;
      OVW1 = a1 * cz;
      OVW2 = a2 * cz;
      OVW3 = a3 * cz;
      OVW4 = a0 * tz;
      OVW5 = a1 * tz;
      OVW6 = a2 * tz;
      OVW7 = a3 * tz;
      o.qc = ovmix(ovQc, b0, b1, p00, p10, p01, p11);
      o.qr = ovmix(ovQr, b0, b1, p00, p10, p01, p11);
      o.qh = ovmix(ovQh, b0, b1, p00, p10, p01, p11);
      o.u = ovmix(ovU, b0, b1, p00, p10, p01, p11);
      o.v = ovmix(ovV, b0, b1, p00, p10, p01, p11);
      return o;
    }
    // module-scope weights: allocating a closure per sample is ~1 us in V8
    let OVW0 = 0;
    let OVW1 = 0;
    let OVW2 = 0;
    let OVW3 = 0;
    let OVW4 = 0;
    let OVW5 = 0;
    let OVW6 = 0;
    let OVW7 = 0;
    function ovmix(a, b0, b1, p00, p10, p01, p11) {
      return (
        a[b0 + p00] * OVW0 +
        a[b0 + p10] * OVW1 +
        a[b0 + p01] * OVW2 +
        a[b0 + p11] * OVW3 +
        a[b1 + p00] * OVW4 +
        a[b1 + p10] * OVW5 +
        a[b1 + p01] * OVW6 +
        a[b1 + p11] * OVW7
      );
    }
    const OV_TMP = { qc: 0, qr: 0, qh: 0, u: 0, v: 0 };

    /* ------------------------------------------------------------ update */
    function update(dt) {
      time += dt;
      const found = findElements();
      // create / reinforce
      for (const cand of found) {
        const el = elementNear(cand.x, cand.y, 15000);
        if (el) {
          el.w = lerp(el.w, cand.w, 0.4);
          el.wPeak = Math.max(el.wPeak, cand.w);
          el.life = 0;
        } else if (elements.length < 18) {
          createElement(cand.x, cand.y, cand.w, cand.col);
        }
      }

      const stormSpeed = motion.speed || 15;
      for (const el of elements) {
        el.age += dt;
        el.life += dt;

        /* --- motion: storm-relative mean flow + propagation toward the
         * nearest boundary/neighbour (upscale growth) ------------------- */
        let pu = motion.u;
        let pv = motion.v;
        // right-flank propagation for discrete supercells
        const propScale = el.system && el.system.type === 'supercell' ? 1 : 0.4;
        pu += (-motion.v / (stormSpeed || 1)) * 2.5 * propScale;
        pv += (motion.u / (stormSpeed || 1)) * 2.5 * propScale;
        el.x += pu * dt;
        el.y += pv * dt;

        const col = grid.colIndex(el.x, el.y);
        const inDomain = col >= 0;
        const wCore = inDomain ? Math.max(grid.maxUpdraft[col], 0) : 0;
        el.w = lerp(el.w, Math.max(wCore, 1), 0.25);
        el.wPeak = Math.max(el.wPeak, el.w);

        /* --- mesocyclone vorticity equation ---------------------------
         * tilting of streamwise horizontal vorticity into the vertical by
         * the updraft, plus stretching by the updraft, minus friction. */
        const dwdz = clamp(el.w / 4500, 0, 0.012);
        const tilting = 1.25 * dwdz * shearRate * streamwiseFrac * el.rotationSign;
        const stretching = el.zeta * dwdz * 0.15;
        const friction = el.zeta / 600;
        el.tilt = tilting;
        el.zeta += (tilting + stretching - friction) * dt;
        el.zeta = clamp(el.zeta, -0.018, 0.018);
        // low-level vorticity concentrates as the RFD wraps (observed to lag
        // the mid-level mesocyclone by roughly 10-20 minutes)
        const matureFactor = clamp((el.age - 900) / 1200, 0, 1);
        el.zetaLow = clamp(el.zeta * (0.45 + 0.55 * matureFactor) * (1 + el.rfd * 0.5), -0.02, 0.02);

        /* --- RFD / occlusion cycle ------------------------------------ */
        el.hookPhase += dt / 1500;
        el.rfd = clamp(0.5 + 0.5 * Math.sin(el.hookPhase * Math.PI * 2), 0, 1);

        /* --- hail: growth limited by the updraft suspension criterion - */
        const dMax = hailSizeFromUpdraft(el.w);
        const growth = clamp((dMax - el.hailSize) / 900, -0.0004, 0.00006);
        el.hailSize = clamp(el.hailSize + growth * dt, 0, 0.22);
        const colHail = inDomain ? grid.colHail[col] : 0;
        el.hail = clamp(colHail * 3.2, 0, 1.4);

        /* --- precipitation and the downburst potential ---------------- */
        el.precip = inDomain ? clamp(grid.rainAccum[col] / 12, 0, 1.5) : 0;
        const dcapeGust = 0.75 * Math.sqrt(2 * Math.max(0, metrics.dcape));
        const loading = 6 * clamp(el.precip, 0, 1);
        el.gust = clamp((dcapeGust * 0.55 + loading) * clamp((el.rfd * 0.5 + 0.5), 0, 1), 0, 75);

        /* --- tornadogenesis ------------------------------------------- */
        const stp = metrics.stp;
        const lclPenalty = clamp((2000 - metrics.lcl) / 1000, 0, 1);
        // only a minority of supercells tornadify: require strong low-level
        // vorticity AND low LCL AND a supportive STP
        const torThreshold = 0.0095 + 0.0045 * (1 - lclPenalty);
        if (!el.tornado && el.zetaLow > torThreshold && el.age > 1800 && stp > 1.2 && el.w > 12) {
          const chance = clamp((el.zetaLow - torThreshold) * 70 * (0.25 + stp * 0.14), 0, 1);
          if (hash(el.id, Math.floor(time / 300), 11, cfg.seed || 1) < chance * 0.12) {
            el.tornado = { ef: 0, intensity: 0, x: el.x, y: el.y, age: 0, path: [] };
          }
        }
        if (el.tornado) {
          const tor = el.tornado;
          tor.age += dt;
          // intensity follows the low-level vorticity, ramping up then down
          const target = clamp((el.zetaLow - torThreshold) * 82, 0, 1.2);
          tor.intensity = lerp(tor.intensity, target, 0.12);
          tor.ef = efFromIntensity(tor.intensity);
          // the tornado sits at the updraft centre, slightly cyclonic-side
          const off = 1500;
          tor.x = el.x - (-motion.v / (stormSpeed || 1)) * off;
          tor.y = el.y - (motion.u / (stormSpeed || 1)) * off;
          tor.path.push({ x: tor.x, y: tor.y, ef: tor.ef, width: tornadoWidth(tor.ef) });
          if (tor.path.length > 400) tor.path.shift();
          if (el.zetaLow < torThreshold * 0.75 || el.w < 6) {
            el.tornadoHistory.push({ path: tor.path.slice(), ef: Math.max(...tor.path.map((p) => p.ef)) });
            el.tornado = null;
          }
        }
        el.track.push({ x: el.x, y: el.y });
        if (el.track.length > 240) el.track.shift();

        // death: no updraft support for a while, or off the domain
        const margin = dx * 2;
        if (!inDomain || el.x < -margin || el.y < -margin || el.x > grid.nx * dx + margin || el.y > grid.ny * dx + margin) {
          el.dead = true;
        } else if (el.life > 2400) {
          el.dead = true;
        }
      }
      for (let i = elements.length - 1; i >= 0; i -= 1) if (elements[i].dead) elements.splice(i, 1);

      clusterSystems(18);
      buildOverlay();
    }

    function tornadoWidth(ef) {
      return [80, 180, 350, 700, 1200, 1800][clamp(ef, 0, 5)] || 120;
    }
    function efFromIntensity(v) {
      if (v >= 1.12) return 5;
      if (v >= 0.92) return 4;
      if (v >= 0.72) return 3;
      if (v >= 0.52) return 2;
      if (v >= 0.28) return 1;
      return 0;
    }
    function efWind(ef) {
      return [105, 110, 135, 165, 200, 260][clamp(ef, 0, 5)];
    }

    /* ---------------------------------------------- analytic fine structure
     * Sub-grid convective structure (hook echo, forward-flank precip, hail
     * core, BWER, RFD arc, mesocyclone and TVS winds) sampled from the
     * overlay that buildOverlay() splats each update. */
    function hydrometeorAt(x, y, z) {
      const o = overlayAt(x, y, z);
      return { qr: Math.max(0, o.qr), qh: Math.max(0, o.qh), qc: Math.max(0, o.qc) };
    }
    function windPerturbation(x, y, z, out) {
      const o = overlayAt(x, y, z);
      const t = out || { u: 0, v: 0 };
      t.u = o.u;
      t.v = o.v;
      return t;
    }

    let beamSigma = 0;
    function setBeamSigma(s) {
      beamSigma = s;
    }

    /* ------------------------------------------------------------- hazards
     * Every hazard is diagnosed from a physical quantity in the model or the
     * element state, so warnings can be verified against something real. */
    function hazards() {
      const out = [];
      for (const el of elements) {
        if (el.x < 0 || el.y < 0 || el.x > grid.nx * dx || el.y > grid.ny * dx) continue;
        const col = grid.colIndex(el.x, el.y);
        const gustMph = el.gust * MSL_TO_MPH;
        if (gustMph >= 58) {
          out.push({
            kind: 'wind',
            x: el.x,
            y: el.y,
            radius: 6000,
            mph: Math.round(gustMph),
            severity: clamp((gustMph - 55) / 45, 0, 1),
            tag: windTag(gustMph),
            source: 'storm',
            id: `w${el.id}`,
          });
        }
        if (el.hailSize >= 0.019) {
          const inches = el.hailSize / 0.0254;
          out.push({
            kind: 'hail',
            x: el.x,
            y: el.y,
            radius: 5200,
            inches: Math.round(inches * 100) / 100,
            severity: clamp((inches - 0.7) / 3.3, 0, 1),
            tag: hailTag(inches),
            source: 'storm',
            id: `h${el.id}`,
          });
        }
        if (el.tornado) {
          const ef = el.tornado.ef;
          out.push({
            kind: 'tornado',
            x: el.tornado.x,
            y: el.tornado.y,
            radius: 1200,
            ef,
            mph: efWind(ef),
            severity: clamp(0.45 + el.tornado.intensity * 0.45, 0, 1),
            tag: ef >= 4 ? 'catastrophic' : ef >= 2 ? 'considerable' : 'base',
            path: el.tornado.path,
            source: 'storm',
            id: `t${el.id}`,
          });
        }
        const rainMm = col >= 0 ? grid.rainAccum[col] : 0;
        if (rainMm > 45) {
          out.push({
            kind: 'flood',
            x: el.x,
            y: el.y,
            radius: 9000,
            inches: Math.round((rainMm / 25.4) * 10) / 10,
            severity: clamp((rainMm - 45) / 100, 0, 1),
            tag: rainMm > 90 ? 'considerable' : 'base',
            source: 'storm',
            id: `f${el.id}`,
          });
        }
      }
      // grid-based damaging wind from the model's own cold pool / gust front
      const baseSurfaceWind = Math.hypot(sounding.windAt(120).u, sounding.windAt(120).v);
      let windHits = 0;
      const step = 3;
      for (let j = 1; j < grid.ny - 1; j += step) {
        for (let i = 1; i < grid.nx - 1; i += step) {
          const c = j * grid.nx + i;
          // only count a gust front where the model's own cold pool is
          // producing a genuine anomaly over the environmental flow
          // require a genuine cold pool AND a large gust anomaly, so only
          // real outflow boundaries and downdrafts are reported
          if (grid.coldPool[c] > -0.35) continue;
          const anomaly = grid.surfaceGust[c] - baseSurfaceWind;
          if (anomaly < 13) continue;
          const gust = Math.min(anomaly + baseSurfaceWind * 0.5, 33) * MSL_TO_MPH;
          if (gust < 58) continue;
          if (windHits >= 8) continue;
          windHits += 1;
          const x = i * dx;
          const y = j * dx;
          if (out.some((h) => h.kind === 'wind' && Math.hypot(h.x - x, h.y - y) < 40000)) continue;
          out.push({
            kind: 'wind',
            x,
            y,
            radius: 6500,
            mph: Math.round(gust),
            severity: clamp((gust - 55) / 45, 0, 1),
            tag: windTag(gust),
            source: 'gustfront',
            id: `g${i}_${j}`,
          });
        }
      }
      return out;
    }

    /** NWS-style impact tag. Wind: 60 base, 70 considerable, 80+ destructive.
     *  Hail: 0.75/1.00 base, 1.50/2.00 considerable, 2.75+ destructive. */
    function windTag(mph) {
      if (mph >= 80) return 'destructive';
      if (mph >= 70) return 'considerable';
      return 'base';
    }
    function hailTag(inches) {
      if (inches >= 2.75) return 'destructive';
      if (inches >= 1.5) return 'considerable';
      return 'base';
    }

    return {
      elements,
      systems,
      update,
      hydrometeorAt,
      windPerturbation,
      overlayAt,
      buildOverlay,
      setBeamSigma,
      hazards,
      hailSizeFromUpdraft,
      hailFallSpeed,
      efWind,
      windTag,
      hailTag,
      get time() {
        return time;
      },
      metrics: { shear06, srh01, streamwiseFrac, shearRate },
    };
  }

  WX.createStormField = createStormField;
  WX.hailSizeFromUpdraft = hailSizeFromUpdraft;
  WX.hailFallSpeed = hailFallSpeed;
  WX.windTag = (mph) => (mph >= 80 ? 'destructive' : mph >= 70 ? 'considerable' : 'base');
  WX.hailTag = (i) => (i >= 2.75 ? 'destructive' : i >= 1.5 ? 'considerable' : 'base');
})(typeof self !== 'undefined' ? self : globalThis);
