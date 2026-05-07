import * as THREE from "three";
import { Palette } from "../utils/materials";

export interface SceneGroups {
  root: THREE.Group;
  /** Always-visible context: parcel boundary, road, etc. */
  context: THREE.Group;
  /** The single terrain mesh group. */
  terrain: THREE.Group;
  /** Overlays draped on the terrain (contours, etc.). */
  annotations: THREE.Group;
}

export function createScene(): { scene: THREE.Scene; groups: SceneGroups } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(Palette.background);
  scene.fog = new THREE.Fog(Palette.background, 350, 800);

  const root = new THREE.Group();
  root.name = "rootGroup";

  const context = new THREE.Group();
  context.name = "contextGroup";

  const terrain = new THREE.Group();
  terrain.name = "terrainGroup";

  const annotations = new THREE.Group();
  annotations.name = "annotationGroup";

  root.add(context, terrain, annotations);
  scene.add(root);

  return {
    scene,
    groups: { root, context, terrain, annotations }
  };
}
