import * as THREE from "three";
import type { PropertyAnchor } from "../utils/terrainSampling";

export interface LayerVisibility {
  parcelBoundary: boolean;
  lotDimensions: boolean;
  roadContext: boolean;
  terrain: boolean;
  contours: boolean;
  house: boolean;
  rearTerrace: boolean;
  lowerWalkout: boolean;
  poolTerrace: boolean;
  pool: boolean;
  grassZones: boolean;
  stairs: boolean;
  retainingWalls: boolean;
  gradingPads: boolean;
  cutFillOverlay: boolean;
  labels: boolean;
}

export interface LayerHandles {
  parcelBoundary?: THREE.Object3D;
  lotDimensions?: THREE.Object3D;
  roadContext?: THREE.Object3D;
  terrain?: THREE.Object3D;
  contours?: THREE.Object3D;
  house?: THREE.Object3D;
  rearTerrace?: THREE.Object3D;
  lowerWalkout?: THREE.Object3D;
  poolTerrace?: THREE.Object3D;
  pool?: THREE.Object3D;
  grassZones?: THREE.Object3D;
  stairs?: THREE.Object3D;
  retainingWalls?: THREE.Object3D;
  gradingPads?: THREE.Object3D;
  cutFillOverlay?: THREE.Object3D;
  labels?: THREE.Object3D;
}

export const defaultVisibility = (): LayerVisibility => ({
  parcelBoundary: true,
  lotDimensions: true,
  roadContext: true,
  terrain: true,
  contours: true,
  house: true,
  rearTerrace: true,
  lowerWalkout: true,
  poolTerrace: true,
  pool: true,
  grassZones: false,
  stairs: true,
  retainingWalls: false,
  gradingPads: false,
  cutFillOverlay: false,
  labels: false
});

export interface ViewState {
  visibility: LayerVisibility;
  exaggeration: number;
  anchor: PropertyAnchor;
  floorOffsetAboveWestGradeFt: number;
  /**
   * When true, the displayed terrain is regraded under the house and pool
   * terrace pads so the structures stay above grade — useful for visualizing
   * what the site would look like after the proposed cut. The original DEM
   * is still used for cut/fill analytics and the property report.
   */
  autoGradeTerrain: boolean;
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
  setVisible(handles.rearTerrace, visibility.rearTerrace);
  setVisible(handles.lowerWalkout, visibility.lowerWalkout);
  setVisible(handles.poolTerrace, visibility.poolTerrace);
  setVisible(handles.pool, visibility.pool);
  setVisible(handles.grassZones, visibility.grassZones);
  setVisible(handles.stairs, visibility.stairs);
  setVisible(handles.retainingWalls, visibility.retainingWalls);
  setVisible(handles.gradingPads, visibility.gradingPads);
  setVisible(handles.cutFillOverlay, visibility.cutFillOverlay);
  setVisible(handles.labels, visibility.labels);
}

function setVisible(obj: THREE.Object3D | undefined, visible: boolean): void {
  if (!obj) return;
  obj.visible = visible;
}
