/** @jsx jsx */
/** @jsxFrag React.Fragment */
import { hooks, jsx, React, ReactRedux } from "jimu-core";
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
  COORDINATE_GRAPHIC_SYMBOL,
  type CoordinateResultSummary,
  type CoordinateSearchResult,
  DEFAULT_COORDINATE_ZOOM_SCALE,
  DEFAULT_STYLE_VARIANT,
  type PointJSON,
  type SearchResult,
  type SearchResultSummary,
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
  useCoordinateLayerManager,
  useEsriSearchModules,
  useSearchSourceSelector,
  useSearchWidget,
} from "../shared/hooks";
import {
  type CoordinateDetectionResult,
  isLikelyCoordinateInput,
  isValidPointData,
  isValidSpatialReference,
  normalizeSearchConfig,
  summarizeSearchResult,
  toMutableValue,
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
): Sweref99Projection | null => {
  if (!projectionId) return null;
  return PROJECTION_BY_ID.get(projectionId) ?? null;
};

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

const Widget = (props: WidgetProps) => {
  const { id, useMapWidgetIds } = props;
  const translate = hooks.useTranslation(defaultMessages);
  const config = normalizeSearchConfig(props.config);
  const styles = useUiStyles(config.styleVariant ?? DEFAULT_STYLE_VARIANT);

  const mapWidgetId = Array.isArray(useMapWidgetIds)
    ? (useMapWidgetIds
        .find((v): v is string => typeof v === "string" && v.trim().length > 0)
        ?.trim() ?? null)
    : null;

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
  const results =
    toMutableValue<SearchResultSummary[]>(widgetState.results) ?? [];
  const coordinateResult = toMutableValue<CoordinateResultSummary>(
    widgetState.coordinateResult
  );

  const { modules, error: moduleError } = useEsriSearchModules();

  const handleActiveViewChange = hooks.useEventCallback((view: JimuMapView) => {
    setMapView(view);
  });
  hooks.useUpdateEffect(() => {
    if (!mapWidgetId) {
      setMapView(null);
    }
  }, [mapWidgetId]);
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

  const modulesRef = hooks.useLatest(modules);
  const isCoordinateInputRef = hooks.useLatest(widgetState.isCoordinateInput);
  const awaitingModulesRef = React.useRef(false);
  const lastCoordinateTermRef = React.useRef<string>("");
  const coordinateLayerId = `${id}-coordinate-layer`;
  const { updateGraphic: updateCoordinateGraphic, clearGraphics: clearCoordinateGraphics, goToPoint: goToCoordinate } =
    useCoordinateLayerManager({
      id: coordinateLayerId,
      modules,
      mapView,
      enabled: Boolean(config.enableCoordinateSearch),
      zoomScale: config.coordinateZoomScale,
      defaultZoomScale: DEFAULT_COORDINATE_ZOOM_SCALE,
      symbol: {
        style: COORDINATE_GRAPHIC_SYMBOL.STYLE,
        color: COORDINATE_GRAPHIC_SYMBOL.COLOR,
        size: COORDINATE_GRAPHIC_SYMBOL.SIZE,
        outlineColor: COORDINATE_GRAPHIC_SYMBOL.OUTLINE_COLOR,
        outlineWidth: COORDINATE_GRAPHIC_SYMBOL.OUTLINE_WIDTH,
      },
    });

  const coordinateSearch = useCoordinateSearch({
    modules,
    mapView,
    preference: config.preferredProjection,
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
      const message = translate(errorKey ?? "coordinateErrorGeneric");

      if (message === errorKey && errorKey !== "coordinateErrorGeneric") {
        console.log(`Missing translation for error key: ${errorKey}`);
      }

      setError(message || translate("coordinateErrorGeneric"));
      clearCoordinateResultState();
      clearCoordinateGraphics();
    },
  });

  hooks.useUpdateEffect(() => {
    if (!config.enableCoordinateSearch) return;
    if (!widgetState.isCoordinateInput) return;
    const summary = coordinateResult;
    const modulesCurrent = modulesRef.current;
    if (
      !summary ||
      !summary.mapPoint ||
      !modulesCurrent?.Point ||
      !modulesCurrent?.SpatialReference
    ) {
      clearCoordinateGraphics();
      return;
    }

    try {
      const pointData = summary.mapPoint;

      if (!isValidPointData(pointData)) {
        console.log("Search widget: invalid stored coordinate data");
        clearCoordinateGraphics();
        return;
      }

      const sr = pointData.spatialReference;
      if (!isValidSpatialReference(sr)) {
        console.log(
          "Search widget: invalid spatial reference in stored coordinate"
        );
        clearCoordinateGraphics();
        return;
      }

      const spatialReference = new modulesCurrent.SpatialReference(
        typeof sr.wkid === "number" ? { wkid: sr.wkid } : { wkt: sr.wkt }
      );

      const point = new modulesCurrent.Point({
        x: pointData.x,
        y: pointData.y,
        spatialReference,
      });

      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        console.log(
          "Search widget: failed to construct valid Point from stored data"
        );
        clearCoordinateGraphics();
        return;
      }

      updateCoordinateGraphic(point);
    } catch (error) {
      console.log("Search widget: failed to render stored coordinate", error);
      clearCoordinateGraphics();
    }
  }, [
    config.enableCoordinateSearch,
    coordinateResult,
    clearCoordinateGraphics,
    modulesRef,
    updateCoordinateGraphic,
  ]);

  const clearCoordinateArtifacts = hooks.useEventCallback(() => {
    awaitingModulesRef.current = false;
    clearCoordinateResultState();
    clearCoordinateGraphics();
    setCoordinateLoading(false);
    lastCoordinateTermRef.current = "";
  });
  const exitCoordinateMode = hooks.useEventCallback(() => {
    if (isCoordinateInputRef.current) {
      setCoordinateInputFlag(false);
    }
    clearCoordinateArtifacts();
  });
  const enterCoordinateMode = hooks.useEventCallback(() => {
    const wasCoordinate = isCoordinateInputRef.current;
    if (!wasCoordinate) {
      clearResults();
      setSearching(false);
      setError(null);
    }
    setCoordinateInputFlag(true);
  });
  const resetCoordinateDetection = hooks.useEventCallback(() => {
    setDetectionResult(null);
    exitCoordinateMode();
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

    if (!config.enableCoordinateSearch || !normalized) {
      resetCoordinateDetection();
      return;
    }

    const detection = isLikelyCoordinateInput(normalized);
    setDetectionResult(detection);

    const shouldUseCoordinates =
      detection.isCoordinate && detection.confidence !== "low";

    if (!shouldUseCoordinates) {
      exitCoordinateMode();
      return;
    }

    enterCoordinateMode();

    if (lastCoordinateTermRef.current === normalized) {
      return;
    }

    lastCoordinateTermRef.current = normalized;
    triggerCoordinateSearch(normalized);
  });

  hooks.useUpdateEffect(() => {
    if (
      !config.enableCoordinateSearch ||
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
    config.enableCoordinateSearch,
    widgetState.isCoordinateInput,
    triggerCoordinateSearch,
  ]);

  const searchWidgetRef = useSearchWidget({
    mapView,
    container: containerEl,
    modules,
    config,
    activeSourceIndex: widgetState.activeSourceIndex,
    lastSearchTerm: widgetState.lastSearchTerm,
    zoomScale: config.zoomScale,
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
    sources: config.searchSources,
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
    config.enableCoordinateSearch && widgetState.isCoordinateInput;

  const showLoading =
    !modules ||
    (isCoordinateActive ? coordinateLoading : widgetState.isSearching);

  const formatCoordinateValue = (value: number) =>
    new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const getProjectionDisplayLabel = (
    projection: Sweref99Projection | null
  ): string => {
    if (!projection) return translate("coordinateErrorNoProjection");
    const key = `crs_${projection.id.replace(/-/g, "_")}`;
    const label = translate(key);
    return label !== key ? label : projection.name;
  };

  const renderCoordinateLabeledValue = (labelKey: string, value: number) => (
    <div>
      <Label css={styles.coordinateLabel}>{translate(labelKey)}</Label>
      <Typography css={styles.coordinateValue}>
        {formatCoordinateValue(value)} m
      </Typography>
    </div>
  );

  const renderCoordinateBadge = () => {
    if (
      !config.enableCoordinateSearch ||
      !config.showCoordinateBadge ||
      !widgetState.isCoordinateInput ||
      !coordinateResult?.projectionId
    ) {
      return null;
    }

    const projection = resolveProjection(coordinateResult.projectionId);
    const projectionLabel = getProjectionDisplayLabel(projection);

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
    const projectionLabel = getProjectionDisplayLabel(projection);
    return (
      <div css={styles.coordinateDetails} role="group">
        <div>
          <Label css={styles.coordinateLabel}>{translate("projection")}</Label>
          <Typography css={styles.coordinateValue}>
            {projectionLabel}
          </Typography>
        </div>
        {renderCoordinateLabeledValue(
          "coordinateEasting",
          coordinateResult.easting
        )}
        {renderCoordinateLabeledValue(
          "coordinateNorthing",
          coordinateResult.northing
        )}
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

  const renderCoordinateResults = () => {
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
  };

  const renderResults = () => {
    if (isCoordinateActive) {
      return renderCoordinateResults();
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
                  config.searchSources[result.sourceIndex]?.name ??
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
                  {config.searchSources.map((source, index) => (
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
      {mapWidgetId && (
        <JimuMapViewComponent
          useMapWidgetId={mapWidgetId}
          onActiveViewChange={handleActiveViewChange}
        />
      )}
    </div>
  );
};

export default Widget;
