import { cloneDem, recomputeDemRange, type DemData } from "./demData";
import type { PropertyAnchor } from "../utils/terrainSampling";

export interface GradingPadSpec {
  /** Identifies the pad in logs / debug. */
  id: string;
  /** Anchor whose rotation orients the pad in world space. */
  anchor: PropertyAnchor;
  /** Pad center in property local frame (meters). */
  localCenterX: number;
  localCenterZ: number;
  /** Pad size in local frame, meters along local +/- X and +/- Z. */
  widthMeters: number;
  depthMeters: number;
  /** Target ground elevation under this pad, in meters (absolute). */
  targetElevationMeters: number;
  /**
   * Feather distance outside the pad over which terrain transitions linearly
   * back to the natural elevation, meters. 0 = sharp pad edge.
   */
  featherMeters: number;
}

/**
 * Returns a new DEM where terrain inside each pad's footprint is set to the
 * pad's target elevation, with a linear feathered transition back to the
 * natural elevation outside the pad. When pads overlap, the cell with the
 * highest weight (= closest to the pad center, in pad-local distance) wins.
 *
 * The base DEM is left untouched. The original DEM remains the source of
 * truth for cut/fill analytics — this function produces a "what the terrain
 * would look like if we did the proposed grading" visualization DEM.
 */
export function applyProposedGrading(
  baseDem: DemData,
  pads: GradingPadSpec[]
): DemData {
  if (pads.length === 0) return baseDem;

  const dem = cloneDem(baseDem);
  const { widthMeters, depthMeters, rows, cols, elevations } = dem;
  const cellX = widthMeters / (cols - 1);
  const cellZ = depthMeters / (rows - 1);

  // Pre-compute trig per pad.
  const padCosSin = pads.map((p) => ({
    pad: p,
    cos: Math.cos(p.anchor.rotationY),
    sin: Math.sin(p.anchor.rotationY),
    halfW: p.widthMeters / 2,
    halfD: p.depthMeters / 2
  }));

  for (let r = 0; r < rows; r++) {
    const z = r * cellZ - depthMeters / 2;
    for (let c = 0; c < cols; c++) {
      const x = c * cellX - widthMeters / 2;
      const natural = elevations[r][c];

      let bestWeight = 0;
      let bestTarget = natural;

      for (const p of padCosSin) {
        const dx = x - p.pad.anchor.x;
        const dz = z - p.pad.anchor.z;
        // Inverse rotation of the anchor's rotationY (world -> local).
        const lx = dx * p.cos - dz * p.sin - p.pad.localCenterX;
        const lz = dx * p.sin + dz * p.cos - p.pad.localCenterZ;

        const overshootX = Math.abs(lx) - p.halfW;
        const overshootZ = Math.abs(lz) - p.halfD;
        const dist = Math.max(overshootX, overshootZ, 0);

        let weight: number;
        if (dist <= 0) {
          weight = 1;
        } else if (p.pad.featherMeters > 0 && dist < p.pad.featherMeters) {
          weight = 1 - dist / p.pad.featherMeters;
        } else {
          weight = 0;
        }

        if (weight > bestWeight) {
          bestWeight = weight;
          bestTarget = p.pad.targetElevationMeters;
        }
      }

      if (bestWeight > 0) {
        elevations[r][c] = bestWeight * bestTarget + (1 - bestWeight) * natural;
      }
    }
  }

  recomputeDemRange(dem);
  return dem;
}
