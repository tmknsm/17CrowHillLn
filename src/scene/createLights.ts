import * as THREE from "three";

/**
 * Topo-map style lighting: heavy hemisphere/ambient with a soft top-down sun.
 * Avoids directional shadow that would crush west/north-facing slopes into a
 * single dark patch and erase the warm parcel fill + contour lines on those
 * faces.
 */
export function createLights(scene: THREE.Scene): THREE.DirectionalLight {
  const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x4a4942, 1.05);
  hemi.position.set(0, 200, 0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff5e3, 0.45);
  // Mostly overhead with a small SE bias so terrain still reads as 3D.
  sun.position.set(60, 320, 80);
  sun.castShadow = false;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.32);
  scene.add(ambient);

  return sun;
}
