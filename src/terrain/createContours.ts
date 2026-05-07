import * as THREE from "three";
import type { DemData } from "./demData";
import { Palette, makeLineMaterial, SURFACE_OFFSET } from "../utils/materials";
import { feetToMeters, metersToFeet } from "../utils/geo";

export interface ContoursOptions {
  intervalFeet: number;
  /** Every Nth contour is rendered as an "index" line. */
  indexEvery?: number;
  exaggeration: number;
}

export interface ContoursResult {
  group: THREE.Group;
  intervalMeters: number;
  count: number;
  range: { min: number; max: number };
}

/**
 * Generate contour line segments from a DEM using a marching-squares scan.
 * Returns a Three.js group that can be added to a scene at world origin.
 */
export function createContours(
  dem: DemData,
  options: ContoursOptions
): ContoursResult {
  const intervalMeters = feetToMeters(options.intervalFeet);
  const indexEvery = options.indexEvery ?? 5;

  const minM = dem.minElevationMeters;
  const maxM = dem.maxElevationMeters;
  const startFt = Math.ceil(metersToFeet(minM) / options.intervalFeet) *
    options.intervalFeet;
  const endFt = Math.floor(metersToFeet(maxM) / options.intervalFeet) *
    options.intervalFeet;

  const minorMaterial = makeLineMaterial(Palette.contour, {
    transparent: true,
    opacity: 0.65,
    depthTest: false
  });
  const indexMaterial = makeLineMaterial(Palette.contourIndex, {
    transparent: true,
    opacity: 0.9,
    linewidth: 2,
    depthTest: false
  });

  const group = new THREE.Group();
  group.name = "contoursGroup";

  let count = 0;

  for (let elevFt = startFt; elevFt <= endFt; elevFt += options.intervalFeet) {
    const elevM = feetToMeters(elevFt);
    const segments = marchingSquaresIso(dem, elevM);
    if (segments.length === 0) continue;

    const isIndex = Math.round(elevFt / options.intervalFeet) % indexEvery === 0;

    const positions = new Float32Array(segments.length * 2 * 3);
    // Larger Y offset (+ polygonOffset on terrain material) keeps contours above
    // the mesh in every camera angle. Index lines sit slightly higher so they
    // never get overdrawn by minor contours at the same elevation rounding.
    const yOffset =
      elevM * options.exaggeration + SURFACE_OFFSET + (isIndex ? 0.35 : 0.25);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      positions[i * 6 + 0] = seg.a.x;
      positions[i * 6 + 1] = yOffset;
      positions[i * 6 + 2] = seg.a.z;
      positions[i * 6 + 3] = seg.b.x;
      positions[i * 6 + 4] = yOffset;
      positions[i * 6 + 5] = seg.b.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const lines = new THREE.LineSegments(
      geometry,
      isIndex ? indexMaterial : minorMaterial
    );
    lines.name = `contour_${elevFt}ft`;
    lines.userData.elevationMeters = elevM;
    lines.userData.elevationFeet = elevFt;
    // Render after the warm parcel fill (renderOrder 5) so the fill cannot
    // dim the contours inside the parcel.
    lines.renderOrder = 6;
    group.add(lines);
    count += 1;
  }

  return {
    group,
    intervalMeters,
    count,
    range: { min: minM, max: maxM }
  };
}

interface IsoSegment {
  a: { x: number; z: number };
  b: { x: number; z: number };
}

function marchingSquaresIso(dem: DemData, threshold: number): IsoSegment[] {
  const { rows, cols, widthMeters, depthMeters, elevations } = dem;
  const cellX = widthMeters / (cols - 1);
  const cellZ = depthMeters / (rows - 1);
  const halfW = widthMeters / 2;
  const halfD = depthMeters / 2;

  const segments: IsoSegment[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const e00 = elevations[r][c];
      const e10 = elevations[r][c + 1];
      const e11 = elevations[r + 1][c + 1];
      const e01 = elevations[r + 1][c];

      let idx = 0;
      if (e00 > threshold) idx |= 1;
      if (e10 > threshold) idx |= 2;
      if (e11 > threshold) idx |= 4;
      if (e01 > threshold) idx |= 8;

      if (idx === 0 || idx === 15) continue;

      const x0 = -halfW + c * cellX;
      const x1 = x0 + cellX;
      const z0 = -halfD + r * cellZ;
      const z1 = z0 + cellZ;

      const top = (): { x: number; z: number } => ({
        x: lerpAt(x0, x1, e00, e10, threshold),
        z: z0
      });
      const right = (): { x: number; z: number } => ({
        x: x1,
        z: lerpAt(z0, z1, e10, e11, threshold)
      });
      const bottom = (): { x: number; z: number } => ({
        x: lerpAt(x0, x1, e01, e11, threshold),
        z: z1
      });
      const left = (): { x: number; z: number } => ({
        x: x0,
        z: lerpAt(z0, z1, e00, e01, threshold)
      });

      switch (idx) {
        case 1:
        case 14:
          segments.push({ a: left(), b: top() });
          break;
        case 2:
        case 13:
          segments.push({ a: top(), b: right() });
          break;
        case 3:
        case 12:
          segments.push({ a: left(), b: right() });
          break;
        case 4:
        case 11:
          segments.push({ a: right(), b: bottom() });
          break;
        case 5:
          segments.push({ a: left(), b: top() });
          segments.push({ a: right(), b: bottom() });
          break;
        case 6:
        case 9:
          segments.push({ a: top(), b: bottom() });
          break;
        case 7:
        case 8:
          segments.push({ a: left(), b: bottom() });
          break;
        case 10:
          segments.push({ a: left(), b: bottom() });
          segments.push({ a: top(), b: right() });
          break;
        default:
          break;
      }
    }
  }

  return segments;
}

function lerpAt(
  a: number,
  b: number,
  va: number,
  vb: number,
  threshold: number
): number {
  const denom = vb - va;
  if (Math.abs(denom) < 1e-9) return a;
  const t = (threshold - va) / denom;
  return a + (b - a) * t;
}
