import type { SiteCenter } from "../config/siteConfig";

export interface LocalPoint {
  x: number;
  z: number;
}

export const METERS_PER_FOOT = 0.3048;
export const FEET_PER_METER = 3.28084;

export const metersToFeet = (m: number): number => m * FEET_PER_METER;
export const feetToMeters = (ft: number): number => ft * METERS_PER_FOOT;

const EARTH_METERS_PER_DEGREE_LAT = 111_320;

export interface ProjectionContext {
  metersPerDegreeLat: number;
  metersPerDegreeLon: number;
  centerLat: number;
  centerLon: number;
}

export function createProjection(center: SiteCenter): ProjectionContext {
  const centerLatRad = (center.lat * Math.PI) / 180;
  return {
    metersPerDegreeLat: EARTH_METERS_PER_DEGREE_LAT,
    metersPerDegreeLon:
      EARTH_METERS_PER_DEGREE_LAT * Math.cos(centerLatRad),
    centerLat: center.lat,
    centerLon: center.lon
  };
}

/**
 * Convert lon/lat to local meters with the site center as origin.
 * Three.js convention: +x = east, +z = south, y = elevation (up).
 */
export function lonLatToLocal(
  lon: number,
  lat: number,
  proj: ProjectionContext
): LocalPoint {
  return {
    x: (lon - proj.centerLon) * proj.metersPerDegreeLon,
    z: -(lat - proj.centerLat) * proj.metersPerDegreeLat
  };
}

export function localToLonLat(
  point: LocalPoint,
  proj: ProjectionContext
): { lon: number; lat: number } {
  return {
    lon: proj.centerLon + point.x / proj.metersPerDegreeLon,
    lat: proj.centerLat - point.z / proj.metersPerDegreeLat
  };
}

export function distance2D(a: LocalPoint, b: LocalPoint): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export interface Polyline {
  points: LocalPoint[];
}

export function polylineLength(points: LocalPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance2D(points[i - 1], points[i]);
  }
  return total;
}

/** Sample a polyline at a given arc length, returning point + tangent. */
export function samplePolyline(
  points: LocalPoint[],
  s: number
): { point: LocalPoint; tangent: LocalPoint } {
  if (points.length < 2) {
    return {
      point: points[0] ?? { x: 0, z: 0 },
      tangent: { x: 1, z: 0 }
    };
  }

  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = distance2D(a, b);
    if (segLen <= 0) continue;
    if (acc + segLen >= s) {
      const t = (s - acc) / segLen;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const inv = 1 / segLen;
      return {
        point: { x: a.x + dx * t, z: a.z + dz * t },
        tangent: { x: dx * inv, z: dz * inv }
      };
    }
    acc += segLen;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = last.x - prev.x;
  const dz = last.z - prev.z;
  const len = Math.max(distance2D(prev, last), 1e-6);
  return {
    point: last,
    tangent: { x: dx / len, z: dz / len }
  };
}
