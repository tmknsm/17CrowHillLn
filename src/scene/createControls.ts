import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement
): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 900;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(30, 0, 11);
  controls.update();
  return controls;
}
