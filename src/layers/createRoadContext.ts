import * as THREE from "three";
import { sampleDem, type DemData } from "../terrain/demData";
import { Palette, SURFACE_OFFSET, makeLineMaterial } from "../utils/materials";

export interface RoadContextOptions {
  exaggeration: number;
}

/**
 * Build a placeholder representation of Crow Hill Ln approaching the parcel.
 * Treated as a polyline draped on the existing DEM with a subtle ribbon underneath.
 */
export function createRoadContext(
  existingDem: DemData,
  options: RoadContextOptions
): THREE.Group {
  // Crow Hill Ln approximation: comes in from the NW past the parcel's north
  // edge (V4 ≈ (9, -55)), curves around the NE corner (V3 ≈ (91, -45)), and
  // continues SE/S along the east edge past V2 and V1 down toward Hill Ln.
  const path: Array<{ x: number; z: number }> = [
    { x: -120, z: -110 },
    { x: -70, z: -90 },
    { x: -20, z: -75 },
    { x: 30, z: -68 },
    { x: 70, z: -65 },
    { x: 100, z: -52 },
    { x: 110, z: -20 },
    { x: 105, z: 25 },
    { x: 95, z: 60 },
    { x: 70, z: 90 },
    { x: 30, z: 110 },
    { x: -40, z: 130 },
    { x: -120, z: 150 }
  ];

  const group = new THREE.Group();
  group.name = "roadContext";

  const ribbon = buildRibbon(path, 8, existingDem, options.exaggeration, -0.05);
  ribbon.material = new THREE.MeshStandardMaterial({
    color: Palette.road,
    roughness: 1,
    metalness: 0
  });
  group.add(ribbon);

  // Centerline
  const positions: number[] = [];
  for (const p of path) {
    const e =
      sampleDem(existingDem, p.x, p.z) * options.exaggeration + SURFACE_OFFSET + 0.05;
    positions.push(p.x, e, p.z);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  const line = new THREE.Line(
    lineGeo,
    makeLineMaterial(Palette.roadCenterline, {
      transparent: true,
      opacity: 0.6
    })
  );
  line.name = "roadCenterline";
  group.add(line);

  return group;
}

function buildRibbon(
  path: Array<{ x: number; z: number }>,
  width: number,
  dem: DemData,
  exaggeration: number,
  yOffset: number
): THREE.Mesh {
  const halfWidth = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.max(Math.sqrt(dx * dx + dz * dz), 1e-6);
    const nx = -dz / len;
    const nz = dx / len;

    const leftX = p.x + nx * halfWidth;
    const leftZ = p.z + nz * halfWidth;
    const rightX = p.x - nx * halfWidth;
    const rightZ = p.z - nz * halfWidth;

    const yLeft =
      sampleDem(dem, leftX, leftZ) * exaggeration + SURFACE_OFFSET + yOffset;
    const yRight =
      sampleDem(dem, rightX, rightZ) * exaggeration + SURFACE_OFFSET + yOffset;

    positions.push(leftX, yLeft, leftZ, rightX, yRight, rightZ);

    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  geom.setIndex(indices);
  geom.computeVertexNormals();

  return new THREE.Mesh(geom);
}
