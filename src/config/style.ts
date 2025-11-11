import {
  css,
  type ImmutableObject,
  type IMThemeVariables,
  React,
} from "jimu-core";
import { useTheme } from "jimu-theme";
import type { TypographyStyle } from "jimu-theme";
import { StyleVariant } from "./enums";
import type { SearchSettingStyles, SearchUiStyles } from "./types";

interface ThemeColorPalette {
  surface?: {
    paper?: string;
    paperHint?: string;
    background?: string;
  };
}

interface ThemeTypographyValues {
  label1?: ImmutableObject<TypographyStyle>;
  subtitle1?: ImmutableObject<TypographyStyle>;
  title1?: ImmutableObject<TypographyStyle>;
  caption?: ImmutableObject<TypographyStyle>;
  label2?: ImmutableObject<TypographyStyle>;
}

type ThemeSpacingFn = ((value: number) => string) | undefined;

const typo = (variant?: ImmutableObject<TypographyStyle>) => ({
  font: `${variant?.fontWeight?.toString() ?? ""} ${variant?.fontSize ?? ""} ${variant?.fontFamily ?? ""}`.trim(),
});

const createSharedStyles = (
  colors: ThemeColorPalette | undefined,
  typography: ThemeTypographyValues | undefined,
  spacing: ThemeSpacingFn
): Omit<SearchUiStyles, "container" | "controls" | "inputArea"> => {
  const itemPadding = `${spacing?.(1)} ${spacing?.(1.5)}`;
  const label1Typo = typo(typography?.label1);

  return {
    actions: css({ flex: "0 0 auto" }),
    sourceSelector: css({ flex: "0 0 auto" }),
    resultsList: css({
      display: "flex",
      flex: "1 1 auto",
      flexDirection: "column",
      position: "absolute",
      inset: `100% 0 auto 0`,
      marginBlockStart: spacing?.(1),
      background: colors?.surface?.paper,
      overflow: "hidden",
      zIndex: 2,
    }),
    resultItem: css({
      display: "flex",
      flex: "0 0 auto",
      alignItems: "center",
      justifyContent: "space-between",
      ...label1Typo,
      padding: itemPadding,
      cursor: "pointer",
      "&:focus-visible": { outline: "none" },
    }),
    resultStatus: css({
      flex: "0 0 auto",
      padding: itemPadding,
    }),
    coordinateBadge: css({
      display: "inline-flex",
      alignItems: "center",
      marginBlockEnd: spacing?.(1),
    }),
    coordinateDetails: css({
      display: "flex",
      flex: "1 1 auto",
      flexDirection: "column",
      ...label1Typo,
      marginBlockStart: spacing?.(1),
      gap: spacing?.(0.5),
    }),
    coordinateLabel: css({
      ...label1Typo,
    }),
    coordinateValue: css({}),
    coordinateWarning: css({
      display: "flex",
      flex: "1 1 auto",
      alignItems: "center",
      gap: spacing?.(0.5),
    }),
    coordinateLoading: css({
      display: "flex",
      flex: "1 1 auto",
      alignItems: "center",
      gap: spacing?.(0.5),
    }),
  };
};

const createDefaultStyles = (
  colors: ThemeColorPalette | undefined,
  typography: ThemeTypographyValues | undefined,
  spacing: ThemeSpacingFn
): SearchUiStyles => ({
  ...createSharedStyles(colors, typography, spacing),
  container: css({
    display: "flex",
  }),
  controls: css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    ".esri-widget": { backgroundColor: "transparent !important" },
  }),
  inputArea: css({
    flex: "1 1 auto",
    minWidth: 0,
    ".esri-search": { width: "100% !important" },
    ".esri-search__input-container": { position: "relative" },
    ".esri-search .esri-search__container > .esri-widget--button": {
      background: colors?.surface?.paperHint,
      color: colors?.surface?.background,
    },
    ".esri-search__input-container .esri-search__clear-button": {
      right: "0 !important",
    },
  }),
});

const createLinearStyles = (
  theme: IMThemeVariables,
  colors: ThemeColorPalette | undefined,
  typography: ThemeTypographyValues | undefined,
  spacing: ThemeSpacingFn
): SearchUiStyles => ({
  ...createSharedStyles(colors, typography, spacing),
  container: css({
    display: "flex",
    background: "transparent",
  }),
  controls: css({
    display: "flex",
    alignItems: "center",
    borderBottom: `1px solid ${theme?.ref?.palette?.neutral?.[500]}`,
    width: "100%",
  }),
  inputArea: css({
    flex: "1 1 auto",
    minWidth: 0,
    ".esri-widget, .esri-input, .esri-select, .esri-search, .esri-search__input, .esri-search__input-container, .esri-search .esri-search__container > .esri-widget--button, .esri-search__input-container .esri-search__clear-button":
      {
        background: "transparent !important",
      },
    ".esri-input, .esri-select, .esri-search .esri-search__container > .esri-widget--button":
      {
        border: "transparent !important",
      },
    ".esri-search": { width: "100% !important" },
    ".esri-search__input-container": { position: "relative" },
    ".esri-search__input-container .esri-search__clear-button": {
      right: "0 !important",
    },
  }),
});

export const createUiStyles = (
  theme: IMThemeVariables,
  variant: StyleVariant = StyleVariant.Default
): SearchUiStyles => {
  const colors = theme.sys?.color as ThemeColorPalette | undefined;
  const typography = theme.sys?.typography as ThemeTypographyValues | undefined;
  const spacing = theme.sys?.spacing as ThemeSpacingFn;

  if (variant === StyleVariant.Linear) {
    return createLinearStyles(theme, colors, typography, spacing);
  }

  return createDefaultStyles(colors, typography, spacing);
};

export const createSettingStyles = (
  theme: IMThemeVariables
): SearchSettingStyles => {
  const spacing = theme?.sys?.spacing as ThemeSpacingFn;
  const typography = (theme?.sys?.typography ?? {}) as ThemeTypographyValues;
  const subtitleTypo = typography.subtitle1 ?? typography.title1;
  const captionTypo = typography.caption ?? typography.label2;

  return {
    sectionHeader: css({
      font: `${subtitleTypo?.fontWeight} ${subtitleTypo?.fontSize} ${subtitleTypo?.fontFamily}`,
    }),
    fieldWidth: css({ width: "100%" }),
    fieldError: css({
      font: `${captionTypo?.fontSize} ${captionTypo?.fontFamily}`,
    }),
    coordinateSection: css({
      display: "flex",
      flexDirection: "column",
      paddingBlock: spacing?.(1.5),
    }),
    coordinateField: css({
      display: "flex",
      flexDirection: "column",
      gap: spacing?.(0.5),
    }),
  };
};

export const useUiStyles = (variant: StyleVariant = StyleVariant.Default) => {
  const theme = useTheme();
  const stylesRef = React.useRef<SearchUiStyles | null>(null);
  const themeRef = React.useRef(theme);
  const variantRef = React.useRef(variant);
  let styles = stylesRef.current;
  if (!styles || themeRef.current !== theme || variantRef.current !== variant) {
    styles = createUiStyles(theme, variant);
    stylesRef.current = styles;
    themeRef.current = theme;
    variantRef.current = variant;
  }
  return styles;
};

export const useSettingStyles = () => {
  const theme = useTheme();
  const stylesRef = React.useRef<SearchSettingStyles | null>(null);
  const themeRef = React.useRef(theme);
  let styles = stylesRef.current;
  if (!styles || themeRef.current !== theme) {
    styles = createSettingStyles(theme);
    stylesRef.current = styles;
    themeRef.current = theme;
  }
  return styles;
};

export type { SearchUiStyles as SearchWidgetStyles };
