import type { SiteCenter } from "../config/siteConfig";
import type { DemData } from "./demData";
import { recomputeDemRange } from "./demData";

/**
 * Load a real bare-earth DEM by fetching AWS public Terrarium elevation tiles
 * around the site center, decoding the RGB-packed elevations, and resampling
 * onto a local meter-based grid.
 *
 * Terrarium tile URL: https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png
 * Elevation in meters = (R * 256 + G + B / 256) - 32768
 *
 * Source: Mapzen / AWS open data registry (public, CORS-enabled, no API key).
 */
export interface TerrariumDemOptions {
  center: SiteCenter;
  /** Half-extent of the DEM in meters (so the output spans 2*radius x 2*radius). */
  radiusMeters: number;
  /** Output grid dimensions. */
  rows: number;
  cols: number;
  zoom?: number;
}

const TILE_BASE = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium";

export async function loadTerrariumDem(
  opts: TerrariumDemOptions
): Promise<DemData> {
  const zoom = opts.zoom ?? 15;
  const widthMeters = opts.radiusMeters * 2;
  const depthMeters = opts.radiusMeters * 2;

  const centerLatRad = (opts.center.lat * Math.PI) / 180;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos(centerLatRad);

  const halfLat = opts.radiusMeters / metersPerDegreeLat;
  const halfLon = opts.radiusMeters / metersPerDegreeLon;

  const minLon = opts.center.lon - halfLon;
  const maxLon = opts.center.lon + halfLon;
  const minLat = opts.center.lat - halfLat;
  const maxLat = opts.center.lat + halfLat;

  // Compute tile coverage. y increases southward, so swap min/max for tile y.
  const minTileX = Math.floor(lonToTileX(minLon, zoom));
  const maxTileX = Math.floor(lonToTileX(maxLon, zoom));
  const minTileY = Math.floor(latToTileY(maxLat, zoom));
  const maxTileY = Math.floor(latToTileY(minLat, zoom));

  const tilesX = maxTileX - minTileX + 1;
  const tilesY = maxTileY - minTileY + 1;
  const tileCount = tilesX * tilesY;
  if (tileCount > 12) {
    throw new Error(
      `Terrarium DEM would require ${tileCount} tiles; aborting to avoid runaway fetch`
    );
  }

  const tilePixelSize = 256;
  const stripeWidth = tilesX * tilePixelSize;
  const stripeHeight = tilesY * tilePixelSize;
  const stripe = new Float32Array(stripeWidth * stripeHeight);

  const fetchPromises: Array<Promise<void>> = [];
  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      fetchPromises.push(
        fetchTerrariumTile(zoom, tx, ty).then((tilePixels) => {
          const offsetX = (tx - minTileX) * tilePixelSize;
          const offsetY = (ty - minTileY) * tilePixelSize;
          for (let r = 0; r < tilePixelSize; r++) {
            for (let c = 0; c < tilePixelSize; c++) {
              stripe[(offsetY + r) * stripeWidth + (offsetX + c)] =
                tilePixels[r * tilePixelSize + c];
            }
          }
        })
      );
    }
  }
  await Promise.all(fetchPromises);

  // Resample stripe → output grid covering [minLon, maxLon] × [minLat, maxLat]
  const elevations: number[][] = [];
  for (let r = 0; r < opts.rows; r++) {
    const row: number[] = [];
    const lat = maxLat - (r / (opts.rows - 1)) * (maxLat - minLat);
    const py = latToTileY(lat, zoom);
    const stripeY = (py - minTileY) * tilePixelSize;

    for (let c = 0; c < opts.cols; c++) {
      const lon = minLon + (c / (opts.cols - 1)) * (maxLon - minLon);
      const px = lonToTileX(lon, zoom);
      const stripeX = (px - minTileX) * tilePixelSize;
      row.push(bilinear(stripe, stripeWidth, stripeHeight, stripeX, stripeY));
    }
    elevations.push(row);
  }

  // The first row (r=0) corresponds to maxLat = north edge. Per createTerrainMesh's
  // convention, elevations[0] is the +z (south) edge, so reverse rows.
  elevations.reverse();

  const dem: DemData = {
    center: { lat: opts.center.lat, lon: opts.center.lon },
    widthMeters,
    depthMeters,
    rows: opts.rows,
    cols: opts.cols,
    minElevationMeters: 0,
    maxElevationMeters: 0,
    elevations
  };
  recomputeDemRange(dem);
  return dem;
}

async function fetchTerrariumTile(
  z: number,
  x: number,
  y: number
): Promise<Float32Array> {
  const url = `${TILE_BASE}/${z}/${x}/${y}.png`;
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to acquire 2D canvas context");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;

  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) {
    const r = data[i * 4 + 0];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    out[i] = r * 256 + g + b / 256 - 32768;
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile ${url}`));
    img.src = url;
  });
}

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    Math.pow(2, z)
  );
}

function bilinear(
  buffer: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const cx0 = clampIdx(Math.floor(x), width);
  const cx1 = clampIdx(cx0 + 1, width);
  const cy0 = clampIdx(Math.floor(y), height);
  const cy1 = clampIdx(cy0 + 1, height);
  const tx = clamp01(x - Math.floor(x));
  const ty = clamp01(y - Math.floor(y));

  const v00 = buffer[cy0 * width + cx0];
  const v10 = buffer[cy0 * width + cx1];
  const v01 = buffer[cy1 * width + cx0];
  const v11 = buffer[cy1 * width + cx1];
  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function clampIdx(i: number, n: number): number {
  if (i < 0) return 0;
  if (i > n - 1) return n - 1;
  return i;
}
