import { Platform, type TextStyle } from "react-native";

/**
 * Slate design system — Day (light) palette.
 * Token roles mirror the web app's slate theme; values are the Day slate set.
 */
export const DayPalette = {
  background: "#e4eaf2",
  surface: "#fbfcfe",
  surfaceMuted: "#eef3f8",
  surfaceTint: "#e7edf5",
  border: "#c3cedd",
  borderStrong: "#8fa2b9",
  text: "#1c2a44",
  textMuted: "#5b6d84",
  textSoft: "#8494a9",
  primary: "#c77400",
  primaryStrong: "#96590a",
  primarySoft: "#f6e3c8",
  primaryOn: "#ffffff",
  success: "#2f7a62",
  successSoft: "#e7f5ef",
  successBorder: "#cfe7dc",
  warning: "#96590a",
  warningSoft: "#f6e3c8",
  warningBorder: "#e8c795",
  danger: "#c65a46",
  dangerStrong: "#a13d2f",
  dangerSoft: "#fdecea",
  dangerBorder: "#efc0b9",
  info: "#2b6cb0",
  infoSoft: "#e8f1fb",
  infoBorder: "#c9d9f1",
  primaryBorder: "#e8c795",
  shadow: "rgba(23, 32, 51, 0.08)",
  modalBackdrop: "rgba(28, 42, 68, 0.42)",
} as const;

/**
 * Slate design system — Deep (dark) palette.
 * Same token roles as DayPalette; the phone app defaults to Deep.
 */
export const DeepPalette = {
  background: "#0f1728",
  surface: "#1d2a44",
  surfaceMuted: "#28354f",
  surfaceTint: "#232f4a",
  border: "#374763",
  borderStrong: "#516584",
  text: "#eef2f8",
  textMuted: "#a8b6c8",
  textSoft: "#7e90a9",
  primary: "#f0a832",
  primaryStrong: "#ffc65c",
  primarySoft: "#3a2c14",
  primaryOn: "#1c2a44",
  success: "#5ec49a",
  successSoft: "#17352a",
  successBorder: "#24503d",
  warning: "#f0a832",
  warningSoft: "#3a2c14",
  warningBorder: "#6e551f",
  danger: "#ff9d8a",
  dangerStrong: "#ff9d8a",
  dangerSoft: "#40231e",
  dangerBorder: "#6e3a30",
  info: "#8fc1f0",
  infoSoft: "#1d3049",
  infoBorder: "#33517a",
  primaryBorder: "#6e551f",
  shadow: "rgba(0, 0, 0, 0.35)",
  modalBackdrop: "rgba(4, 8, 16, 0.6)",
} as const;

/**
 * Work Order (experiment) palette — phone variation of the web Work Order
 * theme: paper, ink and hardware orange. Same token roles as DayPalette.
 * Light-only for the trial; no plate/hardware decoration, palette only.
 */
export const WorkOrderPalette = {
  background: "#e8e6df",
  surface: "#f7f5ef",
  surfaceMuted: "#efede6",
  surfaceTint: "#e2ded2",
  border: "#b9b2a2",
  borderStrong: "#2a343e",
  text: "#1a222b",
  textMuted: "#5a6570",
  textSoft: "#87919b",
  primary: "#e85a08",
  primaryStrong: "#c24e06",
  primarySoft: "#fbe9dc",
  primaryOn: "#ffffff",
  success: "#1e7a46",
  successSoft: "#e2f2e6",
  successBorder: "#bfe3cc",
  warning: "#96590a",
  warningSoft: "#f6e3c8",
  warningBorder: "#e8c795",
  danger: "#b3372a",
  dangerStrong: "#8f2a1e",
  dangerSoft: "#f9e8e4",
  dangerBorder: "#efc0b9",
  info: "#2b5ea7",
  infoSoft: "#e6eefb",
  infoBorder: "#c3d4ef",
  primaryBorder: "#e8c795",
  shadow: "rgba(26, 34, 43, 0.10)",
  modalBackdrop: "rgba(26, 34, 43, 0.45)",
} as const;

export type AppPaletteShape = { [K in keyof typeof DayPalette]: string };

/**
 * Backwards-compatible alias for screens that are not part of the themed set
 * yet (login, onboarding and the entry screen). Those still render with the
 * Day palette.
 */
export const AppPalette = DayPalette;

export const AppLayout = {
  maxContentWidth: 980,
  radiusCard: 10,
  radiusControl: 7,
  touchTargetMin: 48,
} as const;

/** Shared text styles. `num` is the mono-data treatment for prices/metrics. */
export const AppTextStyles: { num: TextStyle } = {
  num: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontVariant: ["tabular-nums"],
  },
};
