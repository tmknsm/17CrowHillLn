import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { sampleDem, type DemData } from "../terrain/demData";
import { Palette, SURFACE_OFFSET } from "../utils/materials";
import { lonLatToLocal, type ProjectionContext } from "../utils/geo";

export interface ParcelGeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
  properties?: Record<string, unknown>;
}

export interface ParcelOptions {
  exaggeration: number;
  /** Initial viewport size; consumer should call `lineMaterial.resolution.set` on resize. */
  viewportSize: { width: number; height: number };
  /** Whether to render a subtle translucent fill inside the parcel. */
  showFill?: boolean;
}

export interface ParcelBoundaryResult {
  /** Group containing line + (optional) fill + corner markers. */
  primary: THREE.Group;
  lineMaterial: LineMaterial;
  /** Local-meter polygon ring (closed). */
  ringLocal: Array<{ x: number; z: number }>;
}

/**
 * Convert a GeoJSON polygon to a closed boundary draped on terrain. The line
 * renders always-on-top to avoid disappearing where the terrain mesh
 * triangulation differs from the bilinear DEM sample, and a subtle translucent
 * fill makes the parcel read as a distinct area.
 */
export function createParcelBoundary(
  feature: ParcelGeoJSONFeature,
  proj: ProjectionContext,
  dem: DemData,
  options: ParcelOptions
): ParcelBoundaryResult {
  const ring = feature.geometry.coordinates[0];
  const points = ring.map(([lon, lat]) => lonLatToLocal(lon, lat, proj));

  // Ensure closed ring for densification.
  if (
    points.length > 0 &&
    (points[0].x !== points[points.length - 1].x ||
      points[0].z !== points[points.length - 1].z)
  ) {
    points.push({ ...points[0] });
  }

  const densified = densifyOpenPolyline(points, 1.0);

  const sampleSurface = (x: number, z: number): number =>
    sampleDem(dem, x, z);

  const positions: number[] = [];
  for (const p of densified) {
    const elev = sampleSurface(p.x, p.z) * options.exaggeration + 1.2;
    positions.push(p.x, elev, p.z);
  }

  const geometry = new LineGeometry();
  geometry.setPositions(positions);

  const lineMaterial = new LineMaterial({
    color: Palette.parcelLine,
    linewidth: 3.5,
    transparent: true,
    opacity: 0.97,
    // Render boundary on top of terrain so small interpolation differences
    // between mesh triangles and DEM bilinear samples can't hide segments.
    depthTest: false,
    depthWrite: false,
    worldUnits: false
  });
  lineMaterial.resolution.set(
    options.viewportSize.width,
    options.viewportSize.height
  );

  const line = new Line2(geometry, lineMaterial);
  line.name = "parcelBoundaryLine";
  line.renderOrder = 10;
  line.computeLineDistances();

  const group = new THREE.Group();
  group.name = "parcelBoundary";
  group.add(line);

  // Subtle fill that hugs the terrain inside the polygon so the lot reads as
  // a distinct area rather than an outlined empty patch. Cell-resolution mesh
  // following terrain elevation; very low opacity so contours stay visible.
  if (options.showFill !== false) {
    const fill = buildParcelFill(points, dem, options.exaggeration);
    if (fill) group.add(fill);
  }

  // Vertex markers — small upright posts at each polygon corner to make the
  // shape unmistakable from any angle.
  const markers = buildCornerMarkers(points, sampleSurface, options.exaggeration);
  group.add(markers);

  return {
    primary: group,
    lineMaterial,
    ringLocal: points
  };
}

function buildParcelFill(
  closedRing: Array<{ x: number; z: number }>,
  dem: DemData,
  exaggeration: number
): THREE.Mesh | null {
  if (closedRing.length < 4) return null;

  // Compute axis-aligned bounding box of the polygon.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of closedRing) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  // Sampling resolution — ~1m grid so the mesh hugs the terrain closely.
  const spacing = 1.5;
  const cols = Math.max(2, Math.ceil((maxX - minX) / spacing) + 1);
  const rows = Math.max(2, Math.ceil((maxZ - minZ) / spacing) + 1);

  const positions: number[] = [];
  const indices: number[] = [];
  const indexGrid: number[] = new Array(rows * cols).fill(-1);
  const inside: boolean[] = new Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + (c / (cols - 1)) * (maxX - minX);
      const z = minZ + (r / (rows - 1)) * (maxZ - minZ);
      const isInside = pointInPolygon(x, z, closedRing);
      inside[r * cols + c] = isInside;
      if (isInside) {
        const y = sampleDem(dem, x, z) * exaggeration + SURFACE_OFFSET + 0.08;
        indexGrid[r * cols + c] = positions.length / 3;
        positions.push(x, y, z);
      }
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = indexGrid[r * cols + c];
      const i10 = indexGrid[r * cols + (c + 1)];
      const i01 = indexGrid[(r + 1) * cols + c];
      const i11 = indexGrid[(r + 1) * cols + (c + 1)];
      // Only emit triangles when all four corners are inside the polygon.
      // This keeps the fill strictly within the parcel, ignoring edge cells
      // that straddle the boundary (a thin ~spacing/2 gap stays under the
      // boundary line).
      if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;
      indices.push(i00, i01, i10);
      indices.push(i10, i01, i11);
    }
  }

  if (indices.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color: 0xf6e8b8,
    transparent: true,
    opacity: 0.22,
    // Always render — the terrain's polygonOffset is too small in flat regions
    // for the +0.13m Y offset to reliably win the depth test.
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = "parcelFill";
  mesh.renderOrder = 5;
  return mesh;
}

function buildCornerMarkers(
  closedRing: Array<{ x: number; z: number }>,
  sampleSurface: (x: number, z: number) => number,
  exaggeration: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = "parcelCorners";

  const markerHeight = 1.6;
  const radius = 0.35;
  const geom = new THREE.CylinderGeometry(radius, radius, markerHeight, 8);
  geom.translate(0, markerHeight / 2, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a1f23,
    roughness: 0.9
  });

  // Skip the duplicated closing vertex.
  const unique = closedRing.slice(0, -1);
  for (const p of unique) {
    const y = sampleSurface(p.x, p.z) * exaggeration;
    const m = new THREE.Mesh(geom, mat);
    m.position.set(p.x, y, p.z);
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

function pointInPolygon(
  x: number,
  z: number,
  ring: Array<{ x: number; z: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    const intersect =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function densifyOpenPolyline(
  points: Array<{ x: number; z: number }>,
  spacing: number
): Array<{ x: number; z: number }> {
  if (points.length < 2) return points;
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const segments = Math.max(1, Math.ceil(len / spacing));
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      out.push({ x: a.x + dx * t, z: a.z + dz * t });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Build a fallback rectangular parcel polygon centered on the site origin
 * when no parcel-boundary.geojson is available.
 */
export function buildPlaceholderParcel(
  proj: ProjectionContext,
  widthMeters = 90,
  depthMeters = 110
): ParcelGeoJSONFeature {
  const halfW = widthMeters / 2;
  const halfD = depthMeters / 2;
  const localCorners = [
    { x: -halfW, z: -halfD },
    { x: halfW, z: -halfD },
    { x: halfW + 6, z: halfD - 12 },
    { x: -halfW + 4, z: halfD },
    { x: -halfW, z: -halfD }
  ];

  const lonLat = localCorners.map((p) => {
    const lon = proj.centerLon + p.x / proj.metersPerDegreeLon;
    const lat = proj.centerLat - p.z / proj.metersPerDegreeLat;
    return [lon, lat] as [number, number];
  });

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [lonLat]
    },
    properties: { source: "placeholder" }
  };
}
