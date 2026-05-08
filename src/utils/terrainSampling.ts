import { sampleDem, type DemData } from "../terrain/demData";
import { lonLatToLocal, type ProjectionContext } from "./geo";
import type { ParcelGeoJSONFeature } from "../layers/createParcelBoundary";

/**
 * Anchor for the property design.
 *
 * Local frame convention used throughout the property module:
 *   Local +X parallel to the front face of the house. With the default
 *     anchor rotation, +X maps to world +Z (south, the "left" of the house).
 *   Local +Z perpendicular to the front face, pointing OUT the front. With
 *     the default anchor rotation, +Z maps to world -X (west).
 *   Local +Y up.
 *
 * For an anchor whose `rotationY` makes the front face point west:
 *     rotationY = atan2(outwardX, outwardZ)
 * where (outwardX, outwardZ) is the world-meter outward normal of the
 * western parcel edge. For a perfectly west-facing edge that simplifies to
 * `rotationY = -Math.PI / 2`.
 */
export interface PropertyAnchor {
  x: number;
  z: number;
  rotationY: number;
}

/** Convert a point expressed in the property's local meter frame to world meters. */
export function localToWorld(
  anchor: PropertyAnchor,
  localX: number,
  localZ: number
): { x: number; z: number } {
  const c = Math.cos(anchor.rotationY);
  const s = Math.sin(anchor.rotationY);
  return {
    x: anchor.x + localX * c + localZ * s,
    z: anchor.z - localX * s + localZ * c
  };
}

export interface FootprintSamples {
  /** Flat list of elevation samples in meters across the rotated footprint. */
  samples: number[];
  min: number;
  max: number;
  /** Mean elevation along the local +Z edge (the front / world-west side at default rotation). */
  westEdgeMean: number;
  /** Mean elevation along the local -Z edge (the rear / world-east side). */
  eastEdgeMean: number;
  /** Mean elevation along the local +X edge (the world-south / "left" side). */
  southEdgeMean: number;
  /** Mean elevation along the local -X edge (the world-north / "right" side). */
  northEdgeMean: number;
  /** Mean elevation across the entire footprint. */
  mean: number;
}

/**
 * Sample DEM elevations across a rotated rectangular footprint in the
 * property's local frame. Returns the flat sample list plus per-edge averages
 * so callers can derive things like a finished-floor reference from the
 * west-side grade.
 */
export function sampleTerrainHeightsInFootprint(
  dem: DemData,
  anchor: PropertyAnchor,
  localCenterX: number,
  localCenterZ: number,
  localWidthMeters: number,
  localDepthMeters: number,
  samplesPerSide: number
): FootprintSamples {
  const N = Math.max(2, Math.floor(samplesPerSide));
  const halfW = localWidthMeters / 2;
  const halfD = localDepthMeters / 2;

  const samples: number[] = new Array(N * N);
  const westEdge: number[] = [];
  const eastEdge: number[] = [];
  const southEdge: number[] = [];
  const northEdge: number[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;

  for (let j = 0; j < N; j++) {
    const tz = N === 1 ? 0.5 : j / (N - 1);
    const lz = localCenterZ - halfD + tz * (halfD * 2);
    for (let i = 0; i < N; i++) {
      const tx = N === 1 ? 0.5 : i / (N - 1);
      const lx = localCenterX - halfW + tx * (halfW * 2);
      const w = localToWorld(anchor, lx, lz);
      const e = sampleDem(dem, w.x, w.z);
      const idx = j * N + i;
      samples[idx] = e;
      if (e < min) min = e;
      if (e > max) max = e;
      sum += e;
      if (j === N - 1) westEdge.push(e);
      if (j === 0) eastEdge.push(e);
      if (i === N - 1) southEdge.push(e);
      if (i === 0) northEdge.push(e);
    }
  }

  return {
    samples,
    min,
    max,
    mean: sum / samples.length,
    westEdgeMean: mean(westEdge),
    eastEdgeMean: mean(eastEdge),
    southEdgeMean: mean(southEdge),
    northEdgeMean: mean(northEdge)
  };
}

export interface CutFillResult {
  /** Max amount of terrain above the pad (cut required), in meters. Always >= 0. */
  maxCutMeters: number;
  /** Max amount of terrain below the pad (fill required), in meters. Always >= 0. */
  maxFillMeters: number;
  meanCutMeters: number;
  meanFillMeters: number;
  /** Approximate footprint area requiring cut (m^2). */
  cutAreaMeters2: number;
  /** Approximate footprint area requiring fill (m^2). */
  fillAreaMeters2: number;
  /** Total footprint area sampled (m^2). */
  totalAreaMeters2: number;
}

/**
 * Compute cut/fill statistics for a level pad at `targetElevationMeters` over
 * a rotated rectangular footprint. "Cut" means terrain rises above the pad,
 * "fill" means terrain sits below the pad.
 */
export function calculatePadCutFill(
  dem: DemData,
  anchor: PropertyAnchor,
  localCenterX: number,
  localCenterZ: number,
  localWidthMeters: number,
  localDepthMeters: number,
  targetElevationMeters: number,
  samplesPerSide: number
): CutFillResult {
  const N = Math.max(2, Math.floor(samplesPerSide));
  const fp = sampleTerrainHeightsInFootprint(
    dem,
    anchor,
    localCenterX,
    localCenterZ,
    localWidthMeters,
    localDepthMeters,
    N
  );

  const cellArea =
    (localWidthMeters * localDepthMeters) / (fp.samples.length || 1);

  let maxCut = 0;
  let maxFill = 0;
  let cutSum = 0;
  let fillSum = 0;
  let cutCells = 0;
  let fillCells = 0;
  const TOLERANCE = 0.05;

  for (const e of fp.samples) {
    const delta = e - targetElevationMeters;
    if (delta > TOLERANCE) {
      if (delta > maxCut) maxCut = delta;
      cutSum += delta;
      cutCells++;
    } else if (delta < -TOLERANCE) {
      const fill = -delta;
      if (fill > maxFill) maxFill = fill;
      fillSum += fill;
      fillCells++;
    }
  }

  return {
    maxCutMeters: maxCut,
    maxFillMeters: maxFill,
    meanCutMeters: cutCells > 0 ? cutSum / cutCells : 0,
    meanFillMeters: fillCells > 0 ? fillSum / fillCells : 0,
    cutAreaMeters2: cutCells * cellArea,
    fillAreaMeters2: fillCells * cellArea,
    totalAreaMeters2: localWidthMeters * localDepthMeters
  };
}

/**
 * Seed an editable property anchor from the parcel boundary. Picks the
 * longest parcel edge whose outward normal points roughly west (negative X
 * in local meters) and places the house center inside the parcel by:
 *
 *   anchor = westEdgeMidpoint + (setback + houseDepth/2) * inwardDirection
 *
 * `rotationY` is chosen so the local +Z axis (front-out direction) maps to
 * the parcel edge's outward normal in world coords.
 *
 * Falls back to the world origin with `rotationY = -PI/2` if the parcel has
 * no west-facing edge.
 */
export function seedAnchorFromParcel(
  feature: ParcelGeoJSONFeature,
  proj: ProjectionContext,
  options: { houseDepthMeters: number; setbackMeters: number }
): PropertyAnchor {
  const fallback: PropertyAnchor = { x: 0, z: 0, rotationY: -Math.PI / 2 };
  const ring = feature.geometry.coordinates[0];
  if (!ring || ring.length < 4) return fallback;

  const points = ring.map(([lon, lat]) => lonLatToLocal(lon, lat, proj));
  const isClosed =
    points.length > 1 &&
    points[0].x === points[points.length - 1].x &&
    points[0].z === points[points.length - 1].z;
  const unique = isClosed ? points.slice(0, -1) : points.slice();
  if (unique.length < 3) return fallback;

  let cx = 0;
  let cz = 0;
  for (const p of unique) {
    cx += p.x;
    cz += p.z;
  }
  cx /= unique.length;
  cz /= unique.length;

  const closed = [...unique, unique[0]];
  let bestEdge: {
    midX: number;
    midZ: number;
    outwardX: number;
    outwardZ: number;
    len: number;
  } | null = null;

  for (let i = 0; i < closed.length - 1; i++) {
    const a = closed[i];
    const b = closed[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1) continue;
    let nx = -dz / len;
    let nz = dx / len;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    if (nx * (cx - midX) + nz * (cz - midZ) > 0) {
      nx = -nx;
      nz = -nz;
    }
    if (nx < 0 && (!bestEdge || len > bestEdge.len)) {
      bestEdge = { midX, midZ, outwardX: nx, outwardZ: nz, len };
    }
  }

  if (!bestEdge) return fallback;

  const inwardX = -bestEdge.outwardX;
  const inwardZ = -bestEdge.outwardZ;
  const offset = options.setbackMeters + options.houseDepthMeters / 2;
  return {
    x: bestEdge.midX + offset * inwardX,
    z: bestEdge.midZ + offset * inwardZ,
    rotationY: Math.atan2(bestEdge.outwardX, bestEdge.outwardZ)
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}
