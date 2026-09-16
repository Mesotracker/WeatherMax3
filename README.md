# WeatherMax 3 — Convective Warning Desk

A browser-based warning-desk simulator built on an actual atmospheric model rather
than scripted animations. Open `index.html` (no build step, no dependencies) and
the desk integrates a 3-D non-hydrostatic model, diagnoses convective elements
from it, runs a WSR-88D forward operator over the result, and issues warnings and
storm reports from what the physics produced.

```
python3 -m http.server 8080      # then open http://localhost:8080
```

A headless test suite that exercises the same render pipeline in Node:

```
node test/run.js
```

---

## What is actually simulated

### `wx/sounding.js` — environment
81 levels from 200 m to 16 km. Pressure from hypsometric integration of virtual
temperature; a height-dependent lapse rate `Γ(z) = 8.6·e^(−z/1400) + Γ_m·(1−e^(−z/1400))`
blending to 3.2 K/km by 12 km; moisture held constant through the mixed layer then
decaying exponentially with a Gaussian dry slot aloft. The user's surface
temperature/dewpoint/shear/CAPE/SRH/DCAPE targets are met by bisecting the mixed-layer
lapse rate (CAPE), the dry-slot depth (DCAPE) and fitting a hodograph to the shear
and helicity targets.

Published indices are computed, not approximated:

- **MLCAPE / CIN** — mean parcel over the lowest 100 hPa, dry adiabat to the Bolton
  LCL, then a pseudoadiabatic ascent integrated to the equilibrium level.
- **DCAPE** — descent of a *wet-bulb* parcel from the minimum-θe level.
- **0–1 / 0–3 SRH** — discrete integration of `−v·∂u/∂z + u·∂v/∂z` relative to the
  Bunkers right-mover.
- **STP / SCP** — the SPC fixed-layer formulas with their published clipping
  (which is why a high-LCL case scores STP ≈ 0 and never tornadifies).
- **WBZ** — upward along a saturated moist adiabat from the LCL until T < 0 °C.

### `wx/nwp.js` — the model core
65 × 49 columns at 5 km (325 × 245 km), 14 levels from 250 m to ~14 km, 60 s
substeps. The domain **translates with the Bunkers right-mover**, so storms stay
quasi-stationary for a full shift.

- **Advection** — semi-Lagrangian, one shared departure trajectory per cell reused
  by all nine tracers. Momentum is advected as the *total* wind and re-based onto
  the arrival level, so a parcel carries the environmental shear of its origin.
- **Microphysics** — five classes (vapour, cloud, rain, snow, hail). Saturation
  adjustment with latent-heat feedback and ice/water partition by temperature,
  Kessler autoconversion and accretion, Kessler-form rain evaporation
  `E = K(1−RH)(ρq_r)^0.5` (this is what builds the cold pool), ice deposition,
  riming, hail accretion, melting, and top-down incremental sedimentation with
  mass-weighted fall speeds.
- **Dynamics** — buoyancy `g·θ_v′/θ̄₀ − g·Σq` plus Coriolis and a quadratic
  updraft drag, then an **anelastic pressure projection**: a 3-D Poisson solve for
  the non-hydrostatic pressure perturbation by Jacobi iteration, whose gradient is
  removed from the wind. This is what converts a buoyant column into a real
  convective circulation with low-level inflow and upper-level outflow.
- **Closure** — Rayleigh relaxation of the momentum perturbation (short near the
  surface, long aloft), horizontal/vertical turbulent diffusion, a 7-cell lateral
  sponge, a Rayleigh top, a rigid lid, and surface drag with insolation suppressed
  under rain and cloud so cold pools survive.

`updateDerived` also computes **MESH** (Witt et al. 1998) from the height-weighted
severe-hail index rather than from a mixing ratio.

Typical output for the Oklahoma outbreak case: 30–38 m/s updrafts, 60–65 dBZ cores,
a −2 K cold pool, 60–120 mm core accumulations, updraft helicity 150–450 m²/s².

### `wx/storms.js` — convective elements
A 5 km grid cannot resolve a 6 km updraft, so each element is carried explicitly
and obeys real relationships:

- **Mesocyclone** — `dζ/dt = tilting + stretching − friction`, where tilting is the
  streamwise horizontal vorticity `(∂w/∂z)·|∂V/∂z|` scaled by the streamwise
  fraction of the shear. Produces 7–20 ×10⁻³ s⁻¹ for strong-shear cases and 2–5 for
  weak-shear ones.
- **Hail** — `D_max` from the suspension criterion `w_up = V_t(D)` with the observed
  dry-hail fall speed `V_t = 126·D^0.567`. A 30 m/s updraft supports ~3 in, a 15 m/s
  updraft ~0.9 in.
- **Downburst** — `gust = 0.75·√(2·DCAPE)` plus precipitation loading.
- **Tornado** — requires low-level vorticity above a threshold that rises with LCL
  height, an STP above 1.2, and a mature mesocyclone; then a probabilistic onset.
  EF scale from the low-level vorticity excess.
- **Systems** — single-linkage clustering into isolated / pulse / multicell /
  cluster / line / bow, with the bow amount measured from the along-motion
  projection, plus bookend vortices and an RFD/occlusion cycle.

Element structure (hook echo, forward-flank precipitation, hail core aloft, BWER,
RFD arc, Rankine mesocyclone and TVS winds) is splatted onto a coarse overlay grid
each step so the radar operator can sample it at hundreds of thousands of gates
without re-running the element loop.

### `wx/radar.js` — the forward operator
Polar sampling at 240 azimuths, 250 m gates to 46 km then 1 km gates to 160 km,
11 elevation angles.

- **Beam height** — `h = √(r² + (k_e R_e)² + 2·r·k_e R_e·sin θ) − k_e R_e + h_ant`
  with `k_e = 4/3`. At 0.5°: 0.59 km at 50 km, 1.47 km at 100 km, 2.64 km at 150 km.
- **Beam broadening** — `σ_beam = 0.42·r·θ_b`. Every gate with condensate is
  averaged across the beam at ±σ, which is the beam-volume convolution that
  genuinely inflates distant mesocyclones, weakens peak velocities and smears
  reflectivity — 0.37 km at 50 km growing to 1.10 km at 150 km.
- **Moments** — reflectivity from calibrated Marshall-Palmer relations per
  hydrometeor class, correlation coefficient and ZDR from the hydrometeor mixture,
  precipitation type from ρhv/ZDR/temperature, radial velocity folded to ±26 m/s
  Nyquist, two-way attenuation, a bright band at the melting level, ground clutter
  on the lowest tilts inside 26 km, and a cone of silence above the model top.
- **MRMS** — a coarse 2–3 km Cartesian composite built from the nearest site, with
  azimuthal shear `(V_max − V_min)/(2Δr)` and rotational velocity derived from
  **that coarse grid**, so a distant mesocyclone reads broader and weaker exactly
  as it does in the real product.

### `wx/engine.js` — operations
Frames are captured every 5 model minutes. Warnings are storm-based polygons
aligned with the storm motion, clustered within 55 km, and tagged:

| hazard | base | considerable | destructive / catastrophic |
| --- | --- | --- | --- |
| wind | 60–69 mph | 70–79 mph | ≥ 80 mph |
| hail | 0.75 / 1.00 in | 1.50 / 2.00 in | ≥ 2.75 in |
| tornado | EF0–EF1 | EF2–EF3 (PDS) | EF4–EF5 (Tornado Emergency) |

Storm reports are drawn with the observed relative frequencies — wind damage and
50+ mph gusts most common, hail common, tornadoes medium, significant wind (74+ mph)
and significant hail (≥ 2 in) rare, significant tornadoes rarest — and spawned from
actual velocity, precipitation-type and rotation values at jittered positions.

Each tornado keeps **one contiguous path**; tracks are never duplicated.

CAM guidance is a biased transform of the model truth: each scheme gets its own
displacement, timing offset, Z–R offset and updraft/wind/hail/QPF scaling.

---

## Desk controls

- **Tabs 1–9** switch products; **Space** plays, **←/→** step frames.
- **Right-click** the map for the lat/lon and range/bearing at the cursor (click to
  copy) and to **switch radar site** — the six nearest of 109 real WSR-88D sites, or
  the full list grouped by state.
- The left panel drives the environment; **Run Simulation** re-integrates with a new
  seed. The right panel lists CAM guidance, active warnings, incoming reports and
  per-cell structure.

## Performance

Node v22, 65 × 49 × 14 grid, 5 substeps per 5-minute frame: ~300 ms of model time
per frame, integrated progressively in the background so the desk stays responsive,
plus ~90–120 ms for a radar scan when the frame or tilt changes (the next frame's
scan is pre-warmed during idle time). Playback from the frame cache is immediate.

## Known limits

- The approximate pressure projection enforces continuity but not the full momentum
  balance, so perturbation winds aloft run somewhat stronger than observed (35–50
  m/s storm-relative instead of 20–30). A multigrid solve would fix this.
- Rotation is carried by the element layer because a 5 km grid cannot tilt shear
  explicitly; the model's own vorticity field is convergence-driven.
- Total core accumulations run on the high side for long-lived cases (100+ mm over
  five hours).
