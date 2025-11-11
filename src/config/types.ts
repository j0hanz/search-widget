import type {
  AllWidgetProps,
  ImmutableObject,
  IMState,
  SerializedStyles,
} from "jimu-core";
import type { JimuMapView } from "jimu-arcgis";
import type { AllWidgetSettingProps } from "jimu-for-builder";
import type { Action } from "redux";
import type {
  CoordinateInputFormat,
  CoordinateProjectionPreference,
  SearchActionType,
  SearchSourceType,
  StyleVariant,
} from "./enums";

export interface Sweref99Bounds {
  readonly eMin: number;
  readonly eMax: number;
  readonly nMin: number;
  readonly nMax: number;
}

export type Sweref99ProjectionType = "tm" | "zone";

export interface Sweref99ProjectionBase {
  readonly id: string;
  readonly epsg: number;
  readonly code: string;
  readonly name: string;
  readonly shortName: string;
  readonly type: Sweref99ProjectionType;
  readonly centralMeridian: number;
  readonly scaleFactor: number;
  readonly falseEasting: number;
  readonly falseNorthing: number;
  readonly bounds: Sweref99Bounds;
}

export interface Sweref99TmProjection extends Sweref99ProjectionBase {
  readonly type: "tm";
}

export interface Sweref99ZoneProjection extends Sweref99ProjectionBase {
  readonly type: "zone";
  readonly zoneId: string;
}

export type Sweref99Projection = Sweref99TmProjection | Sweref99ZoneProjection;

export interface AttributesMap {
  [key: string]: unknown;
}

export interface SearchResult {
  sourceIndex: number;
  name: string;
  text: string;
  feature: __esri.Graphic | null;
  extent: __esri.Extent | null;
  location: __esri.Point | null;
  attributes?: AttributesMap;
}

export type PointJSON = __esri.PointProperties & {
  spatialReference?: __esri.SpatialReferenceProperties;
};

export type ExtentJSON = __esri.ExtentProperties & {
  spatialReference?: __esri.SpatialReferenceProperties;
};

export interface SearchResultSummary {
  sourceIndex: number;
  name: string;
  text: string;
  location?: PointJSON | null;
  extent?: ExtentJSON | null;
  attributes?: AttributesMap;
}

export interface BaseSearchSource {
  id: string;
  name: string;
  placeholder?: string;
  maxSuggestions?: number;
}

export interface LocatorSearchSourceConfig extends BaseSearchSource {
  type: SearchSourceType.Locator;
  url: string;
  apiKey?: string;
  categories?: string[];
  countryCode?: string;
  locationType?: string;
  withinViewEnabled?: boolean;
  outFields?: string[];
}

export interface LayerSearchSourceConfig extends BaseSearchSource {
  type: SearchSourceType.Layer;
  url: string;
  layerId: string;
  searchFields: string[];
  displayField?: string;
  exactMatch?: boolean;
  minSuggestCharacters?: number;
  resultSymbol?: __esri.SimpleMarkerSymbolProperties;
}

export type SearchSourceConfig =
  | LocatorSearchSourceConfig
  | LayerSearchSourceConfig;

export interface SearchConfig {
  searchSources: SearchSourceConfig[];
  placeholder: string;
  maxSuggestions: number;
  zoomScale: number;
  persistLastSearch?: boolean;
  enableCoordinateSearch?: boolean;
  coordinateZoomScale?: number;
  preferredProjection?: CoordinateProjectionPreference;
  showCoordinateBadge?: boolean;
  styleVariant?: StyleVariant;
}

export type IMSearchConfig = ImmutableObject<SearchConfig>;

export interface SearchWidgetState {
  results: SearchResultSummary[];
  activeSourceIndex: number;
  isSearching: boolean;
  lastSearchTerm: string;
  errorMessage?: string | null;
  coordinateResult?: CoordinateResultSummary | null;
  isCoordinateInput: boolean;
}

export type IMSearchWidgetState = ImmutableObject<SearchWidgetState>;

export interface SearchWidgetGlobalState {
  byId: { [id: string]: IMSearchWidgetState };
}

export type IMSearchWidgetGlobalState =
  ImmutableObject<SearchWidgetGlobalState>;

export interface EsriClassConstructor<TInstance, TProps = unknown> {
  new (properties?: TProps): TInstance;
  prototype: TInstance;
}

export interface EsriSearchModules {
  Search: EsriClassConstructor<__esri.Search, __esri.SearchProperties>;
  SearchViewModel: EsriClassConstructor<
    __esri.SearchViewModel,
    __esri.SearchViewModelProperties
  >;
  LocatorSearchSource: EsriClassConstructor<
    __esri.LocatorSearchSource,
    __esri.LocatorSearchSourceProperties
  >;
  LayerSearchSource: EsriClassConstructor<
    __esri.LayerSearchSource,
    __esri.LayerSearchSourceProperties
  >;
  Graphic: EsriClassConstructor<__esri.Graphic, __esri.GraphicProperties>;
  GraphicsLayer: EsriClassConstructor<
    __esri.GraphicsLayer,
    __esri.GraphicsLayerProperties
  >;
  FeatureLayer: EsriClassConstructor<
    __esri.FeatureLayer,
    __esri.FeatureLayerProperties
  >;
  SimpleMarkerSymbol: EsriClassConstructor<
    __esri.SimpleMarkerSymbol,
    __esri.SimpleMarkerSymbolProperties
  >;
  PictureMarkerSymbol: EsriClassConstructor<
    __esri.PictureMarkerSymbol,
    __esri.PictureMarkerSymbolProperties
  >;
  reactiveUtils: typeof __esri.reactiveUtils;
  promiseUtils: typeof __esri.promiseUtils;
  locator: __esri.locator;
  projection: __esri.projection;
  Point: EsriClassConstructor<__esri.Point, __esri.PointProperties> &
    typeof __esri.Point;
  SpatialReference: EsriClassConstructor<
    __esri.SpatialReference,
    __esri.SpatialReferenceProperties
  > &
    typeof __esri.SpatialReference;
}

export type SearchWidgetHandle = __esri.Search & {
  on: (
    type: string | string[],
    listener: (...args: unknown[]) => void
  ) => __esri.Handle;
  activeSourceIndex?: number;
  sources?: __esri.SearchSource[] | null;
  view?: __esri.View | null;
  viewModel?: __esri.SearchViewModel | null;
  searchTerm?: string;
};

export type Maybe<T> = T | null | undefined;

export interface SearchSourceValidation {
  valid: boolean;
  errors: string[];
}

export interface CoordinateParseResult {
  success: boolean;
  easting?: number;
  northing?: number;
  format?: CoordinateInputFormat;
  sanitized?: string;
  error?: string;
  warning?: string;
}

export interface ProjectionDetectionResult {
  projection: Sweref99Projection | null;
  confidence: number;
  alternatives: Sweref99Projection[];
  warnings?: string[];
}

export interface CoordinateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CoordinateSearchResult {
  point: __esri.Point;
  projection: Sweref99Projection;
  easting: number;
  northing: number;
  validation: CoordinateValidationResult;
  format: CoordinateInputFormat;
  confidence: number;
  alternatives: Sweref99Projection[];
  warnings: string[];
}

export interface CoordinateResultSummary {
  projectionId: string;
  easting: number;
  northing: number;
  warnings: string[];
  confidence: number;
  format: CoordinateInputFormat;
  alternativeProjectionIds: string[];
  mapPoint?: PointJSON | null;
}

export interface UseSearchWidgetParams {
  mapView: JimuMapView | null;
  container: HTMLDivElement | null;
  modules: EsriSearchModules | null;
  config: SearchConfig;
  activeSourceIndex: number;
  lastSearchTerm: string;
  zoomScale: number;
  onSearchStart?: (term: string) => void;
  onSearchComplete?: (results: SearchResult[]) => void;
  onResultSelect?: (result: SearchResult) => void;
  onSearchClear?: () => void;
  onSearchError?: (error: Error) => void;
  onActiveSourceChange?: (index: number) => void;
  onInputChange?: (term: string) => void;
}

export type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface BaseSearchAction extends Action<SearchActionType> {
  widgetId: string;
}

export interface SetResultsAction extends BaseSearchAction {
  type: SearchActionType.SetResults;
  results: SearchResultSummary[];
}

export interface ClearResultsAction extends BaseSearchAction {
  type: SearchActionType.ClearResults;
}

export interface SetActiveSourceAction extends BaseSearchAction {
  type: SearchActionType.SetActiveSource;
  index: number;
}

export interface SetSearchingAction extends BaseSearchAction {
  type: SearchActionType.SetSearching;
  value: boolean;
}

export interface SetLastSearchTermAction extends BaseSearchAction {
  type: SearchActionType.SetLastSearchTerm;
  value: string;
}

export interface SetErrorAction extends BaseSearchAction {
  type: SearchActionType.SetError;
  message: string | null;
}

export interface SetCoordinateInputAction extends BaseSearchAction {
  type: SearchActionType.SetCoordinateInput;
  isCoordinate: boolean;
}

export interface SetCoordinateResultAction extends BaseSearchAction {
  type: SearchActionType.SetCoordinateResult;
  result: CoordinateResultSummary | null;
}

export interface ClearCoordinateResultAction extends BaseSearchAction {
  type: SearchActionType.ClearCoordinateResult;
}

export type SearchWidgetAction =
  | SetResultsAction
  | ClearResultsAction
  | SetActiveSourceAction
  | SetSearchingAction
  | SetLastSearchTermAction
  | SetErrorAction
  | SetCoordinateInputAction
  | SetCoordinateResultAction
  | ClearCoordinateResultAction;

export type IMSearchGlobalState = IMSearchWidgetGlobalState;

export type SettingProps = AllWidgetSettingProps<IMSearchConfig>;

export interface EditableLayerSearchSource extends LayerSearchSourceConfig {
  searchFieldsText?: string;
}

export type EditableSearchSource =
  | LocatorSearchSourceConfig
  | EditableLayerSearchSource;

export type WidgetProps = AllWidgetProps<IMSearchConfig>;

export interface StateWithSearch extends IMState {
  searchWidgetState?: IMSearchGlobalState;
}

export interface SearchUiStyles {
  container: SerializedStyles;
  controls: SerializedStyles;
  inputArea: SerializedStyles;
  actions: SerializedStyles;
  sourceSelector: SerializedStyles;
  resultsList: SerializedStyles;
  resultItem: SerializedStyles;
  resultStatus: SerializedStyles;
  coordinateBadge: SerializedStyles;
  coordinateDetails: SerializedStyles;
  coordinateLabel: SerializedStyles;
  coordinateValue: SerializedStyles;
  coordinateWarning: SerializedStyles;
  coordinateLoading: SerializedStyles;
}

export interface SearchSettingStyles {
  sectionHeader: SerializedStyles;
  fieldWidth: SerializedStyles;
  fieldError: SerializedStyles;
  coordinateSection: SerializedStyles;
  coordinateField: SerializedStyles;
}

export interface ZoneSpec {
  readonly zoneId: string;
  readonly name: string;
  readonly epsg: number;
  readonly centralMeridian: number;
}

export interface ProjectionIndex {
  [epsg: number]: Sweref99Projection;
}

export interface ZoneIndex {
  [meridian: number]: Sweref99ZoneProjection;
}

export interface ProjectionDetectorOptions {
  mapView: JimuMapView | null;
  preference?: CoordinateProjectionPreference;
}

export interface CoordinateTransformOptions {
  modules: EsriSearchModules | null;
  mapView: JimuMapView | null;
}

export interface CoordinateSearchOptions {
  modules: EsriSearchModules | null;
  mapView: JimuMapView | null;
  preference?: CoordinateProjectionPreference;
  onSuccess?: (result: CoordinateSearchResult) => void;
  onError?: (
    errorKey: string,
    context?: { warnings?: readonly string[] }
  ) => void;
}

export interface DetectProjectionParams {
  easting: number;
  northing: number;
  preference?: CoordinateProjectionPreference;
  mapCenter?: __esri.Point | null;
}

export interface ValidateCoordinatesParams {
  easting: number;
  northing: number;
  projection?: Sweref99Projection | null;
}

export interface TransformParams {
  easting: number;
  northing: number;
  projection: Sweref99Projection;
  modules: EsriSearchModules;
  spatialReference: __esri.SpatialReference | null;
}
