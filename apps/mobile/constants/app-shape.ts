import type { AppThemeMode } from "@/lib/app-settings";

/**
 * Structural (non-color) theme tokens — the shape language that sits next to
 * the palettes in constants/app-palette.ts.
 *
 * Slate (Day/Deep) keeps the app's established soft structure: rounded cards,
 * pill chips and hairline borders. Work Order (experiment) switches to the
 * web theme's form language: squared form boxes, tag chips and firm borders.
 *
 * Screens consume the shape alongside the palette and gate every structural
 * value on `isForm`, so Day/Deep render with exactly the per-screen literals
 * they have always used; the Slate values below record the representative
 * slate structure (typical card radius, pill chips, hairline border, pill
 * tab indicator) rather than replacing those literals.
 */
export type AppShape = {
  /** Corner radius for main cards/panels in form mode. */
  cardRadius: number;
  /** Corner radius for chips/tags in form mode. */
  chipRadius: number;
  /** Border width for main cards/panels in form mode. */
  cardBorderWidth: number;
  /** Corner radius of the active tab-bar indicator in form mode. */
  tabActiveRadius: number;
  /** True only for the Work Order form treatment. */
  isForm: boolean;
};

/** Slate structure (Day/Deep): soft cards, pill chips, hairline borders. */
export const SlateShape: AppShape = {
  cardRadius: 16,
  chipRadius: 999,
  cardBorderWidth: 1,
  tabActiveRadius: 19,
  isForm: false,
};

/** Work Order structure: squared form boxes, tag chips, firm ink borders. */
export const WorkOrderShape: AppShape = {
  cardRadius: 6,
  chipRadius: 4,
  cardBorderWidth: 1.5,
  tabActiveRadius: 6,
  isForm: true,
};

export function getAppShape(mode: AppThemeMode): AppShape {
  return mode === "workorder" ? WorkOrderShape : SlateShape;
}
