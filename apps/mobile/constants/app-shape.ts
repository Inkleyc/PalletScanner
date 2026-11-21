/**
 * Structural (non-color) theme tokens — the shape language that sits next to
 * the palettes in constants/app-palette.ts.
 *
 * There is exactly one shape: the form structure (squared form boxes, tag
 * chips, firm borders). The owner verdict was that the slate coloring over
 * the form structure is the right combination, so both theme modes (Day
 * and Deep) use it; the modes differ only in palette. Screens consume the
 * shape alongside the palette through useAppShape() in lib/app-theme.tsx.
 */
export type AppShape = {
  /** Corner radius for main cards/panels. */
  cardRadius: number;
  /** Corner radius for chips/tags. */
  chipRadius: number;
  /** Border width for main cards/panels. */
  cardBorderWidth: number;
  /** Corner radius of the active tab-bar indicator. */
  tabActiveRadius: number;
  /**
   * Always true: the single shape is the form shape. Kept so screens can
   * keep gating structural values on it uniformly.
   */
  isForm: boolean;
};

/** The one form structure shared by both theme modes. */
export const FormShape: AppShape = {
  cardRadius: 6,
  chipRadius: 4,
  cardBorderWidth: 1.5,
  tabActiveRadius: 6,
  isForm: true,
};
