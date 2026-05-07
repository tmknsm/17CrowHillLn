# Three.js Parcel Terrain Viewer — Agent Implementation Brief

## Goal

Build a browser-based Three.js site viewer for the parcel at:

- **Parcel/address:** 17 Crow Hill Ln, Rhinebeck, NY
- **Site center:** `41.9379108, -73.8851494`

The app should let the user view the parcel in two clean, isolated modes:

1. **Existing / Raw Parcel**
   - Real terrain from public elevation data
   - Parcel boundary
   - Contours
   - Optional surrounding road/context
   - No proposed structures or grading

2. **Proposed / Designed Parcel**
   - Same site/parcel boundary
   - A modified terrain surface representing conceptual grading
   - Proposed structure placement
   - Proposed driveway, pool, flat play/lawn areas, retaining walls, and grading annotations

The user must be able to switch between these two versions cleanly so each can be evaluated in isolation.

---

## High-Level Product Requirements

### Core Modes

Implement a mode switcher with at least:

```txt
Existing | Proposed
```

Optional third mode:

```txt
Compare
```

### Existing Mode

Show only:

- Existing terrain mesh
- Parcel boundary
- Contour lines
- Road/context labels if available
- Optional current tree/vegetation massing
- Optional aerial/satellite texture if easy to add

Do **not** show:

- Proposed house
- Proposed grading
- Proposed driveway
- Proposed pool
- Proposed retaining walls
- Proposed lawn pads

### Proposed Mode

Show:

- Proposed terrain mesh
- Same parcel boundary
- Proposed building footprint/massing
- Driveway alignment
- Pool / patio / hardscape if included
- Flat usable grass/play areas
- Retaining walls if needed
- Conceptual grading contours
- Optional cut/fill heatmap

Do **not** show the raw existing terrain, unless using a transparent comparison overlay.

### Compare Mode Optional

If implemented, allow:

- Existing and proposed terrain visible together
- Proposed terrain semi-transparent
- Or split-screen / wipe slider comparison
- Or elevation-difference heatmap

This is optional; do not block the basic implementation on it.

---

## Recommended Tech Stack

Use:

- **Vite**
- **TypeScript**
- **Three.js**
- **OrbitControls**
- Optional: `lil-gui` for quick development controls
- Optional: `turf.js` for GIS geometry utilities
- Optional: `proj4` for coordinate conversions
- Optional: `geotiff.js` if loading GeoTIFF DEMs directly in-browser
- Optional: local preprocessing script using Python/GDAL/Rasterio if easier than browser-side GeoTIFF parsing

Recommended app shape:

```txt
parcel-terrain-viewer/
  package.json
  index.html
  src/
    main.ts
    config/siteConfig.ts
    scene/createScene.ts
    scene/createLights.ts
    scene/createCamera.ts
    scene/createControls.ts
    terrain/createTerrainMesh.ts
    terrain/createContours.ts
    terrain/createProposedTerrain.ts
    layers/createParcelBoundary.ts
    layers/createRoadContext.ts
    layers/createBuilding.ts
    layers/createDriveway.ts
    layers/createPool.ts
    layers/createRetainingWalls.ts
    state/layerState.ts
    ui/createModeToggle.ts
    utils/geo.ts
    utils/materials.ts
  public/
    data/
      existing-dem.json
      existing-heightmap.png
      proposed-heightmap.png
      parcel-boundary.geojson
      contours-existing.geojson
      contours-proposed.geojson
      road-context.geojson
```

---

## Data Sources

Use public/free data where possible.

### Elevation / Terrain

Preferred order:

1. **New York State GIS LiDAR / DEM**
   - Use NYS LiDAR or DEM tiles for the area around `41.9379108, -73.8851494`.
   - Prefer bare-earth DEM if available.
   - A 1-meter or 2-foot resolution elevation product is ideal.

2. **USGS 3DEP / National Map**
   - Use if NYS download is inconvenient.

3. **Dutchess County / NYS contour data**
   - Use 2-foot or 5-foot contours as fallback.
   - Can triangulate terrain from contours if DEM is unavailable.

4. **Generic global DEM**
   - Last resort only.
   - Not good enough for careful driveway/pool/house grading decisions.

### Parcel Boundary

Try, in order:

1. Dutchess County ParcelAccess / Real Property GIS
2. Dutchess County GIS Open Data if parcel polygon is available
3. Manual boundary digitization from county parcel viewer screenshot
4. User-provided survey, tax map, or deed map

Important: official downloadable parcel polygons may require ordering from Dutchess County Real Property Tax Service Agency. If not freely downloadable, build the first version using a placeholder parcel boundary around the coordinate and make the app accept a future `parcel-boundary.geojson`.

### Address Verification

Use:

- Dutchess County Address Info-Finder
- ParcelAccess
- Geocoder as fallback

Address:

```txt
17 Crow Hill Ln, Rhinebeck, NY
```

Coordinate:

```txt
41.9379108, -73.8851494
```

---

## Coordinate System Requirements

Do not build the scene directly in raw latitude/longitude.

Convert geospatial coordinates into a local meter-based coordinate system.

### Recommended Local Coordinate Strategy

Use the site center as origin:

```ts
const SITE_CENTER = {
  lat: 41.9379108,
  lon: -73.8851494
}
```

Convert nearby lon/lat into local meters:

```ts
x = east/west offset in meters
z = north/south offset in meters
y = elevation in meters
```

For a site-scale model, an approximate conversion is acceptable:

```ts
const metersPerDegreeLat = 111_320;
const metersPerDegreeLon = 111_320 * Math.cos(centerLatRadians);

x = (lon - centerLon) * metersPerDegreeLon;
z = -(lat - centerLat) * metersPerDegreeLat;
```

Use negative `z` for north if it makes Three.js camera orientation easier. Be consistent.

For higher precision, use a projected CRS such as New York State Plane East or UTM Zone 18N, but local tangent-plane conversion is fine for a small parcel viewer.

---

## Scene Architecture

Use separate Three.js groups for each logical layer.

```ts
const rootGroup = new THREE.Group();

const contextGroup = new THREE.Group();
const existingGroup = new THREE.Group();
const proposedGroup = new THREE.Group();

const existingTerrainGroup = new THREE.Group();
const existingAnnotationGroup = new THREE.Group();

const proposedTerrainGroup = new THREE.Group();
const proposedStructureGroup = new THREE.Group();
const proposedAnnotationGroup = new THREE.Group();

scene.add(rootGroup);

rootGroup.add(contextGroup);
rootGroup.add(existingGroup);
rootGroup.add(proposedGroup);

existingGroup.add(existingTerrainGroup);
existingGroup.add(existingAnnotationGroup);

proposedGroup.add(proposedTerrainGroup);
proposedGroup.add(proposedStructureGroup);
proposedGroup.add(proposedAnnotationGroup);
```

### Layer Visibility

Implement:

```ts
type ViewMode = "existing" | "proposed" | "compare";

function setViewMode(mode: ViewMode) {
  if (mode === "existing") {
    existingGroup.visible = true;
    proposedGroup.visible = false;
  }

  if (mode === "proposed") {
    existingGroup.visible = false;
    proposedGroup.visible = true;
  }

  if (mode === "compare") {
    existingGroup.visible = true;
    proposedGroup.visible = true;

    // Optional:
    // make proposed terrain semi-transparent
    // hide duplicate annotations
    // show cut/fill heatmap
  }
}
```

The parcel boundary should usually remain visible in both modes. Put it in `contextGroup`.

---

## Terrain Pipeline

### Existing Terrain

Generate the existing terrain from DEM or heightmap.

Input should become one of these:

```txt
existing-heightmap.png
```

or:

```txt
existing-dem.json
```

Suggested JSON shape:

```json
{
  "center": {
    "lat": 41.9379108,
    "lon": -73.8851494
  },
  "widthMeters": 250,
  "depthMeters": 250,
  "rows": 257,
  "cols": 257,
  "minElevationMeters": 0,
  "maxElevationMeters": 100,
  "elevations": [
    [/* row 1 */],
    [/* row 2 */]
  ]
}
```

Use a grid mesh:

```ts
function createTerrainMesh(data: DemData): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    data.widthMeters,
    data.depthMeters,
    data.cols - 1,
    data.rows - 1
  );

  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const col = i % data.cols;
    const row = Math.floor(i / data.cols);
    const elevation = data.elevations[row][col];

    positions.setY(i, elevation * ELEVATION_SCALE);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x8f9d7a,
    roughness: 0.9,
    metalness: 0.0
  });

  return new THREE.Mesh(geometry, material);
}
```

Use a vertical exaggeration toggle:

```ts
const ELEVATION_SCALE = 1.0;
```

Allow values like:

```txt
0.5x | 1x | 1.5x | 2x
```

Default should be **1x** to avoid misleading grading decisions.

---

## Proposed Terrain

The proposed terrain should be a separate terrain mesh, not just objects placed on top of the raw terrain.

### First Version

Duplicate the existing elevation grid and apply conceptual terrain modifications.

Implement tools/functions like:

```ts
function flattenPad(
  dem: DemData,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  targetElevation: number,
  featherMeters: number
): DemData
```

```ts
function blendToExisting(
  existing: DemData,
  proposed: DemData,
  featherMeters: number
): DemData
```

### Proposed Grading Operations

Support at least:

1. **House pad**
   - Rectangular or L-shaped flattened building area
   - Slight extra margin around foundation

2. **Driveway**
   - Ribbon/path surface
   - Smooth grade along a polyline
   - Avoid impossible slopes where possible

3. **Pool / patio pad**
   - Flat or nearly flat area

4. **Lawn/play area**
   - Larger flat or gently sloped surface
   - Target slope ideally under 5%

5. **Retaining walls**
   - Vertical or sloped transitions where grade changes abruptly

This can be conceptual, not construction-grade engineering.

---

## Proposed Site Elements

### Building

Use a simple massing model first.

Required:

- Footprint
- Height
- Roof massing if known
- Orientation
- Placement on house pad

Example:

```ts
const house = createBuildingMassing({
  width: 22,
  depth: 14,
  height: 7,
  position: { x: 0, y: padElevation, z: 0 },
  rotationY: Math.PI / 8
});
```

The app should make it easy to swap this placeholder with a more detailed model later.

### Driveway

Represent the driveway as:

- Polyline path
- Width in meters
- Mesh ribbon
- Slightly above terrain to avoid z-fighting

Show in proposed mode only.

### Pool

Represent the pool as:

- Rectangular water plane or simple inset shape
- Optional coping/patio around it
- Proposed mode only

### Retaining Walls

Represent retaining walls as:

- Thin vertical wall meshes
- Follow one or more polylines
- Height based on nearby terrain difference if possible
- Proposed mode only

### Lawn / Play Areas

Represent as:

- Flat or gently sloped patch
- Different material from surrounding terrain
- Proposed mode only

---

## UI Requirements

### Main Toggle

At top-left or top-center:

```txt
Existing | Proposed | Compare
```

Use clear active state.

### Layer Toggles

Add collapsible or secondary toggles:

```txt
Base
[x] Parcel boundary
[x] Contours
[x] Road/context
[ ] Aerial texture

Existing
[x] Existing terrain
[x] Existing contours
[ ] Existing trees

Proposed
[x] Proposed grading
[x] House
[x] Driveway
[x] Pool
[x] Lawn/play areas
[x] Retaining walls
[ ] Cut/fill heatmap
```

Layer toggles should not fight the main mode switcher. If the app is in Existing mode, proposed layer toggles can be visible but disabled/greyed out, or hidden.

### Camera Presets

Add buttons:

```txt
Top Down
Road Approach
Downhill View
Side Slope
Free Orbit
```

### Measurements

Add optional display:

```txt
Cursor elevation
Distance scale
North arrow
Vertical exaggeration
```

Minimum useful measurement features:

- scale bar
- north arrow
- elevation range
- contour interval

---

## Visual Style

The app should be readable and practical, not game-like.

### Existing Mode Style

- Terrain: muted natural green/tan
- Parcel line: clear black/dark outline
- Contours: thin dark lines
- Road: subtle gray
- Context: minimal

### Proposed Mode Style

- Proposed terrain: slightly lighter / more designed surface
- House: warm neutral massing
- Driveway: light gravel gray
- Pool: muted blue
- Lawn/play pad: soft green
- Retaining walls: stone gray
- Cut: warm tint
- Fill: cool tint

Do not over-style. The goal is site comprehension.

---

## Contours

Generate contour lines from the DEM.

Existing contours should be derived from existing DEM.

Proposed contours should be derived from proposed DEM.

Contour interval:

```txt
2 ft if source data supports it
5 ft if source data is coarse
```

Display:

- Thin lines every interval
- Slightly thicker index line every 10 ft
- Optional elevation labels later

Make sure contours follow the active mode:

```txt
Existing mode → existing contours
Proposed mode → proposed contours
```

---

## Cut / Fill Comparison

Optional but very valuable.

If implemented, calculate:

```ts
deltaElevation = proposedElevation - existingElevation
```

Interpretation:

```txt
positive = fill
negative = cut
near zero = unchanged
```

Show as optional heatmap in Proposed or Compare mode.

Also compute summary stats:

```txt
Max cut
Max fill
Approx cut volume
Approx fill volume
Net cut/fill
```

Mark this clearly as conceptual unless using engineering-grade data.

---

## Data Preprocessing Recommendation

For speed and reliability, do GIS preprocessing outside the browser.

Suggested preprocessing script:

```txt
scripts/
  prepare-site-data.py
```

Responsibilities:

1. Take site center coordinate and radius
2. Download or load DEM tile
3. Crop around the parcel/site
4. Resample to manageable grid size
5. Normalize/export elevations
6. Generate contours
7. Export JSON/GeoJSON/PNG assets

Recommended exported area:

```txt
250m x 250m
```

or:

```txt
500ft x 500ft
```

If the parcel is large, use a bigger crop, e.g.:

```txt
400m x 400m
```

Recommended grid:

```txt
257 x 257
```

or:

```txt
513 x 513
```

Use 257 for performance and 513 for detail.

---

## Example Site Configuration

Create:

```ts
// src/config/siteConfig.ts

export const siteConfig = {
  name: "17 Crow Hill Ln Parcel Study",
  address: "17 Crow Hill Ln, Rhinebeck, NY",
  center: {
    lat: 41.9379108,
    lon: -73.8851494
  },
  defaultRadiusMeters: 150,
  defaultViewMode: "existing",
  terrain: {
    verticalExaggeration: 1,
    contourIntervalFeet: 2
  },
  proposed: {
    housePad: {
      center: { x: 0, z: 0 },
      widthMeters: 24,
      depthMeters: 16,
      featherMeters: 8
    },
    driveway: {
      widthMeters: 4
    },
    pool: {
      widthMeters: 5,
      lengthMeters: 12
    },
    lawn: {
      maxPreferredSlopePercent: 5
    }
  }
};
```

---

## Minimum Viable Implementation

The first working version should include:

1. Three.js scene with orbit controls
2. Existing terrain mesh from placeholder or real DEM data
3. Parcel boundary layer
4. Existing contours
5. Proposed terrain mesh as a modified duplicate of existing terrain
6. Simple house massing
7. Simple driveway ribbon
8. Simple lawn/play pad
9. Simple pool rectangle
10. Toggle between Existing and Proposed modes
11. Camera presets
12. Basic labels / north arrow / scale bar

The implementation should still work if real parcel data is not available yet. Use placeholder GeoJSON and make it easy to replace later.

---

## Important Engineering Notes

### Do Not Block on Perfect GIS Data

If parcel boundary or DEM download is difficult, scaffold the app with mock data first:

- Generate synthetic sloped terrain centered on the coordinate
- Add placeholder rectangular parcel boundary
- Add placeholder proposed house/pool/driveway
- Keep the data-loading interfaces real so assets can be swapped later

### Avoid Z-Fighting

Any line or surface overlay should sit slightly above the terrain:

```ts
const SURFACE_OFFSET = 0.05;
```

### Keep Units Clear

Use meters internally.

Display feet optionally for the user, since U.S. land/site work is usually discussed in feet.

Conversions:

```ts
const metersToFeet = (m: number) => m * 3.28084;
const feetToMeters = (ft: number) => ft / 3.28084;
```

### Avoid Misleading Precision

This is a conceptual visualization unless using official survey and engineering-grade grading data.

Include small UI note:

```txt
Conceptual terrain visualization. Not a survey or engineering plan.
```

---

## Acceptance Criteria

The implementation is successful when:

- App launches locally with `npm run dev`
- The user can orbit around the parcel terrain
- Existing mode shows only raw/current parcel terrain and context
- Proposed mode hides existing terrain and shows proposed grading + structures
- Parcel boundary remains visible in both modes
- Existing and proposed terrains are separate meshes
- Existing and proposed contours can be separately rendered
- Layer toggles work without breaking the main mode switch
- Code is organized so real GIS data can replace placeholder data
- All coordinates are converted to local scene coordinates
- Site center is `41.9379108, -73.8851494`
- Address label says `17 Crow Hill Ln, Rhinebeck, NY`
- No proposed objects appear in Existing mode
- Existing raw terrain does not appear in Proposed mode unless Compare mode is active

---

## Suggested Agent Task Prompt

Use this prompt with a coding agent:

```txt
Build a Vite + TypeScript + Three.js app for a parcel terrain viewer centered on 17 Crow Hill Ln, Rhinebeck, NY at coordinates 41.9379108, -73.8851494.

The app needs two primary isolated modes: Existing and Proposed.

Existing mode should show raw terrain, parcel boundary, contours, and minimal context only. Proposed mode should hide the existing terrain and instead show a separate proposed terrain mesh with conceptual grading, a house massing, driveway, pool, lawn/play area, retaining walls, and proposed contours.

Use separate Three.js groups for contextGroup, existingGroup, and proposedGroup. The mode switcher should toggle group visibility so each version can be viewed in isolation. Existing and proposed terrain must be separate meshes, not one mesh with props overlaid.

Use meters internally. Convert lon/lat around the site center into local x/z coordinates. Add orbit controls, lights, camera presets, layer toggles, north arrow, scale bar, and a small disclaimer that this is conceptual and not a survey.

If real DEM/parcel data is unavailable during implementation, create a realistic synthetic sloped terrain and placeholder parcel polygon, but keep the data-loading structure ready for replacement with existing-dem.json, proposed-heightmap.png, parcel-boundary.geojson, and contour GeoJSON files.

Organize the code into clear modules under src/scene, src/terrain, src/layers, src/ui, src/state, src/utils, and src/config. Make the app run with npm install and npm run dev.
```

---

## Future Enhancements

After the MVP works:

1. Real DEM download + preprocessing pipeline
2. Real parcel boundary import
3. Aerial imagery draped on terrain
4. Tree canopy layer
5. Building model import from GLB/GLTF
6. Editable grading handles
7. Cut/fill volume calculation
8. Before/after slider
9. Export screenshots
10. Export terrain and proposed layout as GLB
11. Sun/shadow study by date/time
12. Septic/well/wetlands overlays
13. Road sightline/driveway grade study
14. Slope analysis heatmap
15. Flat-area detection for lawn/play zones

---

## Strong Recommendation

Build the app in two phases:

### Phase 1: Interactive Viewer

Use placeholder terrain and placeholder parcel data. Prove the UX, groups, toggles, proposed mode, camera, and layers.

### Phase 2: Real Site Data

Replace placeholders with real DEM, contours, and parcel boundary.

This avoids getting stuck on GIS acquisition before the actual Three.js product structure works.
