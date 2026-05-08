import * as THREE from "three";
import { siteConfig } from "./config/siteConfig";

import { createScene } from "./scene/createScene";
import { createLights } from "./scene/createLights";
import { createCamera } from "./scene/createCamera";
import { createControls } from "./scene/createControls";

import { buildSyntheticDem } from "./terrain/syntheticTerrain";
import { createTerrainMesh } from "./terrain/createTerrainMesh";
import { createContours } from "./terrain/createContours";
import { sampleDem, type DemData } from "./terrain/demData";
import { loadTerrariumDem } from "./terrain/loadTerrariumDem";

import {
  buildPlaceholderParcel,
  createParcelBoundary,
  type ParcelGeoJSONFeature
} from "./layers/createParcelBoundary";
import { createSegmentLabels } from "./layers/createSegmentLabels";
import { createPropertyDesign } from "./layers/createPropertyDesign";
import { createRoadContext } from "./layers/createRoadContext";

import {
  applyLayerVisibility,
  defaultVisibility,
  type LayerHandles,
  type ViewState
} from "./state/layerState";

import { bindCameraPresets } from "./ui/createCameraPresets";
import { createLayerPanel } from "./ui/createLayerPanel";
import { createPropertyReport } from "./ui/createPropertyReport";
import { bindCursorReadout } from "./ui/createCursorReadout";
import { bindNorthArrow } from "./ui/createNorthArrow";
import { bindScaleBar } from "./ui/createScaleBar";

import { createProjection } from "./utils/geo";
import { Palette, makeTerrainMaterial } from "./utils/materials";
import { feetToMeters } from "./utils/geo";
import { seedAnchorFromParcel } from "./utils/terrainSampling";

async function main(): Promise<void> {
  const appRoot = document.getElementById("app");
  if (!appRoot) throw new Error("Missing #app root element");

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(appRoot.clientWidth, appRoot.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // No shadow-casting lights in the scene — leave shadow map disabled to save GPU work.
  renderer.shadowMap.enabled = false;
  appRoot.appendChild(renderer.domElement);

  const { scene, groups } = createScene();
  createLights(scene);
  const camera = createCamera(appRoot);
  const controls = createControls(camera, renderer.domElement);

  const proj = createProjection(siteConfig.center);

  const exaggeration = siteConfig.terrain.verticalExaggeration;

  const dem = await loadExistingDem();

  // Shift the entire scene down so the site center sits near y=0. DEM elevations
  // remain absolute (in meters) for cursor readout and contour labels; only the
  // visual root group is offset so the camera/lighting math stays simple.
  const referenceElevation = sampleDem(dem, 0, 0);
  groups.root.position.y = -referenceElevation * exaggeration;

  const terrain = createTerrainMesh(
    dem,
    makeTerrainMaterial(Palette.existingTerrain),
    exaggeration
  );
  groups.terrain.add(terrain.mesh);

  const contoursResult = createContours(dem, {
    intervalFeet: siteConfig.terrain.contourIntervalFeet,
    indexEvery: 5,
    exaggeration
  });
  groups.annotations.add(contoursResult.group);

  // Parcel boundary — try to load real GeoJSON, otherwise use placeholder.
  const parcelFeature = await loadParcelOrPlaceholder(proj);
  const parcel = createParcelBoundary(parcelFeature, proj, dem, {
    exaggeration,
    viewportSize: {
      width: appRoot.clientWidth,
      height: appRoot.clientHeight
    },
    showFill: true
  });
  groups.context.add(parcel.primary);

  const lotDimensions = createSegmentLabels(parcelFeature, proj, dem, {
    exaggeration
  });
  groups.context.add(lotDimensions);

  // Anchor rotation comes from the longest west-facing parcel edge so the
  // house auto-aligns with the road frontage. X/Z and FF offset start from the
  // site-tuned defaults in siteConfig — the user can still tweak any of them
  // via the Home folder in the layer panel.
  const seedAnchor = seedAnchorFromParcel(parcelFeature, proj, {
    houseDepthMeters: feetToMeters(42),
    setbackMeters: 8
  });
  const initialAnchor = {
    x: siteConfig.property.defaultAnchorXMeters,
    z: siteConfig.property.defaultAnchorZMeters,
    rotationY: seedAnchor.rotationY
  };
  const initialFloorOffsetFt =
    siteConfig.property.defaultFloorOffsetAboveWestGradeFt;

  const property = createPropertyDesign({
    dem,
    state: {
      anchor: { ...initialAnchor },
      floorOffsetAboveWestGradeFt: initialFloorOffsetFt
    },
    exaggeration
  });
  groups.context.add(property.group);

  // Road context lives in contextGroup so it's always shown alongside the parcel.
  const roadContext = await createRoadContext(proj, dem, {
    exaggeration,
    viewportSize: {
      width: appRoot.clientWidth,
      height: appRoot.clientHeight
    }
  });
  groups.context.add(roadContext.group);

  const handles: LayerHandles = {
    parcelBoundary: parcel.primary,
    lotDimensions,
    roadContext: roadContext.group,
    terrain: terrain.mesh,
    contours: contoursResult.group,
    house: property.handles.house,
    rearTerrace: property.handles.rearTerrace,
    lowerWalkout: property.handles.lowerWalkout,
    poolTerrace: property.handles.poolTerrace,
    pool: property.handles.pool,
    grassZones: property.handles.grassZones,
    stairs: property.handles.stairs,
    retainingWalls: property.handles.retainingWalls,
    gradingPads: property.handles.gradingPads,
    cutFillOverlay: property.handles.cutFillOverlay,
    labels: property.handles.labels
  };

  const state: ViewState = {
    visibility: defaultVisibility(),
    exaggeration,
    anchor: { ...initialAnchor },
    floorOffsetAboveWestGradeFt: initialFloorOffsetFt
  };

  let contoursGroup = contoursResult.group;

  function rebuildContours(): void {
    groups.annotations.remove(contoursGroup);
    disposeGroup(contoursGroup);
    const next = createContours(dem, {
      intervalFeet: siteConfig.terrain.contourIntervalFeet,
      indexEvery: 5,
      exaggeration: state.exaggeration
    });
    contoursGroup = next.group;
    handles.contours = next.group;
    groups.annotations.add(next.group);
    applyLayerVisibility(state.visibility, handles);
  }

  const propertyReport = createPropertyReport();
  propertyReport.update(property.getReportData());

  function commitPropertyChange(): void {
    property.update(
      {
        anchor: state.anchor,
        floorOffsetAboveWestGradeFt: state.floorOffsetAboveWestGradeFt
      },
      state.exaggeration
    );
    propertyReport.update(property.getReportData());
    applyLayerVisibility(state.visibility, handles);
  }

  createLayerPanel(state, {
    onVisibilityChange: (vis) => {
      applyLayerVisibility(vis, handles);
    },
    onExaggerationChange: (scale) => {
      state.exaggeration = scale;
      terrain.applyExaggeration(scale);
      groups.root.position.y = -referenceElevation * scale;
      rebuildContours();
      commitPropertyChange();
    },
    onPropertyDrag: (anchor) => {
      // Cheap update during slider drag: move the property root in lockstep.
      property.setAnchorTransform(anchor);
    },
    onPropertyCommit: () => {
      commitPropertyChange();
    }
  });

  bindCameraPresets(camera, controls);

  bindCursorReadout({
    camera,
    domElement: renderer.domElement,
    dem,
    getExaggeration: () => state.exaggeration
  });

  const northArrow = bindNorthArrow(camera);
  const scaleBar = bindScaleBar(camera, controls, renderer.domElement);

  applyLayerVisibility(state.visibility, handles);

  window.addEventListener("resize", () => {
    const w = appRoot.clientWidth;
    const h = appRoot.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    parcel.lineMaterial.resolution.set(w, h);
    for (const m of roadContext.lineMaterials) m.resolution.set(w, h);
  });

  function tick(): void {
    controls.update();
    northArrow.update();
    scaleBar.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  const loading = document.getElementById("loading");
  if (loading) loading.classList.add("hidden");
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
      obj.geometry.dispose();
    }
  });
}

async function loadExistingDem(): Promise<DemData> {
  try {
    const synthetic = siteConfig.terrain.synthetic;
    const real = await loadTerrariumDem({
      center: siteConfig.center,
      radiusMeters: synthetic.widthMeters / 2,
      rows: synthetic.rows,
      cols: synthetic.cols,
      zoom: 15
    });
    console.info(
      `[dem] Loaded real elevation tiles · range ${real.minElevationMeters.toFixed(1)}–${real.maxElevationMeters.toFixed(1)} m`
    );
    return real;
  } catch (err) {
    console.warn("[dem] Falling back to synthetic terrain:", err);
    return buildSyntheticDem(siteConfig);
  }
}

async function loadParcelOrPlaceholder(
  proj: ReturnType<typeof createProjection>
): Promise<ParcelGeoJSONFeature> {
  try {
    const res = await fetch("/data/parcel-boundary.geojson", {
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.type === "FeatureCollection" && json.features?.length > 0) {
      const feat = json.features[0];
      if (feat?.geometry?.type === "Polygon") {
        return feat as ParcelGeoJSONFeature;
      }
    }
    if (json?.type === "Feature" && json.geometry?.type === "Polygon") {
      return json as ParcelGeoJSONFeature;
    }
    throw new Error("Unsupported parcel GeoJSON shape");
  } catch (err) {
    console.warn(
      "[parcel] Falling back to in-app placeholder polygon:",
      err
    );
    return buildPlaceholderParcel(proj);
  }
}

main().catch((err) => {
  console.error(err);
  const loading = document.getElementById("loading");
  if (loading) {
    loading.textContent = `Failed to load: ${(err as Error).message}`;
  }
});
