import type { PropertyReportData } from "../layers/createPropertyDesign";

export interface PropertyReportPanel {
  update(data: PropertyReportData): void;
}

export function createPropertyReport(): PropertyReportPanel {
  const root = document.getElementById("property-report");

  function row(label: string, value: string): string {
    return `<div class="pr-row"><span class="pr-label">${label}</span><span class="pr-value">${value}</span></div>`;
  }

  function ft(v: number): string {
    return `${v.toFixed(1)} ft`;
  }

  function update(data: PropertyReportData): void {
    if (!root) {
      console.info("[propertyReport]", data);
      return;
    }

    const grass = (
      g: PropertyReportData["northGrassUsable"]
    ): string => {
      if (!g) return "n/a";
      return `${g.widthFt.toFixed(0)} ft · ${g.usable ? "usable" : "too steep"}`;
    };

    const tallWalls =
      data.retainingWallsOver6Ft.length === 0
        ? "none"
        : data.retainingWallsOver6Ft
            .map((w) => `${w.id} ${w.heightFt.toFixed(1)} ft`)
            .join(", ");

    root.innerHTML =
      `<div class="pr-title">Property Report</div>` +
      row("Anchor", `(${data.anchorX.toFixed(1)}, ${data.anchorZ.toFixed(1)}) m`) +
      row("Rotation", `${data.rotationDeg.toFixed(1)}°`) +
      row("Finished floor", ft(data.finishedFloorFeet)) +
      row(
        "Terrain under house",
        `${ft(data.houseTerrainMinFt)} – ${ft(data.houseTerrainMaxFt)}`
      ) +
      row(
        "House cut / fill (max)",
        `${ft(data.houseMaxCutFt)} cut · ${ft(data.houseMaxFillFt)} fill`
      ) +
      row("Pool terrace target", ft(data.poolTerraceTargetFt)) +
      row(
        "Terrain under pool terrace",
        `${ft(data.poolTerraceTerrainMinFt)} – ${ft(data.poolTerraceTerrainMaxFt)}`
      ) +
      row(
        "Pool terrace cut / fill (max)",
        `${ft(data.poolTerraceMaxCutFt)} cut · ${ft(data.poolTerraceMaxFillFt)} fill`
      ) +
      row("Vertical drop house → pool", ft(data.totalDropHouseToPoolFt)) +
      row("Rear wall → pool edge", ft(data.rearWallToPoolEdgeFt)) +
      row("Walkout face → pool edge", ft(data.walkoutFaceToPoolEdgeFt)) +
      row("North grass", grass(data.northGrassUsable)) +
      row("South grass", grass(data.southGrassUsable)) +
      row("Retaining walls > 6 ft", tallWalls);

    console.info("[propertyReport]", data);
  }

  return { update };
}
