import type { AppThemeMode } from "@/lib/app-settings";

/**
 * Structural (non-color) theme tokens — the shape language that sits next to
 * the palettes in constants/app-palette.ts.
 *
 * The form structure (squared form boxes, tag chips, firm borders — the web
 * Work Order theme's bones) applies to the Day and Work Order modes: the
 * owner verdict was that Day's slate coloring over the form structure is the
 * right combination. Deep keeps the app's established soft slate structure:
 * rounded cards, pill chips and hairline borders.
 *
 * Screens consume the shape alongside the palette and gate every structural
 * value on `isForm`, so Deep renders with exactly the per-screen literals it
 * has always used; the Slate values below record the representative slate
 * structure (typical card radius, pill chips, hairline border, pill tab
 * indicator) rather than replacing those literals.
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
  /** True for the form treatment (Day and Work Order modes). */
  isForm: boolean;
};

/** Slate structure (Deep): soft cards, pill chips, hairline borders. */
export const SlateShape: AppShape = {
  cardRadius: 16,
  chipRadius: 999,
  cardBorderWidth: 1,
  tabActiveRadius: 19,
  isForm: false,
};

/** Form structure (Day + Work Order): squared boxes, tag chips, firm borders. */
export const WorkOrderShape: AppShape = {
  cardRadius: 6,
  chipRadius: 4,
  cardBorderWidth: 1.5,
  tabActiveRadius: 6,
  isForm: true,
};

export function getAppShape(mode: AppThemeMode): AppShape {
  // Form structure for Day + Work Order; Deep keeps the soft slate shape.
  return mode === "deep" ? SlateShape : WorkOrderShape;
}
