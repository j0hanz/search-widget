import type { ImmutableObject } from "jimu-core";
import {
  CoordinateProjectionPreference,
  SearchSourceType,
  StyleVariant,
} from "./enums";
import type {
  LocatorSearchSourceConfig,
  ProjectionIndex,
  Sweref99Bounds,
  Sweref99Projection,
  Sweref99TmProjection,
  Sweref99ZoneProjection,
  ZoneIndex,
  ZoneSpec,
} from "./types";

export const DEFAULT_PLACEHOLDER = "Find address or place";
export const DEFAULT_MAX_SUGGESTIONS = 6;
export const DEFAULT_ZOOM_SCALE = 10000;
export const SEARCH_DEBOUNCE_MS = 300;
export const MIN_SEARCH_LENGTH = 3;

export const ESRI_SEARCH_MODULES = [
  "esri/widgets/Search",
  "esri/widgets/Search/SearchViewModel",
  "esri/widgets/Search/LocatorSearchSource",
  "esri/widgets/Search/LayerSearchSource",
  "esri/core/reactiveUtils",
  "esri/core/promiseUtils",
  "esri/Graphic",
  "esri/layers/GraphicsLayer",
  "esri/layers/FeatureLayer",
  "esri/symbols/SimpleMarkerSymbol",
  "esri/symbols/PictureMarkerSymbol",
  "esri/rest/locator",
  "esri/geometry/Point",
  "esri/geometry/SpatialReference",
  "esri/geometry/projection",
] as const;

export const DEFAULT_LOCATOR_NAME = "ArcGIS World Geocoding Service";

export const DEFAULT_LOCATOR_SOURCE: LocatorSearchSourceConfig = {
  id: "default-locator",
  type: SearchSourceType.Locator,
  name: DEFAULT_LOCATOR_NAME,
  placeholder: DEFAULT_PLACEHOLDER,
  url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",
  maxSuggestions: DEFAULT_MAX_SUGGESTIONS,
};

export const DEFAULT_COORDINATE_ZOOM_SCALE = 10_000;
export const DEFAULT_COORDINATE_PREFERENCE =
  CoordinateProjectionPreference.Auto;
export const DEFAULT_STYLE_VARIANT = StyleVariant.Default;
export const COORDINATE_INPUT_MAX_LENGTH = 200;
export const COORDINATE_WARNING_BUFFER_METERS = 5_000;

export const NUMBER_CAPTURE_REGEX = /[-+]?\d[\d\s.,]*/g;
export const LABELED_VALUE_REGEX = /([ENen])\s*[:=]?\s*([-+]?\d[\d\s.,]*)/g;
export const WHITESPACE_REGEX = /\s+/g;
export const HTML_TAG_REGEX = /<[^>]*>/g;
export const PRECISION_LIMITER = 1e-3;

if (PRECISION_LIMITER <= 0 || !Number.isFinite(PRECISION_LIMITER)) {
  throw new Error("PRECISION_LIMITER must be a positive finite number");
}

export const MIN_EASTING = 30_000;
export const MAX_EASTING = 800_000;
export const MIN_NORTHING = 5_900_000;
export const MAX_NORTHING = 7_800_000;

export const TM_EASTING_MIN = 300_000;
export const TM_EASTING_MAX = 700_000;
export const ZONE_EASTING_MIN = 50_000;
export const ZONE_EASTING_MAX = 250_000;

export const GLOBAL_EASTING_MIN = 30_000;
export const GLOBAL_EASTING_MAX = 800_000;
export const GLOBAL_NORTHING_MIN = 5_900_000;
export const GLOBAL_NORTHING_MAX = 7_800_000;

export const PROJECTION_LOAD_TIMEOUT_MS = 5_000;

const ZONE_SPECS: ZoneSpec[] = [
  { zoneId: "12 00", name: "SWEREF 99 12 00", epsg: 3007, centralMeridian: 12 },
  {
    zoneId: "13 30",
    name: "SWEREF 99 13 30",
    epsg: 3008,
    centralMeridian: 13.5,
  },
  { zoneId: "15 00", name: "SWEREF 99 15 00", epsg: 3009, centralMeridian: 15 },
  {
    zoneId: "16 30",
    name: "SWEREF 99 16 30",
    epsg: 3010,
    centralMeridian: 16.5,
  },
  { zoneId: "18 00", name: "SWEREF 99 18 00", epsg: 3011, centralMeridian: 18 },
  {
    zoneId: "14 15",
    name: "SWEREF 99 14 15",
    epsg: 3012,
    centralMeridian: 14.25,
  },
  {
    zoneId: "15 45",
    name: "SWEREF 99 15 45",
    epsg: 3013,
    centralMeridian: 15.75,
  },
  {
    zoneId: "17 15",
    name: "SWEREF 99 17 15",
    epsg: 3014,
    centralMeridian: 17.25,
  },
  {
    zoneId: "18 45",
    name: "SWEREF 99 18 45",
    epsg: 3015,
    centralMeridian: 18.75,
  },
  {
    zoneId: "20 15",
    name: "SWEREF 99 20 15",
    epsg: 3016,
    centralMeridian: 20.25,
  },
  {
    zoneId: "21 45",
    name: "SWEREF 99 21 45",
    epsg: 3017,
    centralMeridian: 21.75,
  },
  {
    zoneId: "23 15",
    name: "SWEREF 99 23 15",
    epsg: 3018,
    centralMeridian: 23.25,
  },
];

const ZONE_BOUNDS: Sweref99Bounds = {
  eMin: 50_000,
  eMax: 250_000,
  nMin: 6_100_000,
  nMax: 7_700_000,
};

const buildZoneProjection = (spec: ZoneSpec): Sweref99ZoneProjection => ({
  id: `sweref99-${spec.zoneId.replace(/\s+/g, "").toLowerCase()}`,
  epsg: spec.epsg,
  code: `EPSG:${spec.epsg}`,
  name: spec.name,
  shortName: spec.name,
  type: "zone",
  zoneId: spec.zoneId,
  centralMeridian: spec.centralMeridian,
  scaleFactor: 1,
  falseEasting: 150_000,
  falseNorthing: 0,
  bounds: ZONE_BOUNDS,
});

export const SWEREF99_TM: Sweref99TmProjection = {
  id: "sweref99-tm",
  epsg: 3006,
  code: "EPSG:3006",
  name: "SWEREF 99 TM",
  shortName: "SWEREF 99 TM",
  type: "tm",
  centralMeridian: 15,
  scaleFactor: 0.9996,
  falseEasting: 500_000,
  falseNorthing: 0,
  bounds: {
    eMin: 300_000,
    eMax: 700_000,
    nMin: 6_100_000,
    nMax: 7_700_000,
  },
};

export const SWEREF99_ZONES: Sweref99ZoneProjection[] =
  ZONE_SPECS.map(buildZoneProjection);

export const SWEREF99_PROJECTIONS: Sweref99Projection[] = [
  SWEREF99_TM,
  ...SWEREF99_ZONES,
];

const projectionIndex: ProjectionIndex = {};
for (const projection of SWEREF99_PROJECTIONS) {
  projectionIndex[projection.epsg] = projection;
}

const zoneIndex: ZoneIndex = {};
for (const zone of SWEREF99_ZONES) {
  const rounded = Math.round(zone.centralMeridian * 100) / 100;
  zoneIndex[rounded] = zone;
}

export const EPSG_TO_PROJECTION = Object.freeze(
  projectionIndex
) as ImmutableObject<{ readonly [epsg: number]: Sweref99Projection }>;

export const CM_TO_ZONE = Object.freeze(zoneIndex) as ImmutableObject<{
  readonly [meridian: number]: Sweref99ZoneProjection;
}>;
