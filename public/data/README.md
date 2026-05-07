# Site data

This folder is the swap-in slot for real GIS data. The app currently runs on
synthetic terrain and a placeholder parcel polygon if the files below are
missing or invalid.

Expected (any subset is fine):

- `existing-dem.json` — see shape in `src/terrain/demData.ts` (`DemData`)
- `existing-heightmap.png` — alternative grayscale heightmap (not yet wired)
- `proposed-heightmap.png` — alternative grayscale heightmap (not yet wired)
- `parcel-boundary.geojson` — single Polygon Feature in WGS84 lon/lat
- `contours-existing.geojson` — optional precomputed contours
- `contours-proposed.geojson` — optional precomputed contours
- `road-context.geojson` — optional road centerlines

A starter `parcel-boundary.geojson` is included so the app boots with a real
file load path; replace it with an authoritative parcel polygon when available
(e.g. from the Dutchess County Real Property Tax Service Agency).
