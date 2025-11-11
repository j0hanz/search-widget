import { hooks, React } from "jimu-core";
import type { JimuMapView } from "jimu-arcgis";
import { DEFAULT_COORDINATE_PREFERENCE } from "../config/constants";
import { CoordinateInputFormat } from "../config/enums";
import type {
  CoordinateSearchOptions,
  CoordinateSearchResult,
  CoordinateGraphicSymbolConfig,
  CoordinateLayerManagerHandlers,
  CoordinateLayerManagerOptions,
  CoordinateTransformOptions,
  EsriSearchModules,
  LayerSearchSourceConfig,
  Maybe,
  ProjectionDetectionResult,
  ProjectionDetectorOptions,
  SearchResult,
  SearchSourceConfig,
  SearchWidgetHandle,
  Sweref99Projection,
  TimeoutHandle,
  UseSearchWidgetParams,
} from "../config/types";
import {
  createLayerSource,
  createLocatorSource,
  detectProjection as detectSwerefProjection,
  destroyWidget,
  formatSearchResult,
  isExtentGeometry,
  isGraphicsLayerDestroyed,
  isLayerSource,
  isLocatorSource,
  isValidFeatureLayer,
  loadArcgisSearchModules,
  parseCoordinateString,
  sanitizeCoordinateInput,
  sanitizeSearchTerm,
  transformSweref99ToMap,
  validateCoordinates,
} from "./utils";

interface DebouncedCoordinateSearch {
  (input: string): Promise<CoordinateSearchResult>;
  cancel?: () => void;
}

const clampToValidIndex = (index: number, arrayLength: number): number =>
  arrayLength === 0 ? -1 : Math.min(Math.max(0, index), arrayLength - 1);

export const useEsriSearchModules = () => {
  const [modules, setModules] = React.useState<EsriSearchModules | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const makeCancelable = hooks.useCancelablePromiseMaker();

  hooks.useEffectOnce(() => {
    makeCancelable(loadArcgisSearchModules())
      .then(setModules)
      .catch((err) => {
        if (err?.name !== "AbortError") setError(err as Error);
      });
  });

  return { modules, error };
};

const MIN_SCALE = 1;
const MAX_SCALE = 1_000_000_000;
const LAYER_LOAD_TIMEOUT_MS = 10_000;

interface SearchStartEventData {
  searchTerm?: string | null;
}

interface SearchCompleteGroupData {
  sourceIndex?: number;
  results?: __esri.SearchResult[] | null;
}

interface SearchCompleteEventData {
  results?: SearchCompleteGroupData[] | null;
}

interface SearchSelectEventData {
  result?: (__esri.SearchResult & { sourceIndex?: number }) | null;
}

interface SearchErrorEventData {
  error?: unknown;
}

type SearchStartEvent = SearchStartEventData | null | undefined;
type SearchCompleteEvent = SearchCompleteEventData | null | undefined;
type SearchSelectEvent = SearchSelectEventData | null | undefined;
type SearchErrorEvent = SearchErrorEventData | null | undefined;

const loadFeatureLayer = async (
  layer: __esri.FeatureLayer
): Promise<boolean> => {
  if (!layer?.when) return false;

  try {
    await Promise.race([
      layer.when(),
      new Promise((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error("Layer load timeout"));
        }, LAYER_LOAD_TIMEOUT_MS);
      }),
    ]);
    return isValidFeatureLayer(layer);
  } catch (error) {
    console.log("Search widget: layer load failed", error);
    return false;
  }
};

const createFeatureLayerFromConfig = (
  modules: EsriSearchModules,
  source: LayerSearchSourceConfig
): __esri.FeatureLayer | null => {
  try {
    return new modules.FeatureLayer({
      id: source.layerId || undefined,
      url: source.url,
      outFields: ["*"],
    });
  } catch (error) {
    console.log(
      "Search widget: failed to instantiate FeatureLayer",
      source.layerId || source.url,
      error
    );
    return null;
  }
};

const buildSources = async (params: {
  configSources: SearchSourceConfig[];
  modules: EsriSearchModules;
  mapView: JimuMapView | null;
}): Promise<__esri.SearchSource[]> => {
  const { configSources, modules, mapView } = params;
  if (!configSources?.length) return [];

  const list: __esri.SearchSource[] = [];
  const view = mapView?.view;

  for (const source of configSources) {
    if (isLocatorSource(source)) {
      list.push(createLocatorSource(modules, source));
      continue;
    }

    if (!isLayerSource(source)) continue;

    // Try to find existing layer first
    let layer = view?.map?.findLayerById(source.layerId) as
      | __esri.FeatureLayer
      | undefined;

    // Create new layer if not found
    if (!layer) {
      layer = createFeatureLayerFromConfig(modules, source);
      if (!layer) continue;
    }

    // Ensure layer is loaded and valid
    const isLoaded = await loadFeatureLayer(layer);
    if (!isLoaded) {
      console.log(
        "Search widget: layer failed to load or invalid",
        source.layerId || source.url
      );
      continue;
    }

    try {
      list.push(createLayerSource(modules, layer, source));
    } catch (error) {
      console.log(
        "Search widget: failed to create layer source",
        source.layerId || source.url,
        error
      );
    }
  }

  return list;
};

export const useSearchWidget = (
  params: UseSearchWidgetParams
): React.MutableRefObject<SearchWidgetHandle | null> => {
  const {
    mapView,
    container,
    modules,
    config,
    activeSourceIndex,
    lastSearchTerm,
    zoomScale,
    onSearchStart,
    onSearchComplete,
    onResultSelect,
    onSearchClear,
    onSearchError,
    onActiveSourceChange,
    onInputChange,
  } = params;

  const widgetRef = React.useRef<SearchWidgetHandle | null>(null);
  const handlesRef = React.useRef<__esri.Handle[]>([]);
  const applySequenceRef = React.useRef(0);

  const mapViewRef = hooks.useLatest(mapView);
  const modulesRef = hooks.useLatest(modules);
  const configRef = hooks.useLatest(config);
  const activeIndexRef = hooks.useLatest(activeSourceIndex);
  const lastTermRef = hooks.useLatest(lastSearchTerm);
  const zoomScaleRef = hooks.useLatest(zoomScale);
  const startRef = hooks.useLatest(onSearchStart);
  const completeRef = hooks.useLatest(onSearchComplete);
  const selectRef = hooks.useLatest(onResultSelect);
  const clearRef = hooks.useLatest(onSearchClear);
  const errorRef = hooks.useLatest(onSearchError);
  const activeSourceChangeRef = hooks.useLatest(onActiveSourceChange);
  const inputChangeRef = hooks.useLatest(onInputChange);
  const lastSearchNotificationRef = React.useRef<string>(
    sanitizeSearchTerm(lastSearchTerm ?? "")
  );
  const lastActiveSourceBroadcastRef = React.useRef<number | null>(
    activeSourceIndex
  );

  const resetHandles = hooks.useEventCallback(() => {
    handlesRef.current.forEach((handle) => {
      handle.remove();
    });
    handlesRef.current = [];
  });

  const addReactiveWatchers = hooks.useEventCallback(
    (searchWidget: SearchWidgetHandle) => {
      const modulesCurrent = modulesRef.current;
      if (!modulesCurrent?.reactiveUtils || !searchWidget?.viewModel) return [];

      const watchers: __esri.Handle[] = [];
      const viewModel = searchWidget.viewModel;

      watchers.push(
        modulesCurrent.reactiveUtils.watch(
          () => viewModel.activeSourceIndex,
          (index: number) => {
            const sourcesLength = searchWidget.sources?.length ?? 0;
            const normalized = clampToValidIndex(
              typeof index === "number" ? index : 0,
              sourcesLength
            );

            if (normalized < 0) return;

            if (normalized === lastActiveSourceBroadcastRef.current) return;

            const currentFromState = clampToValidIndex(
              activeIndexRef.current ?? 0,
              sourcesLength
            );

            if (normalized === currentFromState) {
              lastActiveSourceBroadcastRef.current = normalized;
              return;
            }

            lastActiveSourceBroadcastRef.current = normalized;
            activeSourceChangeRef.current?.(normalized);
          }
        )
      );

      watchers.push(
        modulesCurrent.reactiveUtils.watch(
          () => viewModel.searchTerm,
          (term: string) => {
            const sanitized = sanitizeSearchTerm(term ?? "");
            if (sanitized === lastSearchNotificationRef.current) return;
            lastSearchNotificationRef.current = sanitized;
            inputChangeRef.current?.(sanitized);
          }
        )
      );

      return watchers;
    }
  );

  const attachHandles = hooks.useEventCallback(
    (searchWidget: SearchWidgetHandle) => {
      resetHandles();
      const handles: __esri.Handle[] = [
        searchWidget.on("search-start", (event) => {
          const startEvent = event as SearchStartEvent;
          const sanitized = sanitizeSearchTerm(startEvent?.searchTerm ?? "");
          lastSearchNotificationRef.current = sanitized;
          startRef.current?.(sanitized);
        }),
        searchWidget.on("search-complete", (event) => {
          const completeEvent = event as SearchCompleteEvent;
          const resultGroups = completeEvent?.results ?? [];
          const results = resultGroups.flatMap(
            (group, groupIndex): SearchResult[] => {
              const safeGroup = group ?? {};
              const sourceIndex =
                typeof safeGroup.sourceIndex === "number"
                  ? safeGroup.sourceIndex
                  : groupIndex;
              const groupResults = safeGroup.results ?? [];
              return groupResults.map((res) =>
                formatSearchResult(res, sourceIndex)
              );
            }
          );
          completeRef.current?.(results);
        }),
        searchWidget.on("select-result", (event) => {
          const selectEvent = event as SearchSelectEvent;
          const result = selectEvent?.result;
          if (result) {
            const formatted = formatSearchResult(
              result,
              result?.sourceIndex ?? 0
            );
            selectRef.current?.(formatted);
          }
        }),
        searchWidget.on("search-clear", () => {
          lastSearchNotificationRef.current = "";
          inputChangeRef.current?.("");
          clearRef.current?.();
        }),
        searchWidget.on("search-error", (event) => {
          const errorEvent = event as SearchErrorEvent;
          if (errorEvent?.error instanceof Error) {
            errorRef.current?.(errorEvent.error);
          }
        }),
      ];

      const reactiveHandles = addReactiveWatchers(searchWidget);
      if (reactiveHandles.length) handles.push(...reactiveHandles);
      handlesRef.current = handles;
    }
  );

  const applyConfigToWidget = hooks.useEventCallback(
    async (
      searchWidget: SearchWidgetHandle,
      currentModules: EsriSearchModules | null
    ) => {
      if (!currentModules) {
        return;
      }
      const currentSequence = ++applySequenceRef.current;
      const latestConfig = configRef.current;
      const sources = await buildSources({
        configSources: latestConfig.searchSources,
        modules: currentModules,
        mapView: mapViewRef.current ?? null,
      });
      if (currentSequence !== applySequenceRef.current) return;

      // Handle empty sources array safely - only set activeSourceIndex if we have sources
      const clampedIndex =
        sources.length > 0
          ? clampToValidIndex(activeIndexRef.current ?? 0, sources.length)
          : -1;

      const widgetConfig: { [key: string]: unknown } = {
        includeDefaultSources: false,
        sources,
        maxSuggestions: latestConfig.maxSuggestions,
        searchAllEnabled: false,
        autoSelect: false,
        popupEnabled: true,
        locationEnabled: false,
        placeholder: latestConfig.placeholder,
        searchTerm:
          latestConfig.persistLastSearch && lastTermRef.current
            ? lastTermRef.current
            : latestConfig.persistLastSearch
              ? searchWidget.searchTerm
              : "",
        view: mapViewRef.current?.view ?? searchWidget.view,
      };

      // Only set activeSourceIndex if we have valid sources
      if (sources.length > 0 && clampedIndex >= 0) {
        widgetConfig.activeSourceIndex = clampedIndex;
      }

      Object.assign(
        searchWidget as unknown as { [key: string]: unknown },
        widgetConfig
      );
    }
  );

  hooks.useUpdateEffect((): void | (() => void) => {
    if (!modulesRef.current || !container) {
      destroyWidget(widgetRef.current);
      widgetRef.current = null;
      return;
    }

    const widget = new modulesRef.current.Search({
      container,
      popupEnabled: true,
      popupOpenOnSelect: true,
      maxSuggestions: configRef.current.maxSuggestions,
      locationEnabled: false,
      placeholder: configRef.current.placeholder,
    } as __esri.SearchProperties) as SearchWidgetHandle;

    Object.assign(widget, {
      includeDefaultSources: false,
      searchAllEnabled: false,
      autoSelect: false,
    });
    if (widget.viewModel) {
      const viewModel = widget.viewModel;
      type GoToOverrideHandler = NonNullable<
        __esri.SearchViewModel["goToOverride"]
      >;
      const goToOverride: GoToOverrideHandler = (viewCandidate, goToParams) => {
        const target = goToParams?.target ?? null;
        const activeView = viewCandidate ?? mapViewRef.current?.view ?? null;
        if (!activeView || !target) {
          return Promise.resolve();
        }

        const goToView = activeView;
        if (typeof goToView?.goTo !== "function") {
          return Promise.resolve();
        }

        const goToOptions = { animate: true, duration: 800 };
        const rawScale = zoomScaleRef.current ?? 0;

        const desiredScale =
          Number.isFinite(rawScale) &&
          rawScale >= MIN_SCALE &&
          rawScale <= MAX_SCALE
            ? rawScale
            : null;

        if (desiredScale !== null && desiredScale > 0) {
          return goToView
            .goTo({ target, scale: desiredScale }, goToOptions)
            .catch(() => undefined);
        }

        if (isExtentGeometry(target) && typeof target.expand === "function") {
          try {
            const expanded = target.expand(1.2);
            return goToView.goTo(expanded, goToOptions).catch(() => undefined);
          } catch {
            // Ignore expansion errors and fall back to default goTo
          }
        }

        return goToView.goTo(target, goToOptions).catch(() => undefined);
      };
      viewModel.goToOverride = goToOverride;
    }
    widgetRef.current = widget;
    attachHandles(widget);

    let cancelled = false;
    const applyConfig = async () => {
      try {
        await applyConfigToWidget(widget, modulesRef.current);
      } catch (error) {
        if (!cancelled) {
          console.log("Failed to apply widget config:", error);
        }
      }
    };
    void applyConfig();

    return () => {
      cancelled = true;
      resetHandles();
      destroyWidget(widget);
      widgetRef.current = null;
    };
  }, [modules, container, mapView]);

  hooks.useUpdateEffect(() => {
    if (widgetRef.current && modulesRef.current) {
      void applyConfigToWidget(widgetRef.current, modulesRef.current);
    }
  }, [
    config.searchSources,
    config.maxSuggestions,
    config.placeholder,
    config.persistLastSearch,
    config.zoomScale,
  ]);

  hooks.useUpdateEffect(() => {
    if (widgetRef.current) {
      const sourcesLength = widgetRef.current.sources?.length ?? 0;
      const clampedIndex = clampToValidIndex(activeSourceIndex, sourcesLength);
      widgetRef.current.activeSourceIndex = Math.max(0, clampedIndex);
    }
    lastActiveSourceBroadcastRef.current = activeSourceIndex;
  }, [activeSourceIndex]);

  hooks.useUnmount(() => {
    resetHandles();
    destroyWidget(widgetRef.current);
    widgetRef.current = null;
  });

  return widgetRef;
};

export const useSearchSourceSelector = (params: {
  sources: SearchSourceConfig[];
  activeIndex: number;
  onChange: (index: number) => void;
}) => {
  const { sources, activeIndex, onChange } = params;
  const changeHandler = hooks.useEventCallback((index: number) => {
    if (index >= 0 && index < sources.length) onChange(index);
  });
  return {
    activeSource: sources[activeIndex] ?? null,
    hasMultiple: sources.length > 1,
    changeHandler,
  };
};

const createMarkerSymbol = (
  modules: EsriSearchModules,
  symbolConfig: CoordinateGraphicSymbolConfig
) =>
  new modules.SimpleMarkerSymbol({
    style: symbolConfig.style,
    color: symbolConfig.color,
    size: symbolConfig.size,
    outline: {
      color: symbolConfig.outlineColor,
      width: symbolConfig.outlineWidth,
    },
  });

export const useCoordinateLayerManager = (
  options: CoordinateLayerManagerOptions
): CoordinateLayerManagerHandlers => {
  const {
    id,
    modules,
    mapView,
    enabled,
    zoomScale,
    defaultZoomScale,
    symbol,
  } = options;

  const modulesRef = hooks.useLatest(modules);
  const mapViewRef = hooks.useLatest(mapView);
  const zoomScaleRef = hooks.useLatest(
    typeof zoomScale === "number" && Number.isFinite(zoomScale)
      ? zoomScale
      : null
  );
  const defaultZoomScaleRef = hooks.useLatest(defaultZoomScale);
  const layerRef = React.useRef<__esri.GraphicsLayer | null>(null);
  const viewRef = React.useRef<__esri.View | null>(null);

  const removeLayer = hooks.useEventCallback(
    (
      targetLayer: Maybe<__esri.GraphicsLayer>,
      targetView: Maybe<__esri.View>
    ) => {
      if (!targetLayer || !targetView?.map) return;
      const located = targetView.map.findLayerById(targetLayer.id);
      if (located === targetLayer) {
        targetView.map.remove(targetLayer);
      }
    }
  );

  hooks.useUpdateEffect((): void | (() => void) => {
    const view = mapView?.view ?? null;
    const currentModules = modulesRef.current;
    const existingLayer = layerRef.current;
    const existingView = viewRef.current;

    if (!enabled) {
      removeLayer(existingLayer, existingView);
      if (layerRef.current === existingLayer) layerRef.current = null;
      if (viewRef.current === existingView) viewRef.current = null;
      return;
    }

    if (!view || !currentModules) {
      return;
    }

    let layer = view.map?.findLayerById(id) as __esri.GraphicsLayer | undefined;

    if (!layer) {
      try {
        layer = new currentModules.GraphicsLayer({
          id,
          listMode: "hide",
        });
        view.map?.add(layer);
      } catch (error) {
        console.log(
          "Search widget: failed to initialize coordinate graphics layer",
          error
        );
        return;
      }
    }

    layerRef.current = layer ?? null;
    viewRef.current = view;

    return () => {
      if (layer && view) {
        removeLayer(layer, view);
      }
      if (layerRef.current === layer) {
        layerRef.current = null;
      }
      if (viewRef.current === view) {
        viewRef.current = null;
      }
    };
  }, [enabled, mapView, modules, id, removeLayer]);

  const clearGraphics = hooks.useEventCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (isGraphicsLayerDestroyed(layer)) {
      layerRef.current = null;
      return;
    }

    try {
      layer.removeAll();
    } catch (error) {
      console.log(
        "Search widget: failed to clear coordinate graphics",
        error
      );
      if (layerRef.current === layer) {
        layerRef.current = null;
      }
    }
  });

  const updateGraphic = hooks.useEventCallback((point: __esri.Point) => {
    const layer = layerRef.current;
    const currentModules = modulesRef.current;

    if (!layer || !currentModules) return;
    if (isGraphicsLayerDestroyed(layer)) {
      layerRef.current = null;
      return;
    }

    try {
      layer.removeAll();
      const symbolInstance = createMarkerSymbol(currentModules, symbol);
      const graphic = new currentModules.Graphic({
        geometry: point,
        symbol: symbolInstance,
      });
      layer.add(graphic);
    } catch (error) {
      console.log(
        "Search widget: failed to update coordinate graphic",
        error
      );
      if (layerRef.current === layer) {
        layerRef.current = null;
      }
    }
  });

  const goToPoint = hooks.useEventCallback((point: __esri.Point) => {
    const viewCandidate =
      (viewRef.current ?? mapViewRef.current?.view ?? null) as Maybe<
        __esri.MapView | __esri.SceneView
      >;
    if (!viewCandidate || typeof viewCandidate.goTo !== "function") {
      return;
    }

    const desiredScale =
      zoomScaleRef.current ?? defaultZoomScaleRef.current ?? null;

    if (
      desiredScale === null ||
      !Number.isFinite(desiredScale) ||
      desiredScale <= 0
    ) {
      return;
    }

    viewCandidate
      .goTo({ target: point, scale: desiredScale }, { animate: true })
      .catch(() => undefined);
  });

  hooks.useUnmount(() => {
    removeLayer(layerRef.current, viewRef.current);
    layerRef.current = null;
    viewRef.current = null;
  });

  return { updateGraphic, clearGraphics, goToPoint };
};

export const useDebounce = <T>(value: T, delay: number): T => {
  const [debounced, setDebounced] = React.useState(value);
  const timerRef = React.useRef<TimeoutHandle | null>(null);
  const valueRef = hooks.useLatest(value);
  const delayRef = hooks.useLatest(delay);

  const clearTimer = hooks.useEventCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  });

  hooks.useEffectOnce(() => clearTimer);

  hooks.useUpdateEffect(() => {
    clearTimer();
    timerRef.current = setTimeout(
      () => {
        setDebounced(valueRef.current);
      },
      Math.max(0, delayRef.current ?? delay)
    );
  }, [value, delay]);

  return debounced;
};

export const useCoordinateParser = () => {
  const sanitize = hooks.useEventCallback((value: string) =>
    sanitizeCoordinateInput(value ?? "")
  );

  const parseCoordinates = hooks.useEventCallback((value: string) => {
    const sanitized = sanitize(value);
    const result = parseCoordinateString(sanitized);
    return result.success ? { ...result, sanitized } : result;
  });

  return { sanitizeInput: sanitize, parseCoordinates };
};

export const useProjectionDetector = (options: ProjectionDetectorOptions) => {
  const mapViewRef = hooks.useLatest(options.mapView ?? null);
  const preferenceRef = hooks.useLatest(
    options.preference ?? DEFAULT_COORDINATE_PREFERENCE
  );

  const detect = hooks.useEventCallback(
    (easting: number, northing: number): ProjectionDetectionResult =>
      detectSwerefProjection({
        easting,
        northing,
        mapCenter: mapViewRef.current?.view?.center ?? null,
        preference: preferenceRef.current,
      })
  );

  return { detectProjection: detect };
};

export const useCoordinateTransform = (options: CoordinateTransformOptions) => {
  const modulesRef = hooks.useLatest(options.modules);
  const mapViewRef = hooks.useLatest(options.mapView);

  const transform = hooks.useEventCallback(
    async (params: {
      easting: number;
      northing: number;
      projection: Sweref99Projection;
    }): Promise<__esri.Point> => {
      const modules = modulesRef.current;
      const mapView = mapViewRef.current?.view ?? null;
      if (!modules) throw new Error("coordinateErrorMissingModules");
      if (!mapView) throw new Error("coordinateErrorNoMapView");
      const point = await transformSweref99ToMap({
        easting: params.easting,
        northing: params.northing,
        projection: params.projection,
        modules,
        spatialReference: mapView.spatialReference ?? null,
      });
      if (!point) throw new Error("coordinateErrorTransform");
      return point;
    }
  );

  return { transform };
};

export const useCoordinateSearch = (options: CoordinateSearchOptions) => {
  const parser = useCoordinateParser();
  const detector = useProjectionDetector({
    mapView: options.mapView,
    preference: options.preference,
  });
  const transformer = useCoordinateTransform({
    modules: options.modules,
    mapView: options.mapView,
  });

  const sequenceRef = React.useRef(0);
  const successRef = hooks.useLatest(options.onSuccess);
  const errorRef = hooks.useLatest(options.onError);
  const modulesRef = hooks.useLatest(options.modules);
  const debouncedSearchRef = React.useRef<DebouncedCoordinateSearch | null>(
    null
  );

  const teardownDebounce = hooks.useEventCallback(() => {
    const debounced = debouncedSearchRef.current;
    if (debounced?.cancel) {
      try {
        debounced.cancel();
      } catch (error) {
        // Only ignore expected cancellation errors
        if (
          error instanceof Error &&
          !error.message.includes("abort") &&
          !error.message.includes("cancel")
        ) {
          console.log("Unexpected debounce cancellation error:", error);
        }
      }
    }
    debouncedSearchRef.current = null;
  });

  const searchCoordinatesInternal = hooks.useEventCallback(
    async (input: string): Promise<CoordinateSearchResult> => {
      const sequence = ++sequenceRef.current;
      let errorHandled = false;

      const ensureCurrent = () => {
        if (sequence !== sequenceRef.current) {
          throw new Error("coordinateSearchOutdated");
        }
      };

      const failWith = (errorKey: string): never => {
        ensureCurrent();
        errorHandled = true;
        errorRef.current?.(errorKey);
        throw new Error(errorKey);
      };

      try {
        const parseResult = parser.parseCoordinates(input);
        ensureCurrent();

        if (
          !parseResult.success ||
          parseResult.easting === undefined ||
          parseResult.northing === undefined
        ) {
          const errorKey = parseResult.error ?? "coordinateErrorParse";
          return failWith(errorKey);
        }

        // Collect warnings from parsing
        const parseWarnings = parseResult.warning ? [parseResult.warning] : [];

        const detection = detector.detectProjection(
          parseResult.easting,
          parseResult.northing
        );
        ensureCurrent();

        if (!detection.projection) {
          return failWith("coordinateErrorNoProjection");
        }

        const validation = validateCoordinates({
          easting: parseResult.easting,
          northing: parseResult.northing,
          projection: detection.projection,
        });
        ensureCurrent();

        if (!validation.valid) {
          const errorKey = validation.errors[0] ?? "coordinateErrorOutOfBounds";
          return failWith(errorKey);
        }

        const point = await transformer.transform({
          easting: parseResult.easting,
          northing: parseResult.northing,
          projection: detection.projection,
        });
        ensureCurrent();

        // Combine all warnings, ensuring uniqueness
        const combinedWarnings = Array.from(
          new Set([
            ...parseWarnings,
            ...(detection.warnings ?? []),
            ...validation.warnings,
          ])
        );

        const result: CoordinateSearchResult = {
          point,
          projection: detection.projection,
          easting: parseResult.easting,
          northing: parseResult.northing,
          validation,
          format: parseResult.format ?? CoordinateInputFormat.Unknown,
          confidence: detection.confidence,
          alternatives: detection.alternatives,
          warnings: combinedWarnings,
        };

        // CRITICAL: Check sequence immediately before callback with NO intervening operations
        if (sequence !== sequenceRef.current) {
          throw new Error("coordinateSearchOutdated");
        }
        successRef.current?.(result);
        return result;
      } catch (error) {
        // Check if this is an outdated search before calling error callback
        if (
          error instanceof Error &&
          error.message === "coordinateSearchOutdated"
        ) {
          throw error;
        }

        const message =
          error instanceof Error && error.message
            ? error.message
            : "coordinateErrorGeneric";

        // Only call error callback if this search is still current and not already handled
        if (!errorHandled && sequence === sequenceRef.current) {
          errorRef.current?.(message);
        }

        throw new Error(message);
      }
    }
  );

  hooks.useUpdateEffect(() => {
    teardownDebounce();
    const modulesCurrent = modulesRef.current;
    if (modulesCurrent?.promiseUtils?.debounce) {
      debouncedSearchRef.current = modulesCurrent.promiseUtils.debounce(
        (value: string) => searchCoordinatesInternal(value)
      ) as DebouncedCoordinateSearch;
    }

    return () => {
      teardownDebounce();
    };
  }, [options.modules]);

  hooks.useUnmount(teardownDebounce);

  const searchCoordinates = hooks.useEventCallback(
    (input: string): Promise<CoordinateSearchResult> => {
      const debounced = debouncedSearchRef.current;
      if (debounced) {
        return debounced(input);
      }
      return searchCoordinatesInternal(input);
    }
  );

  return { searchCoordinates, sanitizeInput: parser.sanitizeInput };
};
