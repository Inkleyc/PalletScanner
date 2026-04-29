import * as FileSystem from "expo-file-system/legacy";

type AppMetaState = {
  hasSeenOnboarding: boolean;
  lifetimeScans: number;
  currentMonthKey: string;
  currentMonthScans: number;
};

type AppMetaListener = () => void;

export const FREE_SCAN_LIMIT = 10;

const appMetaListeners = new Set<AppMetaListener>();
const appMetaFile = `${FileSystem.documentDirectory}app-meta.json`;

const getCurrentMonthKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

let appMetaState: AppMetaState = {
  hasSeenOnboarding: false,
  lifetimeScans: 0,
  currentMonthKey: getCurrentMonthKey(),
  currentMonthScans: 0,
};

let hydratePromise: Promise<void> | null = null;

const notifyAppMetaListeners = () => {
  appMetaListeners.forEach((listener) => listener());
};

const normalizeAppMetaState = (state: Partial<AppMetaState>): AppMetaState => {
  const currentMonthKey = getCurrentMonthKey();
  const storedMonthKey =
    typeof state.currentMonthKey === "string" && state.currentMonthKey
      ? state.currentMonthKey
      : currentMonthKey;

  return {
    hasSeenOnboarding: Boolean(state.hasSeenOnboarding),
    lifetimeScans:
      typeof state.lifetimeScans === "number" && !Number.isNaN(state.lifetimeScans)
        ? state.lifetimeScans
        : 0,
    currentMonthKey,
    currentMonthScans:
      storedMonthKey === currentMonthKey &&
      typeof state.currentMonthScans === "number" &&
      !Number.isNaN(state.currentMonthScans)
        ? state.currentMonthScans
        : 0,
  };
};

const persistAppMeta = async () => {
  try {
    await FileSystem.writeAsStringAsync(
      appMetaFile,
      JSON.stringify(appMetaState),
      { encoding: "utf8" },
    );
  } catch {
    // Best-effort persistence.
  }
};

const commitAppMeta = (nextState: Partial<AppMetaState>) => {
  appMetaState = normalizeAppMetaState({
    ...appMetaState,
    ...nextState,
  });
  notifyAppMetaListeners();
  void persistAppMeta();
};

export const hydrateAppMeta = async () => {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(appMetaFile);
      if (!fileInfo.exists) {
        return;
      }

      const raw = await FileSystem.readAsStringAsync(appMetaFile, {
        encoding: "utf8",
      });
      const parsed = JSON.parse(raw) as Partial<AppMetaState>;
      appMetaState = normalizeAppMetaState(parsed);
      notifyAppMetaListeners();
    } catch {
      // Ignore missing or invalid state.
    }
  })();

  await hydratePromise;
};

export const subscribeAppMeta = (listener: AppMetaListener) => {
  appMetaListeners.add(listener);
  return () => {
    appMetaListeners.delete(listener);
  };
};

export const getAppMeta = () => appMetaState;

export const markOnboardingSeen = () => {
  commitAppMeta({ hasSeenOnboarding: true });
};

export const incrementScanCount = () => {
  const currentMonthKey = getCurrentMonthKey();
  const shouldResetMonth = appMetaState.currentMonthKey !== currentMonthKey;
  commitAppMeta({
    lifetimeScans: appMetaState.lifetimeScans + 1,
    currentMonthKey,
    currentMonthScans: shouldResetMonth ? 1 : appMetaState.currentMonthScans + 1,
  });
};

void hydrateAppMeta();
