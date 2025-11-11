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
  if (!widgetId) {
    return inputState;
  }
  const state = ensureWidgetEntry(inputState, widgetId);
  const widgetState = state.byId?.[widgetId];
  if (!widgetState) {
    return state;
  }

  switch (action.type) {
    case SearchActionType.SetResults: {
      const next = widgetState
        .set("results", mapResults(action.results))
        .set("isSearching", false);
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.ClearResults: {
      const next = widgetState
        .set("results", mapResults([]))
        .set("lastSearchTerm", "")
        .set("isSearching", false)
        .set("errorMessage", null);
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.SetActiveSource: {
      const next = widgetState.set("activeSourceIndex", action.index);
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.SetSearching: {
      const next = widgetState
        .set("isSearching", action.value)
        .set("errorMessage", null);
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.SetLastSearchTerm: {
      const next = widgetState.set("lastSearchTerm", action.value);
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.SetError: {
      const next = widgetState
        .set("errorMessage", action.message)
        .set("isSearching", false);
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.SetCoordinateInput: {
      const next = widgetState
        .set("isCoordinateInput", Boolean(action.isCoordinate))
        .set(
          "coordinateResult",
          action.isCoordinate ? widgetState.coordinateResult : null
        );
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.SetCoordinateResult: {
      const next = widgetState.set("coordinateResult", action.result ?? null);
      return state.setIn(["byId", widgetId], next);
    }
    case SearchActionType.ClearCoordinateResult: {
      const next = widgetState.set("coordinateResult", null);
      return state.setIn(["byId", widgetId], next);
    }
  }
  return state;
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
      typeof index === "number" && Number.isFinite(index)
        ? Math.max(0, Math.floor(index))
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
    let sanitized: SearchWidgetState["coordinateResult"] = null;
    if (result && typeof result === "object") {
      try {
        const projectionId =
          typeof result.projectionId === "string" ? result.projectionId : "";

        const easting =
          typeof result.easting === "number" && Number.isFinite(result.easting)
            ? result.easting
            : 0;

        const northing =
          typeof result.northing === "number" &&
          Number.isFinite(result.northing)
            ? result.northing
            : 0;

        const confidence =
          typeof result.confidence === "number" &&
          Number.isFinite(result.confidence)
            ? result.confidence
            : 0;

        if (!projectionId) {
          return {
            type: SearchActionType.SetCoordinateResult,
            result: null,
            widgetId,
          };
        }
        let mapPoint: SearchWidgetState["coordinateResult"]["mapPoint"] = null;
        if (
          result.mapPoint &&
          typeof result.mapPoint === "object" &&
          typeof result.mapPoint.x === "number" &&
          typeof result.mapPoint.y === "number" &&
          result.mapPoint.spatialReference &&
          typeof result.mapPoint.spatialReference === "object"
        ) {
          const sr = result.mapPoint.spatialReference;
          const hasValidWkid =
            typeof sr.wkid === "number" &&
            Number.isFinite(sr.wkid) &&
            sr.wkid > 0;
          const hasValidWkt =
            typeof sr.wkt === "string" && sr.wkt.trim().length > 0;
          if (hasValidWkid || hasValidWkt) {
            mapPoint = {
              x: result.mapPoint.x,
              y: result.mapPoint.y,
              spatialReference: hasValidWkid
                ? { wkid: sr.wkid }
                : { wkt: sr.wkt },
            };
          } else {
            console.log(
              "Search widget: invalid spatial reference in coordinate result"
            );
          }
        }

        sanitized = {
          projectionId,
          easting,
          northing,
          warnings: Array.isArray(result.warnings)
            ? result.warnings.filter((w) => typeof w === "string")
            : [],
          confidence,
          format: result.format ?? CoordinateInputFormat.Unknown,
          alternativeProjectionIds: Array.isArray(
            result.alternativeProjectionIds
          )
            ? result.alternativeProjectionIds.filter(
                (id) => typeof id === "string"
              )
            : [],
          mapPoint,
        };
      } catch (error) {
        console.log("Search widget: invalid coordinate result data", error);
        sanitized = null;
      }
    }

    return {
      type: SearchActionType.SetCoordinateResult,
      result: sanitized,
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
