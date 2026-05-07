import * as THREE from "three";
import type { DemData } from "./demData";

export interface TerrainMesh {
  mesh: THREE.Mesh;
  geometry: THREE.PlaneGeometry;
  applyExaggeration: (scale: number) => void;
}

/**
 * Build a Three.js plane mesh from a DEM grid with elevations applied to vertex Y.
 * The mesh is centered on (0, 0, 0) and rotated so X is east, Z is south, Y is up.
 *
 * Convention: elevations[row][col] — row 0 corresponds to the +z (south) edge,
 * matching {@link sampleDem} bilinear sampling. PlaneGeometry's vertex order
 * after rotateX(-PI/2) lays out vertices row-by-row from -z to +z, so we look
 * up elevations[targetRow][col] where targetRow = (rows-1) - row to match.
 */
export function createTerrainMesh(
  dem: DemData,
  material: THREE.Material,
  exaggeration: number
): TerrainMesh {
  const geometry = new THREE.PlaneGeometry(
    dem.widthMeters,
    dem.depthMeters,
    dem.cols - 1,
    dem.rows - 1
  );
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const baseElevations = new Float32Array(positions.count);

  for (let i = 0; i < positions.count; i++) {
    const col = i % dem.cols;
    const planeRow = Math.floor(i / dem.cols);
    const demRow = dem.rows - 1 - planeRow;
    const elevation = dem.elevations[demRow][col];
    baseElevations[i] = elevation;
    positions.setY(i, elevation * exaggeration);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "terrainMesh";

  function applyExaggeration(scale: number): void {
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, baseElevations[i] * scale);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return { mesh, geometry, applyExaggeration };
}
