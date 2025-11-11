export enum SearchSourceType {
  Locator = "locator",
  Layer = "layer",
}

export enum SearchActionType {
  SetResults = "search/setResults",
  ClearResults = "search/clearResults",
  SetActiveSource = "search/setActiveSource",
  SetSearching = "search/setSearching",
  SetLastSearchTerm = "search/setLastSearchTerm",
  SetError = "search/setError",
  SetCoordinateInput = "search/setCoordinateInput",
  SetCoordinateResult = "search/setCoordinateResult",
  ClearCoordinateResult = "search/clearCoordinateResult",
}

export enum CoordinateInputFormat {
  SpaceSeparated = "space",
  CommaSeparated = "comma",
  Labeled = "labeled",
  Unknown = "unknown",
}

export enum CoordinateProjectionPreference {
  Auto = "auto",
  Tm = "tm",
  Zone = "zone",
}

export enum StyleVariant {
  Default = "default",
  Linear = "linear",
}
