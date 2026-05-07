import * as THREE from "three";

/**
 * Update the scale bar to reflect what 25%/50% of the bar represents in meters
 * given the current camera distance to the orbit target. The bar itself is a
 * fixed pixel width, so we scale the labeled distance instead of the bar.
 */
export function bindScaleBar(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3 },
  domElement: HTMLElement
): { update: () => void } {
  const midLabel = document.getElementById("scale-mid");
  const endLabel = document.getElementById("scale-end");
  if (!midLabel || !endLabel) return { update: () => {} };

  // 100px reference width
  const barPixelWidth = 100;

  return {
    update: () => {
      const distance = camera.position.distanceTo(controls.target);
      const fovRad = (camera.fov * Math.PI) / 180;
      const visibleHeightAtDistance = 2 * Math.tan(fovRad / 2) * distance;
      const aspect = domElement.clientWidth / Math.max(domElement.clientHeight, 1);
      const visibleWidthAtDistance = visibleHeightAtDistance * aspect;

      const metersPerPixel = visibleWidthAtDistance / domElement.clientWidth;
      const totalMeters = metersPerPixel * barPixelWidth;

      const rounded = roundNiceMeters(totalMeters);
      midLabel.textContent = `${(rounded / 2).toFixed(0)} m`;
      endLabel.textContent = `${rounded.toFixed(0)} m`;
    }
  };
}

function roundNiceMeters(m: number): number {
  if (m <= 0) return 0;
  const exp = Math.floor(Math.log10(m));
  const base = Math.pow(10, exp);
  const mantissa = m / base;
  let nice: number;
  if (mantissa < 1.5) nice = 1;
  else if (mantissa < 3.5) nice = 2;
  else if (mantissa < 7.5) nice = 5;
  else nice = 10;
  return nice * base;
}
