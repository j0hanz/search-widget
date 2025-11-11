# Search Widget: ExB Data Source Integration Implementation Plan

## Executive Summary

**Goal**: Transform the custom search-widget from a standalone map search interface into a full-featured ExB widget with complete data source integration, widget interoperability, and message-driven communication.

**Scope**: Implement the missing data source management layer (~500-800 lines of code) to enable the widget to participate in the ExB data flow ecosystem. This plan maintains the existing SWEREF99 coordinate search functionality while adding standard ExB search widget capabilities.

**Timeline**: 4-6 weeks (estimated)  
**Priority**: CRITICAL (blocks widget from functioning as proper ExB search widget)  
**Breaking Changes**: Configuration schema changes (migration required)

---

## Current State Assessment

### What Works ✅

- ArcGIS Search widget integration and module loading
- SWEREF99 coordinate parsing, projection detection, and transformation
- Redux state management with widget-scoped actions
- Settings panel with source configuration
- Input sanitization and validation
- Accessibility (ARIA, keyboard navigation)
- i18n translation system

### Critical Gaps ❌

- **No DataSourceComponent usage** → Results cannot be consumed by other widgets
- **No message publishing** → Cannot trigger actions or communicate with widgets
- **No MapCentric mode** → Cannot discover searchable layers from map widget
- **No query parameter management** → Cannot filter layer sources dynamically
- **No selection synchronization** → Cannot highlight results or share selection state
- **No output data sources** → Results stored only in Redux (not ExB data model)

---

## Implementation Phases

All phases follow these rules:

- Each phase is independently testable
- **No phase breaks existing coordinate search functionality** - Coordinate search (e.g., "6178897,125452" or "500000,6500000") continues to work independently, detecting comma-separated SWEREF99 input and navigating to location without using data sources
- Configuration changes are backward-compatible (with migration)
- All code follows ExB widget patterns (no forbidden hooks, proper module loading)
- **Coordinate search takes precedence**: If input matches coordinate pattern, widget uses existing coordinate parsing/navigation logic instead of geocoding/layer search

### Key Architectural Decision: Coordinate Search Independence

**Critical**: The custom search-widget has a unique feature—**SWEREF99 coordinate search**—that the built-in ExB search widget lacks. This feature **must continue to work independently** from the data source integration being added.

**Current Coordinate Search Flow (DO NOT CHANGE)**:

```
User Input: "6178897,125452" (comma-separated ONLY)
  ↓
isLikelyCoordinateInput() → true (detects comma + SWEREF99 pattern)
  ↓
parseCoordinateString() → { easting: 125452, northing: 6178897 }
  ↓  (auto-corrects axis order: N > 1M, E < 1M)
  ↓
detectProjection() → SWEREF99 zone (by bounds + central meridian)
  ↓
validateCoordinates() → valid (within zone bounds)
  ↓
transformToWgs84() → convert to map spatial reference
  ↓
jimuMapView.goTo(point, { zoom: coordinateZoomScale })
  ↓
Display graphic on coordinate layer (blue X marker)
  ↓
Store in Redux: coordinateResult (NOT in searchResult)
```

**After Data Source Integration (Phases 1-5)**:

- Coordinate search path: **UNCHANGED** - uses flow above, no data sources
- Geocoding/layer search path: **NEW** - creates data sources, publishes messages
- Decision logic in runtime widget:
  ```typescript
  if (isLikelyCoordinateInput(searchText)) {
    // Coordinate path: parseCoordinateString → navigate
    // NO data source, NO messages
  } else {
    // Geocoding/layer path: data sources + messages
  }
  ```

**Why Coordinate Search Doesn't Use Data Sources**:

1. Coordinates are user-calculated positions, not records from services
2. No selection concept—coordinates are exact points, not features
3. Graphics layer provides visualization
4. Redux `coordinateResult` sufficient for state
5. Simpler, faster—no service queries needed

---

## Phase 1: Core Data Source Integration (BLOCKING)

**Duration**: 2 weeks  
**Priority**: CRITICAL  
**Deliverable**: Widget creates output data sources and participates in ExB data flow

### Tasks

#### 1.1: Create DataSourceComponent Integration Layer

**File**: `src/runtime/components/create-datasource.tsx` (new file, ~200 lines)

**Acceptance Criteria**:

- [ ] Component renders `DataSourceComponent` for each active search source
- [ ] Handles both geocode (output DS) and layer (local DS) sources
- [ ] Implements lifecycle handlers: `onDataSourceInfoChange`, `onDataSourceStatusChange`, `onSelectionChange`
- [ ] Manages data source status tracking (loading, loaded, error)
- [ ] Creates unique local IDs using `getLocalId(configId, widgetId)` pattern

**Pattern from built-in widget** (`create-datasource.tsx:13-145`):

```tsx
<DataSourceComponent
  useDataSource={Immutable(outputDatasource)}
  query={defaultQuery}
  onDataSourceInfoChange={(info) =>
    handleRecordChange(serviceListItem, configId)
  }
  onDataSourceStatusChange={(status) =>
    handleDsStatusChange(Immutable(dsStatus.set(configId, status)))
  }
  onSelectionChange={(selection) => onSelectionChange(selection, configId)}
  widgetId={id}
/>
```

**Implementation Steps**:

1. Create component structure with props interface
2. Add geocode output data source rendering
3. Add layer local data source rendering
4. Implement `handleRecordChange` to load records and update Redux
5. Implement `handleDsStatusChange` to track loading states
6. Implement `onSelectionChange` to sync selection across widgets
7. Add conditional rendering based on `hadInputSearchText` flag
8. **IMPORTANT**: Do NOT render `DataSourceComponent` for coordinate search results - coordinate search works independently via `jimuMapView.goTo()` and graphics layer, no data source needed

**Dependencies**:

- `getLocalId` utility function
- `getDatasource` utility function
- Redux actions: `handleSearchResultChange`, `handleSelectionListChange`, `handleDsStatusChange`

---

#### 1.2: Implement Output Data Source Creation for Geocoding

**Files**:

- `src/config/types.ts` (add `outputDataSourceId` to `LocatorSearchSourceConfig`)
- `src/shared/utils.ts` (add `createDsByDefaultGeocodeService` utility)
- `src/runtime/widget.tsx` (integrate with existing geocoding flow)

**Acceptance Criteria**:

- [ ] Each locator source has associated output data source ID
- [ ] Output data sources created on widget mount or config change
- [ ] Geocoding results written to output data sources (not just Redux)
- [ ] Output data sources respect `resultMaxNumber` config
- [ ] Default query uses `where: '2=2'` pattern (not `1=1`) for filter change messages

**Pattern from built-in widget**:

```typescript
// Output data source config
const outputDatasource = {
  dataSourceId: outputDataSourceId,
  mainDataSourceId: outputDataSourceId,
};

// Default query for output DS
const defaultQuery = {
  where: "2=2", // Not '1=1' - triggers filter change messages correctly
  sqlExpression: null,
  pageSize: config.resultMaxNumber,
  outFields: ["*"],
  page: 1,
  returnGeometry: true,
};
```

**Implementation Steps**:

1. Extend `LocatorSearchSourceConfig` type with `outputDataSourceId?: string`
2. Add utility function to create output data sources via `getAppStore().getState().appConfig`
3. Update settings panel to generate unique output DS IDs
4. Modify geocoding result handler to write to output data source
5. Update `CreateDatasource` component to render output DS components

**Edge Cases**:

- Handle output DS creation failure gracefully
- Avoid duplicate DS creation on config changes
- Clean up orphaned output data sources on source removal

---

#### 1.3: Add Message Publishing

**Files**:

- `manifest.json` (add `publishMessages` array)
- `src/runtime/components/create-datasource.tsx` (add message publishing)
- `src/shared/utils.ts` (add `publishRecordCreatedMessageAction` utility)

**Acceptance Criteria**:

- [ ] Manifest declares 3 message types: `DATA_RECORDS_SELECTION_CHANGE`, `DATA_RECORD_SET_CHANGE`, `DATA_SOURCE_FILTER_CHANGE`
- [ ] Selection changes publish `DataRecordsSelectionChangeMessage`
- [ ] Search completion publishes `DataRecordSetChangeMessage`
- [ ] Filter updates publish `DataSourceFilterChangeMessage`
- [ ] Messages include correct `dataSourceId` and `messageCarryData` settings

**Manifest Addition**:

```json
"publishMessages": [
  {
    "messageType": "DATA_RECORDS_SELECTION_CHANGE",
    "messageCarryData": "BOTH_DATA_SOURCE"
  },
  {
    "messageType": "DATA_RECORD_SET_CHANGE",
    "messageCarryData": "OUTPUT_DATA_SOURCE"
  },
  {
    "messageType": "DATA_SOURCE_FILTER_CHANGE",
    "messageCarryData": "BOTH_DATA_SOURCE"
  }
]
```

**Implementation Steps**:

1. Update `manifest.json` with `publishMessages` array
2. Import `MessageManager` and message types from `jimu-core`
3. Implement `publishRecordCreatedMessageAction` utility (pattern from built-in `utils.ts:525-545`)
4. Call message publishing in `handleRecordChange` after records are loaded
5. Call message publishing in `onSelectionChange` handler
6. Add message publishing on filter changes (when search text updates)

**Testing**:

- Verify messages visible in ExB message monitor (dev tools)
- Test message reception in connected widgets (tables, lists, filters)

---

#### 1.4: Refactor Redux State to Store Record IDs Only

**Files**:

- `src/extensions/store.ts` (update `SearchWidgetState` interface)
- `src/runtime/widget.tsx` (update result handling logic)
- `src/config/types.ts` (add result tracking types)

**Current State** (❌ INCORRECT):

```typescript
// Stores full result summaries in Redux
results: SearchResultSummary[]  // Contains name, text, location, extent, attributes
```

**Target State** (✅ CORRECT ExB Pattern):

```typescript
// Stores only record IDs in Redux
searchResult: IMSearchResult; // { [configId: string]: string[] }  - Record IDs only
```

**Acceptance Criteria**:

- [ ] Redux stores `{ [configId: string]: string[] }` (record IDs grouped by source)
- [ ] Runtime queries data sources to retrieve full records
- [ ] `getDatasource(outputDataSourceId)` used to access records
- [ ] Result display logic updated to query data sources instead of Redux state
- [ ] Backward compatibility: old state migrates gracefully

**Implementation Steps**:

1. Add `IMSearchResult` type to Redux state (like built-in widget)
2. Update Redux actions to accept record ID arrays
3. Add `handleSearchResultChange(configId, recordIds)` handler
4. Update result rendering to query data sources by ID
5. Remove `SearchResultSummary` serialization from Redux
6. Add migration logic in reducer for old state format

**Benefits**:

- Results use ExB `DataRecord` API (geometry, attributes, selection)
- Automatic coordinate system transformations
- Query/filter capabilities on results
- Consistency with ExB data model

---

### Phase 1 Testing Checklist

#### Data Source Integration Tests

- [ ] Widget creates output data sources for locator sources
- [ ] Widget creates local data sources for layer sources
- [ ] Geocoding results appear in output data sources
- [ ] Layer search results appear in local data sources
- [ ] Selection in widget syncs to map and other widgets
- [ ] Messages published and received by connected widgets
- [ ] Redux stores only record IDs, not full result objects

#### SWEREF99 Coordinate Search Regression Tests (CRITICAL - No Changes Expected)

- [ ] **TM projection input**: "500000,6500000" → Detects TM (300k-700k E), navigates to location, displays coordinate graphic
- [ ] **Zone projection input**: "125452,6178897" → Detects zone by bounds (50k-250k E), selects correct zone by central meridian, navigates correctly
- [ ] **Swapped axis order**: "6178897,125452" → Auto-detects northing/easting order (N > 1M, E < 1M), corrects to (125452, 6178897), navigates correctly
- [ ] **Comma-separated format ONLY**: "500000,6500000" → Parses comma-separated format, navigates correctly
- [ ] **Space-separated format REJECTED**: "500000 6500000" → Does NOT trigger coordinate search, treated as regular search text
- [ ] **Labeled format REJECTED**: "E: 500000 N: 6500000" → Does NOT trigger coordinate search, treated as regular search text
- [ ] **Out of bounds**: "900000,6500000" → Shows error "coordinateErrorOutOfRange", does not navigate
- [ ] **WGS84 rejection**: "13.5,60.5" → Detects WGS84 (small values), shows error "coordinateErrorNotSweref", does not trigger coordinate search
- [ ] **Invalid format**: "abc,def" → Shows error "coordinateErrorParse", does not navigate
- [ ] **Missing comma**: "500000 6500000" → Does NOT trigger coordinate search, treated as text search
- [ ] **Projection alternatives**: Input near zone boundary → Shows alternative zone projections in UI
- [ ] **Transformation to map SR**: SWEREF99 coordinates transform correctly to map's spatial reference (e.g., Web Mercator)
- [ ] **Coordinate graphics layer**: Point displays with correct symbol (x marker, blue color, white outline)
- [ ] **Graphics cleanup**: Layer removed on unmount or new search
- [ ] **Coordinate precedence**: Input "500000,6500000" (with comma) does NOT trigger geocoding search, uses coordinate logic only

#### Code Quality

- [ ] Type check passes: `npm run type-check`
- [ ] Lint passes: `npm run lint`
- [ ] Unit tests pass: `npm run test`

---

## Phase 2: Query Management Layer (BLOCKING)

**Duration**: 1 week  
**Priority**: HIGH  
**Deliverable**: Dynamic query parameter management for layer sources

### Tasks

#### 2.1: Implement SQL Expression Building

**File**: `src/shared/search-service.ts` (new file, ~150 lines)

**Acceptance Criteria**:

- [ ] `getSQL(searchText, searchFields, datasource, searchExact)` function builds SQL expressions
- [ ] Uses `dataSourceUtils.getSQL()` from `jimu-core` for standard SQL generation
- [ ] Handles exact match vs. partial match (LIKE vs. =)
- [ ] Supports multiple search fields with OR logic
- [ ] Properly escapes search text to prevent SQL injection

**Pattern from built-in widget** (`search-service.ts:73-78`):

```typescript
export function getSQL(
  searchText: string,
  searchFields: FieldSchema[],
  datasource: DataSource,
  searchExact: boolean
): SqlExpression {
  const searchFieldNames = searchFields.map(
    (fieldSchema) => fieldSchema.jimuName
  );
  return dataSourceUtils.getSQL(
    searchText,
    searchFieldNames,
    datasource,
    searchExact
  );
}
```

**Implementation Steps**:

1. Create `search-service.ts` utility file
2. Import `dataSourceUtils` from `jimu-core`
3. Implement `getSQL` function using `dataSourceUtils.getSQL`
4. Add unit tests for SQL generation with various inputs
5. Add edge case handling (empty search text, no fields, special characters)

---

#### 2.2: Implement Query Parameter Updates

**File**: `src/shared/search-service.ts` (extend from 2.1)

**Acceptance Criteria**:

- [ ] `updateDsQueryParams(serviceListItem, widgetId, searchText)` updates data source queries
- [ ] Uses `where` clause for empty search (`1=1`) vs. active search (SQL expression)
- [ ] Includes `returnGeometry: true` for map display
- [ ] Respects `outFields` configuration (search fields + display fields)
- [ ] Calls `(datasource as QueriableDataSource).updateQueryParams(query, widgetId)`

**Pattern from built-in widget** (`search-service.ts:99-112`):

```typescript
export function updateDsQueryParams(
  serviceListItem: DatasourceListItem,
  id: string,
  searchText: string
) {
  const useDataSource = getDatasource(useDataSourceId);
  const SQL = serviceListItem?.SQL;
  const where = !searchText ? "1=1" : SQL?.sql || "1=0";
  const sqlExpression = !searchText ? null : SQL?.sql ? SQL : null;
  const query: any = Immutable({
    outFields: outFields,
    where,
    sqlExpression,
    returnGeometry: true,
  });
  useDataSource &&
    (useDataSource as QueriableDataSource).updateQueryParams(query, id);
}
```

**Implementation Steps**:

1. Implement `updateDsQueryParams` function
2. Add `getOutFields` helper to merge search + display fields
3. Call `updateDsQueryParams` when search text changes
4. Handle case where data source is not yet created
5. Add debounce to avoid excessive query updates

---

#### 2.3: Add Search in Current Map Extent

**Files**:

- `src/config/types.ts` (add `searchInCurrentMapExtent?: boolean` to layer source config)
- `src/shared/search-service.ts` (add `getQueryByServiceListItem` function)
- `src/setting/setting.tsx` (add toggle in UI)

**Acceptance Criteria**:

- [ ] Settings panel has "Search in current map extent" toggle per layer source
- [ ] When enabled, queries include `geometry: mapView.extent` parameter
- [ ] Query updates when map extent changes (with debounce)
- [ ] Disabled by default for backward compatibility

**Pattern from built-in widget** (`search-service.ts:154-170`):

```typescript
export function getQueryByServiceListItem(
  serviceListItem: DatasourceListItem,
  jimuMapView: JimuMapView,
  sourceType: SourceType,
  searchInCurrentMapExtent?: boolean
): QueryParams {
  const query = {
    where: SQL?.sql || "1=0",
    returnGeometry: true,
    outFields: getOutFields(searchFields, displayFields, dsId),
  };

  if (searchInCurrentMapExtent && jimuMapView?.view?.extent) {
    query.geometry = jimuMapView.view.extent;
  }

  return Immutable(query) as QueryParams;
}
```

**Implementation Steps**:

1. Add `searchInCurrentMapExtent` to `LayerSearchSourceConfig` type
2. Update settings panel with toggle control
3. Implement `getQueryByServiceListItem` function
4. Add extent watching with debounce (300ms)
5. Update query parameters when extent changes
6. Test with various map zoom levels and panning

---

#### 2.4: Add Suggestion Query Support

**File**: `src/shared/search-service.ts` (extend from 2.1-2.3)

**Acceptance Criteria**:

- [ ] `fetchLayerSuggestion(searchText, config, serviceListItem)` fetches autocomplete suggestions
- [ ] Uses `dataSourceUtils.querySuggestions()` from `jimu-core`
- [ ] Respects `maxSuggestions` config per source
- [ ] Returns suggestions with `configId` and `isFromSuggestion` flags
- [ ] Handles errors gracefully (returns empty array)

**Pattern from built-in widget** (`search-service.ts:24-67`):

```typescript
export async function fetchSuggestionRecords(
  searchText: string,
  datasourceListItem: DatasourceListItem,
  dsConfigItem: IMSearchDataConfig,
  searchFields: FieldSchema[],
  maxSuggestions: number,
  extent?: __esri.Extent
): Promise<Suggestion> {
  const datasource = getDatasource(useDatasourceId);
  const option = {
    searchText,
    searchFields: searchFields.map((schema) => schema.name),
    dataSource: datasource,
    maxSuggestions,
    extent,
  };

  return dataSourceUtils
    .querySuggestions(option)
    .then((suggest) => {
      const searchSuggestion = suggest?.map((item) => ({
        ...item,
        configId: configId,
        isFromSuggestion: true,
      }));
      return Promise.resolve({
        suggestionItem: searchSuggestion,
        layer: label,
        icon: icon,
      });
    })
    .catch(() =>
      Promise.resolve({ suggestionItem: [], layer: null, icon: null })
    );
}
```

**Implementation Steps**:

1. Implement `fetchLayerSuggestion` function
2. Import `dataSourceUtils.querySuggestions` from `jimu-core`
3. Add suggestion result handling in runtime widget
4. Display suggestions in dropdown (update existing UI)
5. Handle suggestion selection → triggers full search

---

### Phase 2 Testing Checklist

- [ ] Layer search generates correct SQL expressions
- [ ] Query parameters update when search text changes
- [ ] "Search in current extent" toggle works correctly
- [ ] Query updates when map extent changes (with debounce)
- [ ] Suggestions appear for layer sources
- [ ] Exact match toggle works as expected
- [ ] Multiple search fields combined with OR logic
- [ ] Empty search shows all records (where: '1=1')
- [ ] SQL injection attempts safely handled
- [ ] Coordinate search unaffected by query changes

---

## Phase 3: MapCentric Mode (HIGH PRIORITY)

**Duration**: 1 week  
**Priority**: HIGH  
**Deliverable**: Automatic layer discovery from connected map widget

### Tasks

#### 3.1: Add SourceType Enum and Config Schema

**Files**:

- `src/config/enums.ts` (add `SourceType` enum)
- `src/config/types.ts` (add `DataSourceConfigWithMapCentric` type)
- `src/config/constants.ts` (add default geocode service constants)

**Acceptance Criteria**:

- [ ] `SourceType` enum: `CustomSearchSources` | `MapCentric`
- [ ] Config has `sourceType?: SourceType` property
- [ ] Config has `dataSourceConfigWithMapCentric?: DataSourceConfigWithMapCentric` property
- [ ] MapCentric config keyed by map view ID: `{ [viewId: string]: { dataSourceConfig, synchronizeSettings } }`
- [ ] Default to `CustomSearchSources` for backward compatibility

**Type Definitions**:

```typescript
export enum SourceType {
  CustomSearchSources = "CustomSearchSources",
  MapCentric = "MapCentric",
}

export interface DataSourceConfigWithMapCentric {
  [viewId: string]: {
    dataSourceConfig?: SearchSourceConfig[];
    synchronizeSettings?: boolean; // Use map's default geocoding service
  };
}
```

---

#### 3.2: Implement Map Layer Discovery

**File**: `src/shared/utils.ts` (add `getDataSourceConfigWithMapCentric` function, ~200 lines)

**Acceptance Criteria**:

- [ ] Function reads map's `applicationProperties.viewing.search.layers`
- [ ] Creates search source configs from searchable layers
- [ ] Respects layer visibility and enabled status
- [ ] Handles both feature layers and tables
- [ ] Creates data sources if not already created
- [ ] Merges with default geocoding service if `synchronizeSettings: true`

**Pattern from built-in widget** (`utils/utils.ts:54-116`):

```typescript
export async function getDataSourceConfigWithMapCentric(views: {
  [viewId: string]: JimuMapView;
}): Promise<DataSourceConfigWithMapCentric> {
  await createDsByJimuMapViews(views); // Ensure DSs exist

  const dataSourceConfigWithMapCentric = {} as DataSourceConfigWithMapCentric;
  const promise = Object.keys(views || {}).map(async (viewId) => {
    const viewItem = views[viewId];
    const searchProperties = getSearchApplicationPropertiesOfMap(viewItem);
    const enabledLayers = getEnableLayers(viewItem);

    // For each searchable layer, create SearchSourceConfig
    // ...
  });

  await Promise.all(promise);
  return Promise.resolve(dataSourceConfigWithMapCentric);
}
```

**Implementation Steps**:

1. Implement `getSearchApplicationPropertiesOfMap(mapView)` helper
2. Implement `getEnableLayers(mapView)` to filter searchable layers
3. Implement `createDsByJimuMapViews(views)` to ensure data sources exist
4. Implement main `getDataSourceConfigWithMapCentric` function
5. Add layer to search source conversion logic
6. Handle layer field detection (search fields from layer config)
7. Add error handling for malformed map configurations

**Edge Cases**:

- Map has no searchable layers → return empty config
- Layer data source not yet created → create and wait
- Layer visibility changes → update search sources
- Multiple map widgets → separate configs per view ID

---

#### 3.3: Integrate MapCentric Mode in Runtime

**File**: `src/runtime/widget.tsx` (update initialization logic)

**Acceptance Criteria**:

- [ ] Check `config.sourceType === SourceType.MapCentric` on mount and config change
- [ ] Call `getDataSourceConfigWithMapCentric(jimuMapView)` when in MapCentric mode
- [ ] Merge with default geocoding service if `synchronizeSettings: true`
- [ ] Show loading state while discovering layers
- [ ] Fall back to empty sources if map widget disconnected
- [ ] Respect view ID changes (map widget switch)

**Pattern from built-in widget** (`widget.tsx:61-116`):

```typescript
useEffect(() => {
  const hasUseMap = useMapWidgetIds && useMapWidgetIds?.length > 0;
  if (config?.sourceType === SourceType.MapCentric && hasUseMap) {
    setShowLoading(true);
  }

  if (config?.sourceType === SourceType.MapCentric && jimuMapView) {
    if (hasUseMap) {
      initDSConfigWithMapCentric(config, jimuMapView);
    } else {
      setDataSourceConfig(Immutable([]));
      setServiceList(null as IMServiceList);
      setShowLoading(false);
    }
  } else {
    !hasUseMap && setShowLoading(false);
    initDatasourceConfig(config?.datasourceConfig);
  }
}, [config, jimuMapView, useMapWidgetIds]);
```

**Implementation Steps**:

1. Add `sourceType` check in main `useEffect`
2. Implement `initDSConfigWithMapCentric` function
3. Add loading state management
4. Call layer discovery on jimuMapView change
5. Update `CreateDatasource` component with discovered sources
6. Handle synchronizeSettings for default geocoding service

---

#### 3.4: Add Settings Panel Mode Selector

**File**: `src/setting/setting.tsx` (add mode toggle and conditional UI)

**Acceptance Criteria**:

- [ ] Radio buttons or tabs for `CustomSearchSources` vs. `MapCentric` mode
- [ ] MapCentric mode shows map widget selector
- [ ] MapCentric mode has "Synchronize with map's geocoding service" toggle
- [ ] Custom mode shows existing source list editor
- [ ] Mode switch shows confirmation dialog (data loss warning)
- [ ] Help text explains MapCentric benefits

**UI Mockup**:

```
┌─ Search Source Mode ─────────────────────────┐
│ ○ Custom Search Sources                      │
│   Configure search sources manually          │
│                                               │
│ ● Map-Centric Search                          │
│   Use searchable layers from map widget      │
│   ┌─────────────────────────────────────┐   │
│   │ Map Widget: [Select Map ▼]          │   │
│   │ ☑ Use map's default geocoding       │   │
│   └─────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

**Implementation Steps**:

1. Add mode selector radio buttons to settings panel
2. Add map widget selector (using `MapWidgetSelector` component)
3. Add synchronizeSettings toggle
4. Show/hide source list editor based on mode
5. Add confirmation dialog for mode switches
6. Update help text and tooltips

---

### Phase 3 Testing Checklist

- [ ] MapCentric mode discovers layers from map widget
- [ ] Source list updates when map layers change visibility
- [ ] Synchronize settings uses map's default geocoding service
- [ ] Mode switch in settings works without errors
- [ ] Custom mode still works as before
- [ ] Multiple map widgets handled correctly (per view ID)
- [ ] Map widget disconnect clears MapCentric sources
- [ ] Loading state shows during layer discovery
- [ ] Configuration migrates correctly from old format

---

## Phase 4: Selection & Interoperability (MEDIUM PRIORITY)

**Duration**: 3-4 days  
**Priority**: MEDIUM  
**Deliverable**: Bi-directional selection synchronization with map and widgets

### Tasks

#### 4.1: Add Selection State Tracking

**Files**:

- `src/extensions/store.ts` (add `selectionList` to state)
- `src/config/types.ts` (add `IMSelectionList` type)
- `src/runtime/widget.tsx` (add selection handlers)

**Acceptance Criteria**:

- [ ] Redux tracks selection per source: `{ [configId: string]: string[] }`
- [ ] Action: `setSelection(selection, configId, widgetId)`
- [ ] Action: `clearSelection(widgetId)`
- [ ] Selection persists across widget state changes
- [ ] Selection cleared when search text changes

**Redux Addition**:

```typescript
export interface SearchWidgetState {
  // ... existing state ...
  selectionList: IMSelectionList; // { [configId: string]: string[] }
}
```

---

#### 4.2: Implement Selection Message Publishing

**File**: `src/runtime/components/create-datasource.tsx` (update `onSelectionChange`)

**Acceptance Criteria**:

- [ ] Publishes `DataRecordsSelectionChangeMessage` on selection change
- [ ] Includes correct `dataSourceId` and record IDs
- [ ] Handles multi-selection (array of IDs)
- [ ] Handles deselection (empty array)
- [ ] Prevents infinite message loops (check if selection changed)

**Pattern**:

```typescript
const onSelectionChange = (
  selection: ImmutableArray<string>,
  configId: string
) => {
  const prevSelection = selectionList[configId] || [];
  if (lodash.isEqual(prevSelection, selection)) return; // Prevent loops

  handleSelectionListChange(selection, configId);

  MessageManager.getInstance().publishMessage(
    new DataRecordsSelectionChangeMessage(widgetId, {
      dataSourceId: useDataSource.dataSourceId,
      records: selection,
    })
  );
};
```

---

#### 4.3: Update Map Graphics for Selected Results

**File**: `src/shared/hooks.ts` (add `useSelectionGraphics` hook)

**Acceptance Criteria**:

- [ ] Creates `GraphicsLayer` for selection highlights
- [ ] Adds graphics when selection changes
- [ ] Uses distinct symbol (different from coordinate graphics)
- [ ] Removes graphics when selection cleared
- [ ] Cleans up layer on unmount

**Implementation Steps**:

1. Create `useSelectionGraphics` hook similar to `useCoordinateLayerManager`
2. Add selection graphics layer with unique ID
3. Convert selected records to graphics (query geometry from data source)
4. Update graphics when selection changes
5. Use `SimpleMarkerSymbol` with highlight color (e.g., cyan)
6. Clean up on unmount

---

#### 4.4: Listen for External Selection Changes

**File**: `src/runtime/components/create-datasource.tsx` (use `DataSourceComponent.listenSelection`)

**Acceptance Criteria**:

- [ ] Sets `listenSelection: true` on local data sources
- [ ] Updates widget selection when external widget changes selection
- [ ] Scrolls to selected result in result list
- [ ] Highlights selected item in UI

**Pattern from built-in widget** (`create-datasource.tsx:105`):

```tsx
<DataSourceComponent
  // ... other props ...
  onDataSourceCreated={(ds) => {
    ds.setListenSelection(true);
  }}
  onSelectionChange={(selection) => {
    onSelectionChange(selection, configId);
  }}
/>
```

---

### Phase 4 Testing Checklist

- [ ] Clicking result selects record (visual feedback)
- [ ] Selection syncs to map (graphic highlight)
- [ ] Selection syncs to other widgets (table, list)
- [ ] External selection updates widget UI
- [ ] Multi-selection works (Ctrl+Click)
- [ ] Deselection works (click empty area)
- [ ] Selection cleared on new search
- [ ] No infinite message loops
- [ ] Graphics layer cleaned up on unmount

---

## Phase 5: UX Enhancements (LOW PRIORITY)

**Duration**: 3-4 days  
**Priority**: LOW  
**Deliverable**: Recent searches, URL params, improved loading states

### Tasks

#### 5.1: Recent Searches Feature

**Files**:

- `src/shared/utils.ts` (add localStorage helpers)
- `src/runtime/widget.tsx` (add recent searches state and UI)
- `src/config/types.ts` (add config properties)

**Acceptance Criteria**:

- [ ] Stores last N searches in localStorage (default 6)
- [ ] Displays recent searches in dropdown when input focused
- [ ] Clicking recent search executes search
- [ ] Clear all button removes recent searches
- [ ] Respects `persistLastSearch` and `recentSearchesMaxNumber` config

**localStorage Schema**:

```typescript
// Key: `search_widget_recent_${widgetId}`
{
  searches: [
    { text: "Stockholm", timestamp: 1699..., configId: "locator-1" },
    // ...
  ]
}
```

**Implementation Steps**:

1. Add `setRecentSearches`, `getRecentSearches`, `clearRecentSearches` utilities
2. Add recent searches state to widget
3. Update UI to show recent searches dropdown
4. Save search on result selection (not on every keystroke)
5. Add "Clear all" button
6. Add settings panel config for max number

---

#### 5.2: URL Parameter Support

**Files**:

- `manifest.json` (add `urlParameters`)
- `src/shared/utils.ts` (add URL helpers)
- `src/runtime/widget.tsx` (integrate URL state)

**Acceptance Criteria**:

- [ ] Manifest declares `search_status` URL parameter
- [ ] Restores search term from URL on mount
- [ ] Restores active source from URL
- [ ] Updates URL when search executes (debounced)
- [ ] Supports shareable links (bookmarkable searches)

**Manifest Addition**:

```json
"urlParameters": [
  {
    "name": "search_status",
    "label": "Search status"
  }
]
```

**URL Format**:

```
?search_status={"searchText":"Stockholm","serviceEnabledList":["locator-1"]}
```

**Implementation Steps**:

1. Add `urlParameters` to manifest
2. Implement `getSearchStatusInUrl(widgetId)` utility
3. Implement `handleSearchWidgetUrlParamsChange(status, widgetId)` utility
4. Restore state from URL on widget mount
5. Update URL on search (with 500ms debounce)
6. Test with browser back/forward buttons

---

#### 5.3: Component Refactoring

**Files**:

- `src/runtime/components/search-input.tsx` (new, extract from widget.tsx)
- `src/runtime/components/results-list.tsx` (new, extract from widget.tsx)
- `src/runtime/components/coordinate-display.tsx` (new, extract from widget.tsx)

**Acceptance Criteria**:

- [ ] Main widget file <300 lines
- [ ] `SearchInput` component handles input, suggestions, recent searches
- [ ] `ResultsList` component handles result display and selection
- [ ] `CoordinateDisplay` component handles coordinate UI
- [ ] Each component has clear props interface
- [ ] Components are unit-testable independently

**Component Hierarchy**:

```
Widget
├── SearchInput
│   ├── Input field
│   ├── Suggestions dropdown
│   └── Recent searches
├── ResultsList
│   └── Result items (clickable)
├── CoordinateDisplay
│   ├── Coordinate badge
│   ├── Coordinate details
│   └── Projection info
├── SourceSelector (existing dropdown)
└── CreateDatasource (Phase 1)
```

---

#### 5.4: Improved Loading States

**Files**:

- `src/extensions/store.ts` (add `dsStatus` tracking)
- `src/runtime/widget.tsx` (add loading indicators)

**Acceptance Criteria**:

- [ ] Shows spinner during data source creation
- [ ] Shows "Loading sources..." message in MapCentric mode
- [ ] Disables input until sources ready
- [ ] Shows per-source loading status (icon badges)
- [ ] Displays error state for failed sources

**Implementation Steps**:

1. Add `dsStatus: { [configId: string]: DataSourceStatus }` to Redux
2. Track status updates from `DataSourceComponent.onDataSourceStatusChange`
3. Add loading overlay to input area
4. Show source status badges in result list
5. Add error messages for failed sources
6. Test with slow network conditions

---

### Phase 5 Testing Checklist

- [ ] Recent searches appear when input focused
- [ ] Recent searches persist across page reloads
- [ ] URL parameters restore search state correctly
- [ ] Shareable links work (copy URL, open in new tab)
- [ ] Component refactoring complete (no regressions)
- [ ] Loading states show appropriately
- [ ] Error states handled gracefully
- [ ] All components independently testable

---

## Configuration Migration Strategy

### Breaking Changes

1. **`searchSources` structure**: Add `outputDataSourceId` to locator sources
2. **New properties**: `sourceType`, `dataSourceConfigWithMapCentric`
3. **Redux state shape**: Change from `results: SearchResultSummary[]` to `searchResult: { [configId]: string[] }`

### Migration Function

**File**: `src/version-manager.ts` (create version manager like built-in widget)

```typescript
export const versionManager = {
  versions: [
    {
      version: "1.0.0",
      description: "Initial release with coordinate search",
      upgrader: (oldConfig) => oldConfig, // No changes
    },
    {
      version: "1.1.0",
      description: "Add data source integration",
      upgrader: (oldConfig) => {
        const newConfig = { ...oldConfig };

        // Add outputDataSourceId to locator sources
        newConfig.searchSources = oldConfig.searchSources?.map(
          (source, index) => {
            if (source.type === "locator" && !source.outputDataSourceId) {
              return {
                ...source,
                outputDataSourceId: `${oldConfig.id}_output_${index}`,
              };
            }
            return source;
          }
        );

        // Set default sourceType
        if (!newConfig.sourceType) {
          newConfig.sourceType = SourceType.CustomSearchSources;
        }

        return newConfig;
      },
    },
  ],
};
```

### Testing Migration

- [ ] Create test widget with v1.0.0 config
- [ ] Upgrade to v1.1.0
- [ ] Verify all sources have outputDataSourceId
- [ ] Verify sourceType defaults correctly
- [ ] Verify widget functions correctly after migration

---

## Testing Strategy

### Unit Tests (Jest)

**Target Coverage**: 80%+ for new code

#### Priority Test Files

1. `src/shared/search-service.test.ts` (SQL generation, query building)
2. `src/extensions/store.test.ts` (Redux actions, reducers)
3. `src/shared/utils.test.ts` (layer discovery, validation)
4. `src/runtime/components/create-datasource.test.tsx` (component rendering)

#### Test Scenarios

- [ ] SQL injection attempts safely handled
- [ ] Query parameters update correctly
- [ ] Data source lifecycle (create, update, destroy)
- [ ] Message publishing (correct format, no duplicates)
- [ ] Selection synchronization (bidirectional)
- [ ] MapCentric layer discovery (various map configs)
- [ ] Recent searches localStorage operations
- [ ] URL parameter parsing and encoding
- [ ] Configuration migration (all versions)

### Integration Tests

**Framework**: Manual testing in ExB runtime

#### Test Apps

1. **Basic Search**: Single locator source, test geocoding
2. **Layer Search**: Feature layer source, test filtering
3. **MapCentric**: Map with searchable layers, test discovery
4. **Multi-Widget**: Search + Table + Map, test selection sync
5. **Coordinate Search**: SWEREF99 input, verify no regression

#### Test Matrix

| Scenario          | Chrome | Firefox | Safari | Mobile |
| ----------------- | ------ | ------- | ------ | ------ |
| Geocoding         | ✅     | ✅      | ✅     | ✅     |
| Layer search      | ✅     | ✅      | ✅     | ✅     |
| MapCentric        | ✅     | ✅      | ✅     | N/A    |
| Selection sync    | ✅     | ✅      | ✅     | ✅     |
| Coordinate search | ✅     | ✅      | ✅     | ✅     |
| Recent searches   | ✅     | ✅      | ✅     | ✅     |
| URL parameters    | ✅     | ✅      | ✅     | ✅     |

### Performance Testing

**Tools**: Chrome DevTools Profiler, React DevTools Profiler

#### Benchmarks

- [ ] Widget mount time: <500ms (MapCentric mode may be slower)
- [ ] Search response time: <200ms (after ArcGIS widget responds)
- [ ] Selection sync: <50ms (local state update + message publish)
- [ ] Map extent query update: <100ms (debounced)
- [ ] Memory leak check: No increase after 100 searches

#### Performance Targets

- Initial load (no map): <200ms
- MapCentric discovery: <1000ms (10 layers)
- Search with 100 results: <500ms
- Selection of 50 records: <200ms

---

## Rollback Plan

### If Phase 1 Fails

**Symptoms**: Data sources not created, messages not published, widget errors

**Rollback Steps**:

1. Revert `CreateDatasource` component
2. Revert manifest `publishMessages`
3. Revert Redux state changes
4. Keep existing result handling (no data sources)
5. Document blockers for future attempt

**User Impact**: Widget reverts to standalone mode (current behavior)

### If Phase 2 Fails

**Symptoms**: Queries don't execute, layer search broken, SQL errors

**Rollback Steps**:

1. Revert `search-service.ts`
2. Keep data sources but skip query updates
3. Use default queries (no filtering)
4. Document SQL generation issues

**User Impact**: Layer search returns all records (no filtering)

### If Phase 3 Fails

**Symptoms**: MapCentric mode crashes, layer discovery errors, infinite loops

**Rollback Steps**:

1. Disable MapCentric mode in settings (hide option)
2. Force `CustomSearchSources` mode
3. Keep Phases 1-2 changes (data sources still work)
4. Document map integration issues

**User Impact**: No MapCentric mode, manual source configuration required

### General Rollback Procedure

1. Create git branch before each phase: `phase-N-data-sources`
2. Tag stable commits: `v1.1.0-phase-1-stable`
3. If blocking issues found: `git revert` or `git reset --hard <tag>`
4. Keep feature flags for risky changes:
   ```typescript
   const ENABLE_MAPCENTRIC = false; // Flip to enable/disable
   ```

---

## Success Criteria

### Phase 1 Success

- [ ] Widget creates output data sources (visible in ExB DataSource Manager)
- [ ] Widget publishes messages (visible in ExB Message Monitor)
- [ ] Search results appear in Table widget when connected
- [ ] Selection in widget highlights features on map
- [ ] Type/lint/tests pass

### Phase 2 Success

- [ ] Layer search filters by search text
- [ ] "Search in current extent" toggle works
- [ ] Suggestions appear for layer sources
- [ ] SQL queries generated correctly (no injection)
- [ ] Type/lint/tests pass

### Phase 3 Success

- [ ] MapCentric mode discovers layers from map
- [ ] Searchable layers appear automatically in widget
- [ ] Map's default geocoding service used when synchronized
- [ ] Settings panel shows mode selector
- [ ] Type/lint/tests pass

### Phase 4 Success

- [ ] Selection syncs bidirectionally (widget ↔ map ↔ other widgets)
- [ ] Selection graphics appear on map
- [ ] Multi-selection works
- [ ] No message loops
- [ ] Type/lint/tests pass

### Phase 5 Success

- [ ] Recent searches persist and restore
- [ ] URL parameters enable shareable links
- [ ] Widget codebase <2000 lines (after refactoring)
- [ ] All loading/error states polished
- [ ] Type/lint/tests pass

### Overall Success

- [ ] Widget passes ExB certification checklist
- [ ] Widget interoperates with all standard ExB widgets
- [ ] **Coordinate search still works (no regression)**: Comma-separated inputs like "6178897,125452" or "500000,6500000" detect as SWEREF99, navigate to location, display graphic
- [ ] **Coordinate search does NOT create data sources**: Coordinate results stored in Redux `coordinateResult` only, not in output/local data sources
- [ ] **Coordinate search skips geocoding**: When coordinate detected, widget does not call geocoding service or create records
- [ ] Performance meets benchmarks
- [ ] Documentation complete (README, inline comments)
- [ ] Migration guide for existing users

---

## Risk Mitigation

### Technical Risks

#### Risk: Data Source Creation Failures

**Likelihood**: Medium  
**Impact**: High (blocking)  
**Mitigation**:

- Extensive testing with various layer types
- Error handling for all data source operations
- Fallback to standalone mode if DS creation fails
- Clear error messages to user

#### Risk: Message Loop Cascades

**Likelihood**: Medium  
**Impact**: Medium (performance degradation)  
**Mitigation**:

- Equality checks before publishing messages
- Message deduplication logic
- Circuit breaker for excessive messages
- Monitor message count in tests

#### Risk: MapCentric Layer Discovery Errors

**Likelihood**: Medium  
**Impact**: Medium (feature unavailable)  
**Mitigation**:

- Comprehensive error handling
- Fallback to custom sources mode
- Timeout for layer discovery (5s max)
- User-friendly error messages

#### Risk: Redux State Migration Issues

**Likelihood**: Low  
**Impact**: High (data loss)  
**Mitigation**:

- Thorough version manager testing
- Preserve old state as backup
- Migration rollback capability
- Test with all historical config versions

### Schedule Risks

#### Risk: Phase Dependencies Cause Delays

**Likelihood**: Medium  
**Impact**: Medium (timeline slip)  
**Mitigation**:

- Each phase independently testable
- Can ship phases incrementally
- Phase 3-5 optional for MVP
- Parallel work on Phase 2 & 4

#### Risk: Integration Testing Reveals Blockers

**Likelihood**: High  
**Impact**: High (rework required)  
**Mitigation**:

- Early integration testing (after Phase 1)
- Test apps created upfront
- Daily builds and smoke tests
- Stakeholder demos after each phase

### User Impact Risks

#### Risk: Breaking Changes Disrupt Users

**Likelihood**: Medium  
**Impact**: High (user frustration)  
**Mitigation**:

- Automatic config migration
- Backward compatibility where possible
- Clear release notes and migration guide
- Deprecation warnings before removals

#### Risk: New Bugs in Coordinate Search

**Likelihood**: Low  
**Impact**: High (regression)  
**Mitigation**:

- Extensive regression testing
- Don't touch coordinate search code
- Parallel test suite for coordinates
- Feature flag for data source integration

---

## Documentation Requirements

### Developer Documentation

**File**: `README.md` updates

- [ ] Architecture diagram (data flow with data sources)
- [ ] **Coordinate search flow diagram** (independent from data sources):
  ```
  User Input → isLikelyCoordinateInput() → parseCoordinateString() →
  detectProjection() → validateCoordinates() → transformToWgs84() →
  jimuMapView.goTo() → Display graphic (NO data source creation)
  ```
- [ ] Component hierarchy
- [ ] Redux state structure (separate `coordinateResult` from `searchResult`)
- [ ] Message publishing guide
- [ ] MapCentric mode explanation
- [ ] Configuration schema reference
- [ ] Migration guide (v1.0.0 → v1.1.0)
- [ ] **SWEREF99 system overview**:
  - TM projection (EPSG:3006): Central meridian 15°, bounds 300k-700k E
  - 12 zone projections (EPSG:3007-3018): Zone-specific meridians, bounds 50k-250k E
  - Projection detection algorithm (bounds + meridian distance)
  - **Coordinate format support: comma-separated ONLY** (e.g., "500000,6500000")

### User Documentation

**File**: `docs/USER_GUIDE.md` (new)

- [ ] Feature overview:
  - **Geocoding**: Search addresses, places, POIs using locator services
  - **Layer search**: Search features in map layers
  - **Coordinate search** (unique to this widget): Search by SWEREF99 coordinates
- [ ] **Coordinate search guide**:
  - Supported format:
    - **Comma-separated ONLY**: `500000,6500000` or `6178897,125452`
    - Format requirement: **Comma (,) is mandatory** - spaces or other separators will NOT trigger coordinate search
  - System: Swedish SWEREF99 (TM and zone projections)
  - Auto-detection: Widget detects coordinate pattern (comma-separated numbers) and projection automatically
  - Examples:
    - Stockholm (TM): `500000,6580000`
    - Gothenburg (zone): `125000,6400000`
    - Malmö (zone): `115000,6160000`
    - Swapped order works: `6178897,125452` auto-corrects to `125452,6178897`
  - Error messages:
    - "Coordinate out of range": Input outside SWEREF99 bounds (30k-800k E, 5.9M-7.8M N)
    - "Not SWEREF99 coordinates": Input looks like WGS84 (lat/lon)
    - "Could not parse": Invalid format
- [ ] Settings panel guide (custom vs. MapCentric)
- [ ] Integration with other widgets (table, map, filters)
- [ ] Troubleshooting common issues
- [ ] FAQ:
  - Q: "Can I search using lat/lon coordinates?" A: No, only SWEREF99 (Swedish coordinate system) is supported for coordinate search. Use geocoding for addresses.
  - Q: "Why doesn't `13.5 60.5` work as coordinates?" A: Those are WGS84 (lat/lon) coordinates. This widget uses SWEREF99 (Swedish projected coordinates). Try `500000,6650000` instead.
  - Q: "Why doesn't `500000 6500000` work?" A: **Comma is required** for coordinate search. Use `500000,6500000` instead. Space-separated input is treated as text search.
  - Q: "My coordinates show 'out of range' error" A: SWEREF99 coordinates for Sweden are typically 300k-700k E (TM) or 50k-250k E (zones), and 6.1M-7.7M N. Check your coordinate values and ensure comma separator.

### Code Documentation

**Inline Comments**: Simple, clear comments for complex logic only (NO JSDoc)

- [ ] Data source lifecycle explanations
- [ ] **Coordinate search flow**: Document where coordinate detection happens (before geocoding), how it skips data source creation, and navigates directly via `jimuMapView.goTo()`
- [ ] **Coordinate precedence logic**: Explain that `isLikelyCoordinateInput()` runs first, if true → coordinate path, if false → geocoding/layer search path
- [ ] Message publishing logic
- [ ] Query building algorithms
- [ ] MapCentric discovery flow
- [ ] Migration logic

### Release Notes

**File**: `CHANGELOG.md`

```markdown
## [1.1.0] - 2025-XX-XX

### Added

- **Data Source Integration**: Search results now available as ExB data sources
- **Message Publishing**: Widget publishes selection and filter change messages
- **MapCentric Mode**: Automatically discover searchable layers from map widget
- **Selection Synchronization**: Bi-directional selection with map and other widgets
- **Recent Searches**: Quick access to previous search terms
- **URL Parameters**: Shareable links for specific searches

### Changed

- **BREAKING**: Configuration schema updated (automatic migration)
- **BREAKING**: Redux state structure changed (backward compatible)
- Search results stored in data sources instead of Redux only

### Fixed

- [List any bugs fixed during implementation]

### Migration Guide

See `docs/MIGRATION.md` for upgrading from v1.0.0
```

---

## Post-Implementation Checklist

### Code Quality

- [ ] Type check passes: `npm run type-check`
- [ ] Lint passes: `npm run lint`
- [ ] Tests pass: `npm run test`
- [ ] Test coverage >80% for new code
- [ ] No console errors in runtime
- [ ] No forbidden patterns (useMemo, useCallback, direct ArcGIS imports)
- [ ] All TODOs resolved or tracked in issues

### Functionality

- [ ] Geocoding works (locator sources)
- [ ] Layer search works (feature layer sources)
- [ ] Coordinate search works (SWEREF99, no regression)
- [ ] MapCentric mode discovers layers
- [ ] Selection syncs across widgets
- [ ] Messages published correctly
- [ ] Recent searches persist
- [ ] URL parameters restore state
- [ ] All settings panel options functional

### Accessibility

- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Screen reader announces search results
- [ ] ARIA attributes correct (live regions, labels)
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible

### Performance

- [ ] Widget mount <500ms
- [ ] Search response <200ms
- [ ] No memory leaks (100 searches test)
- [ ] No excessive re-renders (React DevTools)
- [ ] Bundle size <500KB (excluding ArcGIS SDK)

### Compatibility

- [ ] Works in Chrome, Firefox, Safari
- [ ] Works on mobile devices
- [ ] Works with ExB 1.14-1.18
- [ ] Works with ArcGIS JS API 4.29
- [ ] Integrates with Table, List, Filter widgets
- [ ] Supports both MapView and SceneView

### Documentation

- [ ] README updated with architecture
- [ ] User guide created
- [ ] Migration guide written
- [ ] Release notes complete
- [ ] Inline comments added for complex logic
- [ ] Configuration schema documented

---

## Appendix A: Key Files and Line Counts

### New Files to Create

| File                                            | Estimated Lines | Purpose                           |
| ----------------------------------------------- | --------------- | --------------------------------- |
| `src/runtime/components/create-datasource.tsx`  | ~200            | DataSourceComponent orchestration |
| `src/shared/search-service.ts`                  | ~220            | SQL generation, query management  |
| `src/shared/layer-discovery.ts`                 | ~200            | MapCentric layer discovery        |
| `src/runtime/components/search-input.tsx`       | ~150            | Extracted input component         |
| `src/runtime/components/results-list.tsx`       | ~100            | Extracted results component       |
| `src/runtime/components/coordinate-display.tsx` | ~80             | Extracted coordinate UI           |
| `src/version-manager.ts`                        | ~50             | Configuration migration           |
| `docs/USER_GUIDE.md`                            | -               | User documentation                |
| `docs/MIGRATION.md`                             | -               | Migration guide                   |
| **Total New Code**                              | **~1000**       |                                   |

### Files to Modify

| File                      | Current Lines | +/- Lines | New Total |
| ------------------------- | ------------- | --------- | --------- |
| `manifest.json`           | 26            | +15       | 41        |
| `config.json`             | 12            | +5        | 17        |
| `src/config/types.ts`     | 306           | +50       | 356       |
| `src/config/enums.ts`     | 32            | +5        | 37        |
| `src/config/constants.ts` | ~100          | +20       | 120       |
| `src/runtime/widget.tsx`  | 591           | -200      | 391       |
| `src/extensions/store.ts` | 201           | +80       | 281       |
| `src/shared/utils.ts`     | 631           | +300      | 931       |
| `src/shared/hooks.ts`     | 391           | +100      | 491       |
| `src/setting/setting.tsx` | 459           | +80       | 539       |
| **Total Modified**        | **2749**      | **+655**  | **3404**  |

### Overall Codebase Growth

- **Current**: ~3154 lines (13 TS files)
- **After Implementation**: ~4400 lines (20 TS files)
- **Growth**: ~1250 lines (+40%)
- **Target**: Keep runtime widget <400 lines via component extraction

---

## Appendix B: Built-in Widget Reference Locations

### Data Source Integration

- `create-datasource.tsx:13-145` - DataSourceComponent pattern
- `widget.tsx:240-262` - Result and selection change handlers
- `widget.tsx:285-296` - Data source status tracking

### Query Management

- `search-service.ts:73-78` - SQL generation
- `search-service.ts:99-112` - Query parameter updates
- `search-service.ts:24-67` - Suggestion queries
- `search-service.ts:154-170` - Map extent filtering

### MapCentric Mode

- `utils/utils.ts:54-116` - Layer discovery
- `utils/utils.ts:150-180` - Searchable layer filtering
- `widget.tsx:61-116` - MapCentric initialization

### Message Publishing

- `utils/utils.ts:525-545` - Message publishing utilities
- `manifest.json:6-22` - Message declarations

### Configuration Management

- `config.ts:1-120` - Type definitions
- `version-manager.ts` - Migration logic

---

## Appendix C: ArcGIS JS API Modules Required

### Core Modules (Already Used)

- ✅ `esri/widgets/Search`
- ✅ `esri/widgets/Search/SearchViewModel`
- ✅ `esri/layers/GraphicsLayer`
- ✅ `esri/Graphic`
- ✅ `esri/symbols/SimpleMarkerSymbol`
- ✅ `esri/geometry/Point`
- ✅ `esri/geometry/SpatialReference`
- ✅ `esri/geometry/projection`

### Additional Modules Needed

- `esri/layers/FeatureLayer` (for layer source creation)
- `esri/rest/locator` (for geocoding utilities, if not using Search widget)
- `esri/rest/query` (for advanced queries, if needed)
- `esri/tasks/QueryTask` (for query execution, if needed)

### Jimu Modules Already Used

- ✅ `jimu-core`: hooks, React, jsx, ReactRedux, Immutable
- ✅ `jimu-arcgis`: JimuMapViewComponent, JimuMapView, loadArcGISJSAPIModules
- ✅ `jimu-ui`: UI components (Button, Alert, etc.)
- ✅ `jimu-for-builder`: Settings components

### Additional Jimu Modules Needed

- `DataSourceComponent` from `jimu-core`
- `DataSourceManager` from `jimu-core`
- `dataSourceUtils` from `jimu-core` (for querySuggestions, getSQL)
- `MessageManager` from `jimu-core`
- Message types: `DataRecordsSelectionChangeMessage`, `DataRecordSetChangeMessage`, `DataSourceFilterChangeMessage`

---

## Appendix D: Testing Commands

### Unit Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Run tests with coverage
npm run test -- --coverage

# Run specific test file
npm run test -- search-service.test.ts
```

### Type Checking

```bash
# Check types
npm run type-check

# Check types in watch mode
npm run type-check -- --watch
```

### Linting

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

### Build

```bash
# Build widget for ExB
npm run build

# Build in watch mode
npm run build -- --watch
```

### Integration Testing

```bash
# Start ExB dev server (from client directory)
cd ../../
npm start

# Widget available at: http://localhost:3000
# Add widget to test app
```

---

## Appendix E: Useful Resources

### ExB Documentation

- [Widget Development Guide](https://developers.arcgis.com/experience-builder/guide/getting-started-widget/)
- [Data Source API](https://developers.arcgis.com/experience-builder/api-reference/jimu-core/DataSource/)
- [Message Actions](https://developers.arcgis.com/experience-builder/guide/message-action/)
- [Widget Communication](https://developers.arcgis.com/experience-builder/guide/widget-communication/)

### ArcGIS JS API

- [Search Widget](https://developers.arcgis.com/javascript/latest/api-reference/esri-widgets-Search.html)
- [Locator Service](https://developers.arcgis.com/javascript/latest/api-reference/esri-rest-locator.html)
- [FeatureLayer](https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-FeatureLayer.html)
- [Query](https://developers.arcgis.com/javascript/latest/api-reference/esri-rest-query.html)

### Built-in Search Widget Code

- Location: `client/dist/widgets/common/search/`
- Key files reviewed: `widget.tsx`, `create-datasource.tsx`, `search-service.ts`, `utils/utils.ts`

### Code Review Findings

- Comprehensive review document (this document's parent)
- Critical findings: No data sources, no messages, no MapCentric
- High priority: Query management, selection sync
- Medium priority: UX enhancements

---

## Sign-off

**Plan Author**: AI Code Review Agent  
**Date**: 2025-11-11  
**Plan Version**: 1.0  
**Based on**: Comprehensive review of built-in vs. custom search widget

**Approval Required From**:

- [ ] Lead Developer (architecture approval)
- [ ] UX Designer (UI/UX sign-off)
- [ ] QA Lead (testing strategy approval)
- [ ] Product Owner (feature priority approval)

**Next Steps**:

1. Review plan with team
2. Estimate story points for each phase
3. Create Jira/GitHub issues for each task
4. Schedule Phase 1 kickoff
5. Set up test apps and environments
6. Begin implementation

---

**End of Implementation Plan**
