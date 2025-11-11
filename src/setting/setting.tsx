/** @jsx jsx */
/** @jsxFrag React.Fragment */
import { hooks, jsx, React } from "jimu-core";
import {
  MapWidgetSelector,
  SettingRow,
  SettingSection,
} from "jimu-ui/advanced/setting-components";
import {
  Alert,
  Button,
  NumericInput,
  Option,
  Select,
  Switch,
  TextInput,
} from "jimu-ui";
import SeamlessImmutable from "seamless-immutable";
import {
  DEFAULT_COORDINATE_PREFERENCE,
  DEFAULT_COORDINATE_ZOOM_SCALE,
  DEFAULT_MAX_SUGGESTIONS,
  DEFAULT_PLACEHOLDER,
  DEFAULT_STYLE_VARIANT,
  DEFAULT_ZOOM_SCALE,
  MIN_SEARCH_LENGTH,
} from "../config/constants";
import {
  CoordinateProjectionPreference,
  SearchSourceType,
} from "../config/enums";
import { useSettingStyles } from "../config/style";
import type {
  EditableSearchSource,
  IMSearchConfig,
  LayerSearchSourceConfig,
  LocatorSearchSourceConfig,
  SearchConfig,
  SearchSourceConfig,
  SettingProps,
} from "../config/types";
import {
  parseArrayField,
  parsePositiveInt,
  parsePositiveNumber,
  sanitizeNonEmptyText,
  sanitizeText,
  sanitizeUrlInput,
  toPlainString,
  validateSearchSource,
} from "../shared/utils";
import StyleVariantSelector from "./component/selector";
import defaultMessages from "./translations/default";

const normalizeSource = (source: SearchSourceConfig): EditableSearchSource => {
  if (source.type === SearchSourceType.Layer) {
    return {
      ...source,
      searchFields: [...(source.searchFields ?? [])],
      resultSymbol: source.resultSymbol
        ? { ...source.resultSymbol }
        : undefined,
      searchFieldsText: (source.searchFields ?? []).join(", "),
    };
  }

  return {
    ...source,
    categories: source.categories ? [...source.categories] : [],
    outFields: source.outFields ? [...source.outFields] : undefined,
  };
};

const toSearchConfig = (config: IMSearchConfig | undefined): SearchConfig => {
  const mutable = config?.asMutable({ deep: true });
  return {
    placeholder: mutable?.placeholder || DEFAULT_PLACEHOLDER,
    maxSuggestions: mutable?.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS,
    zoomScale: mutable?.zoomScale ?? DEFAULT_ZOOM_SCALE,
    persistLastSearch: mutable?.persistLastSearch ?? true,
    enableCoordinateSearch: mutable?.enableCoordinateSearch ?? true,
    coordinateZoomScale:
      typeof mutable?.coordinateZoomScale === "number" &&
      mutable.coordinateZoomScale > 0
        ? mutable.coordinateZoomScale
        : DEFAULT_COORDINATE_ZOOM_SCALE,
    preferredProjection:
      mutable?.preferredProjection ?? DEFAULT_COORDINATE_PREFERENCE,
    showCoordinateBadge: mutable?.showCoordinateBadge ?? true,
    styleVariant: mutable?.styleVariant ?? DEFAULT_STYLE_VARIANT,
    searchSources: mutable?.searchSources?.length
      ? mutable.searchSources.map(normalizeSource)
      : [],
  };
};

const buildLocatorConfig = (
  base: { id: string; name: string; placeholder?: string; url: string; maxSuggestions?: number },
  locatorSource: EditableSearchSource & LocatorSearchSourceConfig
): LocatorSearchSourceConfig => {
  const categoriesArray = parseArrayField(locatorSource.categories);
  const outFieldsArray = parseArrayField(locatorSource.outFields);
  const countryCode = sanitizeText(locatorSource.countryCode ?? "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();

  return {
    id: base.id,
    name: base.name,
    placeholder: base.placeholder,
    url: base.url,
    maxSuggestions: base.maxSuggestions,
    type: SearchSourceType.Locator,
    apiKey: sanitizeText(locatorSource.apiKey ?? "") || undefined,
    categories: categoriesArray,
    countryCode: countryCode || undefined,
    locationType: sanitizeText(locatorSource.locationType ?? "") || undefined,
    withinViewEnabled:
      typeof locatorSource.withinViewEnabled === "boolean"
        ? locatorSource.withinViewEnabled
        : undefined,
    outFields: outFieldsArray.length ? outFieldsArray : undefined,
  };
};

const buildLayerConfig = (
  base: { id: string; name: string; placeholder?: string; url: string; maxSuggestions?: number },
  layerSource: EditableSearchSource & LayerSearchSourceConfig
): LayerSearchSourceConfig => {
  const searchFieldsArray = layerSource.searchFieldsText
    ?.split(",")
    .map(sanitizeText)
    .filter(Boolean);
  const minSuggest = parsePositiveInt(
    layerSource.minSuggestCharacters ?? MIN_SEARCH_LENGTH,
    MIN_SEARCH_LENGTH
  );

  return {
    id: base.id,
    name: base.name,
    placeholder: base.placeholder,
    url: base.url,
    maxSuggestions: base.maxSuggestions,
    type: SearchSourceType.Layer,
    layerId: sanitizeNonEmptyText(layerSource.layerId || "", ""),
    searchFields: searchFieldsArray ?? [],
    displayField: sanitizeText(layerSource.displayField ?? "") || undefined,
    exactMatch: Boolean(layerSource.exactMatch),
    minSuggestCharacters: minSuggest,
    resultSymbol: layerSource.resultSymbol
      ? { ...layerSource.resultSymbol }
      : undefined,
  };
};

const buildSourceConfig = (
  source: EditableSearchSource
): SearchSourceConfig => {
  const base = {
    id: source.id || `${source.type}-${Date.now()}`,
    name: sanitizeNonEmptyText(source.name, ""),
    placeholder: sanitizeNonEmptyText(source.placeholder, ""),
    url: sanitizeUrlInput(source.url ?? ""),
    maxSuggestions: source.maxSuggestions,
  };

  return source.type === SearchSourceType.Layer
    ? buildLayerConfig(base, source as EditableSearchSource & LayerSearchSourceConfig)
    : buildLocatorConfig(base, source as EditableSearchSource & LocatorSearchSourceConfig);
};

const toConfigSources = (
  sources: EditableSearchSource[]
): SearchSourceConfig[] => sources.map(buildSourceConfig);

const computeSourceErrors = (sources: EditableSearchSource[]) =>
  toConfigSources(sources).map((source) => validateSearchSource(source).errors);

const Setting = (props: SettingProps) => {
  const styles = useSettingStyles();
  const translate = hooks.useTranslation(defaultMessages);
  const config = toSearchConfig(props.config);

  const [localSources, setLocalSources] = React.useState<
    EditableSearchSource[]
  >(config.searchSources);
  const [placeholder, setPlaceholder] = React.useState(config.placeholder);
  const [maxSuggestions, setMaxSuggestions] = React.useState(
    config.maxSuggestions
  );
  const [zoomScale, setZoomScale] = React.useState(config.zoomScale);
  const [persistLastSearch, setPersistLastSearch] = React.useState(
    config.persistLastSearch
  );
  const [enableCoordinateSearch, setEnableCoordinateSearch] = React.useState(
    config.enableCoordinateSearch ?? true
  );
  const [coordinateZoomScale, setCoordinateZoomScale] = React.useState(
    config.coordinateZoomScale ?? DEFAULT_COORDINATE_ZOOM_SCALE
  );
  const [preferredProjection, setPreferredProjection] = React.useState(
    config.preferredProjection ?? DEFAULT_COORDINATE_PREFERENCE
  );
  const [showCoordinateBadge, setShowCoordinateBadge] = React.useState(
    config.showCoordinateBadge ?? true
  );
  const [styleVariant, setStyleVariant] = React.useState(
    config.styleVariant ?? DEFAULT_STYLE_VARIANT
  );
  const [sourceErrors, setSourceErrors] = React.useState<string[][]>(() =>
    computeSourceErrors(config.searchSources)
  );
  const sourceIdCounterRef = React.useRef(0);

  hooks.useUpdateEffect(() => {
    setLocalSources(config.searchSources);
    setPlaceholder(config.placeholder);
    setMaxSuggestions(config.maxSuggestions);
    setZoomScale(config.zoomScale);
    setPersistLastSearch(config.persistLastSearch);
    setEnableCoordinateSearch(config.enableCoordinateSearch ?? true);
    setCoordinateZoomScale(
      config.coordinateZoomScale ?? DEFAULT_COORDINATE_ZOOM_SCALE
    );
    setPreferredProjection(
      config.preferredProjection ?? DEFAULT_COORDINATE_PREFERENCE
    );
    setShowCoordinateBadge(config.showCoordinateBadge ?? true);
    setStyleVariant(config.styleVariant ?? DEFAULT_STYLE_VARIANT);
    setSourceErrors(computeSourceErrors(config.searchSources));
  }, [props.config]);

  const commitConfig = hooks.useEventCallback(
    (
      partial: Partial<SearchConfig>,
      sourcesOverride?: EditableSearchSource[]
    ) => {
      const merged: SearchConfig = {
        ...config,
        ...partial,
        searchSources: toConfigSources(sourcesOverride ?? localSources),
      };
      props.onSettingChange({
        id: props.id,
        config: SeamlessImmutable(merged) as IMSearchConfig,
      });
    }
  );

  const updateSources = hooks.useEventCallback(
    (nextSources: EditableSearchSource[]) => {
      setLocalSources(nextSources);
      setSourceErrors(computeSourceErrors(nextSources));
      commitConfig({ searchSources: [] }, nextSources);
    }
  );

  const sanitizeSourceValue = hooks.useEventCallback(
    (key: string, rawValue: unknown, targetSource: EditableSearchSource) => {
      switch (key) {
        case "url":
          return sanitizeUrlInput(toPlainString(rawValue));
        case "maxSuggestions":
          return parsePositiveInt(
            rawValue as number | string,
            targetSource?.maxSuggestions ?? maxSuggestions
          );
        case "exactMatch":
        case "withinViewEnabled":
          return Boolean(rawValue);
        case "categories":
        case "outFields":
          return Array.isArray(rawValue)
            ? rawValue.map(sanitizeText).filter(Boolean)
            : [];
        case "countryCode": {
          const sanitized = sanitizeText(toPlainString(rawValue))
            .replace(/[^A-Za-z]/g, "")
            .slice(0, 3)
            .toUpperCase();
          return sanitized || undefined;
        }
        case "locationType": {
          const normalized = sanitizeText(toPlainString(rawValue)).toLowerCase();
          return normalized === "street" || normalized === "rooftop"
            ? normalized
            : undefined;
        }
        case "minSuggestCharacters":
          return parsePositiveInt(rawValue as number | string, MIN_SEARCH_LENGTH);
        case "resultSymbol":
          return (rawValue as __esri.SimpleMarkerSymbolProperties) ?? undefined;
        default:
          return sanitizeText(toPlainString(rawValue));
      }
    }
  );

  const handleSourceChange = hooks.useEventCallback(
    (index: number, key: string, rawValue: unknown) => {
      const targetSource = localSources[index];
      if (!targetSource) return;

      const sanitizedValue = sanitizeSourceValue(key, rawValue, targetSource);
      updateSources(
        localSources.map((source, idx) =>
          idx === index ? { ...source, [key]: sanitizedValue } : source
        )
      );
    }
  );

  const handleSearchFieldsChange = hooks.useEventCallback(
    (index: number, value: string) => {
      updateSources(
        localSources.map((source, idx) =>
          idx === index
            ? { ...source, searchFieldsText: sanitizeText(value) }
            : source
        )
      );
    }
  );

  const handleSourceTypeChange = hooks.useEventCallback(
    (index: number, type: SearchSourceType) => {
      updateSources(
        localSources.map((source, idx) =>
          idx === index
            ? normalizeSource(
                type === SearchSourceType.Layer
                  ? {
                      id: source.id,
                      type,
                      name: source.name,
                      placeholder: source.placeholder,
                      url: source.url,
                      maxSuggestions: source.maxSuggestions,
                      layerId: "",
                      searchFields: [],
                      displayField: "",
                      exactMatch: false,
                    }
                  : {
                      id: source.id,
                      type,
                      name: source.name,
                      placeholder: source.placeholder,
                      url: source.url,
                      maxSuggestions: source.maxSuggestions,
                      categories: [],
                      outFields: [],
                    }
              )
            : source
        )
      );
    }
  );

  const handleAddSource = hooks.useEventCallback(() => {
    const uniqueId = `source-${Date.now()}-${++sourceIdCounterRef.current}`;
    updateSources([
      ...localSources,
      normalizeSource({
        id: uniqueId,
        type: SearchSourceType.Locator,
        name: translate("newSourceLabel", { index: localSources.length + 1 }),
        placeholder,
        url: "",
        maxSuggestions,
        categories: [],
        outFields: [],
      }),
    ]);
  });

  const handleRemoveSource = hooks.useEventCallback((index: number) => {
    updateSources(localSources.filter((_, idx) => idx !== index));
  });

  const handlePlaceholderChange = hooks.useEventCallback((value: string) => {
    const sanitized = sanitizeNonEmptyText(value, DEFAULT_PLACEHOLDER);
    setPlaceholder(sanitized);
    commitConfig({ placeholder: sanitized });
  });

  const handleMaxSuggestionsChange = hooks.useEventCallback(
    (value: number | string) => {
      const parsed = parsePositiveInt(value, DEFAULT_MAX_SUGGESTIONS);
      setMaxSuggestions(parsed);
      commitConfig({ maxSuggestions: parsed });
    }
  );

  const handleZoomScaleChange = hooks.useEventCallback(
    (value: number | string) => {
      const parsed = parsePositiveNumber(value, DEFAULT_ZOOM_SCALE);
      setZoomScale(parsed);
      commitConfig({ zoomScale: parsed });
    }
  );

  const handleCoordinateSearchToggle = hooks.useEventCallback(
    (value: boolean) => {
      setEnableCoordinateSearch(value);
      commitConfig({ enableCoordinateSearch: value });
    }
  );

  const handleCoordinateZoomScaleChange = hooks.useEventCallback(
    (value: number | string) => {
      const parsed = parsePositiveNumber(value, DEFAULT_COORDINATE_ZOOM_SCALE);
      setCoordinateZoomScale(parsed);
      commitConfig({ coordinateZoomScale: parsed });
    }
  );

  const handlePreferredProjectionChange = hooks.useEventCallback(
    (value: CoordinateProjectionPreference) => {
      setPreferredProjection(value);
      commitConfig({ preferredProjection: value });
    }
  );

  const handleCoordinateBadgeToggle = hooks.useEventCallback(
    (value: boolean) => {
      setShowCoordinateBadge(value);
      commitConfig({ showCoordinateBadge: value });
    }
  );

  const handlePersistToggle = hooks.useEventCallback((value: boolean) => {
    setPersistLastSearch(value);
    commitConfig({ persistLastSearch: value });
  });

  const handleMapWidgetChange = hooks.useEventCallback(
    (useMapWidgetIds: string[]) => {
      const sanitizedIds = Array.isArray(useMapWidgetIds)
        ? useMapWidgetIds.filter((value): value is string => {
            if (typeof value !== "string") return false;
            return value.trim().length > 0;
          })
        : [];
      const nextConfig = SeamlessImmutable({
        searchSources: toConfigSources(localSources),
        placeholder,
        maxSuggestions,
        zoomScale,
        persistLastSearch,
        enableCoordinateSearch,
        coordinateZoomScale,
        preferredProjection,
        showCoordinateBadge,
        styleVariant,
      }) as IMSearchConfig;

      props.onSettingChange({
        id: props.id,
        config: nextConfig,
        useMapWidgetIds: sanitizedIds.length ? [sanitizedIds[0]] : [],
      });
    }
  );

  const sourceHasError = sourceErrors.some((errors) => errors.length > 0);

  return (
    <>
      <SettingSection title={translate("settingMapWidget")}>
        <SettingRow flow="wrap">
          <MapWidgetSelector
            onSelect={handleMapWidgetChange}
            useMapWidgetIds={props.useMapWidgetIds}
          />
        </SettingRow>
      </SettingSection>
      {localSources.length === 0 && (
        <Alert
          open
          withIcon
          type="warning"
          text={translate("warningNoSources")}
        />
      )}
      <SettingSection title={translate("settingSearchSources")}>
        {localSources.map((source, index) => {
          const errors = sourceErrors[index] ?? [];
          const isLayerSource = source.type === SearchSourceType.Layer;
          const locatorSource =
            source.type === SearchSourceType.Locator
              ? (source as EditableSearchSource & LocatorSearchSourceConfig)
              : null;
          const layerSource =
            source.type === SearchSourceType.Layer
              ? (source as EditableSearchSource & LayerSearchSourceConfig)
              : null;
          return (
            <div key={source.id ?? `source-${index}`}>
              <SettingRow flow="wrap" label={translate("settingSourceName")}>
                <TextInput
                  css={styles.fieldWidth}
                  aria-label={translate("settingSourceName")}
                  value={source.name}
                  onChange={(evt) =>
                    handleSourceChange(index, "name", evt.target.value)
                  }
                />
              </SettingRow>
              <SettingRow flow="wrap" label={translate("settingSourceType")}>
                <Select
                  css={styles.fieldWidth}
                  value={source.type}
                  aria-label={translate("settingSourceType")}
                  onChange={(evt) =>
                    handleSourceTypeChange(
                      index,
                      evt.target.value as SearchSourceType
                    )
                  }
                >
                  <Option value={SearchSourceType.Locator}>
                    {translate("locatorSourceLabel")}
                  </Option>
                  <Option value={SearchSourceType.Layer}>
                    {translate("layerSourceLabel")}
                  </Option>
                </Select>
              </SettingRow>
              <SettingRow flow="wrap" label={translate("settingSourceUrl")}>
                <TextInput
                  css={styles.fieldWidth}
                  aria-label={translate("settingSourceUrl")}
                  value={source.url ?? ""}
                  onChange={(evt) =>
                    handleSourceChange(index, "url", evt.target.value)
                  }
                />
              </SettingRow>
              {!isLayerSource && (
                <>
                  <SettingRow
                    flow="wrap"
                    label={translate("settingCategories")}
                  >
                    <TextInput
                      css={styles.fieldWidth}
                      aria-label={translate("settingCategories")}
                      placeholder="Coffee Shop, Pizza, Hotel"
                      value={(locatorSource?.categories ?? []).join(", ")}
                      onChange={(evt) => {
                        const categories = evt.target.value
                          .split(",")
                          .map((s) => sanitizeText(s))
                          .filter(Boolean);
                        handleSourceChange(index, "categories", categories);
                      }}
                    />
                  </SettingRow>
                  <SettingRow
                    flow="wrap"
                    label={translate("settingCountryCode")}
                  >
                    <TextInput
                      css={styles.fieldWidth}
                      aria-label={translate("settingCountryCode")}
                      placeholder="SE, NO, DK"
                      maxLength={3}
                      value={locatorSource?.countryCode ?? ""}
                      onChange={(evt) =>
                        handleSourceChange(
                          index,
                          "countryCode",
                          evt.target.value
                        )
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    flow="wrap"
                    label={translate("settingLocationType")}
                  >
                    <TextInput
                      css={styles.fieldWidth}
                      aria-label={translate("settingLocationType")}
                      value={locatorSource?.locationType ?? ""}
                      onChange={(evt) =>
                        handleSourceChange(
                          index,
                          "locationType",
                          evt.target.value
                        )
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    flow="no-wrap"
                    label={translate("settingWithinViewEnabled")}
                  >
                    <Switch
                      aria-label={translate("settingWithinViewEnabled")}
                      checked={Boolean(locatorSource?.withinViewEnabled)}
                      onChange={(evt) =>
                        handleSourceChange(
                          index,
                          "withinViewEnabled",
                          evt.target.checked
                        )
                      }
                    />
                  </SettingRow>
                </>
              )}
              {isLayerSource && (
                <>
                  <SettingRow flow="wrap" label={translate("settingLayerId")}>
                    <TextInput
                      css={styles.fieldWidth}
                      aria-label={translate("settingLayerId")}
                      value={layerSource?.layerId ?? ""}
                      onChange={(evt) =>
                        handleSourceChange(index, "layerId", evt.target.value)
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    flow="wrap"
                    label={translate("settingSearchFields")}
                  >
                    <TextInput
                      css={styles.fieldWidth}
                      aria-label={translate("settingSearchFields")}
                      value={source.searchFieldsText ?? ""}
                      onChange={(evt) =>
                        handleSearchFieldsChange(index, evt.target.value)
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    flow="wrap"
                    label={translate("settingDisplayField")}
                  >
                    <TextInput
                      css={styles.fieldWidth}
                      aria-label={translate("settingDisplayField")}
                      value={layerSource?.displayField ?? ""}
                      onChange={(evt) =>
                        handleSourceChange(
                          index,
                          "displayField",
                          evt.target.value
                        )
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    flow="no-wrap"
                    label={translate("settingExactMatch")}
                  >
                    <Switch
                      aria-label={translate("settingExactMatch")}
                      checked={Boolean(layerSource?.exactMatch)}
                      onChange={(evt) =>
                        handleSourceChange(
                          index,
                          "exactMatch",
                          evt.target.checked
                        )
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    flow="wrap"
                    label={translate("settingMinSuggestCharacters")}
                  >
                    <NumericInput
                      css={styles.fieldWidth}
                      aria-label={translate("settingMinSuggestCharacters")}
                      min={1}
                      max={10}
                      value={
                        layerSource?.minSuggestCharacters ?? MIN_SEARCH_LENGTH
                      }
                      onAcceptValue={(value) =>
                        handleSourceChange(index, "minSuggestCharacters", value)
                      }
                    />
                  </SettingRow>
                </>
              )}
              <SettingRow
                flow="wrap"
                label={translate("settingSourcePlaceholder")}
              >
                <TextInput
                  css={styles.fieldWidth}
                  aria-label={translate("settingSourcePlaceholder")}
                  value={source.placeholder ?? ""}
                  onChange={(evt) =>
                    handleSourceChange(index, "placeholder", evt.target.value)
                  }
                />
              </SettingRow>
              <SettingRow flow="wrap">
                <NumericInput
                  css={styles.fieldWidth}
                  aria-label={translate("settingMaxSuggestions")}
                  min={1}
                  max={20}
                  value={source.maxSuggestions ?? maxSuggestions}
                  onAcceptValue={(value) =>
                    handleSourceChange(index, "maxSuggestions", value)
                  }
                />
                {localSources.length > 1 && (
                  <Button
                    block
                    onClick={() => handleRemoveSource(index)}
                    aria-label={translate("settingRemoveSource")}
                  >
                    {translate("settingRemoveSource")}
                  </Button>
                )}
              </SettingRow>
              {errors.length > 0 && (
                <div css={styles.fieldError}>
                  {errors.map((key) => (
                    <div key={key}>{translate(`error_${key}`)}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <Button block onClick={handleAddSource} className="mt-2">
          {translate("settingAddSource")}
        </Button>
      </SettingSection>

      <SettingSection title={translate("settingSearchBehavior")}>
        <SettingRow flow="wrap" label={translate("settingPlaceholder")}>
          <TextInput
            css={styles.fieldWidth}
            aria-label={translate("settingPlaceholder")}
            value={placeholder}
            onChange={(evt) => handlePlaceholderChange(evt.target.value)}
          />
        </SettingRow>
        <SettingRow flow="wrap" label={translate("settingMaxSuggestions")}>
          <NumericInput
            css={styles.fieldWidth}
            min={1}
            max={20}
            value={maxSuggestions}
            onAcceptValue={handleMaxSuggestionsChange}
          />
        </SettingRow>
        <SettingRow flow="wrap" label={translate("settingZoomScale")}>
          <NumericInput
            css={styles.fieldWidth}
            min={1}
            value={zoomScale}
            onAcceptValue={handleZoomScaleChange}
          />
        </SettingRow>
        <SettingRow
          flow="no-wrap"
          label={translate("settingPersistLastSearch")}
        >
          <Switch
            aria-label={translate("settingPersistLastSearch")}
            checked={persistLastSearch}
            onChange={(evt) => handlePersistToggle(evt.target.checked)}
          />
        </SettingRow>
      </SettingSection>

      <StyleVariantSelector
        id={props.id}
        config={props.config}
        onSettingChange={props.onSettingChange}
        currentVariant={styleVariant}
      />

      <SettingSection title={translate("settingCoordinateSearch")}>
        <div css={styles.coordinateSection}>
          <SettingRow
            flow="no-wrap"
            label={translate("settingEnableCoordinateSearch")}
          >
            <Switch
              aria-label={translate("settingEnableCoordinateSearch")}
              checked={enableCoordinateSearch}
              onChange={(evt) =>
                handleCoordinateSearchToggle(evt.target.checked)
              }
            />
          </SettingRow>
          <SettingRow flow="wrap">
            <p css={styles.coordinateField}>
              {translate("settingCoordinateSearchDescription")}
            </p>
          </SettingRow>
          {enableCoordinateSearch && (
            <>
              <SettingRow
                flow="wrap"
                label={translate("settingPreferredProjection")}
              >
                <Select
                  css={styles.fieldWidth}
                  aria-label={translate("settingPreferredProjection")}
                  value={preferredProjection}
                  onChange={(evt) =>
                    handlePreferredProjectionChange(
                      evt.target.value as CoordinateProjectionPreference
                    )
                  }
                >
                  <Option value={CoordinateProjectionPreference.Auto}>
                    {translate("coordinatePreferenceAuto")}
                  </Option>
                  <Option value={CoordinateProjectionPreference.Tm}>
                    {translate("coordinatePreferenceTm")}
                  </Option>
                  <Option value={CoordinateProjectionPreference.Zone}>
                    {translate("coordinatePreferenceZone")}
                  </Option>
                </Select>
              </SettingRow>
              <SettingRow
                flow="wrap"
                label={translate("settingCoordinateZoomScale")}
              >
                <NumericInput
                  css={styles.fieldWidth}
                  min={1}
                  value={coordinateZoomScale}
                  onAcceptValue={handleCoordinateZoomScaleChange}
                />
              </SettingRow>
              <SettingRow
                flow="no-wrap"
                label={translate("settingShowCoordinateBadge")}
              >
                <Switch
                  aria-label={translate("settingShowCoordinateBadge")}
                  checked={showCoordinateBadge}
                  onChange={(evt) =>
                    handleCoordinateBadgeToggle(evt.target.checked)
                  }
                />
              </SettingRow>
            </>
          )}
        </div>
      </SettingSection>
      {sourceHasError && (
        <Alert
          open
          withIcon
          type="warning"
          text={translate("warningFixSourceErrors")}
        />
      )}
    </>
  );
};

export default Setting;
