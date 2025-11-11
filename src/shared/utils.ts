import { loadArcGISJSAPIModules } from "jimu-arcgis";
import {
  COORDINATE_INPUT_MAX_LENGTH,
  COORDINATE_WARNING_BUFFER_METERS,
  DEFAULT_COORDINATE_PREFERENCE,
  ESRI_SEARCH_MODULES,
  GLOBAL_EASTING_MAX,
  GLOBAL_EASTING_MIN,
  GLOBAL_NORTHING_MAX,
  GLOBAL_NORTHING_MIN,
  HTML_TAG_REGEX,
  LABELED_VALUE_REGEX,
  MAX_EASTING,
  MAX_NORTHING,
  MIN_EASTING,
  MIN_NORTHING,
  MIN_SEARCH_LENGTH,
  NUMBER_CAPTURE_REGEX,
  PRECISION_LIMITER,
  PROJECTION_LOAD_TIMEOUT_MS,
  SEARCH_DEBOUNCE_MS,
  SWEREF99_TM,
  SWEREF99_ZONES,
  TM_EASTING_MAX,
  TM_EASTING_MIN,
  WHITESPACE_REGEX,
  ZONE_EASTING_MAX,
  ZONE_EASTING_MIN,
} from "../config/constants";
import {
  CoordinateInputFormat,
  CoordinateProjectionPreference,
  SearchSourceType,
} from "../config/enums";
import type {
  AttributesMap,
  CoordinateParseResult,
  CoordinateValidationResult,
  DetectProjectionParams,
  EsriSearchModules,
  ExtentJSON,
  LayerSearchSourceConfig,
  LocatorSearchSourceConfig,
  PointJSON,
  ProjectionDetectionResult,
  SearchResult,
  SearchResultSummary,
  SearchSourceConfig,
  SearchSourceValidation,
  Sweref99Projection,
  Sweref99ZoneProjection,
  TransformParams,
  ValidateCoordinatesParams,
} from "../config/types";

interface MutableLike<T> {
  asMutable?: (options?: { deep?: boolean }) => T;
}

export const toMutableValue = <T>(
  value: T | MutableLike<T> | null | undefined
): T | null => {
  if (value == null) {
    return null;
  }
  const candidate = value as MutableLike<T>;
  if (typeof candidate.asMutable === "function") {
    return candidate.asMutable({ deep: true });
  }
  return value as T;
};

export const sanitizeText = (value: string): string =>
  value
    ?.toString?.()
    .replace(/[\r\n]+/g, " ")
    .trim() ?? "";

export const sanitizeNonEmptyText = (
  value: string,
  fallback: string
): string => {
  const sanitized = sanitizeText(value);
  return sanitized || fallback;
};

export const toPlainString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

export const parseArrayField = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeText).filter(Boolean);
};

export const sanitizeUrlInput = (value: string): string => {
  const trimmed = sanitizeText(value);
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.toString();
  } catch {
    return "";
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toNumber = (value: number | string): number =>
  typeof value === "number" ? value : parseFloat(value);

export const parsePositiveInt = (
  value: number | string,
  fallback: number
): number => {
  const num = typeof value === "number" ? value : parseInt(value, 10);
  return isFiniteNumber(num) && num > 0 ? Math.round(num) : fallback;
};

export const parsePositiveNumber = (
  value: number | string,
  fallback: number
): number => {
  const num = toNumber(value);
  return isFiniteNumber(num) && num > 0 ? num : fallback;
};

const toPointGeometry = (
  geometry?: __esri.Geometry | null
): __esri.Point | null =>
  geometry?.type === "point" ? (geometry as __esri.Point) : null;

export const loadArcgisSearchModules = async (): Promise<EsriSearchModules> => {
  const [
    Search,
    SearchViewModel,
    LocatorSearchSource,
    LayerSearchSource,
    reactiveUtils,
    promiseUtils,
    Graphic,
    GraphicsLayer,
    FeatureLayer,
    SimpleMarkerSymbol,
    PictureMarkerSymbol,
    locator,
    Point,
    SpatialReference,
    projection,
  ] = (await loadArcGISJSAPIModules(ESRI_SEARCH_MODULES.slice())) as [
    EsriSearchModules["Search"],
    EsriSearchModules["SearchViewModel"],
    EsriSearchModules["LocatorSearchSource"],
    EsriSearchModules["LayerSearchSource"],
    EsriSearchModules["reactiveUtils"],
    EsriSearchModules["promiseUtils"],
    EsriSearchModules["Graphic"],
    EsriSearchModules["GraphicsLayer"],
    EsriSearchModules["FeatureLayer"],
    EsriSearchModules["SimpleMarkerSymbol"],
    EsriSearchModules["PictureMarkerSymbol"],
    EsriSearchModules["locator"],
    EsriSearchModules["Point"],
    EsriSearchModules["SpatialReference"],
    EsriSearchModules["projection"],
  ];

  const modules: EsriSearchModules = {
    Search,
    SearchViewModel,
    LocatorSearchSource,
    LayerSearchSource,
    FeatureLayer,
    reactiveUtils,
    promiseUtils,
    Graphic,
    GraphicsLayer,
    SimpleMarkerSymbol,
    PictureMarkerSymbol,
    locator,
    Point,
    SpatialReference,
    projection,
  };

  return modules;
};

export const sanitizeSearchTerm = (value: string): string => {
  if (!value) return "";
  const filtered = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
  const trimmed = filtered.replace(/\s+/g, " ").replace(/[<>]/g, "").trim();
  return trimmed.slice(0, 256);
};

export const isSuggestableTerm = (term: string): boolean =>
  sanitizeSearchTerm(term).length >= MIN_SEARCH_LENGTH;

export const getSuggestionDebounce = () => SEARCH_DEBOUNCE_MS;

const toExtentGeometry = (
  geometry?: __esri.Geometry | null
): __esri.Extent | null =>
  geometry?.type === "extent" ? (geometry as __esri.Extent) : null;

export const formatSearchResult = (
  result: __esri.SearchResult,
  sourceIndex: number
): SearchResult => {
  const resultWithOptional = result as __esri.SearchResult & {
    location?: __esri.Geometry | null;
    extent?: __esri.Geometry | null;
    graphic?: __esri.Graphic | null;
  };
  const graphic = resultWithOptional.graphic ?? result.feature ?? null;
  const location =
    toPointGeometry(resultWithOptional.location ?? null) ??
    toPointGeometry(graphic?.geometry ?? null);
  const extent =
    toExtentGeometry(resultWithOptional.extent ?? null) ??
    toExtentGeometry(graphic?.geometry?.extent ?? null) ??
    null;
  const attributes =
    graphic?.attributes && typeof graphic.attributes === "object"
      ? { ...(graphic.attributes as AttributesMap) }
      : undefined;
  const fallbackAddressValue = attributes?.Match_addr;
  const fallbackAddress =
    typeof fallbackAddressValue === "string" ? fallbackAddressValue : "";
  const name = result?.name ?? "";
  const displayText = name || fallbackAddress;

  return {
    sourceIndex,
    name,
    text: displayText,
    feature: graphic,
    extent,
    location,
    attributes,
  };
};

const toPointJson = (point: __esri.Point | null): PointJSON | null => {
  if (!point || typeof point.toJSON !== "function") return null;
  return point.toJSON() as PointJSON;
};

const toExtentJson = (extent: __esri.Extent | null): ExtentJSON | null => {
  if (!extent || typeof extent.toJSON !== "function") return null;
  return extent.toJSON() as ExtentJSON;
};

export const summarizeSearchResult = (
  result: SearchResult
): SearchResultSummary => ({
  sourceIndex: result.sourceIndex,
  name: result.name,
  text: result.text,
  location: toPointJson(result.location),
  extent: toExtentJson(result.extent),
  attributes: result.attributes ? { ...result.attributes } : undefined,
});

export const createLocatorSource = (
  modules: EsriSearchModules,
  source: LocatorSearchSourceConfig
): __esri.LocatorSearchSource => {
  const { LocatorSearchSource } = modules;
  const config: Partial<__esri.LocatorSearchSourceProperties> = {
    name: source.name,
    placeholder: source.placeholder,
    url: source.url,
    apiKey: source.apiKey,
    maxResults: source.maxSuggestions,
    maxSuggestions: source.maxSuggestions,
    suggestionsEnabled: true,
    minSuggestCharacters: MIN_SEARCH_LENGTH,
  };

  if (Array.isArray(source.categories) && source.categories.length) {
    config.categories = source.categories;
  }
  if (source.countryCode) {
    config.countryCode = source.countryCode;
  }
  if (source.locationType) {
    const normalized = source.locationType.toLowerCase();
    if (normalized === "street" || normalized === "rooftop") {
      config.locationType = normalized;
    }
  }
  if (typeof source.withinViewEnabled === "boolean") {
    config.withinViewEnabled = source.withinViewEnabled;
  }
  if (Array.isArray(source.outFields) && source.outFields.length) {
    config.outFields = source.outFields;
  }

  return new LocatorSearchSource(
    config as __esri.LocatorSearchSourceProperties
  );
};

export const createLayerSource = (
  modules: EsriSearchModules,
  layer: __esri.FeatureLayer,
  source: LayerSearchSourceConfig
): __esri.LayerSearchSource => {
  const { LayerSearchSource, SimpleMarkerSymbol } = modules;
  const config: Partial<__esri.LayerSearchSourceProperties> = {
    layer,
    name: source.name,
    placeholder: source.placeholder,
    displayField: source.displayField ?? layer.displayField ?? undefined,
    outFields: ["*"],
    searchFields: source.searchFields?.length ? source.searchFields : undefined,
    exactMatch: Boolean(source.exactMatch),
    maxResults: source.maxSuggestions,
    maxSuggestions: source.maxSuggestions,
    suggestionsEnabled: true,
    minSuggestCharacters: source.minSuggestCharacters ?? MIN_SEARCH_LENGTH,
  };

  if (source.resultSymbol) {
    try {
      config.resultSymbol = new SimpleMarkerSymbol(source.resultSymbol);
    } catch (error) {
      console.log("Search widget: failed to apply custom result symbol", error);
    }
  }

  return new LayerSearchSource(config as __esri.LayerSearchSourceProperties);
};

const HTTPS_REGEX = /^https:\/\//i;

const validateSourceConfig = (source: SearchSourceConfig, errors: string[]) => {
  if (!source?.name) errors.push("missingName");
  if (!source?.placeholder) errors.push("missingPlaceholder");
  if (!source.url) errors.push("missingUrl");
  else if (!HTTPS_REGEX.test(source.url)) errors.push("invalidUrl");
};

export const validateSearchSource = (
  source: SearchSourceConfig
): SearchSourceValidation => {
  const errors: string[] = [];

  if (isLocatorSource(source)) {
    validateSourceConfig(source, errors);
  } else if (isLayerSource(source)) {
    validateSourceConfig(source, errors);
    if (!source.layerId) errors.push("missingLayerId");
    if (!source.searchFields?.length) errors.push("missingSearchFields");
  }

  return { valid: errors.length === 0, errors };
};

export const isLocatorSource = (
  source?: SearchSourceConfig
): source is LocatorSearchSourceConfig =>
  source?.type === SearchSourceType.Locator;

export const isLayerSource = (
  source?: SearchSourceConfig
): source is LayerSearchSourceConfig => source?.type === SearchSourceType.Layer;

const sanitizeCoordinateInputInternal = (value: string): string => {
  let cleaned = value.replace(HTML_TAG_REGEX, "");
  cleaned = Array.from(cleaned)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code <= 126) || (code >= 160 && code <= 255);
    })
    .join("");
  return cleaned.replace(WHITESPACE_REGEX, " ").trim();
};

const normalizeNumericString = (raw: string): string => {
  const withSpaces = raw.replace(/[\u00A0]/g, " ");
  let cleaned = withSpaces.replace(/[^0-9\s,.-]/g, "");

  if (
    !cleaned ||
    /[,.-]{2,}/.test(cleaned) ||
    /^[,.]+|[,.-]+$/.test(cleaned.replace(/^-/, ""))
  ) {
    return "";
  }

  let sign = "";
  if (cleaned.startsWith("-")) {
    sign = "-";
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  cleaned = cleaned.replace(/[+-]/g, "");

  const buildDecimal = (intPart: string, decPart: string) => {
    const sanitizedInt = intPart.replace(/[,.-]/g, "");
    const sanitizedDec = decPart.replace(/[,.-]/g, "");
    if (!sanitizedInt && !sanitizedDec) return "";
    return sanitizedDec ? `${sanitizedInt}.${sanitizedDec}` : sanitizedInt;
  };

  const spaceGroups = cleaned.split(/\s+/).filter(Boolean);
  const hasThousandSpaces =
    spaceGroups.length > 1 &&
    spaceGroups[0].length <= 3 &&
    spaceGroups.slice(1).every((g) => g.length === 3);

  if (hasThousandSpaces) {
    cleaned = cleaned.replace(/\s+/g, "");
  }

  const dotCount = (cleaned.match(/\./g) ?? []).length;
  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const totalSeparators = dotCount + commaCount;

  if (totalSeparators === 0) return sign + cleaned;
  if (totalSeparators > 2) return "";

  // Single separator - decimal point
  if (totalSeparators === 1) {
    const parts = cleaned.split(/[,.]/);
    return sign + buildDecimal(parts[0], parts[1]);
  }

  // Multiple separators - detect thousands vs decimal
  if (dotCount > 1) return sign + cleaned.replace(/\./g, "");
  if (commaCount > 1) return sign + cleaned.replace(/,/g, "");

  // Mixed - last one is decimal
  const lastCommaIdx = cleaned.lastIndexOf(",");
  const lastDotIdx = cleaned.lastIndexOf(".");
  const decimalIdx = Math.max(lastCommaIdx, lastDotIdx);
  const before = cleaned.slice(0, decimalIdx).replace(/[,.]/g, "");
  const after = cleaned.slice(decimalIdx + 1);
  return sign + buildDecimal(before, after);
};

const parseNumeric = (raw: string): number | null => {
  // Prevent overflow in Number.parseFloat (IEEE 754 limit ~15-17 significant digits)
  const rawDigitCount = raw.replace(/[^0-9]/g, "").length;
  if (rawDigitCount > 18) return null;

  const normalized = normalizeNumericString(raw);
  if (!normalized) return null;

  const digitCount = normalized.replace(/[^0-9]/g, "").length;
  if (digitCount > 15) return null;

  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value) || !Number.isFinite(value)) return null;

  if (Math.abs(value) > 1e8) return null;

  return Math.abs(value) < PRECISION_LIMITER ? 0 : value;
};

const extractNumbers = (input: string): string[] =>
  input.match(NUMBER_CAPTURE_REGEX) ?? [];

const parseLabeled = (
  input: string
): { easting: number | null; northing: number | null } => {
  let easting: number | null = null;
  let northing: number | null = null;

  for (const match of input.matchAll(LABELED_VALUE_REGEX)) {
    const label = match[1].toUpperCase();
    const value = parseNumeric(match[2]);
    if (value === null) continue;
    if (label === "E") easting = value;
    else if (label === "N") northing = value;
  }

  return { easting, northing };
};

const isLikelyWgs84 = (first: number, second: number): boolean => {
  const absFirst = Math.abs(first);
  const absSecond = Math.abs(second);
  return (
    (absFirst <= 90 && absSecond <= 180) || (absFirst <= 90 && absSecond <= 90)
  );
};

const detectAxisOrder = (
  first: number,
  second: number
): { easting: number; northing: number; warning?: string } | null => {
  if (isLikelyWgs84(first, second)) return null;

  const firstIsEasting = first >= MIN_EASTING && first <= MAX_EASTING;
  const firstIsNorthing = first >= MIN_NORTHING && first <= MAX_NORTHING;
  const secondIsEasting = second >= MIN_EASTING && second <= MAX_EASTING;
  const secondIsNorthing = second >= MIN_NORTHING && second <= MAX_NORTHING;

  // Unambiguous: exactly one interpretation
  if (
    firstIsEasting &&
    !firstIsNorthing &&
    secondIsNorthing &&
    !secondIsEasting
  )
    return { easting: first, northing: second };
  if (
    firstIsNorthing &&
    !firstIsEasting &&
    secondIsEasting &&
    !secondIsNorthing
  )
    return { easting: second, northing: first };

  // One clearly in range, other out
  if (firstIsEasting && !secondIsEasting && !secondIsNorthing)
    return { easting: first, northing: second };
  if (secondIsEasting && !firstIsEasting && !firstIsNorthing)
    return { easting: second, northing: first };

  // Ambiguous: prefer easting-first with warning
  if (firstIsEasting && secondIsNorthing) {
    return {
      easting: first,
      northing: second,
      warning: secondIsEasting ? "coordinateWarningAmbiguousOrder" : undefined,
    };
  }

  // Ambiguous: northing-first only if first is not also easting
  if (firstIsNorthing && secondIsEasting) {
    return {
      easting: second,
      northing: first,
      warning: firstIsEasting ? "coordinateWarningAmbiguousOrder" : undefined,
    };
  }

  return null;
};

const detectInputFormat = (value: string): CoordinateInputFormat => {
  if (/[ENen]\s*[:=]/.test(value)) {
    return CoordinateInputFormat.Labeled;
  }
  if (/\d\s*,\s*\d/.test(value)) {
    return CoordinateInputFormat.CommaSeparated;
  }
  if (/\d\s+\d/.test(value)) {
    return CoordinateInputFormat.SpaceSeparated;
  }
  return CoordinateInputFormat.Unknown;
};

const buildCoordinateResult = (
  easting: number,
  northing: number,
  format: CoordinateInputFormat,
  sanitized?: string,
  warning?: string
): CoordinateParseResult => {
  if (isLikelyWgs84(easting, northing))
    return { success: false, error: "coordinateErrorNotSweref" };
  if (!isCoordinateInRange({ easting, northing }))
    return { success: false, error: "coordinateErrorOutOfRange" };
  return { success: true, easting, northing, format, sanitized, warning };
};

export const parseCoordinateString = (input: string): CoordinateParseResult => {
  if (!input) return { success: false, error: "coordinateErrorEmpty" };

  const sanitized = sanitizeCoordinateInputInternal(input);
  if (!sanitized) return { success: false, error: "coordinateErrorEmpty" };
  if (sanitized.length > COORDINATE_INPUT_MAX_LENGTH)
    return { success: false, error: "coordinateErrorTooLong" };

  const format = detectInputFormat(sanitized);

  if (format === CoordinateInputFormat.Labeled) {
    const labeledResult = parseLabeled(sanitized);
    if (labeledResult.easting !== null && labeledResult.northing !== null) {
      return buildCoordinateResult(
        labeledResult.easting,
        labeledResult.northing,
        CoordinateInputFormat.Labeled,
        sanitized
      );
    }
  }

  let numbers = extractNumbers(sanitized);

  if (numbers.length < 2) {
    const fallbackTokens = sanitized
      .split(/\s+/)
      .map((token) => token.replace(/^[,;]+|[,;]+$/g, ""))
      .filter((token) => token.length > 0);
    if (fallbackTokens.length >= 2) numbers = fallbackTokens.slice(0, 2);
  }

  if (numbers.length < 2)
    return { success: false, error: "coordinateErrorParse" };

  const candidates = numbers.slice(0, 2).map(parseNumeric);
  const firstCandidate = candidates[0];
  const secondCandidate = candidates[1];

  if (firstCandidate === null || secondCandidate === null)
    return { success: false, error: "coordinateErrorParse" };

  const axisOrder = detectAxisOrder(firstCandidate, secondCandidate);
  if (!axisOrder) return { success: false, error: "coordinateErrorParse" };

  const { easting, northing, warning } = axisOrder;

  return buildCoordinateResult(
    easting,
    northing,
    format === CoordinateInputFormat.Unknown
      ? sanitized.includes(",")
        ? CoordinateInputFormat.CommaSeparated
        : CoordinateInputFormat.SpaceSeparated
      : format,
    sanitized,
    warning
  );
};

export const normalizeCoordinates = (
  easting: number,
  northing: number
): CoordinateParseResult => {
  if (isLikelyWgs84(easting, northing))
    return { success: false, error: "coordinateErrorNotSweref" };
  if (!isCoordinateInRange({ easting, northing }))
    return { success: false, error: "coordinateErrorOutOfRange" };
  return {
    success: true,
    easting,
    northing,
    format: CoordinateInputFormat.Unknown,
  };
};

export const sanitizeCoordinateInput = (value: string): string =>
  sanitizeCoordinateInputInternal(value).slice(0, COORDINATE_INPUT_MAX_LENGTH);

export const isLikelyWgs84Coordinate = (
  first: number,
  second: number
): boolean => isLikelyWgs84(first, second);

export const isValidSpatialReference = (
  sr: __esri.SpatialReferenceProperties | null | undefined
): boolean => {
  if (!sr || typeof sr !== "object") return false;
  
  if (typeof sr.wkid === "number" && isFiniteNumber(sr.wkid) && sr.wkid > 0) {
    return true;
  }
  
  return typeof sr.wkt === "string" && sr.wkt.trim().length > 0;
};

export const isValidPointGeometry = (
  point: { x?: unknown; y?: unknown } | null | undefined
): boolean => {
  if (!point || typeof point !== "object") return false;
  return (
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
};

export const isValidPointData = (
  data: PointJSON | null | undefined
): boolean => {
  if (!data) return false;
  if (!isValidPointGeometry(data)) return false;
  if (!data.spatialReference || typeof data.spatialReference !== "object") return false;
  return isValidSpatialReference(data.spatialReference);
};

export interface CoordinateDetectionResult {
  isCoordinate: boolean;
  confidence: "high" | "medium" | "low";
  reason:
    | "input_too_short"
    | "not_two_numbers"
    | "invalid_numbers"
    | "address_pattern_detected"
    | "unsupported_characters"
    | "sweref99_range"
    | "wgs84_range"
    | "out_of_range";
}

const ADDRESS_PATTERNS = [
  /\b(gata|gatan|väg|vägen|plan|torg|torget|allé|allén)\b/i,
  /\b\d{3}\s?\d{2}\b/,
  /\b(stockholm|göteborg|malmö|uppsala|linköping)\b/i,
];

const hasUnsupportedLetters = (value: string): boolean => {
  const alphaMatches = value.match(/[A-Za-z]+/g);
  if (!alphaMatches) return false;
  return alphaMatches.some((segment) => !/^[ENen]+$/.test(segment));
};

export const isLikelyCoordinateInput = (
  input: string
): CoordinateDetectionResult => {
  const sanitized = sanitizeCoordinateInput(input);
  if (!sanitized || sanitized.length < 5) {
    return {
      isCoordinate: false,
      confidence: "high",
      reason: "input_too_short",
    };
  }

  if (hasUnsupportedLetters(sanitized)) {
    return {
      isCoordinate: false,
      confidence: "high",
      reason: "unsupported_characters",
    };
  }

  const numbers = extractNumbers(sanitized);
  if (numbers.length !== 2) {
    return {
      isCoordinate: false,
      confidence: numbers.length > 2 ? "medium" : "high",
      reason: "not_two_numbers",
    };
  }

  const parsedNumbers = numbers.map(parseNumeric);
  if (parsedNumbers.some((value) => value === null)) {
    return {
      isCoordinate: false,
      confidence: "high",
      reason: "invalid_numbers",
    };
  }

  if (ADDRESS_PATTERNS.some((pattern) => pattern.test(sanitized))) {
    return {
      isCoordinate: false,
      confidence: "high",
      reason: "address_pattern_detected",
    };
  }

  const [first, second] = parsedNumbers as [number, number];

  const axisOrder = detectAxisOrder(first, second);
  if (axisOrder) {
    return {
      isCoordinate: true,
      confidence: axisOrder.warning ? "medium" : "high",
      reason: "sweref99_range",
    };
  }

  if (isLikelyWgs84(first, second)) {
    return {
      isCoordinate: true,
      confidence: "medium",
      reason: "wgs84_range",
    };
  }

  return {
    isCoordinate: false,
    confidence: "high",
    reason: "out_of_range",
  };
};

export const detectPreferredProjection = (
  preference: CoordinateProjectionPreference
): CoordinateProjectionPreference =>
  preference ??
  DEFAULT_COORDINATE_PREFERENCE ??
  CoordinateProjectionPreference.Auto;

const isInRange = (value: number, min: number, max: number): boolean =>
  value >= min && value <= max;

const isWithinBounds = (
  value: number,
  bounds: { eMin: number; eMax: number; nMin: number; nMax: number },
  axis: "e" | "n"
): boolean => {
  const { eMin, eMax, nMin, nMax } = bounds;
  return axis === "e"
    ? isInRange(value, eMin, eMax)
    : isInRange(value, nMin, nMax);
};

const isCoordinateInRange = (coord: { easting: number; northing: number }): boolean =>
  isInRange(coord.easting, MIN_EASTING, MAX_EASTING) &&
  isInRange(coord.northing, MIN_NORTHING, MAX_NORTHING);

const findMatchingZones = (
  easting: number,
  northing: number
): Sweref99ZoneProjection[] =>
  SWEREF99_ZONES.filter(
    (zone) =>
      isWithinBounds(easting, zone.bounds, "e") &&
      isWithinBounds(northing, zone.bounds, "n")
  );

const getLonFromPoint = (point?: __esri.Point | null): number | null => {
  if (!point) return null;

  let lon: number | null = null;
  if (typeof point.longitude === "number") {
    lon = point.longitude;
  } else if (
    typeof point.x === "number" &&
    point.spatialReference?.wkid === 4326
  ) {
    lon = point.x;
  }

  if (lon !== null && (lon < -180 || lon > 180)) {
    return null;
  }

  return lon;
};

export const getNearestZoneByCentralMeridian = (
  longitude: number
): Sweref99ZoneProjection => {
  let nearest = SWEREF99_ZONES[0];
  let minDiff = Number.POSITIVE_INFINITY;
  for (const zone of SWEREF99_ZONES) {
    const diff = Math.abs(zone.centralMeridian - longitude);
    if (diff < minDiff) {
      nearest = zone;
      minDiff = diff;
    }
  }
  return nearest;
};

const rankZoneCandidates = (
  candidates: Sweref99ZoneProjection[],
  longitude: number | null
): Sweref99ZoneProjection[] => {
  if (candidates.length === 0 || !longitude) return candidates;
  const targetZone = getNearestZoneByCentralMeridian(longitude);
  return [...candidates].sort((a, b) => {
    if (a === targetZone) return -1;
    if (b === targetZone) return 1;
    return (
      Math.abs(a.centralMeridian - longitude) -
      Math.abs(b.centralMeridian - longitude)
    );
  });
};

const buildDetectionResult = (
  projection: Sweref99Projection | null,
  confidence: number,
  alternatives: Sweref99Projection[],
  easting: number
): ProjectionDetectionResult => {
  const warnings: string[] = [];
  if (projection) {
    const { bounds } = projection;
    const buffer = COORDINATE_WARNING_BUFFER_METERS;
    if (
      Math.abs(easting - bounds.eMin) <= buffer ||
      Math.abs(bounds.eMax - easting) <= buffer
    ) {
      warnings.push("coordinateWarningNearBoundary");
    }
  }
  return { projection, confidence, alternatives, warnings };
};

export const detectProjection = (
  params: DetectProjectionParams
): ProjectionDetectionResult => {
  const {
    easting,
    northing,
    preference = DEFAULT_COORDINATE_PREFERENCE,
  } = params;
  const mapLon = getLonFromPoint(params.mapCenter);

  const tmLikely = easting >= TM_EASTING_MIN && easting <= TM_EASTING_MAX;
  const zoneLikely = easting >= ZONE_EASTING_MIN && easting <= ZONE_EASTING_MAX;
  const zoneCandidates = zoneLikely ? findMatchingZones(easting, northing) : [];

  // Preference: Zone with candidates
  if (
    preference === CoordinateProjectionPreference.Zone &&
    zoneCandidates.length
  ) {
    const ranked = rankZoneCandidates(zoneCandidates, mapLon);
    return buildDetectionResult(ranked[0], 1, ranked.slice(1), easting);
  }

  // Preference: TM
  if (preference === CoordinateProjectionPreference.Tm && tmLikely) {
    return buildDetectionResult(SWEREF99_TM, 0.9, zoneCandidates, easting);
  }

  // Single zone match
  if (zoneCandidates.length === 1)
    return buildDetectionResult(zoneCandidates[0], 1, [], easting);

  // Multiple zones
  if (zoneCandidates.length > 1) {
    const ranked = rankZoneCandidates(zoneCandidates, mapLon);
    return buildDetectionResult(
      ranked[0],
      mapLon === null ? 0.7 : 0.85,
      ranked.slice(1),
      easting
    );
  }

  // Fallback to TM
  if (tmLikely) return buildDetectionResult(SWEREF99_TM, 0.6, [], easting);

  // No projection found
  return {
    projection: null,
    confidence: 0,
    alternatives: [],
    warnings: ["coordinateErrorNoProjection"],
  };
};

export const isSweref99Range = (easting: number, northing: number): boolean =>
  isInRange(easting, GLOBAL_EASTING_MIN, GLOBAL_EASTING_MAX) &&
  isInRange(northing, GLOBAL_NORTHING_MIN, GLOBAL_NORTHING_MAX);

const withinProjectionBounds = (
  easting: number,
  northing: number,
  projection?: Sweref99Projection | null
): boolean => {
  if (!projection) return isSweref99Range(easting, northing);
  const { bounds } = projection;
  return (
    isInRange(easting, bounds.eMin, bounds.eMax) &&
    isInRange(northing, bounds.nMin, bounds.nMax)
  );
};

const checkBoundaryWarning = (
  easting: number,
  projection: Sweref99Projection
): string[] => {
  const { bounds } = projection;
  const buffer = COORDINATE_WARNING_BUFFER_METERS;
  const nearWest = Math.abs(easting - bounds.eMin) <= buffer;
  const nearEast = Math.abs(bounds.eMax - easting) <= buffer;
  
  return nearWest || nearEast ? ["coordinateWarningNearBoundary"] : [];
};

export const validateCoordinates = (
  params: ValidateCoordinatesParams
): CoordinateValidationResult => {
  const { easting, northing, projection } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isFiniteNumber(easting) || !isFiniteNumber(northing)) {
    return { valid: false, errors: ["coordinateErrorInvalidNumber"], warnings };
  }

  if (projection && !withinProjectionBounds(easting, northing, projection)) {
    errors.push("coordinateErrorOutOfBounds");
  } else if (!isSweref99Range(easting, northing)) {
    errors.push("coordinateErrorOutOfRange");
  }

  if (!errors.length && projection) {
    warnings.push(...checkBoundaryWarning(easting, projection));
  }

  return { valid: errors.length === 0, errors, warnings };
};

export const getValidationMessage = (
  errors: string[],
  translate: (id: string, values?: { [key: string]: unknown }) => string
): string => (errors.length ? translate(errors[0]) : "");

const projectionLoadCache = new WeakMap<__esri.projection, Promise<void>>();
const projectionLoadInProgress = new WeakMap<__esri.projection, boolean>();

const loadProjectionModule = async (
  projectionModule: __esri.projection
): Promise<void> => {
  if (!projectionModule) throw new Error("Projection module unavailable");
  const existingPromise = projectionLoadCache.get(projectionModule);
  if (existingPromise) {
    return existingPromise;
  }

  if (projectionLoadInProgress.get(projectionModule)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const retryPromise = projectionLoadCache.get(projectionModule);
    if (retryPromise) return retryPromise;
  }
  projectionLoadInProgress.set(projectionModule, true);

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const loadPromise = (async (): Promise<void> => {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("coordinateErrorProjectionTimeout"));
      }, PROJECTION_LOAD_TIMEOUT_MS);
    });

    try {
      await Promise.race([
        projectionModule.load().catch((error: unknown) => {
          throw error instanceof Error
            ? error
            : new Error(
                typeof error === "string" ? error : "Projection load failed"
              );
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      projectionLoadInProgress.delete(projectionModule);
      projectionLoadCache.delete(projectionModule);
      throw error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Projection load failed");
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      projectionLoadInProgress.delete(projectionModule);
    }
  })();

  projectionLoadCache.set(projectionModule, loadPromise);

  try {
    await loadPromise;
  } catch (error) {
    projectionLoadCache.delete(projectionModule);
    throw error instanceof Error
      ? error
      : new Error("coordinateErrorProjectionLoad");
  }
};

const isPointGeometry = (geometry: unknown): geometry is __esri.Point => {
  if (!geometry || typeof geometry !== "object") {
    return false;
  }
  const candidate = geometry as { x?: unknown; y?: unknown };
  return typeof candidate.x === "number" && typeof candidate.y === "number";
};

export const createSweref99Point = (params: TransformParams): __esri.Point => {
  const { modules, projection, easting, northing } = params;
  const { SpatialReference, Point } = modules;

  validateTransformParams(params);

  return new Point({
    x: easting,
    y: northing,
    spatialReference: new SpatialReference({ wkid: projection.epsg }),
  });
};

const validateTransformParams = (params: TransformParams): void => {
  if (!params.spatialReference) {
    throw new Error("coordinateErrorNoSpatialReference");
  }
  if (!params.projection?.epsg || !isFiniteNumber(params.projection.epsg) || params.projection.epsg <= 0) {
    throw new Error("coordinateErrorInvalidProjection");
  }
  if (!isFiniteNumber(params.easting) || !isFiniteNumber(params.northing)) {
    throw new Error("coordinateErrorInvalidCoordinates");
  }
};

const validateProjectedPoint = (point: __esri.Point): void => {
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    throw new Error("coordinateErrorTransform");
  }
};

export const transformSweref99ToMap = async (
  params: TransformParams
): Promise<__esri.Point | null> => {
  const { modules, spatialReference } = params;
  const { projection: projectionModule } = modules;

  validateTransformParams(params);

  const sourcePoint = createSweref99Point(params);
  if (sourcePoint.spatialReference?.wkid === spatialReference.wkid) {
    return sourcePoint;
  }

  try {
    await loadProjectionModule(projectionModule);
    const projectedGeometry = projectionModule.project(sourcePoint, spatialReference);
    
    if (!isPointGeometry(projectedGeometry)) {
      throw new Error("coordinateErrorTransform");
    }

    validateProjectedPoint(projectedGeometry);

    if (!projectedGeometry.spatialReference) {
      projectedGeometry.spatialReference = spatialReference;
    }
    
    return projectedGeometry;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(error != null ? String(error) : "coordinateErrorTransform");
  }
};
