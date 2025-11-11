import { SearchSourceType } from "../config/enums";
import type {
  EsriSearchModules,
  LayerSearchSourceConfig,
  LocatorSearchSourceConfig,
} from "../config/types";
import { createLayerSource, createLocatorSource } from "../shared/utils";

describe("Enhanced source configuration", () => {
  const mockModules = {
    LocatorSearchSource: jest.fn().mockImplementation((config) => config),
    LayerSearchSource: jest.fn().mockImplementation((config) => config),
    SimpleMarkerSymbol: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createLocatorSource applies categories filter", () => {
    const config: LocatorSearchSourceConfig = {
      id: "test",
      type: SearchSourceType.Locator,
      name: "Test",
      url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",
      categories: ["Coffee Shop", "Restaurant"],
      countryCode: "SE",
      withinViewEnabled: true,
      maxSuggestions: 6,
    };

    createLocatorSource(mockModules as unknown as EsriSearchModules, config);

    expect(mockModules.LocatorSearchSource).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ["Coffee Shop", "Restaurant"],
        countryCode: "SE",
        withinViewEnabled: true,
      })
    );
  });

  test("createLayerSource applies minSuggestCharacters", () => {
    const mockLayer = { displayField: "NAME" } as Partial<__esri.FeatureLayer>;
    const config: LayerSearchSourceConfig = {
      id: "test",
      type: SearchSourceType.Layer,
      name: "Test",
      url: "https://services.arcgis.com/test/FeatureServer/0",
      layerId: "test-layer",
      searchFields: ["NAME"],
      minSuggestCharacters: 5,
      maxSuggestions: 10,
    };

    createLayerSource(
      mockModules as unknown as EsriSearchModules,
      mockLayer as __esri.FeatureLayer,
      config
    );

    expect(mockModules.LayerSearchSource).toHaveBeenCalledWith(
      expect.objectContaining({
        minSuggestCharacters: 5,
      })
    );
  });
});
