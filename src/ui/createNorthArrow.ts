import * as THREE from "three";

/**
 * Update the on-screen north arrow each frame so it tracks the camera azimuth.
 */
export function bindNorthArrow(camera: THREE.PerspectiveCamera): {
  update: () => void;
} {
  const rotor = document.getElementById("north-arrow-rotor");
  if (!rotor) return { update: () => {} };

  const dir = new THREE.Vector3();
  return {
    update: () => {
      camera.getWorldDirection(dir);
      // dir.x is east, dir.z is south. Compute camera azimuth around Y axis.
      const angle = Math.atan2(dir.x, -dir.z);
      const deg = -(angle * 180) / Math.PI;
      rotor.setAttribute("transform", `rotate(${deg.toFixed(1)} 32 32)`);
    }
  };
}
