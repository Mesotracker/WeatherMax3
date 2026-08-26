from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from math import atan2, cos, exp, log, log10, radians, sin, sqrt, tan
from typing import Iterable, Mapping, Sequence

import numpy as np


EARTH_RADIUS_M = 6_371_000.0
REFRACTION_INDEX = 4.0 / 3.0
GRAVITY = 9.80665
KNOT_TO_MPS = 0.514444
MPS_TO_KNOT = 1.0 / KNOT_TO_MPS
MPS_TO_MPH = 2.236936
NEXRAD_TILTS_DEG = (0.5, 1.5, 2.4, 3.4)
BEAMWIDTH_DEG = 1.0
NYQUIST_MPS = 32.0
R_D = 287.05
CP_D = 1004.0
EPSILON = 0.622

NEXRAD_16_COLORS = (
    "#646464",
    "#04e9e7",
    "#019ff4",
    "#0300f4",
    "#02fd02",
    "#01c501",
    "#008e00",
    "#fdf802",
    "#e5bc00",
    "#fd9500",
    "#fd0000",
    "#d40000",
    "#bc0000",
    "#f800fd",
    "#9854c6",
    "#fdfdfd",
)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def wind_components_from_met(wind_dir_deg: float, wind_speed_kt: float) -> tuple[float, float]:
    direction = radians(wind_dir_deg)
    speed = wind_speed_kt * KNOT_TO_MPS
    return -speed * sin(direction), -speed * cos(direction)


def met_direction_from_components(u_mps: float, v_mps: float) -> float:
    return (np.degrees(np.arctan2(-u_mps, -v_mps)) + 360.0) % 360.0


def saturation_vapor_pressure_mb(temp_c: np.ndarray | float) -> np.ndarray | float:
    return 6.112 * np.exp((17.67 * temp_c) / (temp_c + 243.5))


def mixing_ratio_kgkg(pressure_mb: np.ndarray, dewpoint_c: np.ndarray) -> np.ndarray:
    vapor_pressure = np.minimum(saturation_vapor_pressure_mb(dewpoint_c), pressure_mb * 0.98)
    return EPSILON * vapor_pressure / np.maximum(pressure_mb - vapor_pressure, 1.0)


def virtual_temperature_k(temp_c: np.ndarray, pressure_mb: np.ndarray, dewpoint_c: np.ndarray) -> np.ndarray:
    temp_k = temp_c + 273.15
    return temp_k * (1.0 + 0.61 * mixing_ratio_kgkg(pressure_mb, dewpoint_c))


def lcl_temperature_k(temp_c: float, dewpoint_c: float) -> float:
    temp_k = temp_c + 273.15
    dewpoint_k = dewpoint_c + 273.15
    return 1.0 / (1.0 / (dewpoint_k - 56.0) + log(temp_k / dewpoint_k) / 800.0) + 56.0


def polygon_area_square_miles(points: Sequence[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    mean_lat = radians(sum(lat for lat, _ in points) / len(points))
    projected = []
    for lat, lon in points:
      x = radians(lon) * EARTH_RADIUS_M * cos(mean_lat)
      y = radians(lat) * EARTH_RADIUS_M
      projected.append((x, y))
    area_m2 = 0.0
    for idx, current in enumerate(projected):
        nxt = projected[(idx + 1) % len(projected)]
        area_m2 += current[0] * nxt[1] - nxt[0] * current[1]
    return abs(area_m2) * 0.5 / 2_589_988.110336


@dataclass(frozen=True)
class StormMotion:
    u_mps: float
    v_mps: float

    @property
    def speed_kt(self) -> float:
        return sqrt(self.u_mps * self.u_mps + self.v_mps * self.v_mps) * MPS_TO_KNOT

    @property
    def from_direction_deg(self) -> float:
        return met_direction_from_components(self.u_mps, self.v_mps)

    @property
    def toward_direction_deg(self) -> float:
        return (self.from_direction_deg + 180.0) % 360.0


@dataclass(frozen=True)
class SoundingMetrics:
    cape_jkg: float
    cin_jkg: float
    lcl_m: float
    lfc_m: float | None
    el_m: float | None
    shear_0_1km_kt: float
    shear_0_3km_kt: float
    shear_0_6km_kt: float
    srh_0_1km: float
    srh_0_3km: float
    storm_motion: StormMotion
    selected_mode: str
    supercell_variant: str | None


@dataclass
class SoundingProfile:
    height_m: np.ndarray
    pressure_mb: np.ndarray
    temperature_c: np.ndarray
    dewpoint_c: np.ndarray
    wind_dir_deg: np.ndarray
    wind_speed_kt: np.ndarray

    @classmethod
    def from_rows(cls, rows: Sequence[Mapping[str, float] | Sequence[float]]) -> "SoundingProfile":
        parsed: list[tuple[float, float, float, float, float, float]] = []
        for row in rows:
            if isinstance(row, Mapping):
                parsed.append(
                    (
                        float(row["height_m"]),
                        float(row["pressure_mb"]),
                        float(row["temperature_c"]),
                        float(row["dewpoint_c"]),
                        float(row["wind_dir_deg"]),
                        float(row["wind_speed_kt"]),
                    )
                )
            else:
                if len(row) < 6:
                    raise ValueError("Sounding rows must contain height, pressure, temperature, dewpoint, wind direction, and wind speed.")
                parsed.append(tuple(float(value) for value in row[:6]))
        if len(parsed) < 2:
            raise ValueError("At least two sounding levels are required.")
        parsed.sort(key=lambda item: item[0])
        data = np.asarray(parsed, dtype=float)
        return cls(data[:, 0], data[:, 1], data[:, 2], data[:, 3], data[:, 4], data[:, 5]).resample_100m()

    @classmethod
    def from_text(cls, text: str) -> "SoundingProfile":
        rows: list[tuple[float, float, float, float, float, float]] = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            pieces = stripped.replace(",", " ").split()
            numeric: list[float] = []
            for piece in pieces:
                try:
                    numeric.append(float(piece))
                except ValueError:
                    numeric.clear()
                    break
            if len(numeric) >= 6:
                rows.append(tuple(numeric[:6]))
        return cls.from_rows(rows)

    @classmethod
    def synthetic_severe(cls) -> "SoundingProfile":
        heights = np.arange(0.0, 16_100.0, 500.0)
        pressure = 1000.0 * np.exp(-heights / 8200.0)
        temperature = 27.0 - 6.6 * heights / 1000.0
        dewpoint = np.maximum(temperature - 24.0, 21.0 - 1.8 * heights / 1000.0)
        wind_dir = np.interp(heights, [0.0, 1000.0, 6000.0, 12_000.0, 16_000.0], [140.0, 190.0, 270.0, 285.0, 300.0])
        wind_speed = np.interp(heights, [0.0, 1000.0, 6000.0, 12_000.0, 16_000.0], [15.0, 30.0, 60.0, 78.0, 92.0])
        return cls(heights, pressure, temperature, dewpoint, wind_dir, wind_speed).resample_100m()

    def resample_100m(self) -> "SoundingProfile":
        target = np.arange(max(0.0, self.height_m[0]), min(16_000.0, self.height_m[-1]) + 100.0, 100.0)
        return SoundingProfile(
            target,
            np.interp(target, self.height_m, self.pressure_mb),
            np.interp(target, self.height_m, self.temperature_c),
            np.interp(target, self.height_m, self.dewpoint_c),
            np.interp(target, self.height_m, self.wind_dir_deg),
            np.interp(target, self.height_m, self.wind_speed_kt),
        )

    def wind_uv_mps(self) -> tuple[np.ndarray, np.ndarray]:
        dirs = np.radians(self.wind_dir_deg)
        speeds = self.wind_speed_kt * KNOT_TO_MPS
        return -speeds * np.sin(dirs), -speeds * np.cos(dirs)

    def wind_at_mps(self, height_m: float) -> tuple[float, float]:
        u, v = self.wind_uv_mps()
        return float(np.interp(height_m, self.height_m, u)), float(np.interp(height_m, self.height_m, v))

    def storm_motion_bunkers(self) -> StormMotion:
        u, v = self.wind_uv_mps()
        mean_u = float(np.mean(u[(self.height_m >= 0.0) & (self.height_m <= 6000.0)]))
        mean_v = float(np.mean(v[(self.height_m >= 0.0) & (self.height_m <= 6000.0)]))
        u0, v0 = self.wind_at_mps(0.0)
        u6, v6 = self.wind_at_mps(6000.0)
        shear_u = u6 - u0
        shear_v = v6 - v0
        shear_mag = max(sqrt(shear_u * shear_u + shear_v * shear_v), 0.1)
        right_u = shear_v / shear_mag * 7.5
        right_v = -shear_u / shear_mag * 7.5
        return StormMotion(mean_u + right_u, mean_v + right_v)

    def bulk_shear_kt(self, bottom_m: float, top_m: float) -> float:
        u0, v0 = self.wind_at_mps(bottom_m)
        u1, v1 = self.wind_at_mps(top_m)
        return sqrt((u1 - u0) ** 2 + (v1 - v0) ** 2) * MPS_TO_KNOT

    def srh(self, top_m: float, motion: StormMotion) -> float:
        mask = (self.height_m >= 0.0) & (self.height_m <= top_m)
        z = self.height_m[mask]
        u, v = self.wind_uv_mps()
        u = u[mask] - motion.u_mps
        v = v[mask] - motion.v_mps
        if len(z) < 2:
            return 0.0
        srh = 0.0
        for idx in range(len(z) - 1):
            du = u[idx + 1] - u[idx]
            dv = v[idx + 1] - v[idx]
            srh += (u[idx] * dv - v[idx] * du)
        return abs(float(srh))

    def parcel_profile_k(self) -> tuple[np.ndarray, float]:
        surface_temp_c = float(self.temperature_c[0])
        surface_td_c = float(self.dewpoint_c[0])
        surface_pressure = float(self.pressure_mb[0])
        lcl_temp = lcl_temperature_k(surface_temp_c, surface_td_c)
        lcl_pressure = surface_pressure * (lcl_temp / (surface_temp_c + 273.15)) ** (CP_D / R_D)
        lcl_height = float(np.interp(lcl_pressure, self.pressure_mb[::-1], self.height_m[::-1]))
        dry_theta = (surface_temp_c + 273.15) * (1000.0 / surface_pressure) ** (R_D / CP_D)
        parcel = dry_theta * (self.pressure_mb / 1000.0) ** (R_D / CP_D)
        moist_start = np.searchsorted(self.height_m, lcl_height)
        if moist_start < len(parcel):
            parcel[moist_start:] = lcl_temp - 0.0060 * (self.height_m[moist_start:] - lcl_height)
        return parcel, lcl_height

    def metrics(self) -> SoundingMetrics:
        parcel_k, lcl_m = self.parcel_profile_k()
        env_tv = virtual_temperature_k(self.temperature_c, self.pressure_mb, self.dewpoint_c)
        parcel_tv = parcel_k * (1.0 + 0.61 * mixing_ratio_kgkg(self.pressure_mb, self.dewpoint_c[0] * np.ones_like(self.dewpoint_c)))
        buoyancy = GRAVITY * (parcel_tv - env_tv) / env_tv
        positive = buoyancy > 0.0
        lfc_m: float | None = None
        el_m: float | None = None
        cape = 0.0
        cin = 0.0
        for idx in range(len(self.height_m) - 1):
            dz = self.height_m[idx + 1] - self.height_m[idx]
            layer_b = 0.5 * (buoyancy[idx] + buoyancy[idx + 1])
            mid_height = 0.5 * (self.height_m[idx] + self.height_m[idx + 1])
            if layer_b > 0.0 and mid_height >= lcl_m:
                if lfc_m is None:
                    lfc_m = mid_height
                el_m = mid_height
                cape += layer_b * dz
            elif lfc_m is None and mid_height < 4500.0:
                cin += min(0.0, layer_b * dz)
        motion = self.storm_motion_bunkers()
        shear01 = self.bulk_shear_kt(0.0, 1000.0)
        shear03 = self.bulk_shear_kt(0.0, 3000.0)
        shear06 = self.bulk_shear_kt(0.0, 6000.0)
        srh01 = self.srh(1000.0, motion)
        srh03 = self.srh(3000.0, motion)
        mode, variant = select_storm_mode(float(cape), shear06, srh01, shear03, self.bulk_shear_kt(6000.0, 12_000.0))
        return SoundingMetrics(float(cape), abs(float(cin)), lcl_m, lfc_m, el_m, shear01, shear03, shear06, srh01, srh03, motion, mode, variant)


def select_storm_mode(cape: float, shear06_kt: float, srh01: float, shear03_kt: float, upper_shear_kt: float) -> tuple[str, str | None]:
    if cape > 1500.0 and shear06_kt >= 40.0 and srh01 >= 150.0:
        if srh01 > 300.0:
            return "supercell", "hp"
        if cape < 2300.0 and upper_shear_kt > 35.0:
            return "supercell", "lp"
        return "supercell", "classic"
    if cape > 2000.0 and shear06_kt > 45.0 and shear03_kt > 28.0:
        return "bow", None
    if cape > 1000.0 and 35.0 <= shear06_kt <= 50.0:
        return "qlcs", None
    if cape > 500.0 and shear06_kt < 35.0:
        return "pulse", None
    return "elevated_showers", None


@dataclass(frozen=True)
class EllipsoidCore:
    center_m: tuple[float, float, float]
    sigma_m: tuple[float, float, float]
    zmax_dbz: float
    sign: float = 1.0
    tilt_per_km_m: tuple[float, float] = (0.0, 0.0)
    rotation_rad: float = 0.0

    def sample_linear_z(self, relative_xyz_m: np.ndarray) -> float:
        x = float(relative_xyz_m[0])
        y = float(relative_xyz_m[1])
        z = float(relative_xyz_m[2])
        tilted_x = x - self.tilt_per_km_m[0] * (z / 1000.0)
        tilted_y = y - self.tilt_per_km_m[1] * (z / 1000.0)
        dx = tilted_x - self.center_m[0]
        dy = tilted_y - self.center_m[1]
        cr = cos(self.rotation_rad)
        sr = sin(self.rotation_rad)
        rx = dx * cr + dy * sr
        ry = -dx * sr + dy * cr
        rz = z - self.center_m[2]
        sx, sy, sz = self.sigma_m
        exponent = -((rx * rx) / (2.0 * sx * sx) + (ry * ry) / (2.0 * sy * sy) + (rz * rz) / (2.0 * sz * sz))
        return self.sign * (10.0 ** (self.zmax_dbz / 10.0)) * exp(exponent)


@dataclass
class StormCell:
    mode: str
    center_m: tuple[float, float]
    motion: StormMotion
    age_s: float
    intensity: float
    rotation: float
    cores: list[EllipsoidCore] = field(default_factory=list)
    variant: str | None = None
    orientation_rad: float = 0.0

    @classmethod
    def supercell(cls, center_m: tuple[float, float], motion: StormMotion, variant: str = "classic", intensity: float = 1.0, rotation: float = 1.0) -> "StormCell":
        hp = variant == "hp"
        lp = variant == "lp"
        rain_peak = 65.0 if hp else 61.0 if not lp else 55.0
        hail_peak = 70.0 if not lp else 64.0
        cores = [
            EllipsoidCore((4200.0, 5200.0, 4600.0), (5200.0, 3400.0, 2700.0), rain_peak, tilt_per_km_m=(460.0, 620.0), rotation_rad=-0.42),
            EllipsoidCore((2600.0, 3400.0, 2500.0), (2700.0, 2100.0, 1600.0), 56.0 if hp else 52.0, tilt_per_km_m=(280.0, 420.0), rotation_rad=-0.2),
            EllipsoidCore((5200.0, 6400.0, 6400.0), (2700.0, 2300.0, 1800.0), hail_peak, tilt_per_km_m=(540.0, 720.0), rotation_rad=-0.35),
            EllipsoidCore((8200.0, 9000.0, 10_800.0), (13_000.0, 7600.0, 3200.0), 40.0, tilt_per_km_m=(900.0, 1200.0), rotation_rad=-0.55),
            EllipsoidCore((-3100.0, -1800.0, 1300.0), (2600.0, 1200.0, 950.0), 48.0, rotation_rad=0.35),
            EllipsoidCore((-4700.0, -700.0, 1200.0), (2100.0, 900.0, 850.0), 46.0, rotation_rad=0.85),
            EllipsoidCore((-5200.0, 900.0, 1400.0), (1500.0, 850.0, 800.0), 43.0, rotation_rad=1.15),
            EllipsoidCore((-2200.0, -2600.0, 1300.0), (3600.0, 950.0, 950.0), 54.0 if hp else 47.0, rotation_rad=-0.62),
            EllipsoidCore((-2300.0, 1300.0, 1600.0), (3600.0, 1300.0, 1400.0), 45.0, sign=-1.0, rotation_rad=0.45),
        ]
        return cls("supercell", center_m, motion, 1800.0, intensity, rotation, cores, variant, orientation_rad=-0.42)

    @classmethod
    def qlcs(cls, center_m: tuple[float, float], motion: StormMotion, intensity: float = 1.0) -> "StormCell":
        cores: list[EllipsoidCore] = []
        for idx in range(9):
            along = (idx - 4) * 5400.0
            bow_push = 2400.0 * exp(-((idx - 4) ** 2) / 5.0)
            cores.append(EllipsoidCore((bow_push, along, 2600.0), (2900.0, 2300.0, 1900.0), 56.0, rotation_rad=0.05))
        cores.append(EllipsoidCore((-2100.0, 0.0, 2100.0), (4100.0, 5200.0, 1300.0), 38.0, sign=-1.0, rotation_rad=0.0))
        cores.append(EllipsoidCore((7800.0, 0.0, 9700.0), (19_000.0, 13_000.0, 3300.0), 38.0))
        return cls("qlcs", center_m, motion, 1800.0, intensity, 0.45, cores, None, orientation_rad=0.02)

    def center_at(self, elapsed_s: float) -> np.ndarray:
        return np.array(
            [
                self.center_m[0] + self.motion.u_mps * elapsed_s,
                self.center_m[1] + self.motion.v_mps * elapsed_s,
            ],
            dtype=float,
        )

    def relative_xyz(self, xyz_m: np.ndarray, elapsed_s: float) -> np.ndarray:
        center = self.center_at(elapsed_s)
        dx = xyz_m[0] - center[0]
        dy = xyz_m[1] - center[1]
        cr = cos(-self.orientation_rad)
        sr = sin(-self.orientation_rad)
        return np.array([dx * cr - dy * sr, dx * sr + dy * cr, xyz_m[2]], dtype=float)

    def bwer_linear_subtraction(self, rel: np.ndarray) -> float:
        if self.mode != "supercell":
            return 0.0
        x, y, z = float(rel[0]), float(rel[1]), float(rel[2])
        radius = 1300.0 + 0.34 * z
        horizontal = exp(-((x - 600.0) ** 2 + (y - 800.0) ** 2) / (2.0 * radius * radius))
        vertical = exp(-((z - 2600.0) ** 2) / (2.0 * 2100.0 * 2100.0))
        return (10.0 ** (54.0 / 10.0)) * horizontal * vertical

    def reflectivity_linear_z(self, xyz_m: np.ndarray, elapsed_s: float) -> float:
        rel = self.relative_xyz(xyz_m, elapsed_s)
        total = 0.0
        for core in self.cores:
            total += core.sample_linear_z(rel) * self.intensity
        total -= self.bwer_linear_subtraction(rel)
        if self.mode == "qlcs":
            x, y, z = rel
            rin = exp(-((x + 1200.0) ** 2) / (2.0 * 2500.0 * 2500.0) - (y * y) / (2.0 * 3400.0 * 3400.0) - ((z - 1700.0) ** 2) / (2.0 * 1300.0 * 1300.0))
            total -= (10.0 ** (45.0 / 10.0)) * rin
        return max(total, 1.0)

    def reflectivity_dbz(self, xyz_m: np.ndarray, elapsed_s: float) -> float:
        return clamp(10.0 * log10(self.reflectivity_linear_z(xyz_m, elapsed_s)), 0.0, 75.0)

    def perturbation_wind_mps(self, xyz_m: np.ndarray, elapsed_s: float) -> np.ndarray:
        rel = self.relative_xyz(xyz_m, elapsed_s)
        if self.mode == "supercell":
            wind = self._supercell_perturbation(rel)
        elif self.mode == "qlcs":
            wind = self._qlcs_perturbation(rel)
        else:
            wind = np.zeros(3, dtype=float)
        cr = cos(self.orientation_rad)
        sr = sin(self.orientation_rad)
        return np.array([wind[0] * cr - wind[1] * sr, wind[0] * sr + wind[1] * cr, wind[2]], dtype=float)

    def _supercell_perturbation(self, rel: np.ndarray) -> np.ndarray:
        wind = np.zeros(3, dtype=float)
        wind += rankine_vortex(rel, center=(0.0, 800.0), z_center=4500.0, z_sigma=2800.0, r_core=3500.0, vmax_mps=45.0 * KNOT_TO_MPS * self.rotation, alpha=0.72)
        wind += rankine_vortex(rel, center=(-2400.0, -900.0), z_center=900.0, z_sigma=850.0, r_core=260.0, vmax_mps=85.0 * KNOT_TO_MPS * self.rotation, alpha=0.82)
        wind += convergence_field(rel, center=(-1700.0, -1200.0), z_top=1600.0, sigma=2400.0, vmax_mps=22.0 * self.rotation)
        wind += divergence_field(rel, center=(3500.0, 4400.0), z_center=650.0, z_sigma=620.0, sigma=3000.0, vmax_mps=26.0 * self.intensity)
        wind += divergence_field(rel, center=(7600.0, 8200.0), z_center=11_500.0, z_sigma=2300.0, sigma=8200.0, vmax_mps=34.0 * self.intensity)
        return wind

    def _qlcs_perturbation(self, rel: np.ndarray) -> np.ndarray:
        x, y, z = rel
        leading = exp(-((x - 1800.0) ** 2) / (2.0 * 2100.0 * 2100.0)) * exp(-(y * y) / (2.0 * 23_000.0 * 23_000.0))
        rear_jet = exp(-((x + 2200.0) ** 2) / (2.0 * 4200.0 * 4200.0)) * exp(-(y * y) / (2.0 * 13_000.0 * 13_000.0)) * exp(-((z - 2300.0) ** 2) / (2.0 * 1600.0 * 1600.0))
        wind = np.array([34.0 * leading + 42.0 * rear_jet, 0.12 * y * leading / 1000.0, -10.0 * rear_jet], dtype=float)
        for offset_y in (-9000.0, 9000.0):
            wind += rankine_vortex(rel, center=(2100.0, offset_y), z_center=1100.0, z_sigma=1300.0, r_core=1800.0, vmax_mps=24.0 * KNOT_TO_MPS, alpha=0.7)
        return wind


def rankine_vortex(rel: np.ndarray, center: tuple[float, float], z_center: float, z_sigma: float, r_core: float, vmax_mps: float, alpha: float) -> np.ndarray:
    dx = float(rel[0] - center[0])
    dy = float(rel[1] - center[1])
    z = float(rel[2])
    distance = max(sqrt(dx * dx + dy * dy), 1.0)
    if distance <= r_core:
        vt = vmax_mps * distance / r_core
    else:
        vt = vmax_mps * (r_core / distance) ** alpha
    vertical_weight = exp(-((z - z_center) ** 2) / (2.0 * z_sigma * z_sigma))
    tangent_x = -dy / distance * vt * vertical_weight
    tangent_y = dx / distance * vt * vertical_weight
    return np.array([tangent_x, tangent_y, 0.0], dtype=float)


def divergence_field(rel: np.ndarray, center: tuple[float, float], z_center: float, z_sigma: float, sigma: float, vmax_mps: float) -> np.ndarray:
    dx = float(rel[0] - center[0])
    dy = float(rel[1] - center[1])
    z = float(rel[2])
    distance = max(sqrt(dx * dx + dy * dy), 1.0)
    radial = vmax_mps * (1.0 - exp(-(distance * distance) / (2.0 * sigma * sigma)))
    envelope = exp(-(distance * distance) / (2.0 * (sigma * 1.55) ** 2)) * exp(-((z - z_center) ** 2) / (2.0 * z_sigma * z_sigma))
    return np.array([dx / distance * radial * envelope, dy / distance * radial * envelope, -0.32 * radial * envelope], dtype=float)


def convergence_field(rel: np.ndarray, center: tuple[float, float], z_top: float, sigma: float, vmax_mps: float) -> np.ndarray:
    if rel[2] > z_top:
        return np.zeros(3, dtype=float)
    return -divergence_field(rel, center, z_center=z_top * 0.45, z_sigma=z_top * 0.55, sigma=sigma, vmax_mps=vmax_mps)


@dataclass(frozen=True)
class RadarSite:
    lat_deg: float
    lon_deg: float
    antenna_height_m: float = 300.0
    identifier: str = "KXXX"
    office: str = "PADUCAH"


@dataclass
class RadarVolume:
    azimuth_deg: np.ndarray
    range_m: np.ndarray
    tilts: dict[float, dict[str, np.ndarray]]


class NexradRadarSampler:
    def __init__(
        self,
        site: RadarSite,
        sounding: SoundingProfile,
        storms: Sequence[StormCell],
        azimuth_step_deg: float = 1.0,
        range_gate_m: float = 250.0,
        max_range_m: float = 230_000.0,
    ) -> None:
        self.site = site
        self.sounding = sounding
        self.storms = list(storms)
        self.azimuth_deg = np.arange(0.0, 360.0, azimuth_step_deg)
        self.range_m = np.arange(range_gate_m, max_range_m + range_gate_m, range_gate_m)

    @staticmethod
    def beam_height_m(range_m: float, elevation_deg: float, antenna_height_m: float) -> float:
        theta = radians(elevation_deg)
        effective_radius = REFRACTION_INDEX * EARTH_RADIUS_M
        return sqrt(range_m * range_m + effective_radius * effective_radius + 2.0 * range_m * effective_radius * sin(theta)) - effective_radius + antenna_height_m

    @staticmethod
    def beam_width_m(range_m: float) -> float:
        return 2.0 * range_m * tan(radians(BEAMWIDTH_DEG) / 2.0)

    @staticmethod
    def alias_velocity_mps(velocity_mps: float) -> float:
        folded = ((velocity_mps + NYQUIST_MPS) % (2.0 * NYQUIST_MPS)) - NYQUIST_MPS
        return folded

    def gate_xyz_m(self, range_m: float, azimuth_deg: float, elevation_deg: float) -> np.ndarray:
        az = radians(azimuth_deg)
        x = range_m * sin(az)
        y = range_m * cos(az)
        z = self.beam_height_m(range_m, elevation_deg, self.site.antenna_height_m)
        return np.array([x, y, z], dtype=float)

    def destination_latlon(self, range_m: float, azimuth_deg: float) -> tuple[float, float]:
        angular = range_m / EARTH_RADIUS_M
        az = radians(azimuth_deg)
        lat0 = radians(self.site.lat_deg)
        lon0 = radians(self.site.lon_deg)
        lat = np.arcsin(sin(lat0) * cos(angular) + cos(lat0) * sin(angular) * cos(az))
        lon = lon0 + atan2(sin(az) * sin(angular) * cos(lat0), cos(angular) - sin(lat0) * sin(lat))
        return float(np.degrees(lat)), float((np.degrees(lon) + 540.0) % 360.0 - 180.0)

    def radial_velocity_mps(self, wind_mps: np.ndarray, azimuth_deg: float, elevation_deg: float) -> float:
        az = radians(azimuth_deg)
        elev = radians(elevation_deg)
        return float(wind_mps[0] * cos(elev) * sin(az) + wind_mps[1] * cos(elev) * cos(az) + wind_mps[2] * sin(elev))

    def sample_gate(self, range_m: float, azimuth_deg: float, elevation_deg: float, elapsed_s: float) -> tuple[float, float, float]:
        center = self.gate_xyz_m(range_m, azimuth_deg, elevation_deg)
        width = max(self.beam_width_m(range_m), 125.0)
        offsets = np.linspace(-0.5 * width, 0.5 * width, 5)
        weights = np.exp(-4.0 * log(2.0) * (offsets / width) ** 2)
        linear_z_values: list[float] = []
        radial_values: list[float] = []
        for offset, weight in zip(offsets, weights):
            xyz = center.copy()
            xyz[2] = max(0.0, xyz[2] + float(offset))
            linear_z = 1.0
            ambient_u, ambient_v = self.sounding.wind_at_mps(float(xyz[2]))
            wind = np.array([ambient_u, ambient_v, 0.0], dtype=float)
            for storm in self.storms:
                storm_z = storm.reflectivity_linear_z(xyz, elapsed_s)
                linear_z += storm_z
                storm_weight = clamp((10.0 * log10(max(storm_z, 1.0)) - 10.0) / 55.0, 0.0, 1.0)
                wind += storm.perturbation_wind_mps(xyz, elapsed_s) * storm_weight
            linear_z_values.append(linear_z * float(weight))
            radial_values.append(self.radial_velocity_mps(wind, azimuth_deg, elevation_deg) * float(weight))
        total_weight = float(np.sum(weights))
        mean_linear_z = float(np.sum(linear_z_values) / total_weight)
        dbz = clamp(10.0 * log10(max(mean_linear_z, 1.0)), 0.0, 75.0)
        velocity = self.alias_velocity_mps(float(np.sum(radial_values) / total_weight))
        spectral_width = self.spectral_width_mps(center, azimuth_deg, elevation_deg, elapsed_s)
        return dbz, velocity * MPS_TO_KNOT, spectral_width

    def spectral_width_mps(self, xyz_m: np.ndarray, azimuth_deg: float, elevation_deg: float, elapsed_s: float) -> float:
        offsets = (
            np.array([250.0, 0.0, 0.0]),
            np.array([-250.0, 0.0, 0.0]),
            np.array([0.0, 250.0, 0.0]),
            np.array([0.0, -250.0, 0.0]),
        )
        velocities: list[float] = []
        for offset in offsets:
            sample = xyz_m + offset
            ambient_u, ambient_v = self.sounding.wind_at_mps(float(sample[2]))
            wind = np.array([ambient_u, ambient_v, 0.0], dtype=float)
            hail_boost = 0.0
            for storm in self.storms:
                dbz = storm.reflectivity_dbz(sample, elapsed_s)
                wind += storm.perturbation_wind_mps(sample, elapsed_s) * clamp((dbz - 20.0) / 45.0, 0.0, 1.0)
                hail_boost = max(hail_boost, clamp((dbz - 58.0) / 15.0, 0.0, 1.0) * 5.0)
            velocities.append(self.radial_velocity_mps(wind, azimuth_deg, elevation_deg))
        return clamp(float(np.std(velocities)) + hail_boost, 0.0, 18.0)

    def generate_volume(self, elapsed_s: float, tilts_deg: Sequence[float] = NEXRAD_TILTS_DEG) -> RadarVolume:
        tilt_data: dict[float, dict[str, np.ndarray]] = {}
        shape = (len(self.azimuth_deg), len(self.range_m))
        for tilt in tilts_deg:
            reflectivity = np.zeros(shape, dtype=np.float32)
            velocity = np.zeros(shape, dtype=np.float32)
            spectral_width = np.zeros(shape, dtype=np.float32)
            for az_idx, azimuth in enumerate(self.azimuth_deg):
                for range_idx, range_m in enumerate(self.range_m):
                    dbz, vel_kt, sw = self.sample_gate(float(range_m), float(azimuth), float(tilt), elapsed_s)
                    reflectivity[az_idx, range_idx] = dbz
                    velocity[az_idx, range_idx] = vel_kt
                    spectral_width[az_idx, range_idx] = sw
            tilt_data[float(tilt)] = {
                "reflectivity_dbz": reflectivity,
                "radial_velocity_kt": velocity,
                "spectral_width_ms": spectral_width,
            }
        return RadarVolume(self.azimuth_deg.copy(), self.range_m.copy(), tilt_data)


@dataclass(frozen=True)
class CountyFeature:
    name: str
    state: str
    fips: str
    polygon: tuple[tuple[float, float], ...]


@dataclass(frozen=True)
class CityFeature:
    name: str
    lat: float
    lon: float
    population: int


@dataclass(frozen=True)
class HighwayFeature:
    name: str
    points: tuple[tuple[float, float], ...]


@dataclass
class MockGISDatabase:
    counties: list[CountyFeature]
    cities: list[CityFeature]
    highways: list[HighwayFeature]

    @classmethod
    def paducah_demo(cls) -> "MockGISDatabase":
        counties = [
            CountyFeature("MASSAC", "ILLINOIS", "ILC127", ((37.00, -89.05), (37.34, -89.04), (37.35, -88.55), (37.02, -88.50))),
            CountyFeature("POPE", "ILLINOIS", "ILC151", ((37.20, -88.72), (37.55, -88.72), (37.56, -88.20), (37.18, -88.24))),
            CountyFeature("MCCRACKEN", "KENTUCKY", "KYC145", ((36.92, -88.92), (37.18, -88.92), (37.18, -88.45), (36.90, -88.44))),
            CountyFeature("BALLARD", "KENTUCKY", "KYC007", ((36.85, -89.18), (37.15, -89.18), (37.16, -88.90), (36.84, -88.88))),
        ]
        cities = [
            CityFeature("METROPOLIS", 37.151, -88.732, 6000),
            CityFeature("BROOKPORT", 37.123, -88.630, 950),
            CityFeature("ROUND KNOB", 37.257, -88.723, 350),
            CityFeature("PADUCAH", 37.083, -88.600, 27_000),
            CityFeature("LONE OAK", 37.038, -88.670, 4500),
            CityFeature("REIDLAND", 37.017, -88.531, 4400),
        ]
        highways = [
            HighwayFeature("I-24", ((37.11, -88.86), (37.09, -88.72), (37.07, -88.58), (37.02, -88.45))),
            HighwayFeature("US-45", ((37.33, -88.74), (37.20, -88.70), (37.08, -88.64), (36.96, -88.58))),
        ]
        return cls(counties, cities, highways)


def point_in_polygon(point: tuple[float, float], polygon: Sequence[tuple[float, float]]) -> bool:
    lat, lon = point
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        lat_i, lon_i = polygon[i]
        lat_j, lon_j = polygon[j]
        intersects = (lon_i > lon) != (lon_j > lon) and lat < (lat_j - lat_i) * (lon - lon_i) / max(lon_j - lon_i, 1e-9) + lat_i
        if intersects:
            inside = not inside
        j = i
    return inside


def segments_intersect(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], d: tuple[float, float]) -> bool:
    def orient(p: tuple[float, float], q: tuple[float, float], r: tuple[float, float]) -> float:
        return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])

    o1 = orient(a, b, c)
    o2 = orient(a, b, d)
    o3 = orient(c, d, a)
    o4 = orient(c, d, b)
    return o1 * o2 < 0.0 and o3 * o4 < 0.0


def polygons_intersect(first: Sequence[tuple[float, float]], second: Sequence[tuple[float, float]]) -> bool:
    if any(point_in_polygon(point, second) for point in first):
        return True
    if any(point_in_polygon(point, first) for point in second):
        return True
    for idx, a in enumerate(first):
        b = first[(idx + 1) % len(first)]
        for jdx, c in enumerate(second):
            d = second[(jdx + 1) % len(second)]
            if segments_intersect(a, b, c, d):
                return True
    return False


@dataclass(frozen=True)
class ThreatState:
    peak_dbz: float
    downburst_wind_kt: float
    hail_size_in: float
    tvs_delta_v_kt: float
    debris_signature: bool

    def tornado_tag(self) -> str:
        if self.tvs_delta_v_kt >= 65.0 and self.debris_signature:
            return "OBSERVED"
        if self.tvs_delta_v_kt >= 40.0:
            return "RADAR INDICATED"
        return "POSSIBLE"

    def wind_tag_mph(self) -> int:
        if self.peak_dbz >= 68.0 or self.downburst_wind_kt >= 70.0:
            return 80
        if self.downburst_wind_kt >= 50.0:
            return 60
        return 50

    def hail_tag_in(self) -> float:
        if self.peak_dbz >= 68.0:
            return max(2.75, self.hail_size_in)
        if self.peak_dbz >= 55.0:
            return max(1.00, self.hail_size_in)
        return self.hail_size_in


class WarnGenCompiler:
    def __init__(self, site: RadarSite, gis: MockGISDatabase) -> None:
        self.site = site
        self.gis = gis

    def validate_polygon(self, polygon: Sequence[tuple[float, float]]) -> None:
        if len(polygon) < 3:
            raise ValueError("Warning polygon must contain at least three vertices.")
        if len(polygon) > 30:
            raise ValueError("Warning polygon exceeds the 30 vertex WarnGen cap.")
        if polygon_area_square_miles(polygon) > 3000.0:
            raise ValueError("Warning polygon exceeds 3000 square miles.")
        for idx, a in enumerate(polygon):
            b = polygon[(idx + 1) % len(polygon)]
            for jdx, c in enumerate(polygon):
                if abs(idx - jdx) <= 1 or {idx, jdx} == {0, len(polygon) - 1}:
                    continue
                d = polygon[(jdx + 1) % len(polygon)]
                if segments_intersect(a, b, c, d):
                    raise ValueError("Warning polygon is self-intersecting.")

    def intersect_counties(self, polygon: Sequence[tuple[float, float]]) -> list[CountyFeature]:
        return [county for county in self.gis.counties if polygons_intersect(polygon, county.polygon)]

    def track_from_two_positions(self, current: tuple[float, float], previous_15_min: tuple[float, float]) -> tuple[float, float]:
        distance_m, bearing_to = haversine_distance_bearing(previous_15_min, current)
        speed_kt = (distance_m / (15.0 * 60.0)) * MPS_TO_KNOT
        from_direction = (bearing_to + 180.0) % 360.0
        return from_direction, speed_kt

    def translate_point(self, point: tuple[float, float], from_direction_deg: float, speed_kt: float, minutes: float) -> tuple[float, float]:
        toward = (from_direction_deg + 180.0) % 360.0
        distance_m = speed_kt * KNOT_TO_MPS * minutes * 60.0
        return haversine_forward(point[0], point[1], distance_m, toward)

    def cities_in_track(self, polygon: Sequence[tuple[float, float]], from_direction_deg: float, speed_kt: float, issue_time: datetime) -> list[str]:
        impacts: list[str] = []
        for minutes in range(0, 65, 5):
            shifted = [self.translate_point(point, from_direction_deg, speed_kt, minutes) for point in polygon]
            for city in self.gis.cities:
                if point_in_polygon((city.lat, city.lon), shifted):
                    local = issue_time + timedelta(minutes=minutes)
                    label = f"{city.name} AROUND {local.strftime('%-I%M %p')} CDT"
                    if label not in impacts:
                        impacts.append(label)
        return impacts[:12]

    def compile_warning(
        self,
        product: str,
        polygon: Sequence[tuple[float, float]],
        issue_time: datetime,
        duration_min: int,
        from_direction_deg: float,
        speed_kt: float,
        storm_location: tuple[float, float],
        threat: ThreatState,
        event_number: int = 42,
    ) -> str:
        self.validate_polygon(polygon)
        counties = self.intersect_counties(polygon)
        if not counties:
            counties = sorted(self.gis.counties, key=lambda county: abs(county.polygon[0][0] - storm_location[0]) + abs(county.polygon[0][1] - storm_location[1]))[:1]
        expiration = issue_time + timedelta(minutes=duration_min)
        product = product.upper()
        pil = {"TOR": "TOR", "SVR": "SVR", "FFW": "FFW"}[product]
        warning_name = {"TOR": "TORNADO WARNING", "SVR": "SEVERE THUNDERSTORM WARNING", "FFW": "FLASH FLOOD WARNING"}[product]
        wmo = {"TOR": "WFUS53", "SVR": "WUUS53", "FFW": "WGUS53"}[product]
        ugc = "-".join(county.fips for county in counties) + f"-{expiration.strftime('%d%H%M')}-"
        vtec_hazard = {"TOR": "TO", "SVR": "SV", "FFW": "FF"}[product]
        vtec = f"/O.NEW.{self.site.identifier}.{vtec_hazard}.W.{event_number:04d}.{issue_time.strftime('%y%m%dT%H%MZ')}-{expiration.strftime('%y%m%dT%H%MZ')}/"
        nearest = min(self.gis.cities, key=lambda city: haversine_distance_bearing((city.lat, city.lon), storm_location)[0])
        cities = self.cities_in_track(polygon, from_direction_deg, speed_kt, issue_time)
        county_lines = "\n".join(f"* {county.name} COUNTY IN {county.state}..." for county in counties)
        latlon = " ".join(f"{int(round(lat * 100)):04d} {abs(int(round(lon * 100))):04d}" for lat, lon in polygon)
        issue_stamp = issue_time.strftime("%-I%M %p CDT %a %b %-d %Y").upper()
        hazard, source, impact, tags = self._hazard_text(product, threat)
        location_line = f"AT {issue_time.strftime('%-I%M %p CDT').upper()}, A {source.lower()} WAS LOCATED NEAR {nearest.name}, MOVING {compass_word((from_direction_deg + 180.0) % 360.0)} AT {round(speed_kt)} KNOTS."
        return "\n".join(
            [
                f"{wmo} {self.site.identifier} {issue_time.strftime('%d%H%M')}",
                f"{pil}{self.site.identifier[1:]}",
                "",
                "BULLETIN - EAS ACTIVATION REQUESTED",
                warning_name,
                f"NATIONAL WEATHER SERVICE {self.site.office} KY",
                issue_stamp,
                "",
                f"{ugc}",
                f"{vtec}",
                "",
                f"THE NATIONAL WEATHER SERVICE IN {self.site.office} HAS ISSUED A",
                f"{warning_name} FOR...",
                county_lines,
                "",
                f"* UNTIL {expiration.strftime('%-I%M %p CDT').upper()}.",
                "",
                f"* {location_line}",
                "",
                f"  HAZARD...{hazard}.",
                f"  SOURCE...{source}.",
                f"  IMPACT...{impact}.",
                "",
                "LOCATIONS IMPACTED INCLUDE...",
                ". ".join(cities) + "." if cities else f"{nearest.name}.",
                "",
                "PRECAUTIONARY/PREPAREDNESS ACTIONS...",
                self._preparedness(product),
                "",
                "&&",
                "",
                f"LAT...LON {latlon}",
                f"TIME...MOT...LOC {issue_time.strftime('%H%MZ')} {round(from_direction_deg):03d}DEG {round(speed_kt)}KT {int(round(storm_location[0] * 100)):04d} {abs(int(round(storm_location[1] * 100))):04d}",
                *tags,
            ]
        )

    def _hazard_text(self, product: str, threat: ThreatState) -> tuple[str, str, str, list[str]]:
        wind_mph = threat.wind_tag_mph()
        hail_in = threat.hail_tag_in()
        if product == "TOR":
            tornado_tag = threat.tornado_tag()
            hazard = "DAMAGING TORNADO AND BASEBALL SIZE HAIL" if tornado_tag == "OBSERVED" else "TORNADO AND LARGE HAIL"
            source = "RADAR CONFIRMED TORNADO DEBRIS SIGNATURE" if tornado_tag == "OBSERVED" else "RADAR INDICATED ROTATION"
            impact = "FLYING DEBRIS WILL BE DANGEROUS TO THOSE CAUGHT WITHOUT SHELTER"
            return hazard, source, impact, [f"TORNADO...{tornado_tag}", f"MAX HAIL SIZE...{hail_in:.2f} IN"]
        if product == "SVR":
            hazard = f"{wind_mph} MPH WIND GUSTS AND {hail_in:.2f} INCH HAIL"
            source = "RADAR INDICATED"
            impact = "HAIL DAMAGE TO VEHICLES IS EXPECTED AND WIND DAMAGE TO ROOFS AND TREES IS LIKELY"
            return hazard, source, impact, [f"WIND...{wind_mph}MPH", f"HAIL...{hail_in:.2f}IN"]
        return "FLASH FLOODING CAUSED BY THUNDERSTORMS", "RADAR INDICATED", "LOW WATER CROSSINGS MAY BECOME IMPASSABLE", ["FLASH FLOOD...RADAR INDICATED"]

    @staticmethod
    def _preparedness(product: str) -> str:
        if product == "TOR":
            return "TAKE COVER NOW! MOVE TO A BASEMENT OR AN INTERIOR ROOM ON THE LOWEST FLOOR OF A STURDY BUILDING."
        if product == "SVR":
            return "FOR YOUR PROTECTION MOVE TO AN INTERIOR ROOM ON THE LOWEST FLOOR OF A BUILDING."
        return "TURN AROUND, DO NOT DROWN WHEN ENCOUNTERING FLOODED ROADS."


def haversine_forward(lat_deg: float, lon_deg: float, distance_m: float, bearing_deg: float) -> tuple[float, float]:
    lat1 = radians(lat_deg)
    lon1 = radians(lon_deg)
    bearing = radians(bearing_deg)
    angular = distance_m / EARTH_RADIUS_M
    lat2 = np.arcsin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(bearing))
    lon2 = lon1 + atan2(sin(bearing) * sin(angular) * cos(lat1), cos(angular) - sin(lat1) * sin(lat2))
    return float(np.degrees(lat2)), float((np.degrees(lon2) + 540.0) % 360.0 - 180.0)


def haversine_distance_bearing(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    lat1 = radians(a[0])
    lat2 = radians(b[0])
    dlat = lat2 - lat1
    dlon = radians(b[1] - a[1])
    h = sin(dlat / 2.0) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2.0) ** 2
    distance = 2.0 * EARTH_RADIUS_M * np.arcsin(min(1.0, sqrt(h)))
    y = sin(dlon) * cos(lat2)
    x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    bearing = (np.degrees(atan2(y, x)) + 360.0) % 360.0
    return float(distance), float(bearing)


def compass_word(direction_deg: float) -> str:
    names = ("NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST")
    return names[int((direction_deg + 22.5) // 45.0) % 8]


def demo() -> None:
    sounding = SoundingProfile.synthetic_severe()
    metrics = sounding.metrics()
    storm = StormCell.supercell((0.0, 0.0), metrics.storm_motion, metrics.supercell_variant or "classic", intensity=1.0, rotation=1.0)
    site = RadarSite(37.068, -88.772, 134.0, "KPAH", "PADUCAH")
    sampler = NexradRadarSampler(site, sounding, [storm], azimuth_step_deg=5.0, range_gate_m=1000.0, max_range_m=25_000.0)
    volume = sampler.generate_volume(elapsed_s=0.0)
    base = volume.tilts[0.5]
    threat = ThreatState(
        peak_dbz=float(np.max(base["reflectivity_dbz"])),
        downburst_wind_kt=float(np.max(np.power(np.abs(base["radial_velocity_kt"]), 0.969457))),
        hail_size_in=1.5,
        tvs_delta_v_kt=60.0,
        debris_signature=True,
    )
    warngen = WarnGenCompiler(site, MockGISDatabase.paducah_demo())
    polygon = ((37.12, -88.72), (37.34, -88.51), (37.21, -88.32), (37.01, -88.64))
    text = warngen.compile_warning("TOR", polygon, datetime(2026, 6, 8, 0, 45, tzinfo=timezone.utc), 45, 245.0, 35.0, (37.15, -88.70), threat)
    print(f"MODE={metrics.selected_mode} CAPE={metrics.cape_jkg:.0f} SHEAR06={metrics.shear_0_6km_kt:.0f} SRH01={metrics.srh_0_1km:.0f}")
    print(f"BASE_MAX_DBZ={threat.peak_dbz:.1f} MAX_VEL={threat.downburst_wind_kt:.1f}KT")
    print(text.splitlines()[0])


if __name__ == "__main__":
    demo()
