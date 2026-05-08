import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { sampleDem, type DemData } from "../terrain/demData";
import { Palette, SURFACE_OFFSET } from "../utils/materials";
import {
  feetToMeters,
  lonLatToLocal,
  type ProjectionContext
} from "../utils/geo";

export interface RoadContextOptions {
  exaggeration: number;
  /** Initial viewport size for the wide-line material. */
  viewportSize: { width: number; height: number };
}

interface LineFeature {
  kind: "road" | "branch";
  name?: string;
  coords: Array<{ x: number; z: number }>;
}

export interface RoadContextResult {
  /** Top-level group meant to live in groups.context. */
  group: THREE.Group;
  /** Wide-line materials whose `resolution` must be updated on viewport resize. */
  lineMaterials: LineMaterial[];
}

/**
 * Build the road context around the parcel from OSM-derived geometry stored in
 * `public/data/road-context.geojson` (Crow Hill Road + Crow Hill Lane + nearby
 * branch service drives). Falls back to a hand-drawn approximation if the file
 * is missing or invalid so the app still boots.
 */
export async function createRoadContext(
  proj: ProjectionContext,
  existingDem: DemData,
  options: RoadContextOptions
): Promise<RoadContextResult> {
  const features = await loadRoadFeatures(proj);

  const result: RoadContextResult = {
    group: new THREE.Group(),
    lineMaterials: []
  };
  result.group.name = "roadContext";

  // All ribbons drawn at 10 ft (typical residential / shared-driveway width
  // and what matches the actual paved surface visible in aerials).
  const ribbonWidth = feetToMeters(10);

  for (const feat of features) {
    if (feat.coords.length < 2) continue;

    const ribbon = buildRibbon(
      feat.coords,
      ribbonWidth,
      existingDem,
      options.exaggeration,
      0.25
    );
    // depthTest:false + a high renderOrder ensures the ribbon paints over the
    // terrain AND over the parcel-fill overlay (which itself is depthTest:false
    // at renderOrder 5). Without this, the road is hidden anywhere it falls
    // inside the parcel polygon.
    ribbon.material = new THREE.MeshBasicMaterial({
      color: Palette.road,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    ribbon.renderOrder = 7;
    ribbon.name = `roadRibbon${feat.name ? `:${feat.name}` : ""}`;
    result.group.add(ribbon);

    // Centerline as a wide Line2 so it's actually visible (a regular
    // THREE.Line ignores linewidth on most GPUs and ends up 1 device-pixel).
    const centerlinePositions: number[] = [];
    for (const p of feat.coords) {
      const e =
        sampleDem(existingDem, p.x, p.z) * options.exaggeration +
        SURFACE_OFFSET +
        0.55;
      centerlinePositions.push(p.x, e, p.z);
    }
    const lineGeo = new LineGeometry();
    lineGeo.setPositions(centerlinePositions);

    const lineMat = new LineMaterial({
      color: 0xfaf3da,
      linewidth: 2.5,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      worldUnits: false
    });
    lineMat.resolution.set(
      options.viewportSize.width,
      options.viewportSize.height
    );
    result.lineMaterials.push(lineMat);

    const line = new Line2(lineGeo, lineMat);
    line.computeLineDistances();
    line.renderOrder = 8;
    line.name = `roadCenterline${feat.name ? `:${feat.name}` : ""}`;
    result.group.add(line);
  }

  return result;
}

async function loadRoadFeatures(
  proj: ProjectionContext
): Promise<LineFeature[]> {
  try {
    const res = await fetch(
      `${import.meta.env.BASE_URL}data/road-context.geojson`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const features: LineFeature[] = [];
    if (json?.type !== "FeatureCollection" || !Array.isArray(json.features)) {
      throw new Error("Unsupported road-context shape");
    }
    for (const f of json.features) {
      const geom = f?.geometry;
      const props = (f?.properties ?? {}) as Record<string, unknown>;
      if (!geom || geom.type !== "LineString") continue;
      const coords = (geom.coordinates as number[][]).map(([lon, lat]) =>
        lonLatToLocal(lon, lat, proj)
      );
      features.push({
        kind: props.kind === "branch" ? "branch" : "road",
        name: typeof props.name === "string" ? props.name : undefined,
        coords
      });
    }
    if (features.length === 0) {
      throw new Error("No LineString features found in road-context.geojson");
    }
    console.info(
      `[road-context] Loaded ${features.length} feature(s) from road-context.geojson`
    );
    return features;
  } catch (err) {
    console.warn(
      "[road-context] Falling back to hand-drawn approximation:",
      err
    );
    return buildPlaceholderFeatures();
  }
}

/**
 * Hand-drawn approximation kept only as a last-resort fallback. Roughly traces
 * a road wrapping the N/W/SW edges of the parcel based on the OSM geometry.
 */
function buildPlaceholderFeatures(): LineFeature[] {
  const road: Array<{ x: number; z: number }> = [
    { x: 110, z: -45 },
    { x: 50, z: -48 },
    { x: 20, z: -47 },
    { x: 8, z: -27 },
    { x: -11, z: 31 },
    { x: -28, z: 73 }
  ];
  return [{ kind: "road", name: "Crow Hill Road (approx)", coords: road }];
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
