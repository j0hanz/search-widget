export default {
  searchPlaceholder: "Search for address or place",
  searchAriaLabel: "Search for place or feature",
  searchButton: "Search",
  clearSearch: "Clear search",
  selectSource: "Select search source",
  noResultsFound: "No results found",
  errorSearchFailed: "Search failed. Please try again.",
  loadingResults: "Loading results...",
  resultCount: "{count} results found",
  resultFromSource: "From {source}",
  searchModeLabel: "Choose search mode",
  modeGeocodingLabel: "Search",
  modeCoordinatesLabel: "Coordinates",
  placeholderCoordinates: "Paste SWEREF 99 coordinates (e.g. 123456 7890123)",
  coordinateHintUnlabeled: "Enter two coordinates separated by space or comma",
  coordinateHintLabeled: "Use E= and N= to specify axis order",
  coordinateProjectionAria: "Detected coordinate system: {projection}",
  coordinateEasting: "Easting",
  coordinateNorthing: "Northing",
  coordinateErrorEmpty: "Enter coordinates to search.",
  coordinateErrorTooLong: "Coordinate input is too long.",
  coordinateErrorParse:
    "Could not parse coordinates. Try format: E=123456 N=7890123.",
  coordinateErrorNotSweref:
    "The coordinates do not look like SWEREF 99 values.",
  coordinateErrorOutOfRange:
    "Coordinates are outside the valid SWEREF 99 range.",
  coordinateErrorOutOfBounds:
    "Coordinates are outside the detected projection bounds.",
  coordinateErrorInvalidNumber: "Coordinates must be numeric.",
  coordinateErrorNoProjection:
    "Could not detect a SWEREF 99 projection for these coordinates.",
  coordinateErrorGeneric: "Coordinate search failed. Please try again.",
  coordinateErrorProjectionTimeout: "Projection tools took too long to load.",
  coordinateErrorProjectionLoad: "Could not load projection tools.",
  coordinateErrorNoSpatialReference: "Map spatial reference is unavailable.",
  coordinateErrorTransform:
    "Could not transform coordinates to the map projection.",
  coordinateErrorMissingModules: "Coordinate tools are not ready yet.",
  coordinateErrorNoMapView: "The map view is unavailable.",
  coordinateWarningNearBoundary:
    "Coordinates are near the projection boundary. Verify the projection.",
  coordinateWarningAmbiguousOrder:
    "Coordinates could be interpreted multiple ways. Use E= and N= to be sure.",
  searchNavigationFailed: "Could not navigate to the result.",
};
