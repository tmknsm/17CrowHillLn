import * as THREE from "three";

/** Slight offset to lift overlay surfaces above the terrain to avoid z-fighting. */
export const SURFACE_OFFSET = 0.05;

export const Palette = {
  existingTerrain: 0x8a9777,
  proposedTerrain: 0x9caf86,
  parcelLine: 0x111418,
  contour: 0x2c3a26,
  contourIndex: 0x121a0e,
  road: 0x4a4a4d,
  roadCenterline: 0xb6b6b6,
  building: 0xc7b69d,
  buildingRoof: 0x6b5a47,
  driveway: 0x8a857c,
  pool: 0x4d8aa6,
  lawn: 0x88a76a,
  retainingWall: 0x6e6a64,
  cut: 0xc97a4f,
  fill: 0x6da3c7,
  background: 0x1a1d1f
} as const;

export function makeTerrainMaterial(color: number): THREE.MeshStandardMaterial {
  // polygonOffset pushes the terrain back in the depth buffer so overlays draped
  // on the surface (contours, parcel fill, road ribbons) stay visible even where
  // the mesh's per-triangle interpolation differs slightly from the bilinear DEM
  // sample used to drape the overlays. Without this, contour segments wink in
  // and out depending on local triangulation orientation.
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: false,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 1.5
  });
}

export function makeLineMaterial(
  color: number,
  opts: {
    linewidth?: number;
    transparent?: boolean;
    opacity?: number;
    depthTest?: boolean;
  } = {}
): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    linewidth: opts.linewidth ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthTest: opts.depthTest ?? true,
    depthWrite: false
  });
}
