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
  type AppPaletteShape,
} from "@/constants/app-palette";
import { FormShape, type AppShape } from "@/constants/app-shape";
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
  /** Structural tokens (see constants/app-shape.ts). One form shape for all modes. */
  shape: AppShape;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

/**
 * Provides the active palette and shape. The mode is persisted through
 * app-settings (same store as the other device settings) and resolves
 * exactly: "day" -> DayPalette, anything else -> the "deep" default. A
 * stored value from a retired mode therefore degrades gracefully to Deep.
 * Both modes share the single FormShape; they differ only in palette.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const settings = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettings,
    getAppSettings,
  );
  const mode: AppThemeMode = settings.themeMode === "day" ? "day" : "deep";

  const value = useMemo<AppThemeContextValue>(
    () => ({
      mode,
      setMode: setThemeMode,
      palette: mode === "deep" ? DeepPalette : DayPalette,
      shape: FormShape,
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
