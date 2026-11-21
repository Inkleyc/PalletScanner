import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  DayPalette,
  DeepPalette,
  WorkOrderPalette,
  type AppPaletteShape,
} from "@/constants/app-palette";
import { getAppShape, type AppShape } from "@/constants/app-shape";
import {
  getAppSettings,
  setThemeMode,
  subscribeAppSettings,
  type AppThemeMode,
} from "@/lib/app-settings";

export type { AppThemeMode };

type AppThemeContextValue = {
  /** Active theme mode. "deep" is the phone default. */
  mode: AppThemeMode;
  setMode: (mode: AppThemeMode) => void;
  palette: AppPaletteShape;
  /** Structural tokens for the active mode (see constants/app-shape.ts). */
  shape: AppShape;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

/**
 * Provides the active palette. The mode is persisted through app-settings
 * (same store as the other device settings). Modes resolve exactly:
 * "day" -> DayPalette, "workorder" -> WorkOrderPalette (experiment), and
 * anything else -> the "deep" default.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const settings = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );
  const mode: AppThemeMode =
    settings.themeMode === "day"
      ? "day"
      : settings.themeMode === "workorder"
        ? "workorder"
        : "deep";

  const value = useMemo<AppThemeContextValue>(
    () => ({
      mode,
      setMode: setThemeMode,
      palette:
        mode === "workorder"
          ? WorkOrderPalette
          : mode === "deep"
            ? DeepPalette
            : DayPalette,
      shape: getAppShape(mode),
    }),
    [mode],
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }
  return context;
}

export function useAppPalette(): AppPaletteShape {
  return useAppTheme().palette;
}

export function useAppShape(): AppShape {
  return useAppTheme().shape;
}
