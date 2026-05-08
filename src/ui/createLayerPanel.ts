import GUI from "lil-gui";
import type { LayerVisibility, ViewState } from "../state/layerState";
import type { PropertyAnchor } from "../utils/terrainSampling";

export interface LayerPanelHooks {
  onVisibilityChange: (visibility: LayerVisibility) => void;
  onExaggerationChange: (scale: number) => void;
  /** Cheap, called continuously while a property slider is being dragged. */
  onPropertyDrag: (
    anchor: PropertyAnchor,
    floorOffsetAboveWestGradeFt: number
  ) => void;
  /** Heavy, called once when the user releases a property slider. */
  onPropertyCommit: (
    anchor: PropertyAnchor,
    floorOffsetAboveWestGradeFt: number
  ) => void;
}

export function createLayerPanel(
  state: ViewState,
  hooks: LayerPanelHooks
): { gui: GUI } {
  const gui = new GUI({ title: "Layers" });

  const baseFolder = gui.addFolder("Base");
  baseFolder
    .add(state.visibility, "parcelBoundary")
    .name("Parcel boundary")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  baseFolder
    .add(state.visibility, "lotDimensions")
    .name("Lot dimensions")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  baseFolder
    .add(state.visibility, "roadContext")
    .name("Crow Hill Ln / Rd")
    .onChange(() => hooks.onVisibilityChange(state.visibility));

  const homeFolder = gui.addFolder("Home");

  // Property anchor proxy — lil-gui edits radians via a degrees view so the
  // slider feels natural. Mirror values back to the underlying anchor on every
  // change so the cheap drag-update + final commit hooks see fresh values.
  const proxy = {
    anchorX: state.anchor.x,
    anchorZ: state.anchor.z,
    rotationDeg: (state.anchor.rotationY * 180) / Math.PI,
    floorOffsetFt: state.floorOffsetAboveWestGradeFt
  };

  function syncAnchorFromProxy(): void {
    state.anchor.x = proxy.anchorX;
    state.anchor.z = proxy.anchorZ;
    state.anchor.rotationY = (proxy.rotationDeg * Math.PI) / 180;
    state.floorOffsetAboveWestGradeFt = proxy.floorOffsetFt;
  }

  function emitDrag(): void {
    syncAnchorFromProxy();
    hooks.onPropertyDrag(state.anchor, state.floorOffsetAboveWestGradeFt);
  }

  function emitCommit(): void {
    syncAnchorFromProxy();
    hooks.onPropertyCommit(state.anchor, state.floorOffsetAboveWestGradeFt);
  }

  const placementFolder = homeFolder.addFolder("Placement");
  placementFolder
    .add(proxy, "anchorX", -300, 300, 0.5)
    .name("X (east/west, m)")
    .onChange(emitDrag)
    .onFinishChange(emitCommit);
  placementFolder
    .add(proxy, "anchorZ", -300, 300, 0.5)
    .name("Z (north/south, m)")
    .onChange(emitDrag)
    .onFinishChange(emitCommit);
  placementFolder
    .add(proxy, "rotationDeg", -180, 180, 1)
    .name("Rotation (deg)")
    .onChange(emitDrag)
    .onFinishChange(emitCommit);
  placementFolder
    .add(proxy, "floorOffsetFt", 0, 6, 0.1)
    .name("FF above west grade (ft)")
    .onChange(emitDrag)
    .onFinishChange(emitCommit);

  const structuresFolder = homeFolder.addFolder("Structures");
  structuresFolder
    .add(state.visibility, "house")
    .name("House")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  structuresFolder
    .add(state.visibility, "rearTerrace")
    .name("Rear terrace")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  structuresFolder
    .add(state.visibility, "lowerWalkout")
    .name("Lower walkout")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  structuresFolder
    .add(state.visibility, "poolTerrace")
    .name("Pool terrace")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  structuresFolder
    .add(state.visibility, "pool")
    .name("Pool")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  structuresFolder
    .add(state.visibility, "stairs")
    .name("Stairs")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  structuresFolder
    .add(state.visibility, "grassZones")
    .name("Grass zones")
    .onChange(() => hooks.onVisibilityChange(state.visibility));

  const gradingFolder = homeFolder.addFolder("Grading & Labels");
  gradingFolder
    .add(state.visibility, "retainingWalls")
    .name("Retaining walls")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  gradingFolder
    .add(state.visibility, "gradingPads")
    .name("Proposed pads")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  gradingFolder
    .add(state.visibility, "cutFillOverlay")
    .name("Cut / fill overlay")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  gradingFolder
    .add(state.visibility, "labels")
    .name("Labels")
    .onChange(() => hooks.onVisibilityChange(state.visibility));

  const terrainFolder = gui.addFolder("Terrain");
  terrainFolder
    .add(state.visibility, "terrain")
    .name("Terrain surface")
    .onChange(() => hooks.onVisibilityChange(state.visibility));
  terrainFolder
    .add(state.visibility, "contours")
    .name("Contours")
    .onChange(() => hooks.onVisibilityChange(state.visibility));

  const settingsFolder = gui.addFolder("Settings");
  const exObj = { exaggeration: state.exaggeration };
  settingsFolder
    .add(exObj, "exaggeration", { "0.5x": 0.5, "1x": 1, "1.5x": 1.5, "2x": 2 })
    .name("Vertical exaggeration")
    .onChange((v: number) => {
      state.exaggeration = v;
      hooks.onExaggerationChange(v);
    });

  return { gui };
}
