import * as THREE from "three";

export function createCamera(canvas: HTMLElement): THREE.PerspectiveCamera {
  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 3000);
  // Default pose: 3/4 view from the SE looking at the parcel center, low enough
  // to show real vertical relief but high enough to see the full lot.
  camera.position.set(170, 95, 200);
  camera.lookAt(30, 0, 10);
  return camera;
}

export type CameraPreset =
  | "topDown"
  | "roadApproach"
  | "downhill"
  | "sideSlope"
  | "freeOrbit";

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

// Targets aim at the parcel centroid (~ x=30, z=11), not the world origin.
const PARCEL_CENTROID = new THREE.Vector3(30, 0, 11);

export const CAMERA_PRESETS: Record<CameraPreset, CameraPose> = {
  topDown: {
    position: new THREE.Vector3(30, 280, 11.1),
    target: PARCEL_CENTROID.clone()
  },
  roadApproach: {
    // Looking from the NE corner (Crow Hill Ln side) into the parcel.
    position: new THREE.Vector3(170, 70, -150),
    target: PARCEL_CENTROID.clone()
  },
  downhill: {
    // Sitting at the high (E) side looking down the slope.
    position: new THREE.Vector3(180, 75, 30),
    target: new THREE.Vector3(-30, 0, 30)
  },
  sideSlope: {
    position: new THREE.Vector3(30, 60, 230),
    target: PARCEL_CENTROID.clone()
  },
  freeOrbit: {
    position: new THREE.Vector3(170, 95, 200),
    target: PARCEL_CENTROID.clone()
  }
};
