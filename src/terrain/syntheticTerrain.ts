import type { SiteConfig } from "../config/siteConfig";
import type { DemData } from "./demData";
import { recomputeDemRange } from "./demData";

/**
 * Build a synthetic-but-plausible existing terrain DEM around the site center.
 * Combines a planar slope, a soft ridge, and value-noise to feel like a real hillside.
 */
export function buildSyntheticDem(siteConfig: SiteConfig): DemData {
  const cfg = siteConfig.terrain.synthetic;
  const elevations: number[][] = [];

  const halfW = cfg.widthMeters / 2;
  const halfD = cfg.depthMeters / 2;

  const slopeRad = (cfg.slopeDirectionDegrees * Math.PI) / 180;
  const slopeDirX = Math.sin(slopeRad);
  const slopeDirZ = Math.cos(slopeRad);
  const slopeMetersPerMeter = cfg.slopePercent / 100;

  const noise = createValueNoise(1337);

  for (let r = 0; r < cfg.rows; r++) {
    const row: number[] = [];
    const z = -halfD + (r / (cfg.rows - 1)) * cfg.depthMeters;

    for (let c = 0; c < cfg.cols; c++) {
      const x = -halfW + (c / (cfg.cols - 1)) * cfg.widthMeters;

      const planar = (x * slopeDirX + z * slopeDirZ) * slopeMetersPerMeter;

      const ridge =
        cfg.ridgeAmplitudeMeters *
        Math.sin((x + 18) * 0.018) *
        Math.cos((z + 6) * 0.022);

      const macroNoise =
        cfg.noiseAmplitudeMeters * noise(x * 0.012, z * 0.012) +
        0.35 * cfg.noiseAmplitudeMeters * noise(x * 0.04, z * 0.04) +
        0.15 * cfg.noiseAmplitudeMeters * noise(x * 0.11, z * 0.11);

      const elevation = cfg.baseElevationMeters + planar + ridge + macroNoise;
      row.push(elevation);
    }
    elevations.push(row);
  }

  const dem: DemData = {
    center: { lat: siteConfig.center.lat, lon: siteConfig.center.lon },
    widthMeters: cfg.widthMeters,
    depthMeters: cfg.depthMeters,
    rows: cfg.rows,
    cols: cfg.cols,
    minElevationMeters: 0,
    maxElevationMeters: 0,
    elevations
  };
  recomputeDemRange(dem);
  return dem;
}

function createValueNoise(seed: number): (x: number, z: number) => number {
  const PRIME1 = 73856093;
  const PRIME2 = 19349663;

  function hash(ix: number, iz: number): number {
    let n = (ix * PRIME1) ^ (iz * PRIME2) ^ seed;
    n = (n << 13) ^ n;
    const v = (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
    return 1 - v / 1073741824;
  }

  function smooth(t: number): number {
    return t * t * (3 - 2 * t);
  }

  return (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;

    const v00 = hash(ix, iz);
    const v10 = hash(ix + 1, iz);
    const v01 = hash(ix, iz + 1);
    const v11 = hash(ix + 1, iz + 1);

    const sx = smooth(fx);
    const sz = smooth(fz);

    const a = v00 * (1 - sx) + v10 * sx;
    const b = v01 * (1 - sx) + v11 * sx;
    return a * (1 - sz) + b * sz;
  };
}
