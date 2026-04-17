import * as FileSystem from "expo-file-system/legacy";

type AppSettings = {
  promptToPostOnSave: boolean;
};

type SettingsListener = () => void;

const settingsListeners = new Set<SettingsListener>();
const settingsFile = `${FileSystem.documentDirectory}app-settings.json`;

let settingsState: AppSettings = {
  promptToPostOnSave: true,
};

let hydratePromise: Promise<void> | null = null;

const notifySettingsListeners = () => {
  settingsListeners.forEach((listener) => listener());
};

const persistSettings = async () => {
  try {
    await FileSystem.writeAsStringAsync(
      settingsFile,
      JSON.stringify(settingsState),
      { encoding: "utf8" },
    );
  } catch {
    // Best-effort persistence; the in-memory setting still works if writing fails.
  }
};

export const hydrateAppSettings = async () => {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(settingsFile);
      if (!fileInfo.exists) {
        return;
      }

      const raw = await FileSystem.readAsStringAsync(settingsFile, {
        encoding: "utf8",
      });
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      settingsState = {
        ...settingsState,
        ...parsed,
      };
      notifySettingsListeners();
    } catch {
      // Ignore invalid or missing persisted settings.
    }
  })();

  await hydratePromise;
};

export const subscribeAppSettings = (listener: SettingsListener) => {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
};

export const getAppSettings = () => settingsState;

export const setPromptToPostOnSave = (value: boolean) => {
  settingsState = {
    ...settingsState,
    promptToPostOnSave: value,
  };
  notifySettingsListeners();
  void persistSettings();
};

void hydrateAppSettings();
