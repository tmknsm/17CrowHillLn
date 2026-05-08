# Three.js Property Placement Prompt

Place the attached farmhouse / pool / terrace concept (see `houseDimensions.png`) onto the existing Three.js terrain in this project (`17CrowHillLn`) using real-world scale and accurate spatial relationships.

The terrain already exists and is generated from public elevation data (NYS / USGS Terrarium tiles, with a synthetic fallback). **Do not replace or fake the terrain.** Use the existing DEM grid as the source of truth for grade, slope, and elevation.

The goal is to place a simplified but dimensionally accurate version of the property design onto the real terrain so I can evaluate whether the house, lower level, pool, terraces, stairs, and usable grass areas actually fit on the slope.

---

## Project Integration (read this first)

This is a Vite + TypeScript + Three.js project. Author code in TypeScript using the existing modules and conventions:

- **Tooling:** Three.js `^0.160`, `lil-gui`, `proj4`, `@turf/turf`, Vite + TS.
- **Entry point:** `src/main.ts`.
- **Site config:** `src/config/siteConfig.ts` — site center `41.9379108, -73.8851494`, default `verticalExaggeration: 1.5`.
- **Scene groups (`src/scene/createScene.ts`):**
  - `groups.context` — parcel boundary, road context, **home / property design** (this is where the new property objects belong).
  - `groups.terrain` — the single terrain mesh.
  - `groups.annotations` — overlays draped on terrain (contours, etc.).
- **Layer state (`src/state/layerState.ts`):** `LayerVisibility`, `LayerHandles`, `applyLayerVisibility`. Add new keys for every new toggleable layer (rear terrace, lower walkout, pool terrace, grading pad, cut/fill overlay, retaining walls, stairs, labels, grass zones).
- **UI panel (`src/ui/createLayerPanel.ts`):** `lil-gui` panel with `Base / Home / Terrain / Settings` folders. Add a new `Property` (or expand `Home`) folder with the new toggles + sliders.
- **Materials palette:** `src/utils/materials.ts` — reuse `Palette.cut`, `Palette.fill`, `Palette.retainingWall`, `Palette.lawn`, `Palette.pool`, `Palette.building`, `Palette.driveway`, etc.
- **Geo / units helpers:** `src/utils/geo.ts` — `feetToMeters`, `metersToFeet`, `lonLatToLocal`, `createProjection`, `distance2D`, `samplePolyline`, `polylineLength`.

### Coordinate & unit conventions (mandatory)

- World units are **meters**. Internally, **always meters**. The text below quotes design dimensions in feet because the design is U.S. residential — convert to meters at the boundary using `feetToMeters(...)`.
- Three.js axes: **`+X` = east**, **`+Z` = south**, **`+Y` = up**. Therefore:
  - "Front faces west" = front normal points to `-X`.
  - "Rear faces east / downhill" = rear normal points to `+X`.
  - "Long face runs north/south" = long face is parallel to the Z axis.
- Vertical exaggeration is a runtime scalar (`state.exaggeration`, default `1.5`). **Every visual y-position must be `elevationMeters * exaggeration`** so the property and the terrain stay co-planar when the user changes the slider. If `applyExaggeration` changes, the property module must re-anchor (a `rebuild` or `applyExaggeration(scale)` hook is fine — model it after `createTerrainMesh.applyExaggeration`).
- The scene root is offset: `groups.root.position.y = -referenceElevation * exaggeration` (set in `main.ts`). Just put property objects in world coordinates relative to elevations from `sampleDem`; the existing root offset will keep the site centered around y≈0.

### Existing terrain sampling

Use the helper that already exists. Do not write a new one.

```ts
// src/terrain/demData.ts
import { sampleDem, type DemData } from "../terrain/demData";

const elevationMeters = sampleDem(dem, x, z); // bilinear, clamped, in meters
```

`DemData` shape: `{ center, widthMeters, depthMeters, rows, cols, minElevationMeters, maxElevationMeters, elevations: number[][] }`. The `dem` instance is constructed in `main.ts` and should be passed into the new property module.

### What this supersedes

`src/layers/createHomeStructures.ts` is the previous, simpler placeholder (40×70 ft house, balcony, pool). Replace its body with the new design described below, **or** create a new module `src/layers/createPropertyDesign.ts` and update `main.ts` + `layerState.ts` + `createLayerPanel.ts` to wire it in. Either way, remove the old 40×70 ft placeholder geometry so it doesn't double-render.

The existing module's parcel-edge anchor logic (find the longest west-facing edge of the parcel, push inward by a setback) is a good seed for the **default** anchor — keep that pattern but expose the anchor as editable (see "Placement Anchor" below).

---

## Critical Orientation

- The **front** of the house must face **west** (front normal in world `-X`).
- The **rear** of the house faces **east / downhill** toward the pool (`+X`).
- House long axis runs **north/south** (parallel to world Z).
- House sits on the upper portion of the slope; pool and lower terrace are downhill (east) of it.

---

## Existing Terrain Rules

Use the existing terrain DEM. For every placed object, calculate its Y elevation by sampling the terrain at its footprint or anchor point with `sampleDem(dem, x, z)` (returns **meters**, then multiply by `exaggeration` for visual y).

Do **not** assume a flat site globally. Instead:

- Find the intended house pad area on the terrain.
- Sample terrain heights across the house footprint (multiple samples, not just the center).
- Establish a proposed finished-floor elevation based on the high-side / west-side grade.
- Show any required cut/fill, retaining walls, or grading pads as **explicit geometry** (toggleable layers).
- Do not let the house, pool, or terraces float above or sink into the terrain without explanation.

---

## Placement Anchor

Create a single editable placement anchor for the property. Default it to the parcel-derived position used by the existing module (longest west-facing edge midpoint, pushed inward by a setback), then let the user override it.

Anchor shape:

```ts
interface PropertyAnchor {
  x: number;        // world meters, east
  z: number;        // world meters, south
  rotationY: number; // radians, around Y (up)
}
```

The anchor represents the **center of the main house footprint**. All other elements are positioned in a house-local frame and then transformed by the anchor. Define the local frame as:

- Local `+X` = parallel to the front face (running roughly north/south in world after rotation).
- Local `+Z` = forward, out of the front of the house (toward world west when correctly rotated).
- Local `+Y` = up.

Pick a default `rotationY` that makes the front face point world `-X` given that frame, and expose it via a `lil-gui` slider for fine alignment with the parcel and driveway.

Implement `localToWorld(anchor, localX, localZ)` once and reuse it for every dependent object.

---

## Main House Footprint

Create a simplified farmhouse massing matching `houseDimensions.png`.

Overall house footprint (feet, convert via `feetToMeters`):

- Width north/south (along world Z after rotation): **76 ft**
- Depth west/east (along world X after rotation): **42 ft**
- Front faces west, rear faces east.
- Finished-floor elevation: derived from terrain sampling (see below).

Coordinate relationship to anchor:

- House center = anchor.
- House extends 38 ft north/south from center.
- House extends 21 ft west/east from center.

Approximate program (simple boxes, no millwork):

- Main farmhouse volume: **56 ft × 38 ft**
- Left wing / side volume: **24 ft × 36 ft**
- Right gable volume: **28 ft × 34 ft**
- Front porch on west side: **24 ft × 10 ft** (porch faces west)
- Rear deck / terrace on east side (covered separately under "Rear Upper Terrace")

Materials (reuse `Palette.building`, add new entries to `materials.ts` if needed):

- White siding boxes
- Dark standing-seam gable roofs
- Black window rectangles (simple inset boxes)
- Simple porch slab and posts

---

## Elevation Logic for House

```ts
const FF_OFFSET_FT = 1.5; // tweakable via GUI

// 1. Sample terrain at multiple points across the rotated house footprint.
const samples = sampleTerrainHeightsInFootprint(dem, anchor, widthFt, depthFt, sampleCount);

// 2. Prioritize the west / front side grade as the entry reference.
const avgWestSideGrade = mean(samples.westEdge);

// 3. Set finished floor slightly above the west grade.
const finishedFloorY = avgWestSideGrade + feetToMeters(FF_OFFSET_FT);
```

Report (console + optional debug overlay):

- Min terrain elevation under house footprint (m + ft)
- Max terrain elevation under house footprint
- Proposed finished-floor elevation
- Required max cut
- Required max fill

Visual grading indicators (toggleable layers):

- **Green / translucent pad** = proposed leveled building pad (`Palette.lawn` w/ opacity, or new `Palette.gradingPad`).
- **Red / orange translucent areas** = cut (`Palette.cut`).
- **Blue translucent areas** = fill (`Palette.fill`).
- **Gray retaining walls** (`Palette.retainingWall`) where pad-vs-grade transition exceeds 3 ft.

---

## Rear Upper Terrace

East / downhill of the house, attached to the rear face.

- Width north/south: **80 ft**
- Depth west/east: **22 ft**
- Elevation: `finishedFloorY - feetToMeters(1)`
- Material: stone / concrete / bluestone (reuse `Palette.driveway` or add `Palette.bluestone`)
- Simple railing on the exposed downhill (east) edge.

The terrace projects from the house and bridges toward the lower slope; it should not be independently placed.

---

## Lower Walkout Level

Directly below / east of the rear terrace, tucked into the slope.

- Width north/south: **72 ft**
- Depth west/east: **24 ft**
- Lower-floor elevation: `finishedFloorY - feetToMeters(12)`
- Height: **11 ft**
- East face glazed (transparent or `0x88aacc` low-opacity panels).
- West / back side embedded into slope where terrain allows.

Sample terrain under this footprint and surface whether the real terrain supports a walkout. If terrain is too flat or too steep, make that obvious via cut/fill overlays.

---

## Pool Terrace

East / downhill of the lower walkout.

- Width north/south: **110 ft**
- Depth west/east: **70 ft**
- Target elevation: `finishedFloorY - feetToMeters(14)`
- Material: bluestone / gray stone
- Must be level.

Sample real terrain across the pool-terrace footprint and show:

- Where terrain must be cut.
- Where terrain must be filled.
- Retaining walls required around terrace edges.
- Whether the terrace can sit naturally into the slope.

---

## Pool

Rectangular pool centered on the pool terrace, parallel to the house long axis (long axis runs west/east since house long axis runs north/south — see brief).

- Width north/south: **18 ft**
- Length west/east: **48 ft**
- Water surface: `terraceY - feetToMeters(0.5)`
- Coping: 3 ft wide on all sides

Leave usable deck space around the pool (don't run it edge-to-edge with the terrace).

---

## Side Grass / Play Areas

Use the real terrain as a constraint. Prioritize side areas, not a huge extension beyond the far end of the pool.

- North side of pool: 20–35 ft wide if terrain allows.
- South side of pool: 20–35 ft wide if terrain allows.
- Max usable slope: **5%**.
- If natural terrain exceeds 5%, render the area in a "not usable" tint and surface it in the report.

Represent these as flat green pads or slightly graded green planes (`Palette.lawn`).

---

## Stairs

Exterior stone stairs along the **left / south** side of the house and pool zone, connecting:

1. Upper house level / rear terrace
2. Lower walkout level
3. Pool terrace

Use real elevation differences from the placed objects. **Do not hard-code riser count** — derive it from sampled elevations:

- Riser height: 6.5–7.5 in
- Tread depth: 14–16 in
- Stair width: 5 ft
- Landings every 8–10 risers
- Follow terrain where possible.

If slope is too steep or shallow, adjust stair run length and landing locations. Surface a warning if any flight exceeds reasonable rise-over-run.

---

## Retaining Walls

Generate retaining walls **only where needed**, based on real terrain vs proposed level pads.

Use retaining walls around:

- House pad if cut/fill exceeds 3 ft
- Rear terrace edge
- Lower walkout transition
- Pool terrace edges
- Stair landings

Rules:

- Avoid a single giant wall when a terraced solution is more realistic.
- If wall height exceeds 6 ft, split into multiple terraced walls where possible.
- Show wall height labels (toggleable).

---

## Spatial Validation Output

Generate a debug overlay (DOM panel, styled like the existing `cursor-readout` in `index.html`) AND a console report containing:

- House anchor coordinates (m + ft)
- House `rotationY` in degrees
- House finished-floor elevation (m + ft)
- Existing terrain min/max under house footprint
- Pool terrace target elevation
- Terrain min/max under pool terrace
- Cut/fill depth range for each pad
- Total vertical drop from house finished floor to pool terrace
- Distance from house rear wall to pool edge
- Distance from lower walkout face to pool edge
- Usable grass dimensions beside pool (north & south)
- Any retaining wall segment over 6 ft tall

This is important: the scene must help me understand whether the design actually works on the real terrain.

---

## Labels

Add optional labels in the Three.js scene (sprite-based or drei-style — sprites are fine):

- House footprint: 76 ft × 42 ft
- Front faces west / Rear faces east
- Finished floor elevation
- Rear terrace: 80 ft × 22 ft
- Lower walkout: 72 ft × 24 ft
- Pool terrace: 110 ft × 70 ft
- Pool: 18 ft × 48 ft
- Vertical drop from house to pool
- Cut/fill warnings
- Retaining wall heights

Labels must be toggleable as a single layer (`labels: boolean` in `LayerVisibility`).

---

## Controls (lil-gui)

Extend `src/ui/createLayerPanel.ts`. Group the new controls under a `Property` folder (and possibly retire the existing `Home` folder, since this design replaces those volumes).

Property anchor (sliders):

- Move house north/south (`anchor.z`)
- Move house east/west (`anchor.x`)
- Rotate house (`anchor.rotationY`, degrees in the GUI, radians under the hood)
- Finished-floor offset above west grade (default 1.5 ft)

Toggles (extend `LayerVisibility`):

- House
- Rear terrace
- Lower walkout
- Pool terrace
- Pool
- Stairs
- Retaining walls
- Grass zones
- Grading pads (proposed level surfaces)
- Cut / fill overlay
- Labels

When the user moves or rotates the anchor or changes the FF offset, **every dependent element must re-anchor and all terrain sampling / cut-fill calculations must update**. Implement this as a single `rebuild()` (or `update(state)`) on the property module that the GUI hook calls. Mirror the pattern used by `rebuildContours()` in `main.ts`.

---

## Implementation Structure

Single source-of-truth config (TypeScript). Co-locate next to the new module, e.g. `src/layers/createPropertyDesign.ts`:

```ts
export interface PropertyLayout {
  anchor: { x: number; z: number; rotationY: number };
  house: {
    widthFt: 76;
    depthFt: 42;
    frontDirection: "west";
    floorOffsetAboveWestGradeFt: number; // default 1.5
  };
  upperTerrace: {
    widthFt: 80;
    depthFt: 22;
    elevationOffsetFromHouseFFFt: -1;
  };
  lowerWalkout: {
    widthFt: 72;
    depthFt: 24;
    elevationOffsetFromHouseFFFt: -12;
    heightFt: 11;
  };
  poolTerrace: {
    widthFt: 110;
    depthFt: 70;
    elevationOffsetFromHouseFFFt: -14;
  };
  pool: {
    widthFt: 18;
    lengthFt: 48;
    waterOffsetFromTerraceFt: -0.5;
    copingFt: 3;
  };
  grassZones: {
    preferredSideWidthMinFt: 20;
    preferredSideWidthMaxFt: 35;
    maxSlopePercent: 5;
  };
  stairs: {
    widthFt: 5;
    targetRiserMinIn: 6.5;
    targetRiserMaxIn: 7.5;
    treadDepthIn: 15;
    maxRisersBeforeLanding: 10;
  };
}
```

The unit suffix in property names (`Ft`, `In`) is intentional — convert to meters at the call site with `feetToMeters` so unit confusion is impossible.

---

## Required Helper Functions

Reuse existing helpers; add the new ones in a focused utility module, e.g. `src/utils/terrainSampling.ts`:

```ts
// Already exists — DO NOT reimplement
import { sampleDem, type DemData } from "../terrain/demData";
import { feetToMeters, metersToFeet } from "../utils/geo";

// New helpers to add
export function sampleTerrainHeightsInFootprint(
  dem: DemData,
  anchor: PropertyAnchor,
  localCenterX: number,
  localCenterZ: number,
  widthMeters: number,
  depthMeters: number,
  sampleCount: number
): {
  samples: number[];          // elevations in meters
  min: number;
  max: number;
  westEdgeMean: number;
  eastEdgeMean: number;
};

export function calculatePadCutFill(
  dem: DemData,
  footprintWorldCorners: { x: number; z: number }[],
  targetElevationMeters: number,
  sampleCount: number
): {
  maxCutMeters: number;
  maxFillMeters: number;
  meanCutMeters: number;
  meanFillMeters: number;
  cutCellsArea: number;       // m^2
  fillCellsArea: number;      // m^2
};

export function localToWorld(
  anchor: PropertyAnchor,
  localX: number,
  localZ: number
): { x: number; z: number };
```

In the property module:

```ts
function createLevelPad(
  footprint: Footprint,
  targetElevationMeters: number,
  exaggeration: number
): THREE.Mesh;

function createCutFillOverlay(
  dem: DemData,
  footprint: Footprint,
  targetElevationMeters: number,
  exaggeration: number
): THREE.Group;

function createRetainingWallsFromPadEdges(
  dem: DemData,
  footprint: Footprint,
  targetElevationMeters: number,
  exaggeration: number,
  thresholdMeters: number       // e.g. feetToMeters(3)
): THREE.Group;

function createDimensionLabel(
  startWorld: THREE.Vector3,
  endWorld: THREE.Vector3,
  text: string
): THREE.Sprite;
```

---

## Wiring into the App

1. **`src/layers/createPropertyDesign.ts`** — new module that returns
   `{ group, house, rearTerrace, lowerWalkout, poolTerrace, pool, stairs, retainingWalls, grassZones, gradingPads, cutFillOverlay, labels, update(state, exaggeration) }`.
2. **`src/state/layerState.ts`** — extend `LayerVisibility` and `LayerHandles` with the new layers (`house`, `rearTerrace`, `lowerWalkout`, `poolTerrace`, `pool`, `stairs`, `retainingWalls`, `grassZones`, `gradingPads`, `cutFillOverlay`, `labels`). Update `defaultVisibility()` and `applyLayerVisibility()`. Remove `balcony` if it's no longer represented.
3. **`src/ui/createLayerPanel.ts`** — add a `Property` folder with the toggles and anchor sliders. Trigger `propertyDesign.update(...)` on slider change.
4. **`src/main.ts`** —
   - Construct `propertyDesign` after the parcel + DEM are ready.
   - Add `propertyDesign.group` to `groups.context`.
   - Pass its handles into `LayerHandles`.
   - When `onExaggerationChange` fires, also call `propertyDesign.applyExaggeration(scale)` (or `update(state, scale)`).
5. **`src/utils/materials.ts`** — add any missing palette entries (e.g. `gradingPad`, `bluestone`, `coping`).

Remove or gut `src/layers/createHomeStructures.ts` so it does not double-render. Strip references in `main.ts` and `layerState.ts`.

---

## Visual Style

Match the existing app aesthetic (muted natural palette, dark UI panels). Do not over-style. The goal is site comprehension.

- House siding: warm white / off-white
- Roofs: dark gray standing-seam
- Stone/bluestone terraces: medium warm gray
- Pool water: muted blue (`Palette.pool`)
- Lawn / grass pads: soft green (`Palette.lawn`)
- Retaining walls: stone gray (`Palette.retainingWall`)
- Cut overlay: warm orange-red (`Palette.cut`), 0.4 opacity
- Fill overlay: cool blue (`Palette.fill`), 0.4 opacity
- Grading pad: translucent green, 0.3 opacity

---

## Final Result

The final result should show the reference-property layout placed accurately on the real Rhinebeck terrain.

Rendering can stay simple and blocky.

Accuracy priorities:

1. Correct orientation: **front faces west**.
2. Correct scale (feet authored, meters internally).
3. Correct relative placement of house, rear terrace, lower walkout, pool terrace, pool, grass zones, stairs.
4. Correct elevations from sampled terrain (`sampleDem`) and a tweakable FF offset.
5. Clear cut / fill / retaining-wall implications as toggleable geometry.
6. Easy adjustment of anchor (`x`, `z`, `rotationY`) and FF offset via lil-gui, with all dependent elements re-anchoring and all terrain sampling re-running.
7. Vertical exaggeration (`state.exaggeration`) respected — every y-position is `elevationMeters * exaggeration`, and the property re-anchors when the slider changes.

Do not focus on photorealism. Focus on whether this property layout actually fits the slope.
