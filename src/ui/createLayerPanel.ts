import GUI from "lil-gui";
import type { LayerVisibility, ViewState } from "../state/layerState";

export interface LayerPanelHooks {
  onVisibilityChange: (visibility: LayerVisibility) => void;
  onExaggerationChange: (scale: number) => void;
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
    .name("Road / context")
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
