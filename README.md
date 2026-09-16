# WeatherMax 3 — Warning Desk

A severe-weather **warning game**. You are the forecaster on duty: the atmosphere
runs on a real numerical model, storms develop on their own schedule, and you draw
warning polygons, pick AWIPS products and impact tags, and get scored on how well
you called it. Miss a significant event and it costs you.

```
python3 -m http.server 8080      # then open http://localhost:8080
```

Headless test suite (drives the real game logic through a DOM stub):

```
node test/run.js
```

---

## How to play

1. **Start Shift** picks a scenario and starts the clock. Tempo accelerates across
   the shift — you get less time to think as it goes on.
2. **Watch the radar.** Ten layers, four real elevation angles, ten CAM guidance
   runs. Right-click for coordinates and to move the radar.
3. **Draw a warning area** by dragging on the map. Four shapes: county-style,
   storm cone, free polygon, box. Wheel zooms.
4. **Pick a product** in the Product Desk — outlook, mesoscale discussion, watch,
   PDS watch, warning, PDS/destructive warning, flash flood, SPS — and set its
   impact tag, max wind, max hail, duration and basis.
5. **Issue it.** You are scored immediately, and again as the valid period plays out.
6. **Time controls**: `−5` / `+5` step one 5-minute frame, `Play` runs the clock,
   and the slider **only scrubs frames that have already happened** — you can
   review the past but never look ahead. `Space` plays, `←/→` step, `Enter` issues,
   `Esc` clears the polygon, `1`–`9` switch layers.

### Scoring

Each issued product is verified against the model's own truth hazards over its
valid period:

```
score = spatial·0.46 + lead·0.24 + severity·0.18 + hazardFit·0.12
hit   = score ≥ 44          skill points = max(8, score − 45)
```

- **Spatial** — containment of the hazard ellipse, penalised for polygons much
  larger than the hazard. A county-sized box around a single core scores badly.
- **Lead** — for warnings, best around 10 minutes; too early or too late both cost.
- **Severity** — how well your impact tag and wind/hail maxima match what happened.
  Tagging `destructive` on a 65 mph gust is penalised.
- **Hazard fit** — did you warn the right hazard at the right magnitude?

A false alarm costs 18–38 points depending on the product. **Missing** a hazard
with severity ≥ 0.66 that had no active warning over it costs **32 points**.
Desk score = `72 + skillPoints / (issued + misses)`, clamped to 0–100.

---

## What is actually simulated

### `wx/sounding.js` — environment
81 levels to 16 km. Your surface temp/dewpoint/shear/CAPE/SRH/DCAPE targets are
met by bisecting the mixed-layer lapse rate (CAPE), the dry-slot depth (DCAPE) and
fitting a hodograph to the shear and helicity. Published STP and SCP with their
real clipping — which is why the high-LCL Colorado case scores STP ≈ 0 and never
tornadifies no matter how tall the echo gets.

### `wx/nwp.js` — the model core
57 × 43 columns at 5 km (285 × 215 km), 14 levels from 250 m to 14.2 km, five 60 s
substeps, translating with the Bunkers right-mover so storms hold position.

- Semi-Lagrangian advection carrying the **total** momentum so a parcel keeps the
  environmental shear of its origin level.
- Five-class bulk microphysics with Kessler-form evaporation `E = K(1−RH)(ρq_r)^0.5`
  — this is what builds the cold pool.
- **Anelastic pressure projection**: a 3-D Poisson solve for the non-hydrostatic
  pressure perturbation whose gradient is removed from the wind. This is what turns
  a buoyant column into a circulation with low-level inflow.
- Surface flux distributed over the lowest kilometre and sized from a 150 W/m²
  budget; a Rayleigh momentum relaxation; lateral sponge; rigid lid.
- **MESH** from the Witt (1998) severe-hail index, not from a mixing ratio.

The model top matters: at 11.4 km the updraft hit the lid and died (w = 1.7 m/s).
At 14.2 km the same case produces 32–45 m/s updrafts, 62–67 dBZ cores, a −1.3 K
cold pool and 20–30 mm core accumulations.

### `wx/storms.js` — convective elements
A 5 km grid cannot resolve a 6 km updraft, so each element is carried explicitly:

- **Mesocyclone** — `dζ/dt = tilting + stretching − friction`, tilting being the
  streamwise horizontal vorticity scaled by the streamwise fraction of the shear.
- **Hail** — from the suspension criterion `w_up = V_t(D)` with `V_t = 126·D^0.567`.
- **Downburst** — `0.75·√(2·DCAPE)` plus precipitation loading, modulated by the RFD.
- **Tornado** — requires low-level vorticity above an LCL-dependent threshold,
  STP > 1.2 and a mature mesocyclone; EF scale follows the vorticity excess.
- **Systems** — clustering into isolated / pulse / multicell / cluster / line / bow
  with bookend vortices and an RFD/occlusion cycle.

Hazard severities are anchored on the real NWS thresholds, so the game's 0.66 miss
line means *significant*: 74 mph, 2.00 in, EF2.

### `wx/radar.js` — the forward operator
240 azimuths, 250 m gates to 46 km then 1 km gates to 170 km, 11 elevation angles.

- **Beam height** on the 4/3-earth cone: 0.59 km at 50 km, 1.47 km at 100 km,
  2.64 km at 150 km on the 0.5° tilt.
- **Beam broadening** `σ = 0.42·r·θ_b` applied as a real cross-beam average, so
  distant mesocyclones genuinely inflate and smear.
- **Velocity is storm-relative** — the environmental motion is removed, so a
  translating storm shows only its own circulation (mean |SRV| ≈ 12 m/s, folded
  at ±26 m/s Nyquist).
- ρhv and ZDR from the hydrometeor mixture, hydrometeor classification, two-way
  attenuation, bright band, ground clutter, cone of silence.
- **MRMS** rotation derived from the coarse composite, so it reads broader and
  weaker with range exactly like the real product.

### Operations
Storm-based polygons, spotter reports at observed relative frequencies, one
contiguous path per tornado, per-scheme CAM biases.

---

## Desk controls

- **Right-click**: cursor lat/lon and range/bearing (click to copy), draw an area
  centred on the cursor, and **switch radar site** — the six nearest of 109 real
  WSR-88D sites or the full list. Switching sites moves the antenna, **not** the
  simulation: your score, issued products, reports and the clock all survive.
- **`.pal` upload**: load an AWIPS/N0R-format colormap (`value red green blue` per
  line) onto the reflectivity or velocity layer.

## Performance

Node v22: ~380–490 ms of wall clock per 5-minute frame (model step, element update,
hazard diagnosis, frame capture and one radar scan). The model integrates in a
`setTimeout` chain so it never blocks the pointer, raster output is cached per
frame/layer/tilt/zoom, and the tempo starts at 20 s per frame and tightens to 5.5 s.

## Known limits

- The Jacobi projection enforces continuity but not the full momentum balance, so
  perturbation winds aloft still run stronger than observed.
- Tornadoes are predominantly EF0–EF1; the EF scale follows low-level vorticity
  honestly, and this run's mesocyclones peaked near 20 ×10⁻³ s⁻¹.
- Rotation lives in the element layer because a 5 km grid cannot tilt shear
  explicitly.
