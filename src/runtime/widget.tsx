/** @jsx jsx */
/** @jsxFrag React.Fragment */
import { hooks, type ImmutableObject, jsx, React, ReactRedux } from "jimu-core";
import { type JimuMapView, JimuMapViewComponent } from "jimu-arcgis";
import {
  Alert,
  Button,
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
  Label,
  Loading,
  SVG,
  Typography,
} from "jimu-ui";
import caretDown from "jimu-icons/svg/outlined/directional/down.svg";
import type { Dispatch } from "redux";
import {
  type CoordinateResultSummary,
  type CoordinateSearchResult,
  DEFAULT_COORDINATE_PREFERENCE,
  DEFAULT_COORDINATE_ZOOM_SCALE,
  DEFAULT_LOCATOR_SOURCE,
  DEFAULT_MAX_SUGGESTIONS,
  DEFAULT_PLACEHOLDER,
  DEFAULT_STYLE_VARIANT,
  DEFAULT_ZOOM_SCALE,
  type IMSearchConfig,
  type Maybe,
  type PointJSON,
  type SearchConfig,
  type SearchResult,
  type SearchResultSummary,
  type SearchSourceConfig,
  SearchSourceType,
  type StateWithSearch,
  SWEREF99_PROJECTIONS,
  type WidgetProps,
} from "../config";
import { useUiStyles } from "../config/style";
import type { Sweref99Projection } from "../config/types";
import {
  createDefaultWidgetState,
  searchActions,
  type SearchWidgetAction,
} from "../extensions/store";
import {
  useCoordinateSearch,
  useEsriSearchModules,
  useSearchSourceSelector,
  useSearchWidget,
} from "../shared/hooks";
import {
  type CoordinateDetectionResult,
  isLikelyCoordinateInput,
  summarizeSearchResult,
} from "../shared/utils";
import defaultMessages from "./translations/default";

const isGoToCapableView = (
  candidate: __esri.View | null | undefined
): candidate is __esri.MapView | __esri.SceneView =>
  Boolean(
    candidate &&
      typeof (candidate as __esri.MapView | __esri.SceneView).goTo ===
        "function"
  );

const PROJECTION_BY_ID = new Map<string, Sweref99Projection>(
  SWEREF99_PROJECTIONS.map((projection) => [projection.id, projection])
);

const resolveProjection = (
  projectionId: string | undefined
): Sweref99Projection | null =>
  projectionId ? (PROJECTION_BY_ID.get(projectionId) ?? null) : null;

const toCoordinateResultSummary = (
  result: CoordinateSearchResult
): CoordinateResultSummary => ({
  projectionId: result.projection.id,
  easting: result.easting,
  northing: result.northing,
  warnings: [...(result.warnings ?? [])],
  confidence: result.confidence,
  format: result.format,
  alternativeProjectionIds: (result.alternatives ?? []).map((alt) => alt.id),
  mapPoint:
    typeof result.point?.toJSON === "function"
      ? (result.point.toJSON() as PointJSON)
      : null,
});

interface MutableLike<T> {
  asMutable?: (options?: { deep?: boolean }) => T;
}

function toMutableValue<T>(value: Maybe<T | MutableLike<T>>): T | null {
  if (value == null) {
    return null;
  }
  const candidate = value as MutableLike<T>;
  if (typeof candidate.asMutable === "function") {
    return candidate.asMutable({ deep: true });
  }
  return value as T;
}

const isGraphicsLayerDestroyed = (
  layer: __esri.GraphicsLayer | null
): boolean => {
  if (!layer) return false;
  const candidate = layer as Partial<__esri.GraphicsLayer> & {
    destroyed?: boolean;
  };
  return Boolean(candidate.destroyed);
};

const useCoordinateSummary = (
  summary: Maybe<
    CoordinateResultSummary | ImmutableObject<CoordinateResultSummary>
  >
): CoordinateResultSummary | null => {
  const cacheRef = React.useRef<{
    source: typeof summary;
    value: CoordinateResultSummary | null;
  } | null>(null);

  if (!cacheRef.current || cacheRef.current.source !== summary) {
    cacheRef.current = {
      source: summary,
      value: toMutableValue<CoordinateResultSummary>(summary),
    };
  }

  return cacheRef.current.value;
};

const normalizeConfigValue = (
  config: IMSearchConfig | undefined
): SearchConfig => {
  const mutable =
    (config?.asMutable?.({ deep: true }) as Partial<SearchConfig>) ?? {};
  const baseSources = Array.isArray(mutable.searchSources)
    ? mutable.searchSources
    : [];
  const placeholder = mutable.placeholder ?? DEFAULT_PLACEHOLDER;
  const maxSuggestions = mutable.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;

  const sources: SearchSourceConfig[] = baseSources.length
    ? baseSources.map((source, index) => {
        const base = {
          id: source?.id ?? `search-source-${index}`,
          name: source?.name ?? `Source ${index + 1}`,
          placeholder: source?.placeholder ?? placeholder,
          maxSuggestions: source?.maxSuggestions ?? maxSuggestions,
        };
        return source?.type === SearchSourceType.Layer
          ? {
              ...base,
              type: SearchSourceType.Layer,
              url: source.url ?? "",
              layerId: source.layerId ?? "",
              searchFields: source.searchFields ? [...source.searchFields] : [],
              displayField: source.displayField,
              exactMatch: source.exactMatch,
            }
          : {
              ...base,
              type: SearchSourceType.Locator,
              url:
                source?.type === SearchSourceType.Locator && source.url
                  ? source.url
                  : DEFAULT_LOCATOR_SOURCE.url,
              apiKey:
                source?.type === SearchSourceType.Locator
                  ? source.apiKey
                  : undefined,
            };
      })
    : [{ ...DEFAULT_LOCATOR_SOURCE }];

  return {
    useMapWidget: mutable.useMapWidget,
    placeholder,
    maxSuggestions,
    zoomScale: mutable.zoomScale ?? DEFAULT_ZOOM_SCALE,
    persistLastSearch: mutable.persistLastSearch ?? true,
    searchSources: sources,
    enableCoordinateSearch: mutable.enableCoordinateSearch ?? true,
    coordinateZoomScale:
      typeof mutable.coordinateZoomScale === "number" &&
      mutable.coordinateZoomScale > 0
        ? mutable.coordinateZoomScale
        : DEFAULT_COORDINATE_ZOOM_SCALE,
    preferredProjection:
      mutable.preferredProjection ?? DEFAULT_COORDINATE_PREFERENCE,
    showCoordinateBadge: mutable.showCoordinateBadge ?? true,
    styleVariant: mutable.styleVariant ?? DEFAULT_STYLE_VARIANT,
  };
};

const useNormalizedConfig = (
  config: IMSearchConfig | undefined
): SearchConfig => {
  const cacheRef = React.useRef<{
    source: IMSearchConfig | undefined;
    value: SearchConfig;
  } | null>(null);

  if (!cacheRef.current || cacheRef.current.source !== config) {
    cacheRef.current = {
      source: config,
      value: normalizeConfigValue(config),
    };
  }

  return cacheRef.current.value;
};

const useSearchResultSummaries = (results: unknown): SearchResultSummary[] => {
  const cacheRef = React.useRef<{
    source: unknown;
    value: SearchResultSummary[];
  } | null>(null);

  if (!cacheRef.current || cacheRef.current.source !== results) {
    const mutable =
      toMutableValue<SearchResultSummary[]>(
        results as Maybe<
          SearchResultSummary[] | MutableLike<SearchResultSummary[]>
        >
      ) ?? [];
    cacheRef.current = {
      source: results,
      value: mutable,
    };
  }

  return cacheRef.current.value;
};

const Widget = (props: WidgetProps) => {
  const { id } = props;
  const translate = hooks.useTranslation(defaultMessages);
  const cfg = useNormalizedConfig(props.config);
  const styles = useUiStyles(cfg.styleVariant ?? DEFAULT_STYLE_VARIANT);

  const defaultStateRef = React.useRef(createDefaultWidgetState());
  const dispatch = ReactRedux.useDispatch<Dispatch<SearchWidgetAction>>();
  const widgetState = ReactRedux.useSelector(
    (state: StateWithSearch) =>
      state.searchWidgetState?.byId?.[id] ?? defaultStateRef.current
  );

  const [mapView, setMapView] = React.useState<JimuMapView | null>(null);
  const [containerEl, setContainerEl] = React.useState<HTMLDivElement | null>(
    null
  );
  const [isSourceMenuOpen, setSourceMenuOpen] = React.useState(false);
  const [coordinateLoading, setCoordinateLoading] = React.useState(false);
  const [detectionResult, setDetectionResult] =
    React.useState<CoordinateDetectionResult | null>(null);

  const rawResultsRef = React.useRef<SearchResult[]>([]);
  const results = useSearchResultSummaries(widgetState.results);
  const coordinateResult = useCoordinateSummary(widgetState.coordinateResult);

  const { modules, error: moduleError } = useEsriSearchModules();

  const handleActiveViewChange = hooks.useEventCallback((view: JimuMapView) => {
    setMapView(view);
  });
  const handleContainerRef = hooks.useEventCallback(
    (node: HTMLDivElement | null) => {
      node !== containerEl && setContainerEl(node);
    }
  );
  const handleToggleSourceMenu = hooks.useEventCallback(() => {
    setSourceMenuOpen((prev) => !prev);
  });
  const handleCloseSourceMenu = hooks.useEventCallback(() => {
    setSourceMenuOpen(false);
  });

  const setSearching = hooks.useEventCallback((value: boolean) => {
    dispatch(searchActions.setSearching(value, id));
  });
  const setLastSearchTerm = hooks.useEventCallback((value: string) => {
    dispatch(searchActions.setLastSearchTerm(value, id));
  });
  const clearResults = hooks.useEventCallback(() => {
    rawResultsRef.current = [];
    dispatch(searchActions.clearResults(id));
  });
  const setResults = hooks.useEventCallback(
    (nextResults: SearchResultSummary[]) => {
      dispatch(searchActions.setResults(nextResults, id));
    }
  );
  const setError = hooks.useEventCallback((message: string | null) => {
    dispatch(searchActions.setError(message, id));
  });
  const setActiveSource = hooks.useEventCallback((index: number) => {
    dispatch(searchActions.setActiveSource(index, id));
  });
  const setCoordinateInputFlag = hooks.useEventCallback(
    (isCoordinate: boolean) => {
      dispatch(searchActions.setCoordinateInput(isCoordinate, id));
    }
  );
  const setCoordinateResultState = hooks.useEventCallback(
    (summary: CoordinateResultSummary | null) => {
      dispatch(searchActions.setCoordinateResult(summary, id));
    }
  );
  const clearCoordinateResultState = hooks.useEventCallback(() => {
    dispatch(searchActions.clearCoordinateResult(id));
  });

  const coordinateLayerRef = React.useRef<__esri.GraphicsLayer | null>(null);
  const coordinateLayerViewRef = React.useRef<__esri.View | null>(null);
  const modulesRef = hooks.useLatest(modules);
  const mapViewRefLatest = hooks.useLatest(mapView);
  const coordinateZoomScaleRef = hooks.useLatest(cfg.coordinateZoomScale);
  const isCoordinateInputRef = hooks.useLatest(widgetState.isCoordinateInput);
  const awaitingModulesRef = React.useRef(false);
  const lastCoordinateTermRef = React.useRef<string>("");
  const coordinateLayerId = `${id}-coordinate-layer`;

  hooks.useUpdateEffect((): void | (() => void) => {
    const enabled = cfg.enableCoordinateSearch;
    const view = mapView?.view;
    const currentModules = modulesRef.current;
    const existingLayerRef = coordinateLayerRef.current;
    const existingViewRef = coordinateLayerViewRef.current;

    const removeLayer = (
      targetLayer: __esri.GraphicsLayer | null,
      targetView: __esri.View | null
    ) => {
      if (!targetLayer || !targetView?.map) return;
      const located = targetView.map.findLayerById(targetLayer.id);
      if (located === targetLayer) {
        targetView.map.remove(targetLayer);
      }
    };

    if (!enabled) {
      removeLayer(existingLayerRef, existingViewRef);
      coordinateLayerRef.current = null;
      coordinateLayerViewRef.current = null;
      return;
    }

    if (!view || !currentModules) {
      return;
    }

    // Find or create layer for this effect
    let layer = view.map?.findLayerById(coordinateLayerId) as
      | __esri.GraphicsLayer
      | undefined;

    if (!layer) {
      layer = new currentModules.GraphicsLayer({
        id: coordinateLayerId,
        listMode: "hide",
      });
      view.map?.add(layer);
    }
    coordinateLayerRef.current = layer;
    coordinateLayerViewRef.current = view;

    return () => {
      if (layer && view) {
        removeLayer(layer, view);
      }
      if (coordinateLayerRef.current === layer) {
        coordinateLayerRef.current = null;
      }
      if (coordinateLayerViewRef.current === view) {
        coordinateLayerViewRef.current = null;
      }
    };
  }, [cfg.enableCoordinateSearch, mapView, modules, coordinateLayerId]);

  const updateCoordinateGraphic = hooks.useEventCallback(
    (point: __esri.Point) => {
      const currentModules = modulesRef.current;
      const layer = coordinateLayerRef.current;
      if (!currentModules || !layer) return;

      if (isGraphicsLayerDestroyed(layer)) {
        coordinateLayerRef.current = null;
        return;
      }

      try {
        if (isGraphicsLayerDestroyed(layer)) {
          coordinateLayerRef.current = null;
          return;
        }

        layer.removeAll();
        const symbol = new currentModules.SimpleMarkerSymbol({
          style: "x",
          color: [32, 108, 255, 0.95],
          size: 14,
          outline: { color: [255, 255, 255, 0.9], width: 2 },
        });
        layer.add(new currentModules.Graphic({ geometry: point, symbol }));
      } catch (error) {
        coordinateLayerRef.current = null;
        console.log("Failed to update coordinate graphic:", error);
      }
    }
  );

  const goToCoordinate = hooks.useEventCallback((point: __esri.Point) => {
    const view = mapViewRefLatest.current?.view;
    const zoomScale =
      coordinateZoomScaleRef.current ?? DEFAULT_COORDINATE_ZOOM_SCALE;
    if (view && zoomScale > 0) {
      view
        .goTo({ target: point, scale: zoomScale }, { animate: true })
        .catch(() => undefined);
    }
  });

  const coordinateSearch = useCoordinateSearch({
    modules,
    mapView,
    preference: cfg.preferredProjection,
    onSuccess: (result) => {
      if (!isCoordinateInputRef.current) return;
      setCoordinateLoading(false);
      setCoordinateResultState(toCoordinateResultSummary(result));
      updateCoordinateGraphic(result.point);
      goToCoordinate(result.point);
      setError(null);
    },
    onError: (errorKey) => {
      if (!isCoordinateInputRef.current) return;
      if (errorKey?.startsWith("coordinateWarning")) return;
      setCoordinateLoading(false);
      const translated = translate(errorKey ?? "coordinateErrorGeneric");
      const message =
        translated && translated !== errorKey
          ? translated
          : translate("coordinateErrorGeneric");

      // Log missing translation keys for debugging
      if (
        translated === errorKey &&
        errorKey &&
        errorKey !== "coordinateErrorGeneric"
      ) {
        console.log(`Missing translation for error key: ${errorKey}`);
      }

      setError(message);
      clearCoordinateResultState();
      coordinateLayerRef.current?.removeAll();
    },
  });

  hooks.useUpdateEffect(() => {
    if (!cfg.enableCoordinateSearch) return;
    const summary = coordinateResult;
    const modulesCurrent = modulesRef.current;
    if (
      !summary ||
      !summary.mapPoint ||
      !modulesCurrent?.Point ||
      !modulesCurrent?.SpatialReference
    ) {
      coordinateLayerRef.current?.removeAll();
      return;
    }
    const layer = coordinateLayerRef.current;
    if (!layer || isGraphicsLayerDestroyed(layer)) {
      coordinateLayerRef.current = null;
      return;
    }

    try {
      const pointData = summary.mapPoint;

      // Validate point coordinates
      if (
        typeof pointData.x !== "number" ||
        typeof pointData.y !== "number" ||
        !Number.isFinite(pointData.x) ||
        !Number.isFinite(pointData.y)
      ) {
        console.log("Search widget: invalid stored coordinate data");
        layer.removeAll();
        return;
      }

      // Validate spatial reference exists
      if (
        !pointData.spatialReference ||
        typeof pointData.spatialReference !== "object"
      ) {
        console.log(
          "Search widget: missing spatial reference in stored coordinate"
        );
        layer.removeAll();
        return;
      }

      // Validate spatial reference has exactly one of wkid or wkt
      const sr = pointData.spatialReference;
      const hasValidWkid =
        typeof sr.wkid === "number" && Number.isFinite(sr.wkid) && sr.wkid > 0;
      const hasValidWkt =
        typeof sr.wkt === "string" && sr.wkt.trim().length > 0;

      if (!hasValidWkid && !hasValidWkt) {
        console.log(
          "Search widget: invalid spatial reference in stored coordinate"
        );
        layer.removeAll();
        return;
      }

      // Construct spatial reference first to validate before Point creation
      const spatialReference = new modulesCurrent.SpatialReference(
        hasValidWkid ? { wkid: sr.wkid } : { wkt: sr.wkt }
      );

      // Create point with validated data
      const point = new modulesCurrent.Point({
        x: pointData.x,
        y: pointData.y,
        spatialReference,
      });

      if (
        !point ||
        typeof point.x !== "number" ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        console.log(
          "Search widget: failed to construct valid Point from stored data"
        );
        layer.removeAll();
        return;
      }

      if (
        coordinateLayerRef.current === layer &&
        !isGraphicsLayerDestroyed(layer)
      ) {
        updateCoordinateGraphic(point);
      }
    } catch (error) {
      console.log("Search widget: failed to render stored coordinate", error);
      if (coordinateLayerRef.current === layer) {
        layer.removeAll();
      }
    }
  }, [
    cfg.enableCoordinateSearch,
    coordinateResult,
    modulesRef,
    updateCoordinateGraphic,
  ]);

  const clearCoordinateArtifacts = hooks.useEventCallback(() => {
    awaitingModulesRef.current = false;
    clearCoordinateResultState();
    coordinateLayerRef.current?.removeAll();
    setCoordinateLoading(false);
    lastCoordinateTermRef.current = "";
  });
  const triggerCoordinateSearch = hooks.useEventCallback((input: string) => {
    if (!input) return;
    if (!modulesRef.current) {
      awaitingModulesRef.current = true;
      setCoordinateLoading(true);
      return;
    }

    awaitingModulesRef.current = false;
    setCoordinateLoading(true);
    clearCoordinateResultState();
    void coordinateSearch.searchCoordinates(input).catch((error) => {
      if (
        error instanceof Error &&
        error.message === "coordinateSearchOutdated"
      ) {
        return;
      }
      if (error instanceof Error && error.message) return;
      console.log("Coordinate search error:", error);
    });
  });

  const handleInputChange = hooks.useEventCallback((term: string) => {
    const normalized = term ?? "";
    setLastSearchTerm(normalized);

    if (!cfg.enableCoordinateSearch) {
      setDetectionResult(null);
      if (isCoordinateInputRef.current) {
        setCoordinateInputFlag(false);
        clearCoordinateArtifacts();
      }
      return;
    }

    if (!normalized) {
      setDetectionResult(null);
      if (isCoordinateInputRef.current) {
        setCoordinateInputFlag(false);
        clearCoordinateArtifacts();
      }
      return;
    }

    const detection = isLikelyCoordinateInput(normalized);
    setDetectionResult(detection);

    const wasCoordinate = isCoordinateInputRef.current;
    const shouldUseCoordinates =
      detection.isCoordinate && detection.confidence !== "low";

    setCoordinateInputFlag(shouldUseCoordinates);

    if (shouldUseCoordinates) {
      if (!wasCoordinate) {
        clearResults();
        setSearching(false);
        setError(null);
      }

      if (lastCoordinateTermRef.current !== normalized) {
        lastCoordinateTermRef.current = normalized;
        triggerCoordinateSearch(normalized);
      }
    } else if (wasCoordinate) {
      clearCoordinateArtifacts();
    }
  });

  hooks.useUpdateEffect(() => {
    if (
      !cfg.enableCoordinateSearch ||
      !widgetState.isCoordinateInput ||
      !modules ||
      !awaitingModulesRef.current
    ) {
      return;
    }

    const term = lastCoordinateTermRef.current;
    if (!term) {
      awaitingModulesRef.current = false;
      return;
    }

    triggerCoordinateSearch(term);
  }, [
    modules,
    cfg.enableCoordinateSearch,
    widgetState.isCoordinateInput,
    triggerCoordinateSearch,
  ]);

  const searchWidgetRef = useSearchWidget({
    mapView,
    container: containerEl,
    modules,
    config: cfg,
    activeSourceIndex: widgetState.activeSourceIndex,
    lastSearchTerm: widgetState.lastSearchTerm,
    zoomScale: cfg.zoomScale,
    onInputChange: handleInputChange,
    onSearchStart: (term) => {
      if (isCoordinateInputRef.current) {
        setSearching(false);
        return;
      }
      setSearching(true);
      setLastSearchTerm(term);
      setError(null);
    },
    onSearchComplete: (completed) => {
      if (isCoordinateInputRef.current) {
        setSearching(false);
        return;
      }
      rawResultsRef.current = completed;
      const summaries = completed.map((item) => summarizeSearchResult(item));
      setResults(summaries);
      setSearching(false);
    },
    onResultSelect: (result) => {
      setLastSearchTerm(result.text || result.name);
    },
    onSearchClear: () => {
      clearResults();
    },
    onSearchError: () => {
      if (isCoordinateInputRef.current) {
        setSearching(false);
        return;
      }
      setError(translate("errorSearchFailed"));
    },
    onActiveSourceChange: (index) => {
      setActiveSource(index);
    },
  });

  const { activeSource, hasMultiple, changeHandler } = useSearchSourceSelector({
    sources: cfg.searchSources,
    activeIndex: widgetState.activeSourceIndex,
    onChange: (index) => {
      setActiveSource(index);
      if (searchWidgetRef.current) {
        searchWidgetRef.current.activeSourceIndex = index;
      }
      handleCloseSourceMenu();
    },
  });

  const isCoordinateActive =
    cfg.enableCoordinateSearch && widgetState.isCoordinateInput;

  const showLoading =
    !modules ||
    (isCoordinateActive ? coordinateLoading : widgetState.isSearching);

  const formatCoordinateValue = (value: number) =>
    new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const getProjectionLabel = (projection: Sweref99Projection | null) => {
    if (!projection) return translate("coordinateErrorNoProjection");
    const key = `crs_${projection.id.replace(/-/g, "_")}`;
    const label = translate(key);
    return label !== key ? label : projection.name;
  };

  const renderCoordinateValue = (labelKey: string, value: number) => (
    <div>
      <Label css={styles.coordinateLabel}>{translate(labelKey)}</Label>
      <Typography css={styles.coordinateValue}>
        {formatCoordinateValue(value)} m
      </Typography>
    </div>
  );

  const renderCoordinateBadge = () => {
    if (
      !cfg.enableCoordinateSearch ||
      !cfg.showCoordinateBadge ||
      !widgetState.isCoordinateInput ||
      !coordinateResult?.projectionId
    ) {
      return null;
    }

    const projection = resolveProjection(coordinateResult.projectionId);
    const projectionLabel = getProjectionLabel(projection);

    return (
      <div
        css={styles.coordinateBadge}
        role="status"
        aria-live="polite"
        aria-label={translate("coordinateDetected", {
          projection: projectionLabel,
        })}
      >
        <Typography>{projectionLabel}</Typography>
        {detectionResult?.confidence === "medium" && (
          <Typography>{translate("warningLowConfidence")}</Typography>
        )}
      </div>
    );
  };

  const renderCoordinateDetails = () => {
    if (!coordinateResult) return null;
    const projection = resolveProjection(coordinateResult.projectionId);
    const projectionLabel = getProjectionLabel(projection);
    return (
      <div css={styles.coordinateDetails} role="group">
        <div>
          <Label css={styles.coordinateLabel}>{translate("projection")}</Label>
          <Typography css={styles.coordinateValue}>
            {projectionLabel}
          </Typography>
        </div>
        {renderCoordinateValue("coordinateEasting", coordinateResult.easting)}
        {renderCoordinateValue("coordinateNorthing", coordinateResult.northing)}
        {coordinateResult.warnings?.map((warning, i) => (
          <div
            key={`${warning}-${i}`}
            css={styles.coordinateWarning}
            role="note"
          >
            <Typography>
              {translate(warning, { projection: projectionLabel })}
            </Typography>
          </div>
        ))}
      </div>
    );
  };

  const invokeGoToLocation = hooks.useEventCallback((index: number) => {
    const resultItems = rawResultsRef.current;

    if (!Array.isArray(resultItems) || resultItems.length === 0) {
      console.log("Search widget: no results available");
      return;
    }

    if (index < 0 || index >= resultItems.length) {
      console.log("Search widget: invalid result index", index);
      return;
    }

    const fullResult = resultItems[index];
    if (!fullResult) {
      console.log("Search widget: missing result at index", index);
      return;
    }

    const activeViewCandidate =
      mapView?.view ?? searchWidgetRef.current?.view ?? null;
    const goToView = isGoToCapableView(activeViewCandidate)
      ? activeViewCandidate
      : null;
    if (!goToView) {
      console.log("Search widget: map view not available for navigation");
      return;
    }

    const target = fullResult.extent ?? fullResult.location ?? null;
    if (!target) {
      console.log("Search widget: result lacks navigable geometry");
      return;
    }

    goToView.goTo(target).catch((error) => {
      console.log("Search widget: navigation failed", error);
    });
  });

  const renderResults = () => {
    if (isCoordinateActive) {
      if (coordinateLoading) {
        return (
          <div css={styles.coordinateLoading}>
            <Loading />
            <Typography>{translate("searching")}</Typography>
          </div>
        );
      }

      if (coordinateResult) {
        return renderCoordinateDetails();
      }

      return null;
    }

    if (!results.length) {
      const shouldShowEmptyState =
        widgetState.lastSearchTerm &&
        !widgetState.isSearching &&
        !widgetState.errorMessage;
      return shouldShowEmptyState ? (
        <Typography css={styles.resultStatus}>
          {translate("noResultsFound")}
        </Typography>
      ) : null;
    }
    return (
      <div css={styles.resultsList} role="list">
        {results.map((result, index) => (
          <Button
            key={`${result.sourceIndex}-${index}-${result.name}`}
            css={styles.resultItem}
            onClick={() => {
              invokeGoToLocation(index);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                invokeGoToLocation(index);
              }
            }}
            role="listitem"
            type="tertiary"
          >
            <Typography>{result.name || result.text}</Typography>
            <Typography>
              {translate("resultFromSource", {
                source:
                  cfg.searchSources[result.sourceIndex]?.name ??
                  activeSource?.name ??
                  "",
              })}
            </Typography>
          </Button>
        ))}
      </div>
    );
  };

  return (
    <div aria-live="polite">
      <div css={styles.container}>
        <div css={styles.controls}>
          <div css={styles.inputArea} data-loading={showLoading}>
            {showLoading && <Loading />}
            <div
              ref={handleContainerRef}
              aria-label={translate("searchPlaceholder")}
            />
          </div>
          <div css={styles.actions}>
            {hasMultiple && (
              <Dropdown
                isOpen={isSourceMenuOpen}
                toggle={handleToggleSourceMenu}
                css={styles.sourceSelector}
              >
                <DropdownButton aria-label={translate("selectSource")}>
                  <Typography>
                    {activeSource?.name ?? translate("selectSource")}
                  </Typography>
                  <SVG src={caretDown} />
                </DropdownButton>
                <DropdownMenu role="menu">
                  {cfg.searchSources.map((source, index) => (
                    <DropdownItem
                      key={source.id ?? `source-${index}`}
                      active={index === widgetState.activeSourceIndex}
                      onClick={() => {
                        changeHandler(index);
                      }}
                    >
                      {source.name}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
            )}
          </div>
        </div>
      </div>

      {renderCoordinateBadge()}

      {widgetState.errorMessage && (
        <Alert open withIcon type="error" text={widgetState.errorMessage} />
      )}
      {renderResults()}
      {moduleError && (
        <Alert
          open
          withIcon
          type="error"
          text={translate("errorSearchFailed")}
        />
      )}
      {cfg.useMapWidget && (
        <JimuMapViewComponent
          useMapWidgetId={cfg.useMapWidget}
          onActiveViewChange={handleActiveViewChange}
        />
      )}
    </div>
  );
};

export default Widget;
