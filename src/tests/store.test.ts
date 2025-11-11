import { searchActions, searchReducer } from "../extensions/store";

const WIDGET_ID = "widget-1";

describe("searchReducer", () => {
  it("stores search results and clears searching flag", () => {
    const initialState = searchReducer(
      undefined,
      searchActions.setResults([], WIDGET_ID)
    );
    expect(initialState.byId[WIDGET_ID].isSearching).toBe(false);
  });

  it("handles clear results", () => {
    const baseState = searchReducer(
      undefined,
      searchActions.setResults(
        [
          {
            sourceIndex: 0,
            name: "A",
            text: "A",
            location: null,
            extent: null,
          },
        ],
        WIDGET_ID
      )
    );
    const cleared = searchReducer(
      baseState,
      searchActions.clearResults(WIDGET_ID)
    );
    expect(cleared.byId[WIDGET_ID].results).toHaveLength(0);
    expect(cleared.byId[WIDGET_ID].lastSearchTerm).toBe("");
  });

  it("updates active source index", () => {
    const baseState = searchReducer(
      undefined,
      searchActions.setActiveSource(2, WIDGET_ID)
    );
    expect(baseState.byId[WIDGET_ID].activeSourceIndex).toBe(2);
  });
});
