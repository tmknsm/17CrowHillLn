import * as THREE from "three";
import { sampleDem, type DemData } from "../terrain/demData";
import {
  feetToMeters,
  lonLatToLocal,
  type ProjectionContext
} from "../utils/geo";
import type { ParcelGeoJSONFeature } from "./createParcelBoundary";

export interface HomeStructuresOptions {
  exaggeration: number;
}

export interface HomeStructuresResult {
  /** Parent group placed in world coordinates with proper rotation. */
  group: THREE.Group;
  /** Sub-groups for individual layer toggles. */
  house: THREE.Group;
  balcony: THREE.Group;
  pool: THREE.Group;
}

/**
 * Build a 3D home complex on the parcel based on the houseDimensions floor
 * plan: a 40' × 70' main house with gabled roof, a wood balcony/terrace plus
 * pergola on the south side, and a 16' × 36' pool with surrounding deck.
 *
 * The home is positioned with its 40' front face centered on the longest
 * west-facing parcel edge (where Crow Hill Ln driveway connects), with a
 * modest setback so the front face sits inside the parcel.
 */
export function createHomeStructures(
  feature: ParcelGeoJSONFeature,
  proj: ProjectionContext,
  dem: DemData,
  options: HomeStructuresOptions
): HomeStructuresResult {
  const ring = feature.geometry.coordinates[0];
  const points = ring.map(([lon, lat]) => lonLatToLocal(lon, lat, proj));

  const isClosed =
    points.length > 1 &&
    points[0].x === points[points.length - 1].x &&
    points[0].z === points[points.length - 1].z;
  const unique = isClosed ? points.slice(0, -1) : points.slice();

  const result: HomeStructuresResult = {
    group: new THREE.Group(),
    house: new THREE.Group(),
    balcony: new THREE.Group(),
    pool: new THREE.Group()
  };
  result.group.name = "homeStructures";
  result.house.name = "homeHouse";
  result.balcony.name = "homeBalcony";
  result.pool.name = "homePool";

  if (unique.length < 3) return result;

  let cx = 0;
  let cz = 0;
  for (const p of unique) {
    cx += p.x;
    cz += p.z;
  }
  cx /= unique.length;
  cz /= unique.length;

  // Find the longest parcel edge whose outward normal points west
  // (negative x component in local meters).
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
      bestEdge = {
        midX,
        midZ,
        outwardX: nx,
        outwardZ: nz,
        len
      };
    }
  }
  if (!bestEdge) return result;

  // House footprint dimensions
  const W = feetToMeters(40);
  const D = feetToMeters(70);
  const wallH = feetToMeters(10);
  const ridgeH = feetToMeters(12);

  // Center the front face on the edge midpoint, then push the whole
  // structure inward by a setback so the house sits inside the parcel.
  const setback = 8;
  const inwardX = -bestEdge.outwardX;
  const inwardZ = -bestEdge.outwardZ;
  const frontFaceX = bestEdge.midX + setback * inwardX;
  const frontFaceZ = bestEdge.midZ + setback * inwardZ;
  const houseCenterX = frontFaceX + (D / 2) * inwardX;
  const houseCenterZ = frontFaceZ + (D / 2) * inwardZ;

  // Ground elevation: take the max DEM sample across a 5×5 grid spanning the
  // full home complex footprint so the structures never sink into the slope
  // at the uphill corners. The home complex extends well past the house on
  // the +X local side (terrace, deck, pergola, pool) so the sample area is
  // wider than the house alone.
  // Rotated 90° CCW from the edge orientation, then a further 180°, for a net
  // rotation of 270° CCW (equivalently 90° CW) from the edge-aligned default.
  const rotY =
    Math.atan2(bestEdge.outwardX, bestEdge.outwardZ) - Math.PI / 2 - Math.PI;
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const localToWorld = (lx: number, lz: number): { x: number; z: number } => ({
    x: houseCenterX + lx * cosR + lz * sinR,
    z: houseCenterZ - lx * sinR + lz * cosR
  });
  const sampleHalfW = W / 2 + feetToMeters(40);
  const sampleHalfD = D / 2 + feetToMeters(5);
  let groundElev = -Infinity;
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const lx = -sampleHalfW + (i / 4) * sampleHalfW * 2;
      const lz = -sampleHalfD + (j / 4) * sampleHalfD * 2;
      const w = localToWorld(lx, lz);
      const e = sampleDem(dem, w.x, w.z);
      if (e > groundElev) groundElev = e;
    }
  }
  const groundY = groundElev * options.exaggeration;

  result.group.position.set(houseCenterX, groundY, houseCenterZ);
  result.group.rotation.y = rotY;

  // ============ Materials ============
  const wallsMat = new THREE.MeshStandardMaterial({
    color: 0xe7e0d2,
    roughness: 0.85
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d30,
    roughness: 0.7
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x3b3f44,
    roughness: 0.8
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6b4f3a,
    roughness: 0.85
  });
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x3e2c20,
    roughness: 0.85
  });
  const pavedMat = new THREE.MeshStandardMaterial({
    color: 0xa19c94,
    roughness: 0.92
  });
  const copingMat = new THREE.MeshStandardMaterial({
    color: 0xc7c0b4,
    roughness: 0.85
  });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x3d8db0,
    roughness: 0.18,
    metalness: 0.0,
    emissive: 0x1a4d66,
    emissiveIntensity: 0.18
  });

  // ============ House: walls + gabled roof ============
  // Local axes:
  //   +X = parallel to the front face (40' wide)
  //   +Z = forward, out the front of the house (toward the western edge)
  //   +Y = up
  // The 70' side walls are at X = ±W/2, the 40' front/back walls are at
  // Z = ±D/2.

  const wallsGeom = new THREE.BoxGeometry(W, wallH, D);
  wallsGeom.translate(0, wallH / 2, 0);
  const walls = new THREE.Mesh(wallsGeom, wallsMat);
  result.house.add(walls);

  // Slim trim band above the walls to break up the silhouette
  const trimH = 0.25;
  const trimGeom = new THREE.BoxGeometry(W + 0.15, trimH, D + 0.15);
  trimGeom.translate(0, wallH + trimH / 2, 0);
  const trim = new THREE.Mesh(trimGeom, trimMat);
  result.house.add(trim);

  // Gable roof: triangular cross-section in X-Y plane, extruded along Z
  const overhang = feetToMeters(1.5);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-W / 2 - overhang, 0);
  roofShape.lineTo(W / 2 + overhang, 0);
  roofShape.lineTo(0, ridgeH);
  roofShape.lineTo(-W / 2 - overhang, 0);
  const roofGeom = new THREE.ExtrudeGeometry(roofShape, {
    depth: D + overhang * 2,
    bevelEnabled: false
  });
  // Extrude is along +Z from 0 to depth — center on Z and lift to wall top.
  roofGeom.translate(0, wallH + trimH, -(D + overhang * 2) / 2);
  const roof = new THREE.Mesh(roofGeom, roofMat);
  result.house.add(roof);

  // Front door (a small dark rectangle slightly proud of the front wall)
  const doorW = feetToMeters(3.5);
  const doorH = feetToMeters(7);
  const doorGeom = new THREE.BoxGeometry(doorW, doorH, 0.06);
  doorGeom.translate(0, doorH / 2, 0);
  const door = new THREE.Mesh(doorGeom, beamMat);
  door.position.set(0, 0, D / 2 + 0.03);
  result.house.add(door);

  result.group.add(result.house);

  // ============ Balcony group: terrace deck + pergola ============
  // Outdoor structures live on the +X local side (which becomes roughly the
  // sunny / south-facing side of the house in world coords given the western
  // edge orientation).

  // Wood terrace adjacent to the +X long wall, centered on the house length.
  const terraceXm = feetToMeters(7);
  const terraceZm = feetToMeters(20);
  const terraceH = 0.40;
  const terraceCenterX = W / 2 + terraceXm / 2;
  const terraceCenterZ = 0;
  const terraceGeom = new THREE.BoxGeometry(terraceXm, terraceH, terraceZm);
  terraceGeom.translate(0, terraceH / 2, 0);
  const terrace = new THREE.Mesh(terraceGeom, woodMat);
  terrace.position.set(terraceCenterX, 0, terraceCenterZ);
  result.balcony.add(terrace);

  // Terrace railings (outer +X side and the two ends)
  const railH = 1.0;
  const railThick = 0.05;
  const outerRail = new THREE.Mesh(
    new THREE.BoxGeometry(railThick, railH, terraceZm),
    woodMat
  );
  outerRail.position.set(W / 2 + terraceXm, terraceH + railH / 2, 0);
  result.balcony.add(outerRail);
  for (const sz of [-1, 1]) {
    const endRail = new THREE.Mesh(
      new THREE.BoxGeometry(terraceXm, railH, railThick),
      woodMat
    );
    endRail.position.set(
      terraceCenterX,
      terraceH + railH / 2,
      sz * (terraceZm / 2)
    );
    result.balcony.add(endRail);
  }

  // Pergola: 20' wide (X) × 16' deep (Z) × 9' tall, set back behind the pool.
  const pergolaWm = feetToMeters(20);
  const pergolaDm = feetToMeters(16);
  const pergolaHm = feetToMeters(9);
  const pergolaCenterX = W / 2 + feetToMeters(7 + 12) + pergolaWm / 2;
  const pergolaCenterZ = -feetToMeters(22);

  const postR = 0.10;
  const postGeom = new THREE.CylinderGeometry(postR, postR, pergolaHm, 12);
  postGeom.translate(0, pergolaHm / 2, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeom, beamMat);
      post.position.set(
        pergolaCenterX + sx * (pergolaWm / 2),
        0,
        pergolaCenterZ + sz * (pergolaDm / 2)
      );
      result.balcony.add(post);
    }
  }
  // Top frame
  const beamThick = 0.10;
  const beamHeight = 0.18;
  for (const sz of [-1, 1]) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(pergolaWm + 0.4, beamHeight, beamThick),
      beamMat
    );
    beam.position.set(
      pergolaCenterX,
      pergolaHm + beamHeight / 2,
      pergolaCenterZ + sz * (pergolaDm / 2)
    );
    result.balcony.add(beam);
  }
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(beamThick, beamHeight, pergolaDm),
      beamMat
    );
    beam.position.set(
      pergolaCenterX + sx * (pergolaWm / 2),
      pergolaHm + beamHeight / 2,
      pergolaCenterZ
    );
    result.balcony.add(beam);
  }
  // Slatted shade
  const slatCount = 9;
  for (let i = 0; i < slatCount; i++) {
    const t = (i + 0.5) / slatCount;
    const slatX = pergolaCenterX - pergolaWm / 2 + t * pergolaWm;
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, pergolaDm),
      beamMat
    );
    slat.position.set(
      slatX,
      pergolaHm + beamHeight + 0.05,
      pergolaCenterZ
    );
    result.balcony.add(slat);
  }

  result.group.add(result.balcony);

  // ============ Pool group: deck + water + coping ============
  // Rotated 90° from the floor plan orientation (long axis runs along the
  // house width direction X) and pushed out past the +X (east-ish) wall of
  // the house with a small gap so the pool sits behind the house rather
  // than under it.
  const poolWm = feetToMeters(36);
  const poolLm = feetToMeters(16);
  const poolDepth = 0.55;
  const poolGap = feetToMeters(8);
  const poolCenterX = W / 2 + poolGap + poolWm / 2;
  const poolCenterZ = 0;

  // Deck wraps the pool with a ~4' margin all around.
  const deckMargin = feetToMeters(4);
  const deckXm = poolWm + 2 * deckMargin;
  const deckZm = poolLm + 2 * deckMargin;
  const deckCenterX = poolCenterX;
  const deckCenterZ = poolCenterZ;
  const deckThick = 0.08;
  const deckGeom = new THREE.BoxGeometry(deckXm, deckThick, deckZm);
  deckGeom.translate(0, deckThick / 2, 0);
  const deck = new THREE.Mesh(deckGeom, pavedMat);
  deck.position.set(deckCenterX, 0, deckCenterZ);
  result.pool.add(deck);

  // Water sits with its surface flush with the top of the deck.
  const waterGeom = new THREE.BoxGeometry(poolWm, poolDepth, poolLm);
  waterGeom.translate(0, deckThick - poolDepth / 2, 0);
  const water = new THREE.Mesh(waterGeom, waterMat);
  water.position.set(poolCenterX, 0, poolCenterZ);
  result.pool.add(water);

  // Light stone coping ringing the pool edge
  const copingW = 0.12;
  const copingH = 0.06;
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(copingW, copingH, poolLm + copingW * 2),
      copingMat
    );
    c.position.set(
      poolCenterX + sx * (poolWm / 2 + copingW / 2),
      deckThick + copingH / 2,
      poolCenterZ
    );
    result.pool.add(c);
  }
  for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(poolWm, copingH, copingW),
      copingMat
    );
    c.position.set(
      poolCenterX,
      deckThick + copingH / 2,
      poolCenterZ + sz * (poolLm / 2 + copingW / 2)
    );
    result.pool.add(c);
  }

  result.group.add(result.pool);

  return result;
}
