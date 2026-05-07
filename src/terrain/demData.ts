export interface DemData {
  /** Geographic center used to derive the local origin. */
  center: { lat: number; lon: number };
  widthMeters: number;
  depthMeters: number;
  rows: number;
  cols: number;
  minElevationMeters: number;
  maxElevationMeters: number;
  /** Row-major elevations in meters. elevations[row][col]. row 0 is +z (south) edge by convention. */
  elevations: number[][];
}

export interface DemDataPair {
  existing: DemData;
  proposed: DemData;
}

export function cloneDem(dem: DemData): DemData {
  return {
    ...dem,
    center: { ...dem.center },
    elevations: dem.elevations.map((row) => row.slice())
  };
}

export function demExtents(dem: DemData): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  return {
    minX: -dem.widthMeters / 2,
    maxX: dem.widthMeters / 2,
    minZ: -dem.depthMeters / 2,
    maxZ: dem.depthMeters / 2
  };
}

/** Sample DEM elevation at local meter coordinate. Bilinear interpolation, clamped to bounds. */
export function sampleDem(dem: DemData, x: number, z: number): number {
  const { widthMeters, depthMeters, rows, cols, elevations } = dem;
  const cellX = widthMeters / (cols - 1);
  const cellZ = depthMeters / (rows - 1);

  const u = (x + widthMeters / 2) / cellX;
  const v = (z + depthMeters / 2) / cellZ;

  const c0 = clampIndex(Math.floor(u), cols);
  const c1 = clampIndex(c0 + 1, cols);
  const r0 = clampIndex(Math.floor(v), rows);
  const r1 = clampIndex(r0 + 1, rows);

  const tu = clamp01(u - Math.floor(u));
  const tv = clamp01(v - Math.floor(v));

  const e00 = elevations[r0][c0];
  const e01 = elevations[r0][c1];
  const e10 = elevations[r1][c0];
  const e11 = elevations[r1][c1];

  const a = e00 * (1 - tu) + e01 * tu;
  const b = e10 * (1 - tu) + e11 * tu;
  return a * (1 - tv) + b * tv;
}

export function recomputeDemRange(dem: DemData): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const e = dem.elevations[r][c];
      if (e < min) min = e;
      if (e > max) max = e;
    }
  }
  dem.minElevationMeters = min;
  dem.maxElevationMeters = max;
}

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function clampIndex(i: number, n: number): number {
  if (i < 0) return 0;
  if (i > n - 1) return n - 1;
  return i;
}
