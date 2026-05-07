export interface SiteCenter {
  lat: number;
  lon: number;
}

export interface SiteConfig {
  name: string;
  address: string;
  center: SiteCenter;
  /** Half-extent of the terrain in meters (so terrain spans 2*radius). */
  defaultRadiusMeters: number;
  terrain: {
    verticalExaggeration: number;
    contourIntervalFeet: number;
    /** Synthetic terrain controls — used when real DEM tiles fail to load. */
    synthetic: {
      widthMeters: number;
      depthMeters: number;
      rows: number;
      cols: number;
      baseElevationMeters: number;
      slopeDirectionDegrees: number;
      slopePercent: number;
      ridgeAmplitudeMeters: number;
      noiseAmplitudeMeters: number;
    };
  };
}

export const siteConfig: SiteConfig = {
  name: "17 Crow Hill Ln Parcel Study",
  address: "17 Crow Hill Ln, Rhinebeck, NY",
  center: {
    lat: 41.9379108,
    lon: -73.8851494
  },
  defaultRadiusMeters: 200,
  terrain: {
    verticalExaggeration: 1.5,
    contourIntervalFeet: 2,
    synthetic: {
      widthMeters: 400,
      depthMeters: 400,
      rows: 161,
      cols: 161,
      baseElevationMeters: 145,
      slopeDirectionDegrees: 290,
      slopePercent: 14,
      ridgeAmplitudeMeters: 4.5,
      noiseAmplitudeMeters: 1.6
    }
  }
};
