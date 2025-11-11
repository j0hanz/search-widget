System.register([], function (e) {
  return {
    execute: function () {
      e({
        searchPlaceholder: "Hitta adress eller plats",
        searchAriaLabel: "Sök plats eller objekt",
        searchButton: "Sök",
        clearSearch: "Rensa sökning",
        selectSource: "Välj sökkälla",
        noResultsFound: "Inga resultat hittades",
        errorSearchFailed: "Sökningen misslyckades. Försök igen.",
        loadingResults: "Laddar resultat...",
        resultCount: "{count} resultat hittades",
        resultFromSource: "Från {source}",
        searchModeLabel: "Välj sökläge",
        modeGeocodingLabel: "Sök",
        modeCoordinatesLabel: "Koordinater",
        placeholderCoordinates:
          "Klistra in SWEREF 99-koordinater (t.ex. 123456 7890123)",
        coordinateHintUnlabeled:
          "Ange två koordinater separerade med mellanslag eller komma",
        coordinateHintLabeled: "Använd E= och N= om du vill ange axelordning",
        coordinateProjectionAria: "Detekterat koordinatsystem: {projection}",
        coordinateEasting: "Östlig",
        coordinateNorthing: "Nordlig",
        coordinateErrorEmpty: "Ange koordinater för att söka.",
        coordinateErrorTooLong: "Koordinatinmatningen är för lång.",
        coordinateErrorParse:
          "Kunde inte tolka koordinater. Prova format: E=123456 N=7890123.",
        coordinateErrorNotSweref:
          "Koordinaterna ser inte ut som SWEREF 99-värden.",
        coordinateErrorOutOfRange:
          "Koordinater utanför giltigt SWEREF 99-område.",
        coordinateErrorOutOfBounds:
          "Koordinater utanför de detekterade projektionsgränserna.",
        coordinateErrorInvalidNumber: "Koordinater måste vara numeriska.",
        coordinateErrorNoProjection:
          "Kunde inte detektera en SWEREF 99-projektion för dessa koordinater.",
        coordinateErrorGeneric: "Koordinatsökning misslyckades. Försök igen.",
        coordinateErrorProjectionTimeout:
          "Projektionsverktygen tog för lång tid att ladda.",
        coordinateErrorProjectionLoad: "Kunde inte ladda projektionsverktyg.",
        coordinateErrorNoSpatialReference:
          "Kartans rumsliga referens är otillgänglig.",
        coordinateErrorTransform:
          "Kunde inte transformera koordinater till kartprojektionen.",
        coordinateErrorMissingModules: "Koordinatverktyg är inte redo ännu.",
        coordinateErrorNoMapView: "Kartvyn är otillgänglig.",
        coordinateWarningNearBoundary:
          "Koordinaterna är nära projektionsgränsen. Verifiera projektionen.",
        coordinateWarningAmbiguousOrder:
          "Koordinaterna kunde tolkas på flera sätt. Använd E= och N= för att vara säker.",
        searchNavigationFailed: "Kunde inte navigera till resultatet.",
      });
    },
  };
});
