import * as THREE from "three";
import { sampleDem, type DemData } from "../terrain/demData";
import {
  lonLatToLocal,
  metersToFeet,
  type ProjectionContext
} from "../utils/geo";
import type { ParcelGeoJSONFeature } from "./createParcelBoundary";

export interface SegmentLabelOptions {
  exaggeration: number;
  /** Skip segments shorter than this (meters) to avoid clutter on tiny edges. */
  minSegmentMeters?: number;
  /** How far outside the boundary (meters) to push the label. */
  outwardOffsetMeters?: number;
}

/**
 * Build a group of upright sprite labels showing each parcel segment length in
 * feet, placed at the midpoint of each segment and nudged slightly outward
 * from the polygon centroid so the text doesn't overlap the boundary line.
 */
export function createSegmentLabels(
  feature: ParcelGeoJSONFeature,
  proj: ProjectionContext,
  dem: DemData,
  options: SegmentLabelOptions
): THREE.Group {
  const ring = feature.geometry.coordinates[0];
  const points = ring.map(([lon, lat]) => lonLatToLocal(lon, lat, proj));

  if (
    points.length > 0 &&
    (points[0].x !== points[points.length - 1].x ||
      points[0].z !== points[points.length - 1].z)
  ) {
    points.push({ ...points[0] });
  }

  const group = new THREE.Group();
  group.name = "parcelSegmentLabels";
  if (points.length < 2) return group;

  // Polygon centroid (skip duplicated closing vertex) — used to flip the
  // outward normal so labels always sit just outside the boundary.
  const unique = points.slice(0, -1);
  let cx = 0;
  let cz = 0;
  for (const p of unique) {
    cx += p.x;
    cz += p.z;
  }
  cx /= unique.length;
  cz /= unique.length;

  const minSegMeters = options.minSegmentMeters ?? 1;
  const outwardOffset = options.outwardOffsetMeters ?? 4.5;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < minSegMeters) continue;

    const lengthFeet = metersToFeet(segLen);
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;

    let nx = -dz / segLen;
    let nz = dx / segLen;
    const towardCenterX = cx - midX;
    const towardCenterZ = cz - midZ;
    if (nx * towardCenterX + nz * towardCenterZ > 0) {
      nx = -nx;
      nz = -nz;
    }

    const labelX = midX + nx * outwardOffset;
    const labelZ = midZ + nz * outwardOffset;
    const surfaceY = sampleDem(dem, labelX, labelZ) * options.exaggeration;
    const labelY = surfaceY + 4.0;

    const sprite = makeLabelSprite(formatLengthFeet(lengthFeet));
    sprite.position.set(labelX, labelY, labelZ);
    group.add(sprite);
  }

  return group;
}

function formatLengthFeet(feet: number): string {
  if (feet >= 1000) {
    return `${feet.toFixed(0)} ft`;
  }
  return `${feet.toFixed(1)} ft`;
}

function makeLabelSprite(text: string): THREE.Sprite {
  const dpr =
    typeof window !== "undefined" && window.devicePixelRatio
      ? Math.min(window.devicePixelRatio, 2)
      : 1;
  const fontPx = Math.round(38 * dpr);
  const padX = Math.round(14 * dpr);
  const padY = Math.round(8 * dpr);
  const radius = Math.round(10 * dpr);
  const fontSpec = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`;

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = fontSpec;
  const textWidth = measure.measureText(text).width;

  const w = Math.ceil(textWidth + padX * 2);
  const h = Math.ceil(fontPx * 1.25 + padY * 2);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(20, 23, 26, 0.9)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = Math.max(1, dpr);
  roundedRectPath(ctx, 0.5, 0.5, w - 1, h - 1, radius);
  ctx.fill();
  ctx.stroke();

  ctx.font = fontSpec;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f3efd9";
  ctx.fillText(text, w / 2, h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  // World-meter sizing so labels stay legible at typical viewing distances
  // without becoming overwhelming when zoomed in close.
  const heightWorld = 5.5;
  const aspect = w / h;
  sprite.scale.set(heightWorld * aspect, heightWorld, 1);
  sprite.renderOrder = 12;
  return sprite;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}
