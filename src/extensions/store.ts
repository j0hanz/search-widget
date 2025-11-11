import type { extensionSpec, ImmutableObject } from "jimu-core";
import SeamlessImmutable from "seamless-immutable";
import { CoordinateInputFormat, SearchActionType } from "../config/enums";
import type {
  ClearCoordinateResultAction,
  ClearResultsAction,
  IMSearchWidgetGlobalState,
  IMSearchWidgetState,
  SearchResultSummary,
  SearchWidgetAction,
  SearchWidgetState,
  SetActiveSourceAction,
  SetCoordinateInputAction,
  SetCoordinateResultAction,
  SetErrorAction,
  SetLastSearchTermAction,
  SetResultsAction,
  SetSearchingAction,
} from "../config/types";

export type { SearchWidgetAction } from "../config/types";

export const createDefaultWidgetState = (
  overrides?: Partial<SearchWidgetState>
): IMSearchWidgetState =>
  SeamlessImmutable<SearchWidgetState>({
    results: [],
    activeSourceIndex: 0,
    isSearching: false,
    lastSearchTerm: "",
    errorMessage: null,
    coordinateResult: null,
    isCoordinateInput: false,
    ...overrides,
  }) as unknown as IMSearchWidgetState;

const emptyGlobalState = SeamlessImmutable<{
  byId: { [key: string]: IMSearchWidgetState };
}>({ byId: {} }) as IMSearchWidgetGlobalState;

const ensureWidgetEntry = (
  state: IMSearchWidgetGlobalState,
  widgetId: string
): IMSearchWidgetGlobalState => {
  if (
    !state ||
    typeof state !== "object" ||
    !state.byId ||
    typeof state.byId !== "object"
  ) {
    state = emptyGlobalState;
  }

  if (state.byId[widgetId]) {
    return state;
  }

  return state.setIn(["byId", widgetId], createDefaultWidgetState());
};

const mapResults = (
  results: SearchResultSummary[]
): ImmutableObject<SearchResultSummary[]> =>
  SeamlessImmutable<SearchResultSummary[]>(
    results ?? []
  ) as unknown as ImmutableObject<SearchResultSummary[]>;

const reducer = (
  inputState: IMSearchWidgetGlobalState = emptyGlobalState,
  action: SearchWidgetAction
): IMSearchWidgetGlobalState => {
  const { widgetId } = action;
  if (!widgetId) return inputState;

  const state = ensureWidgetEntry(inputState, widgetId);
  const widgetState = state.byId?.[widgetId];
  if (!widgetState) return state;

  let next: IMSearchWidgetState;

  switch (action.type) {
    case SearchActionType.SetResults:
      next = widgetState.merge({
        results: mapResults(action.results),
        isSearching: false,
      });
      break;

    case SearchActionType.ClearResults:
      next = widgetState.merge({
        results: mapResults([]),
        lastSearchTerm: "",
        isSearching: false,
        errorMessage: null,
      });
      break;

    case SearchActionType.SetActiveSource:
      next = widgetState.set("activeSourceIndex", action.index);
      break;

    case SearchActionType.SetSearching:
      next = widgetState.merge({
        isSearching: action.value,
        errorMessage: null,
      });
      break;

    case SearchActionType.SetLastSearchTerm:
      next = widgetState.set("lastSearchTerm", action.value);
      break;

    case SearchActionType.SetError:
      next = widgetState.merge({
        errorMessage: action.message,
        isSearching: false,
      });
      break;

    case SearchActionType.SetCoordinateInput:
      next = widgetState.merge({
        isCoordinateInput: Boolean(action.isCoordinate),
        coordinateResult: action.isCoordinate
          ? widgetState.coordinateResult
          : null,
      });
      break;

    case SearchActionType.SetCoordinateResult:
      next = widgetState.set("coordinateResult", action.result ?? null);
      break;

    case SearchActionType.ClearCoordinateResult:
      next = widgetState.set("coordinateResult", null);
      break;
  }
  return state.setIn(["byId", widgetId], next);
};

export const searchReducer = reducer;

export const searchActions = {
  setResults: (
    results: SearchResultSummary[],
    widgetId: string
  ): SetResultsAction => ({
    type: SearchActionType.SetResults,
    results: Array.isArray(results) ? results : [],
    widgetId,
  }),
  clearResults: (widgetId: string): ClearResultsAction => ({
    type: SearchActionType.ClearResults,
    widgetId,
  }),
  setActiveSource: (
    index: number,
    widgetId: string
  ): SetActiveSourceAction => ({
    type: SearchActionType.SetActiveSource,
    index:
      typeof index === "number" && Number.isFinite(index) && index >= 0
        ? index
        : 0,
    widgetId,
  }),
  setSearching: (value: boolean, widgetId: string): SetSearchingAction => ({
    type: SearchActionType.SetSearching,
    value: Boolean(value),
    widgetId,
  }),
  setLastSearchTerm: (
    value: string,
    widgetId: string
  ): SetLastSearchTermAction => ({
    type: SearchActionType.SetLastSearchTerm,
    value: typeof value === "string" ? value : "",
    widgetId,
  }),
  setError: (message: string | null, widgetId: string): SetErrorAction => ({
    type: SearchActionType.SetError,
    message:
      message === null || typeof message === "string"
        ? message
        : String(message),
    widgetId,
  }),
  setCoordinateInput: (
    isCoordinate: boolean,
    widgetId: string
  ): SetCoordinateInputAction => ({
    type: SearchActionType.SetCoordinateInput,
    isCoordinate: Boolean(isCoordinate),
    widgetId,
  }),
  setCoordinateResult: (
    result: SearchWidgetState["coordinateResult"],
    widgetId: string
  ): SetCoordinateResultAction => {
    if (!result || typeof result !== "object") {
      return {
        type: SearchActionType.SetCoordinateResult,
        result: null,
        widgetId,
      };
    }

    const projectionId =
      typeof result.projectionId === "string" ? result.projectionId : "";
    if (!projectionId) {
      return {
        type: SearchActionType.SetCoordinateResult,
        result: null,
        widgetId,
      };
    }

    const easting =
      typeof result.easting === "number" && Number.isFinite(result.easting)
        ? result.easting
        : 0;
    const northing =
      typeof result.northing === "number" && Number.isFinite(result.northing)
        ? result.northing
        : 0;
    const confidence =
      typeof result.confidence === "number" &&
      Number.isFinite(result.confidence)
        ? result.confidence
        : 0;

    let mapPoint: SearchWidgetState["coordinateResult"]["mapPoint"] = null;
    const point = result.mapPoint;
    if (
      point &&
      typeof point === "object" &&
      typeof point.x === "number" &&
      typeof point.y === "number" &&
      point.spatialReference &&
      typeof point.spatialReference === "object"
    ) {
      const sr = point.spatialReference;
      const hasValidWkid =
        typeof sr.wkid === "number" && Number.isFinite(sr.wkid) && sr.wkid > 0;
      const hasValidWkt =
        typeof sr.wkt === "string" && sr.wkt.trim().length > 0;

      if (hasValidWkid || hasValidWkt) {
        mapPoint = {
          x: point.x,
          y: point.y,
          spatialReference: hasValidWkid ? { wkid: sr.wkid } : { wkt: sr.wkt },
        };
      }
    }

    return {
      type: SearchActionType.SetCoordinateResult,
      result: {
        projectionId,
        easting,
        northing,
        warnings: Array.isArray(result.warnings)
          ? result.warnings.filter((w) => typeof w === "string")
          : [],
        confidence,
        format: result.format ?? CoordinateInputFormat.Unknown,
        alternativeProjectionIds: Array.isArray(result.alternativeProjectionIds)
          ? result.alternativeProjectionIds.filter(
              (id) => typeof id === "string"
            )
          : [],
        mapPoint,
      },
      widgetId,
    };
  },
  clearCoordinateResult: (widgetId: string): ClearCoordinateResultAction => ({
    type: SearchActionType.ClearCoordinateResult,
    widgetId,
  }),
};

export const getDefaultWidgetState = () => createDefaultWidgetState();

export default class SearchReduxStoreExtension
  implements extensionSpec.ReduxStoreExtension
{
  readonly id = "search_widget_store";

  getActions(): string[] {
    return Object.values(SearchActionType);
  }

  getInitLocalState(): { byId: { [key: string]: IMSearchWidgetState } } {
    return { byId: {} };
  }

  getReducer() {
    return reducer;
  }

  getStoreKey(): string {
    return "searchWidgetState";
  }
}
