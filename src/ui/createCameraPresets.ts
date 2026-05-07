import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CAMERA_PRESETS,
  type CameraPreset
} from "../scene/createCamera";

export function bindCameraPresets(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): void {
  const root = document.getElementById("camera-presets");
  if (!root) return;

  const buttons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("button[data-preset]")
  );
  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset as CameraPreset | undefined;
      if (!preset) return;
      animateCamera(camera, controls, preset);
    });
  }
}

function animateCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  preset: CameraPreset
): void {
  const target = CAMERA_PRESETS[preset];
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = target.position.clone();
  const endTarget = target.target.clone();

  const startTime = performance.now();
  const durationMs = 600;

  function step(): void {
    const t = Math.min(1, (performance.now() - startTime) / durationMs);
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(startPos, endPos, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    controls.update();
    if (t < 1) {
      requestAnimationFrame(step);
    }
  }
  step();
}
