import * as THREE from "three";

export interface LayerVisibility {
  parcelBoundary: boolean;
  roadContext: boolean;
  terrain: boolean;
  contours: boolean;
}

export interface LayerHandles {
  parcelBoundary?: THREE.Object3D;
  roadContext?: THREE.Object3D;
  terrain?: THREE.Object3D;
  contours?: THREE.Object3D;
}

export const defaultVisibility = (): LayerVisibility => ({
  parcelBoundary: true,
  roadContext: true,
  terrain: true,
  contours: true
});

export interface ViewState {
  visibility: LayerVisibility;
  exaggeration: number;
}

export function applyLayerVisibility(
  visibility: LayerVisibility,
  handles: LayerHandles
): void {
  setVisible(handles.parcelBoundary, visibility.parcelBoundary);
  setVisible(handles.roadContext, visibility.roadContext);
  setVisible(handles.terrain, visibility.terrain);
  setVisible(handles.contours, visibility.contours);
}

function setVisible(obj: THREE.Object3D | undefined, visible: boolean): void {
  if (!obj) return;
  obj.visible = visible;
}
