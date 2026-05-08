import * as THREE from "three";

export interface LayerVisibility {
  parcelBoundary: boolean;
  lotDimensions: boolean;
  roadContext: boolean;
  terrain: boolean;
  contours: boolean;
  house: boolean;
  balcony: boolean;
  pool: boolean;
}

export interface LayerHandles {
  parcelBoundary?: THREE.Object3D;
  lotDimensions?: THREE.Object3D;
  roadContext?: THREE.Object3D;
  terrain?: THREE.Object3D;
  contours?: THREE.Object3D;
  house?: THREE.Object3D;
  balcony?: THREE.Object3D;
  pool?: THREE.Object3D;
}

export const defaultVisibility = (): LayerVisibility => ({
  parcelBoundary: true,
  lotDimensions: true,
  roadContext: true,
  terrain: true,
  contours: true,
  house: true,
  balcony: true,
  pool: true
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
  setVisible(handles.lotDimensions, visibility.lotDimensions);
  setVisible(handles.roadContext, visibility.roadContext);
  setVisible(handles.terrain, visibility.terrain);
  setVisible(handles.contours, visibility.contours);
  setVisible(handles.house, visibility.house);
  setVisible(handles.balcony, visibility.balcony);
  setVisible(handles.pool, visibility.pool);
}

function setVisible(obj: THREE.Object3D | undefined, visible: boolean): void {
  if (!obj) return;
  obj.visible = visible;
}
