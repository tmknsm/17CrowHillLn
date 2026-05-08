import * as THREE from "three";
import { feetToMeters, metersToFeet } from "../utils/geo";
import { sampleDem, type DemData } from "../terrain/demData";
import {
  type PropertyAnchor,
  localToWorld,
  sampleTerrainHeightsInFootprint,
  calculatePadCutFill
} from "../utils/terrainSampling";
import { Palette } from "../utils/materials";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PropertyDesignState {
  anchor: PropertyAnchor;
  /** Finished floor offset above the west-side average grade, in feet. */
  floorOffsetAboveWestGradeFt: number;
}

export interface PropertyReportData {
  anchorX: number;
  anchorZ: number;
  rotationDeg: number;
  finishedFloorMeters: number;
  finishedFloorFeet: number;
  houseTerrainMinFt: number;
  houseTerrainMaxFt: number;
  houseMaxCutFt: number;
  houseMaxFillFt: number;
  poolTerraceTargetFt: number;
  poolTerraceTerrainMinFt: number;
  poolTerraceTerrainMaxFt: number;
  poolTerraceMaxCutFt: number;
  poolTerraceMaxFillFt: number;
  totalDropHouseToPoolFt: number;
  rearWallToPoolEdgeFt: number;
  walkoutFaceToPoolEdgeFt: number;
  northGrassUsable: { widthFt: number; usable: boolean } | null;
  southGrassUsable: { widthFt: number; usable: boolean } | null;
  retainingWallsOver6Ft: { id: string; heightFt: number }[];
}

export interface PropertyDesignHandles {
  house: THREE.Group;
  rearTerrace: THREE.Group;
  lowerWalkout: THREE.Group;
  poolTerrace: THREE.Group;
  pool: THREE.Group;
  grassZones: THREE.Group;
  stairs: THREE.Group;
  retainingWalls: THREE.Group;
  gradingPads: THREE.Group;
  cutFillOverlay: THREE.Group;
  labels: THREE.Group;
}

export interface PropertyDesign {
  group: THREE.Group;
  handles: PropertyDesignHandles;
  /** Full rebuild — re-samples terrain and regenerates every layer. */
  update(state: PropertyDesignState, exaggeration: number): void;
  /** Cheap transform-only update during continuous anchor slider drags. */
  setAnchorTransform(anchor: PropertyAnchor): void;
  getReportData(): PropertyReportData;
  dispose(): void;
}

export interface CreatePropertyDesignOptions {
  dem: DemData;
  state: PropertyDesignState;
  exaggeration: number;
}

// ---------------------------------------------------------------------------
// Design dimensions (single source of truth, in feet)
// ---------------------------------------------------------------------------

const DIMS = {
  house: { widthFt: 76, depthFt: 42 },
  mainMass: { widthFt: 56, depthFt: 38, wallFt: 10, ridgeFt: 13, centerXFt: 0, centerZFt: 0 },
  rightGable: {
    widthFt: 28,
    depthFt: 34,
    wallFt: 10,
    ridgeFt: 14,
    centerXFt: -24,
    centerZFt: 0
  },
  leftWing: {
    widthFt: 24,
    depthFt: 36,
    wallFt: 10,
    ridgeFt: 12,
    centerXFt: 26,
    centerZFt: 0
  },
  porch: {
    widthFt: 24,
    depthFt: 10,
    postHeightFt: 9,
    slabThicknessFt: 0.5
  },
  // Rear terrace is the roof of the lower walkout, not a separate slab — it
  // shares the walkout's plan footprint and sits at FF-1 ft (the top of the
  // walkout walls).
  rearTerrace: { widthFt: 72, depthFt: 24, dropFromFFFt: 1 },
  lowerWalkout: { widthFt: 72, depthFt: 24, floorDropFromFFFt: 12, heightFt: 11 },
  // Pool terrace shares the walkout floor's elevation — you walk straight out
  // of the walkout onto the pool deck.
  poolTerrace: { widthFt: 110, depthFt: 70, dropFromFFFt: 12 },
  pool: {
    widthFt: 18, // N/S — along local +/- X
    lengthFt: 48, // W/E — along local +/- Z
    copingFt: 3,
    waterDropFromTerraceFt: 0.5,
    poolDepthFt: 5
  },
  grass: { minWidthFt: 20, maxWidthFt: 35, maxSlopePct: 5, depthFt: 50 },
  stairs: {
    widthFt: 5,
    riserMinIn: 6.5,
    riserMaxIn: 7.5,
    treadIn: 15,
    maxRisersPerFlight: 10
  },
  retainWall: { triggerFt: 3, terraceMaxFt: 6, thicknessFt: 1 }
} as const;

// Local-frame Z offsets for downhill structures, computed from DIMS.
// Reminder: local +Z = world west (front of house, uphill). So downhill = -Z.
//
// Rear terrace lives directly above the lower walkout (it IS the walkout's
// roof), so they share their plan center. The pool terrace sits east of the
// walkout at the same elevation as the walkout floor, so the user walks
// directly out of the walkout onto the pool deck.
function downhillZ(): {
  rearTerraceCenterZ: number;
  lowerWalkoutCenterZ: number;
  poolTerraceCenterZ: number;
} {
  const houseHalfDepth = feetToMeters(DIMS.house.depthFt) / 2;
  const walkoutDepth = feetToMeters(DIMS.lowerWalkout.depthFt);
  const poolDepth = feetToMeters(DIMS.poolTerrace.depthFt);
  const walkoutCenter = -(houseHalfDepth + walkoutDepth / 2);
  const poolCenter = -(houseHalfDepth + walkoutDepth + poolDepth / 2);
  return {
    rearTerraceCenterZ: walkoutCenter,
    lowerWalkoutCenterZ: walkoutCenter,
    poolTerraceCenterZ: poolCenter
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPropertyDesign(
  options: CreatePropertyDesignOptions
): PropertyDesign {
  const { dem } = options;

  const group = new THREE.Group();
  group.name = "propertyDesign";

  const handles: PropertyDesignHandles = {
    house: subgroup("house"),
    rearTerrace: subgroup("rearTerrace"),
    lowerWalkout: subgroup("lowerWalkout"),
    poolTerrace: subgroup("poolTerrace"),
    pool: subgroup("pool"),
    grassZones: subgroup("grassZones"),
    stairs: subgroup("stairs"),
    retainingWalls: subgroup("retainingWalls"),
    gradingPads: subgroup("gradingPads"),
    cutFillOverlay: subgroup("cutFillOverlay"),
    labels: subgroup("labels")
  };
  group.add(
    handles.gradingPads,
    handles.cutFillOverlay,
    handles.poolTerrace,
    handles.lowerWalkout,
    handles.rearTerrace,
    handles.pool,
    handles.grassZones,
    handles.stairs,
    handles.house,
    handles.retainingWalls,
    handles.labels
  );

  const mats = makeMaterials();
  const ownedDisposables: Array<{ dispose(): void }> = [];

  let report: PropertyReportData = emptyReport();

  const setAnchorTransform = (anchor: PropertyAnchor): void => {
    group.position.set(anchor.x, 0, anchor.z);
    group.rotation.y = anchor.rotationY;
  };

  const update = (
    state: PropertyDesignState,
    exaggeration: number
  ): void => {
    setAnchorTransform(state.anchor);

    for (const sub of Object.values(handles)) clearGroup(sub);

    // 1. Sample terrain under each pad and derive elevations.
    const houseFp = sampleTerrainHeightsInFootprint(
      dem,
      state.anchor,
      0,
      0,
      feetToMeters(DIMS.house.widthFt),
      feetToMeters(DIMS.house.depthFt),
      9
    );
    const finishedFloorMeters =
      houseFp.westEdgeMean + feetToMeters(state.floorOffsetAboveWestGradeFt);

    const offsets = downhillZ();
    const rearTerraceY =
      finishedFloorMeters - feetToMeters(DIMS.rearTerrace.dropFromFFFt);
    const walkoutFloorY =
      finishedFloorMeters - feetToMeters(DIMS.lowerWalkout.floorDropFromFFFt);
    const poolTerraceY =
      finishedFloorMeters - feetToMeters(DIMS.poolTerrace.dropFromFFFt);

    const poolFp = sampleTerrainHeightsInFootprint(
      dem,
      state.anchor,
      0,
      offsets.poolTerraceCenterZ,
      feetToMeters(DIMS.poolTerrace.widthFt),
      feetToMeters(DIMS.poolTerrace.depthFt),
      11
    );

    // 2. Build geometry.
    buildHouse(handles.house, mats, finishedFloorMeters, exaggeration, ownedDisposables);
    buildRearTerrace(
      handles.rearTerrace,
      mats,
      offsets.rearTerraceCenterZ,
      rearTerraceY,
      exaggeration,
      ownedDisposables
    );
    buildLowerWalkout(
      handles.lowerWalkout,
      mats,
      offsets.lowerWalkoutCenterZ,
      walkoutFloorY,
      exaggeration,
      ownedDisposables
    );
    buildPoolTerrace(
      handles.poolTerrace,
      mats,
      offsets.poolTerraceCenterZ,
      poolTerraceY,
      exaggeration,
      ownedDisposables
    );
    buildPool(
      handles.pool,
      mats,
      offsets.poolTerraceCenterZ,
      poolTerraceY,
      exaggeration,
      ownedDisposables
    );

    const grass = buildGrassZones(
      handles.grassZones,
      mats,
      dem,
      state.anchor,
      offsets.poolTerraceCenterZ,
      poolTerraceY,
      exaggeration,
      ownedDisposables
    );

    buildGradingPads(
      handles.gradingPads,
      mats,
      offsets,
      finishedFloorMeters,
      rearTerraceY,
      walkoutFloorY,
      poolTerraceY,
      exaggeration,
      ownedDisposables
    );

    // Rear terrace is the walkout's roof — not a terrain pad — so it's
    // intentionally absent from the cut/fill, retaining-wall, and grading-pad
    // analyses below. The walkout floor pad (FF - 12 ft) carries the cut/fill
    // story for that footprint.
    const analyticalPads: CutFillPad[] = [
      {
        id: "house",
        centerLocalX: 0,
        centerLocalZ: 0,
        widthMeters: feetToMeters(DIMS.house.widthFt),
        depthMeters: feetToMeters(DIMS.house.depthFt),
        targetMeters: finishedFloorMeters
      },
      {
        id: "lowerWalkout",
        centerLocalX: 0,
        centerLocalZ: offsets.lowerWalkoutCenterZ,
        widthMeters: feetToMeters(DIMS.lowerWalkout.widthFt),
        depthMeters: feetToMeters(DIMS.lowerWalkout.depthFt),
        targetMeters: walkoutFloorY
      },
      {
        id: "poolTerrace",
        centerLocalX: 0,
        centerLocalZ: offsets.poolTerraceCenterZ,
        widthMeters: feetToMeters(DIMS.poolTerrace.widthFt),
        depthMeters: feetToMeters(DIMS.poolTerrace.depthFt),
        targetMeters: poolTerraceY
      }
    ];

    buildCutFillOverlay(
      handles.cutFillOverlay,
      dem,
      state.anchor,
      analyticalPads,
      exaggeration,
      ownedDisposables
    );

    const tallWalls = buildRetainingWalls(
      handles.retainingWalls,
      mats,
      dem,
      state.anchor,
      analyticalPads,
      exaggeration,
      ownedDisposables
    );

    buildStairs(
      handles.stairs,
      mats,
      offsets,
      finishedFloorMeters,
      walkoutFloorY,
      poolTerraceY,
      exaggeration,
      ownedDisposables
    );

    buildLabels(
      handles.labels,
      offsets,
      finishedFloorMeters,
      rearTerraceY,
      walkoutFloorY,
      poolTerraceY,
      exaggeration,
      ownedDisposables
    );

    // 3. Compute report data.
    const houseCutFill = calculatePadCutFill(
      dem,
      state.anchor,
      0,
      0,
      feetToMeters(DIMS.house.widthFt),
      feetToMeters(DIMS.house.depthFt),
      finishedFloorMeters,
      9
    );
    const poolCutFill = calculatePadCutFill(
      dem,
      state.anchor,
      0,
      offsets.poolTerraceCenterZ,
      feetToMeters(DIMS.poolTerrace.widthFt),
      feetToMeters(DIMS.poolTerrace.depthFt),
      poolTerraceY,
      11
    );

    const houseRearWallLocalZ = -feetToMeters(DIMS.house.depthFt) / 2;
    const poolNearEdgeLocalZ =
      offsets.poolTerraceCenterZ + feetToMeters(DIMS.pool.lengthFt) / 2;
    const walkoutFaceLocalZ =
      offsets.lowerWalkoutCenterZ - feetToMeters(DIMS.lowerWalkout.depthFt) / 2;

    report = {
      anchorX: state.anchor.x,
      anchorZ: state.anchor.z,
      rotationDeg: (state.anchor.rotationY * 180) / Math.PI,
      finishedFloorMeters,
      finishedFloorFeet: metersToFeet(finishedFloorMeters),
      houseTerrainMinFt: metersToFeet(houseFp.min),
      houseTerrainMaxFt: metersToFeet(houseFp.max),
      houseMaxCutFt: metersToFeet(houseCutFill.maxCutMeters),
      houseMaxFillFt: metersToFeet(houseCutFill.maxFillMeters),
      poolTerraceTargetFt: metersToFeet(poolTerraceY),
      poolTerraceTerrainMinFt: metersToFeet(poolFp.min),
      poolTerraceTerrainMaxFt: metersToFeet(poolFp.max),
      poolTerraceMaxCutFt: metersToFeet(poolCutFill.maxCutMeters),
      poolTerraceMaxFillFt: metersToFeet(poolCutFill.maxFillMeters),
      totalDropHouseToPoolFt: metersToFeet(finishedFloorMeters - poolTerraceY),
      rearWallToPoolEdgeFt: Math.abs(
        metersToFeet(poolNearEdgeLocalZ - houseRearWallLocalZ)
      ),
      walkoutFaceToPoolEdgeFt: Math.abs(
        metersToFeet(poolNearEdgeLocalZ - walkoutFaceLocalZ)
      ),
      northGrassUsable: grass.north,
      southGrassUsable: grass.south,
      retainingWallsOver6Ft: tallWalls
    };
  };

  const dispose = (): void => {
    for (const d of ownedDisposables) d.dispose();
    ownedDisposables.length = 0;
    for (const sub of Object.values(handles)) clearGroup(sub);
    disposeMaterials(mats);
  };

  update(options.state, options.exaggeration);

  return {
    group,
    handles,
    update,
    setAnchorTransform,
    getReportData: () => report,
    dispose
  };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

interface PropertyMaterials {
  houseSiding: THREE.MeshStandardMaterial;
  houseRoof: THREE.MeshStandardMaterial;
  houseTrim: THREE.MeshStandardMaterial;
  window: THREE.MeshStandardMaterial;
  porchPost: THREE.MeshStandardMaterial;
  bluestone: THREE.MeshStandardMaterial;
  coping: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  retainWall: THREE.MeshStandardMaterial;
  poolWater: THREE.MeshStandardMaterial;
  woodDeck: THREE.MeshStandardMaterial;
  lawnUsable: THREE.MeshStandardMaterial;
  lawnUnusable: THREE.MeshStandardMaterial;
  gradingPad: THREE.MeshBasicMaterial;
  cutFill: THREE.MeshBasicMaterial;
  stairs: THREE.MeshStandardMaterial;
  railing: THREE.MeshStandardMaterial;
  labelSprite: () => THREE.SpriteMaterial; // factory because each label gets its own texture
}

function makeMaterials(): PropertyMaterials {
  return {
    houseSiding: new THREE.MeshStandardMaterial({
      color: Palette.house,
      roughness: 0.85
    }),
    houseRoof: new THREE.MeshStandardMaterial({
      color: Palette.houseRoof,
      roughness: 0.6,
      metalness: 0.1
    }),
    houseTrim: new THREE.MeshStandardMaterial({
      color: Palette.houseTrim,
      roughness: 0.8
    }),
    window: new THREE.MeshStandardMaterial({
      color: Palette.window,
      roughness: 0.4,
      metalness: 0.2
    }),
    porchPost: new THREE.MeshStandardMaterial({
      color: Palette.house,
      roughness: 0.85
    }),
    bluestone: new THREE.MeshStandardMaterial({
      color: Palette.bluestone,
      roughness: 0.95
    }),
    coping: new THREE.MeshStandardMaterial({
      color: Palette.coping,
      roughness: 0.85
    }),
    glass: new THREE.MeshStandardMaterial({
      color: Palette.glass,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.55
    }),
    retainWall: new THREE.MeshStandardMaterial({
      color: Palette.retainingWall,
      roughness: 0.95
    }),
    poolWater: new THREE.MeshStandardMaterial({
      color: Palette.pool,
      roughness: 0.25,
      metalness: 0.0,
      emissive: 0x1a4d66,
      emissiveIntensity: 0.18
    }),
    woodDeck: new THREE.MeshStandardMaterial({
      color: Palette.woodDeck,
      roughness: 0.9
    }),
    lawnUsable: new THREE.MeshStandardMaterial({
      color: Palette.lawn,
      roughness: 0.95,
      transparent: true,
      opacity: 0.85
    }),
    lawnUnusable: new THREE.MeshStandardMaterial({
      color: Palette.slopeWarning,
      roughness: 0.95,
      transparent: true,
      opacity: 0.55
    }),
    gradingPad: new THREE.MeshBasicMaterial({
      color: Palette.gradingPad,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.2,
      polygonOffsetUnits: -1.2,
      side: THREE.DoubleSide
    }),
    cutFill: new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide
    }),
    stairs: new THREE.MeshStandardMaterial({
      color: Palette.bluestone,
      roughness: 0.92
    }),
    railing: new THREE.MeshStandardMaterial({
      color: Palette.houseTrim,
      roughness: 0.7,
      metalness: 0.3
    }),
    labelSprite: () =>
      new THREE.SpriteMaterial({
        depthTest: false,
        transparent: true
      })
  };
}

function disposeMaterials(m: PropertyMaterials): void {
  for (const v of Object.values(m)) {
    if (typeof v !== "function" && v && "dispose" in v && typeof v.dispose === "function") {
      v.dispose();
    }
  }
}

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------

function buildHouse(
  out: THREE.Group,
  mats: PropertyMaterials,
  finishedFloorY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  const ffYVisual = finishedFloorY * exaggeration;

  // Three masses with simple gable roofs.
  addMass(out, mats, owned, {
    centerLx: feetToMeters(DIMS.mainMass.centerXFt),
    centerLz: feetToMeters(DIMS.mainMass.centerZFt),
    width: feetToMeters(DIMS.mainMass.widthFt),
    depth: feetToMeters(DIMS.mainMass.depthFt),
    wallHeight: feetToMeters(DIMS.mainMass.wallFt) * exaggeration,
    ridgeHeight: feetToMeters(DIMS.mainMass.ridgeFt) * exaggeration,
    baseY: ffYVisual,
    ridgeAlongLocalX: true
  });
  addMass(out, mats, owned, {
    centerLx: feetToMeters(DIMS.rightGable.centerXFt),
    centerLz: feetToMeters(DIMS.rightGable.centerZFt),
    width: feetToMeters(DIMS.rightGable.widthFt),
    depth: feetToMeters(DIMS.rightGable.depthFt),
    wallHeight: feetToMeters(DIMS.rightGable.wallFt) * exaggeration,
    ridgeHeight: feetToMeters(DIMS.rightGable.ridgeFt) * exaggeration,
    baseY: ffYVisual,
    ridgeAlongLocalX: false
  });
  addMass(out, mats, owned, {
    centerLx: feetToMeters(DIMS.leftWing.centerXFt),
    centerLz: feetToMeters(DIMS.leftWing.centerZFt),
    width: feetToMeters(DIMS.leftWing.widthFt),
    depth: feetToMeters(DIMS.leftWing.depthFt),
    wallHeight: feetToMeters(DIMS.leftWing.wallFt) * exaggeration,
    ridgeHeight: feetToMeters(DIMS.leftWing.ridgeFt) * exaggeration,
    baseY: ffYVisual,
    ridgeAlongLocalX: true
  });

  // Windows on long faces (east + west) of the main mass, plus simple front door.
  addMainMassWindows(out, mats, owned, ffYVisual, exaggeration);

  // West-facing porch in front of the main mass.
  addPorch(out, mats, owned, ffYVisual, exaggeration);
}

interface MassDescriptor {
  centerLx: number;
  centerLz: number;
  width: number;
  depth: number;
  wallHeight: number;
  ridgeHeight: number;
  baseY: number;
  /** If true, gable ridge runs along local +/-X (gables face along Z). */
  ridgeAlongLocalX: boolean;
}

function addMass(
  out: THREE.Group,
  mats: PropertyMaterials,
  owned: Array<{ dispose(): void }>,
  d: MassDescriptor
): void {
  // Walls
  const wallsGeom = new THREE.BoxGeometry(d.width, d.wallHeight, d.depth);
  wallsGeom.translate(0, d.wallHeight / 2, 0);
  const walls = new THREE.Mesh(wallsGeom, mats.houseSiding);
  walls.position.set(d.centerLx, d.baseY, d.centerLz);
  out.add(walls);
  owned.push(wallsGeom);

  // Slim trim band above the walls
  const trimH = 0.18;
  const trimGeom = new THREE.BoxGeometry(d.width + 0.1, trimH, d.depth + 0.1);
  trimGeom.translate(0, trimH / 2, 0);
  const trim = new THREE.Mesh(trimGeom, mats.houseTrim);
  trim.position.set(d.centerLx, d.baseY + d.wallHeight, d.centerLz);
  out.add(trim);
  owned.push(trimGeom);

  // Gable roof — triangular cross-section extruded along the ridge axis.
  const gableHeight = d.ridgeHeight - d.wallHeight;
  const overhang = 0.3;
  const shape = new THREE.Shape();
  if (d.ridgeAlongLocalX) {
    // Cross-section in the Z-Y plane (gable faces are at +/-X). Extrude along X.
    const halfDepth = d.depth / 2 + overhang;
    shape.moveTo(-halfDepth, 0);
    shape.lineTo(halfDepth, 0);
    shape.lineTo(0, gableHeight);
    shape.lineTo(-halfDepth, 0);
    const roofGeom = new THREE.ExtrudeGeometry(shape, {
      depth: d.width + overhang * 2,
      bevelEnabled: false
    });
    // Default extrude is along +Z; rotate so it's along +X, then center.
    roofGeom.rotateY(Math.PI / 2);
    roofGeom.translate(
      -(d.width + overhang * 2) / 2 + (d.width + overhang * 2),
      d.baseY + d.wallHeight + trimH,
      0
    );
    // After rotateY(PI/2), extrusion along +Z becomes +X. The shape's z axis
    // now corresponds to world Z, which is what we want. The extrude box runs
    // from x=0 to x=width+overhang*2 — center it around centerLx.
    roofGeom.translate(d.centerLx - (d.width + overhang * 2), 0, d.centerLz);
    const roof = new THREE.Mesh(roofGeom, mats.houseRoof);
    out.add(roof);
    owned.push(roofGeom);
  } else {
    // Cross-section in the X-Y plane (gable faces are at +/-Z). Extrude along Z.
    const halfWidth = d.width / 2 + overhang;
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(0, gableHeight);
    shape.lineTo(-halfWidth, 0);
    const roofGeom = new THREE.ExtrudeGeometry(shape, {
      depth: d.depth + overhang * 2,
      bevelEnabled: false
    });
    // Extrude is along +Z, so it runs from z=0 to z=depth+overhang*2.
    roofGeom.translate(
      d.centerLx,
      d.baseY + d.wallHeight + trimH,
      d.centerLz - (d.depth + overhang * 2) / 2
    );
    const roof = new THREE.Mesh(roofGeom, mats.houseRoof);
    out.add(roof);
    owned.push(roofGeom);
  }
}

function addMainMassWindows(
  out: THREE.Group,
  mats: PropertyMaterials,
  owned: Array<{ dispose(): void }>,
  ffYVisual: number,
  exaggeration: number
): void {
  const mainW = feetToMeters(DIMS.mainMass.widthFt);
  const mainD = feetToMeters(DIMS.mainMass.depthFt);
  const mainWall = feetToMeters(DIMS.mainMass.wallFt) * exaggeration;
  const winW = feetToMeters(3.5);
  const winH = feetToMeters(4.5) * exaggeration;
  const sillFromFloor = feetToMeters(3) * exaggeration;
  const winThick = 0.05;

  const winGeom = new THREE.PlaneGeometry(winW, winH);
  owned.push(winGeom);

  // West face windows (front, lz = +mainD/2) — 5 windows centered, two skipped for porch/door.
  const westZ = feetToMeters(DIMS.mainMass.centerZFt) + mainD / 2 + winThick;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5 - 0.5;
    const lx = feetToMeters(DIMS.mainMass.centerXFt) + t * (mainW - winW * 2);
    if (Math.abs(t) < 0.16) continue; // leave space for the front door
    const win = new THREE.Mesh(winGeom, mats.window);
    win.position.set(lx, ffYVisual + sillFromFloor + winH / 2, westZ);
    win.rotation.y = Math.PI;
    out.add(win);
  }

  // East face windows (rear)
  const eastZ = feetToMeters(DIMS.mainMass.centerZFt) - mainD / 2 - winThick;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5 - 0.5;
    const lx = feetToMeters(DIMS.mainMass.centerXFt) + t * (mainW - winW * 2);
    const win = new THREE.Mesh(winGeom, mats.window);
    win.position.set(lx, ffYVisual + sillFromFloor + winH / 2, eastZ);
    out.add(win);
  }

  // Front door on the west face, centered.
  const doorW = feetToMeters(3.5);
  const doorH = feetToMeters(7) * exaggeration;
  const doorGeom = new THREE.BoxGeometry(doorW, doorH, 0.06);
  doorGeom.translate(0, doorH / 2, 0);
  const door = new THREE.Mesh(doorGeom, mats.houseTrim);
  door.position.set(
    feetToMeters(DIMS.mainMass.centerXFt),
    ffYVisual,
    feetToMeters(DIMS.mainMass.centerZFt) + mainD / 2 + 0.04
  );
  out.add(door);
  owned.push(doorGeom);

  // Same windows on the leftWing south face (lx = +DIMS.leftWing.centerXFt + leftW/2).
  const leftW = feetToMeters(DIMS.leftWing.widthFt);
  const leftCx = feetToMeters(DIMS.leftWing.centerXFt);
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3 - 0.5;
    const lz = feetToMeters(DIMS.leftWing.centerZFt) +
      t * (feetToMeters(DIMS.leftWing.depthFt) - winW * 2);
    const win = new THREE.Mesh(winGeom, mats.window);
    win.position.set(leftCx + leftW / 2 + winThick, ffYVisual + sillFromFloor + winH / 2, lz);
    win.rotation.y = -Math.PI / 2;
    out.add(win);
  }

  // Right gable north face windows
  const rightW = feetToMeters(DIMS.rightGable.widthFt);
  const rightCx = feetToMeters(DIMS.rightGable.centerXFt);
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3 - 0.5;
    const lz = feetToMeters(DIMS.rightGable.centerZFt) +
      t * (feetToMeters(DIMS.rightGable.depthFt) - winW * 2);
    const win = new THREE.Mesh(winGeom, mats.window);
    win.position.set(
      rightCx - rightW / 2 - winThick,
      ffYVisual + sillFromFloor + winH / 2,
      lz
    );
    win.rotation.y = Math.PI / 2;
    out.add(win);
  }
}

function addPorch(
  out: THREE.Group,
  mats: PropertyMaterials,
  owned: Array<{ dispose(): void }>,
  ffYVisual: number,
  exaggeration: number
): void {
  const porchW = feetToMeters(DIMS.porch.widthFt);
  const porchD = feetToMeters(DIMS.porch.depthFt);
  const slabT = feetToMeters(DIMS.porch.slabThicknessFt) * exaggeration;
  const postH = feetToMeters(DIMS.porch.postHeightFt) * exaggeration;

  const mainCenterZ = feetToMeters(DIMS.mainMass.centerZFt);
  const mainHalfD = feetToMeters(DIMS.mainMass.depthFt) / 2;
  const porchCenterZ = mainCenterZ + mainHalfD + porchD / 2;

  // Slab
  const slabGeom = new THREE.BoxGeometry(porchW, slabT, porchD);
  slabGeom.translate(0, slabT / 2, 0);
  const slab = new THREE.Mesh(slabGeom, mats.bluestone);
  slab.position.set(0, ffYVisual - slabT, porchCenterZ);
  out.add(slab);
  owned.push(slabGeom);

  // 4 corner posts
  const postR = 0.08;
  const postGeom = new THREE.CylinderGeometry(postR, postR, postH, 12);
  postGeom.translate(0, postH / 2, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeom, mats.porchPost);
      post.position.set(
        sx * (porchW / 2 - 0.3),
        ffYVisual,
        porchCenterZ + sz * (porchD / 2 - 0.3)
      );
      out.add(post);
    }
  }
  owned.push(postGeom);

  // Simple shed roof — flat slab tilted slightly downward toward the front edge.
  const roofThick = 0.18;
  const roofW = porchW + 0.3;
  const roofD = porchD + 0.3;
  const roofGeom = new THREE.BoxGeometry(roofW, roofThick, roofD);
  roofGeom.translate(0, roofThick / 2, 0);
  const roof = new THREE.Mesh(roofGeom, mats.houseRoof);
  roof.position.set(0, ffYVisual + postH, porchCenterZ);
  roof.rotation.x = -0.08; // slight slope away from house
  out.add(roof);
  owned.push(roofGeom);
}

// ---------------------------------------------------------------------------
// Rear upper terrace
// ---------------------------------------------------------------------------

function buildRearTerrace(
  out: THREE.Group,
  mats: PropertyMaterials,
  centerLz: number,
  terraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  const w = feetToMeters(DIMS.rearTerrace.widthFt);
  const d = feetToMeters(DIMS.rearTerrace.depthFt);
  const slabT = 0.25 * exaggeration;
  const slabGeom = new THREE.BoxGeometry(w, slabT, d);
  slabGeom.translate(0, -slabT / 2, 0);
  const slab = new THREE.Mesh(slabGeom, mats.bluestone);
  slab.position.set(0, terraceY * exaggeration, centerLz);
  out.add(slab);
  owned.push(slabGeom);

  // Railing on east edge (downhill)
  const railH = feetToMeters(3.5) * exaggeration;
  const railThick = 0.05;
  const railTop = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.04, railThick),
    mats.railing
  );
  railTop.position.set(0, terraceY * exaggeration + railH, centerLz - d / 2);
  out.add(railTop);
  owned.push(railTop.geometry);

  const postCount = 12;
  for (let i = 0; i <= postCount; i++) {
    const t = i / postCount;
    const lx = -w / 2 + t * w;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(railThick, railH, railThick),
      mats.railing
    );
    post.position.set(lx, terraceY * exaggeration + railH / 2, centerLz - d / 2);
    out.add(post);
    owned.push(post.geometry);
  }
}

// ---------------------------------------------------------------------------
// Lower walkout level
// ---------------------------------------------------------------------------

function buildLowerWalkout(
  out: THREE.Group,
  mats: PropertyMaterials,
  centerLz: number,
  floorY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  const w = feetToMeters(DIMS.lowerWalkout.widthFt);
  const d = feetToMeters(DIMS.lowerWalkout.depthFt);
  const h = feetToMeters(DIMS.lowerWalkout.heightFt) * exaggeration;
  const wallThick = 0.25;

  // Solid back (west, uphill) wall — embedded into slope.
  const backGeom = new THREE.BoxGeometry(w, h, wallThick);
  backGeom.translate(0, h / 2, 0);
  const back = new THREE.Mesh(backGeom, mats.bluestone);
  back.position.set(0, floorY * exaggeration, centerLz + d / 2 - wallThick / 2);
  out.add(back);
  owned.push(backGeom);

  // Side walls (north, south)
  for (const sx of [-1, 1]) {
    const sideGeom = new THREE.BoxGeometry(wallThick, h, d);
    sideGeom.translate(0, h / 2, 0);
    const side = new THREE.Mesh(sideGeom, mats.bluestone);
    side.position.set(sx * (w / 2 - wallThick / 2), floorY * exaggeration, centerLz);
    out.add(side);
    owned.push(sideGeom);
  }

  // Floor slab
  const floorThick = 0.2 * exaggeration;
  const floorGeom = new THREE.BoxGeometry(w, floorThick, d);
  floorGeom.translate(0, -floorThick / 2, 0);
  const floorMesh = new THREE.Mesh(floorGeom, mats.bluestone);
  floorMesh.position.set(0, floorY * exaggeration, centerLz);
  out.add(floorMesh);
  owned.push(floorGeom);

  // Glazed east face (downhill) — large glass panel + thin frame uprights.
  const glassGeom = new THREE.BoxGeometry(w - wallThick * 2, h - 0.3, 0.06);
  glassGeom.translate(0, (h - 0.3) / 2 + 0.15, 0);
  const glass = new THREE.Mesh(glassGeom, mats.glass);
  glass.position.set(0, floorY * exaggeration, centerLz - d / 2);
  out.add(glass);
  owned.push(glassGeom);

  // No ceiling slab — the rear terrace IS the walkout's roof. See
  // buildRearTerrace() for the slab that caps these walls.
}

// ---------------------------------------------------------------------------
// Pool terrace + pool
// ---------------------------------------------------------------------------

function buildPoolTerrace(
  out: THREE.Group,
  mats: PropertyMaterials,
  centerLz: number,
  terraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  const w = feetToMeters(DIMS.poolTerrace.widthFt);
  const d = feetToMeters(DIMS.poolTerrace.depthFt);
  const slabT = 0.25 * exaggeration;
  const slabGeom = new THREE.BoxGeometry(w, slabT, d);
  slabGeom.translate(0, -slabT / 2, 0);
  const slab = new THREE.Mesh(slabGeom, mats.bluestone);
  slab.position.set(0, terraceY * exaggeration, centerLz);
  out.add(slab);
  owned.push(slabGeom);
}

function buildPool(
  out: THREE.Group,
  mats: PropertyMaterials,
  poolTerraceCenterLz: number,
  poolTerraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  const poolNS = feetToMeters(DIMS.pool.widthFt); // along local +/- X
  const poolEW = feetToMeters(DIMS.pool.lengthFt); // along local +/- Z
  const coping = feetToMeters(DIMS.pool.copingFt);
  const waterDrop = feetToMeters(DIMS.pool.waterDropFromTerraceFt) * exaggeration;
  const poolDepth = feetToMeters(DIMS.pool.poolDepthFt) * exaggeration;
  const baseY = poolTerraceY * exaggeration;

  // Coping ring (sits on top of terrace surface, slightly proud).
  const copingT = 0.12 * exaggeration;
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(coping, copingT, poolEW + coping * 2),
      mats.coping
    );
    c.position.set(sx * (poolNS / 2 + coping / 2), baseY + copingT / 2, poolTerraceCenterLz);
    out.add(c);
    owned.push(c.geometry);
  }
  for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(poolNS, copingT, coping),
      mats.coping
    );
    c.position.set(0, baseY + copingT / 2, poolTerraceCenterLz + sz * (poolEW / 2 + coping / 2));
    out.add(c);
    owned.push(c.geometry);
  }

  // Water surface at terrace - 0.5 ft.
  const waterGeom = new THREE.BoxGeometry(poolNS, poolDepth, poolEW);
  waterGeom.translate(0, -poolDepth / 2, 0);
  const water = new THREE.Mesh(waterGeom, mats.poolWater);
  water.position.set(0, baseY - waterDrop, poolTerraceCenterLz);
  out.add(water);
  owned.push(waterGeom);
}

// ---------------------------------------------------------------------------
// Grass zones (north and south of pool)
// ---------------------------------------------------------------------------

interface GrassResult {
  north: { widthFt: number; usable: boolean } | null;
  south: { widthFt: number; usable: boolean } | null;
}

function buildGrassZones(
  out: THREE.Group,
  mats: PropertyMaterials,
  dem: DemData,
  anchor: PropertyAnchor,
  poolTerraceCenterLz: number,
  poolTerraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): GrassResult {
  const result: GrassResult = { north: null, south: null };
  const widthFt = clamp(
    (DIMS.grass.minWidthFt + DIMS.grass.maxWidthFt) / 2,
    DIMS.grass.minWidthFt,
    DIMS.grass.maxWidthFt
  );
  const widthM = feetToMeters(widthFt);
  const depthM = feetToMeters(DIMS.grass.depthFt);
  const poolHalfWidthM = feetToMeters(DIMS.poolTerrace.widthFt) / 2;

  // South pad: local +X side of pool terrace.
  const southCenterLx = poolHalfWidthM + widthM / 2 + feetToMeters(2);
  result.south = buildOneGrassPad(
    out,
    mats,
    dem,
    anchor,
    southCenterLx,
    poolTerraceCenterLz,
    widthM,
    depthM,
    widthFt,
    poolTerraceY,
    exaggeration,
    owned
  );

  // North pad: local -X side of pool terrace.
  const northCenterLx = -(poolHalfWidthM + widthM / 2 + feetToMeters(2));
  result.north = buildOneGrassPad(
    out,
    mats,
    dem,
    anchor,
    northCenterLx,
    poolTerraceCenterLz,
    widthM,
    depthM,
    widthFt,
    poolTerraceY,
    exaggeration,
    owned
  );

  return result;
}

function buildOneGrassPad(
  out: THREE.Group,
  mats: PropertyMaterials,
  dem: DemData,
  anchor: PropertyAnchor,
  centerLx: number,
  centerLz: number,
  widthM: number,
  depthM: number,
  widthFt: number,
  poolTerraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): { widthFt: number; usable: boolean } {
  const fp = sampleTerrainHeightsInFootprint(
    dem,
    anchor,
    centerLx,
    centerLz,
    widthM,
    depthM,
    7
  );

  // Slope in % across the pad, max of N/S vs W/E gradients.
  const dxRange = fp.southEdgeMean - fp.northEdgeMean;
  const dzRange = fp.westEdgeMean - fp.eastEdgeMean;
  const slopeXPct = Math.abs(dxRange) / widthM * 100;
  const slopeZPct = Math.abs(dzRange) / depthM * 100;
  const slopePct = Math.max(slopeXPct, slopeZPct);
  const usable = slopePct <= DIMS.grass.maxSlopePct;

  const padGeom = new THREE.PlaneGeometry(widthM, depthM, 8, 8);
  padGeom.rotateX(-Math.PI / 2);
  const positions = padGeom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const lx = positions.getX(i) + centerLx;
    const lz = positions.getZ(i) + centerLz;
    const w = localToWorld(anchor, lx, lz);
    const e = sampleDem(dem, w.x, w.z);
    positions.setY(i, e * exaggeration);
  }
  positions.needsUpdate = true;
  padGeom.computeVertexNormals();

  const mat = usable ? mats.lawnUsable : mats.lawnUnusable;
  const pad = new THREE.Mesh(padGeom, mat);
  pad.position.set(centerLx, 0, centerLz);
  // Geometry already has world Y baked in — clear pad.position.y so it doesn't double-offset.
  pad.position.y = 0;
  // Reposition geometry verts down into local space relative to pad center.
  out.add(pad);
  owned.push(padGeom);

  void poolTerraceY;
  return { widthFt, usable };
}

// ---------------------------------------------------------------------------
// Grading pads (proposed level surfaces)
// ---------------------------------------------------------------------------

function buildGradingPads(
  out: THREE.Group,
  mats: PropertyMaterials,
  offsets: ReturnType<typeof downhillZ>,
  finishedFloorY: number,
  rearTerraceY: number,
  walkoutFloorY: number,
  poolTerraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  void rearTerraceY; // The rear terrace is the walkout's roof, not a graded surface.

  pad(0, 0, DIMS.house.widthFt, DIMS.house.depthFt, finishedFloorY);
  pad(
    0,
    offsets.lowerWalkoutCenterZ,
    DIMS.lowerWalkout.widthFt,
    DIMS.lowerWalkout.depthFt,
    walkoutFloorY
  );
  pad(
    0,
    offsets.poolTerraceCenterZ,
    DIMS.poolTerrace.widthFt,
    DIMS.poolTerrace.depthFt,
    poolTerraceY
  );

  function pad(
    centerLx: number,
    centerLz: number,
    wFt: number,
    dFt: number,
    targetY: number
  ): void {
    const wM = feetToMeters(wFt);
    const dM = feetToMeters(dFt);
    const geom = new THREE.PlaneGeometry(wM, dM, 1, 1);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, mats.gradingPad);
    mesh.position.set(centerLx, targetY * exaggeration + 0.02, centerLz);
    out.add(mesh);
    owned.push(geom);
  }
}

// ---------------------------------------------------------------------------
// Cut/fill overlay
// ---------------------------------------------------------------------------

interface CutFillPad {
  id: string;
  centerLocalX: number;
  centerLocalZ: number;
  widthMeters: number;
  depthMeters: number;
  targetMeters: number;
}

function buildCutFillOverlay(
  out: THREE.Group,
  dem: DemData,
  anchor: PropertyAnchor,
  pads: CutFillPad[],
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  for (const p of pads) {
    const segments = 32;
    const geom = new THREE.PlaneGeometry(
      p.widthMeters,
      p.depthMeters,
      segments,
      segments
    );
    geom.rotateX(-Math.PI / 2);
    const positions = geom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const cutColor = new THREE.Color(Palette.cut);
    const fillColor = new THREE.Color(Palette.fill);
    const TOLERANCE = 0.05;

    for (let i = 0; i < positions.count; i++) {
      const lx = positions.getX(i) + p.centerLocalX;
      const lz = positions.getZ(i) + p.centerLocalZ;
      const w = localToWorld(anchor, lx, lz);
      const terrainE = sampleDem(dem, w.x, w.z);
      const delta = terrainE - p.targetMeters;
      // Drape the overlay on the terrain surface itself so it sits on the
      // ground and doesn't intersect the pad slabs above.
      positions.setY(i, terrainE * exaggeration);

      let r = 1;
      let g = 1;
      let b = 1;
      let a = 0;
      if (delta > TOLERANCE) {
        r = cutColor.r;
        g = cutColor.g;
        b = cutColor.b;
        a = clamp(delta / feetToMeters(8), 0.4, 1);
      } else if (delta < -TOLERANCE) {
        r = fillColor.r;
        g = fillColor.g;
        b = fillColor.b;
        a = clamp(-delta / feetToMeters(8), 0.4, 1);
      }
      colors[i * 3 + 0] = r * a;
      colors[i * 3 + 1] = g * a;
      colors[i * 3 + 2] = b * a;
    }
    positions.needsUpdate = true;
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(p.centerLocalX, 0, p.centerLocalZ);
    mesh.userData.padId = p.id;
    out.add(mesh);
    owned.push(geom);
    owned.push(mat);
  }
}

// ---------------------------------------------------------------------------
// Retaining walls
// ---------------------------------------------------------------------------

function buildRetainingWalls(
  out: THREE.Group,
  mats: PropertyMaterials,
  dem: DemData,
  anchor: PropertyAnchor,
  pads: CutFillPad[],
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): { id: string; heightFt: number }[] {
  const tall: { id: string; heightFt: number }[] = [];
  const triggerM = feetToMeters(DIMS.retainWall.triggerFt);
  const terraceMaxM = feetToMeters(DIMS.retainWall.terraceMaxFt);
  const wallThick = feetToMeters(DIMS.retainWall.thicknessFt);
  const segLen = 1.5; // meters per perimeter segment

  for (const p of pads) {
    const halfW = p.widthMeters / 2;
    const halfD = p.depthMeters / 2;
    const edges: Array<{
      // local frame coordinates
      x: number; z: number;
      tx: number; tz: number; // tangent direction (unit)
      len: number;
    }> = [];

    // Walk perimeter clockwise: north(-X) -> east(-Z) -> south(+X) -> west(+Z).
    const corners = [
      { x: -halfW + p.centerLocalX, z: halfD + p.centerLocalZ },
      { x: halfW + p.centerLocalX, z: halfD + p.centerLocalZ },
      { x: halfW + p.centerLocalX, z: -halfD + p.centerLocalZ },
      { x: -halfW + p.centerLocalX, z: -halfD + p.centerLocalZ }
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      const steps = Math.max(2, Math.round(len / segLen));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const ax = a.x + dx * t0;
        const az = a.z + dz * t0;
        const bx = a.x + dx * t1;
        const bz = a.z + dz * t1;
        const segDx = bx - ax;
        const segDz = bz - az;
        const segLenActual = Math.sqrt(segDx * segDx + segDz * segDz);
        edges.push({
          x: (ax + bx) / 2,
          z: (az + bz) / 2,
          tx: segDx / segLenActual,
          tz: segDz / segLenActual,
          len: segLenActual
        });
      }
    }

    for (const e of edges) {
      const w = localToWorld(anchor, e.x, e.z);
      const terrainE = sampleDem(dem, w.x, w.z);
      const delta = terrainE - p.targetMeters;
      if (Math.abs(delta) <= triggerM) continue;
      // Only build a wall on the high side (cut). On fill sides we'd really
      // want a retaining/perimeter wall too, but the most informative case for
      // slope evaluation is showing where terrain rises above the pad.
      const totalHeight = Math.abs(delta);
      let remaining = totalHeight;
      let bottomY = (delta > 0 ? p.targetMeters : terrainE) * exaggeration;
      // Outward normal direction (perpendicular to tangent, pointing away from pad center).
      const padCx = p.centerLocalX;
      const padCz = p.centerLocalZ;
      const toPadX = padCx - e.x;
      const toPadZ = padCz - e.z;
      let nx = -e.tz;
      let nz = e.tx;
      if (nx * toPadX + nz * toPadZ > 0) {
        nx = -nx;
        nz = -nz;
      }
      let tier = 0;
      while (remaining > 0.01 && tier < 4) {
        const tierH = Math.min(remaining, terraceMaxM) * exaggeration;
        const wallGeom = new THREE.BoxGeometry(e.len + 0.05, tierH, wallThick);
        wallGeom.translate(0, tierH / 2, 0);
        const wall = new THREE.Mesh(wallGeom, mats.retainWall);
        const angle = Math.atan2(e.tx, e.tz);
        wall.position.set(e.x, bottomY, e.z);
        wall.rotation.y = angle;
        out.add(wall);
        owned.push(wallGeom);
        bottomY += tierH;
        remaining -= terraceMaxM;
        tier++;
        // Step back inward for the next tier
        // (visual approximation of terraced walls)
      }
      const heightFt = metersToFeet(totalHeight);
      if (heightFt > 6) {
        tall.push({ id: p.id, heightFt });
      }
    }
  }

  // Deduplicate / aggregate by pad id, taking max height.
  const byPad = new Map<string, number>();
  for (const t of tall) {
    const cur = byPad.get(t.id) ?? 0;
    if (t.heightFt > cur) byPad.set(t.id, t.heightFt);
  }
  return Array.from(byPad.entries()).map(([id, heightFt]) => ({
    id,
    heightFt
  }));
}

// ---------------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------------

function buildStairs(
  out: THREE.Group,
  mats: PropertyMaterials,
  offsets: ReturnType<typeof downhillZ>,
  ffY: number,
  walkoutFloorY: number,
  poolTerraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  void ffY;
  void poolTerraceY; // walkoutFloorY === poolTerraceY in the current design.

  // Stair runs along the south side of the property, descending east from
  // the rear terrace surface (FF - 1 ft) down to the walkout / pool floor
  // (FF - 12 ft). Single 11 ft flight; the walkout floor and pool terrace
  // share the same elevation, so no second flight is needed.
  const stairLocalX =
    feetToMeters(DIMS.house.widthFt) / 2 + feetToMeters(2); // south side, +X edge
  const rearTerraceY =
    walkoutFloorY + feetToMeters(DIMS.lowerWalkout.heightFt);

  // Top of stair: the rear terrace's west edge, just past the house's south-east corner.
  const topLocalZ = offsets.rearTerraceCenterZ + feetToMeters(DIMS.rearTerrace.depthFt) / 2;
  // Bottom of stair: the east face of the walkout, where the pool terrace begins.
  const bottomLocalZ =
    offsets.lowerWalkoutCenterZ - feetToMeters(DIMS.lowerWalkout.depthFt) / 2;

  buildStairFlight(
    out,
    mats,
    owned,
    stairLocalX,
    topLocalZ,
    bottomLocalZ,
    rearTerraceY,
    walkoutFloorY,
    exaggeration
  );
}

function buildStairFlight(
  out: THREE.Group,
  mats: PropertyMaterials,
  owned: Array<{ dispose(): void }>,
  localX: number,
  topLocalZ: number,
  bottomLocalZ: number,
  topY: number,
  bottomY: number,
  exaggeration: number
): void {
  const dropM = topY - bottomY;
  if (dropM <= 0.05) return;
  const dropFt = metersToFeet(dropM);
  const targetRiserFt = (DIMS.stairs.riserMinIn + DIMS.stairs.riserMaxIn) / 2 / 12;
  const riserCount = Math.max(1, Math.round(dropFt / targetRiserFt));
  const riserHeightFt = dropFt / riserCount;
  // Clamp riser by extending tread depth instead of changing the ratio.
  const treadM = feetToMeters(DIMS.stairs.treadIn / 12);
  const widthM = feetToMeters(DIMS.stairs.widthFt);
  const riserH = (feetToMeters(riserHeightFt)) * exaggeration;

  const totalRunM = treadM * riserCount;
  const flightSpanM = Math.abs(topLocalZ - bottomLocalZ);
  // Distribute risers along the flight; use the available z span as the run.
  const stepZSpan = Math.min(totalRunM, flightSpanM);
  const stepDz = (bottomLocalZ - topLocalZ) / riserCount;
  void stepZSpan;

  for (let i = 0; i < riserCount; i++) {
    const fraction = (i + 0.5) / riserCount;
    const z = topLocalZ + (bottomLocalZ - topLocalZ) * fraction;
    const stepY = topY * exaggeration - riserH * (i + 0.5);
    const stepGeom = new THREE.BoxGeometry(widthM, riserH, treadM);
    stepGeom.translate(0, riserH / 2, 0);
    const step = new THREE.Mesh(stepGeom, mats.stairs);
    step.position.set(localX, stepY - riserH / 2, z);
    out.add(step);
    owned.push(stepGeom);
    void stepDz;
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function buildLabels(
  out: THREE.Group,
  offsets: ReturnType<typeof downhillZ>,
  ffY: number,
  rearY: number,
  walkoutY: number,
  poolTerraceY: number,
  exaggeration: number,
  owned: Array<{ dispose(): void }>
): void {
  const labelOffsetY = feetToMeters(6) * exaggeration;
  pushLabel(`House 76 ft x 42 ft (front faces west)`, 0, 0, ffY * exaggeration + labelOffsetY);
  pushLabel(
    `FF ${metersToFeet(ffY).toFixed(1)} ft`,
    feetToMeters(DIMS.house.widthFt) / 2 + 1,
    0,
    ffY * exaggeration + labelOffsetY * 0.6
  );
  pushLabel(
    `Rear terrace (walkout roof, FF -1 ft)`,
    0,
    offsets.rearTerraceCenterZ,
    rearY * exaggeration + labelOffsetY * 0.6
  );
  pushLabel(
    `Lower walkout 72 x 24 (floor FF -12 ft)`,
    feetToMeters(DIMS.lowerWalkout.widthFt) / 2 + 2,
    offsets.lowerWalkoutCenterZ,
    walkoutY * exaggeration + labelOffsetY * 0.4
  );
  pushLabel(
    `Pool terrace 110 x 70 (FF -12 ft)`,
    0,
    offsets.poolTerraceCenterZ,
    poolTerraceY * exaggeration + labelOffsetY * 0.6
  );
  pushLabel(
    `Pool 18 x 48`,
    0,
    offsets.poolTerraceCenterZ,
    poolTerraceY * exaggeration + labelOffsetY * 0.3
  );
  pushLabel(
    `Drop ${metersToFeet(ffY - poolTerraceY).toFixed(1)} ft (house \u2192 pool)`,
    feetToMeters(DIMS.poolTerrace.widthFt) / 2 + 2,
    offsets.poolTerraceCenterZ,
    ffY * exaggeration + labelOffsetY
  );

  function pushLabel(text: string, lx: number, lz: number, ly: number): void {
    const sprite = makeTextSprite(text);
    sprite.position.set(lx, ly, lz);
    out.add(sprite);
    owned.push(sprite.material);
    if (sprite.material.map) owned.push(sprite.material.map);
  }
}

function makeTextSprite(text: string): THREE.Sprite {
  const padding = 14;
  const font = "600 28px -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, sans-serif";
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
  }
  measureCtx.font = font;
  const metrics = measureCtx.measureText(text);
  const textW = Math.ceil(metrics.width);
  const textH = 32;

  const canvas = document.createElement("canvas");
  canvas.width = textW + padding * 2;
  canvas.height = textH + padding * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
  }
  ctx.font = font;
  ctx.fillStyle = "rgba(28, 32, 35, 0.92)";
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, canvas.width - 1, canvas.height - 1, 8);
  ctx.stroke();
  ctx.fillStyle = "#e6e8ea";
  ctx.textBaseline = "middle";
  ctx.fillText(text, padding, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 2;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true
  });
  const sprite = new THREE.Sprite(mat);
  // Scale so the sprite reads as ~1 m tall in world space at default exag.
  const scale = canvas.height / 32; // base 1 m for a 32-px-tall sprite
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subgroup(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `propertyDesign:${name}`;
  return g;
}

function clearGroup(g: THREE.Group): void {
  // Walk children in reverse so removal during iteration is safe.
  for (let i = g.children.length - 1; i >= 0; i--) {
    const child = g.children[i];
    g.remove(child);
    if ((child as THREE.Mesh).geometry) {
      (child as THREE.Mesh).geometry.dispose?.();
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function emptyReport(): PropertyReportData {
  return {
    anchorX: 0,
    anchorZ: 0,
    rotationDeg: 0,
    finishedFloorMeters: 0,
    finishedFloorFeet: 0,
    houseTerrainMinFt: 0,
    houseTerrainMaxFt: 0,
    houseMaxCutFt: 0,
    houseMaxFillFt: 0,
    poolTerraceTargetFt: 0,
    poolTerraceTerrainMinFt: 0,
    poolTerraceTerrainMaxFt: 0,
    poolTerraceMaxCutFt: 0,
    poolTerraceMaxFillFt: 0,
    totalDropHouseToPoolFt: 0,
    rearWallToPoolEdgeFt: 0,
    walkoutFaceToPoolEdgeFt: 0,
    northGrassUsable: null,
    southGrassUsable: null,
    retainingWallsOver6Ft: []
  };
}
