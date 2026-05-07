import * as THREE from "three";
import type { DemData } from "../terrain/demData";
import { sampleDem } from "../terrain/demData";
import { metersToFeet } from "../utils/geo";

export interface CursorReadoutContext {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  dem: DemData;
  getExaggeration: () => number;
}

/**
 * Track the cursor over the terrain bounds and display the local x/z and elevation
 * in feet/meters in the bottom-center HUD.
 */
export function bindCursorReadout(ctx: CursorReadoutContext): void {
  const readout = document.getElementById("cursor-readout");
  if (!readout) return;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersection = new THREE.Vector3();

  let lastUpdate = 0;
  ctx.domElement.addEventListener("pointermove", (event) => {
    const now = performance.now();
    if (now - lastUpdate < 16) return;
    lastUpdate = now;

    const rect = ctx.domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, ctx.camera);
    if (!raycaster.ray.intersectPlane(groundPlane, intersection)) {
      readout.textContent = "Off terrain";
      return;
    }

    const dem = ctx.dem;
    if (
      Math.abs(intersection.x) > dem.widthMeters / 2 ||
      Math.abs(intersection.z) > dem.depthMeters / 2
    ) {
      readout.textContent = "Off terrain";
      return;
    }

    const elevation = sampleDem(dem, intersection.x, intersection.z);
    const elevFt = metersToFeet(elevation);

    readout.innerHTML =
      `<strong>${elevFt.toFixed(1)} ft</strong> ` +
      `<span style="opacity:0.6">(${elevation.toFixed(2)} m)</span> · ` +
      `x ${intersection.x.toFixed(1)} m · z ${intersection.z.toFixed(1)} m`;
  });

  ctx.domElement.addEventListener("pointerleave", () => {
    readout.textContent = "Hover terrain for elevation";
  });
}
