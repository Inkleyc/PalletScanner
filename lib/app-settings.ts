import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { readWebStorage, writeWebStorage } from "@/lib/web-storage";

type AppSettings = {
  promptToPostOnSave: boolean;
  facebookSellerNote: string;
};

type SettingsListener = () => void;

const settingsListeners = new Set<SettingsListener>();
const settingsFile = `${FileSystem.documentDirectory}app-settings.json`;
const settingsWebKey = "app-settings";

let settingsState: AppSettings = {
  promptToPostOnSave: true,
  facebookSellerNote:
    "Local pickup. Message with any questions or to arrange a time.",
};

let hydratePromise: Promise<void> | null = null;

const notifySettingsListeners = () => {
  settingsListeners.forEach((listener) => listener());
};

const persistSettings = async () => {
  try {
    if (Platform.OS === "web") {
      await writeWebStorage(settingsWebKey, JSON.stringify(settingsState));
      return;
    }
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
      if (Platform.OS === "web") {
        const raw = await readWebStorage(settingsWebKey);
        if (!raw) {
          return;
        }
        settingsState = {
          ...settingsState,
          ...(JSON.parse(raw) as Partial<AppSettings>),
        };
        notifySettingsListeners();
        return;
      }
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

export const setFacebookSellerNote = (value: string) => {
  settingsState = {
    ...settingsState,
    facebookSellerNote: value.trim(),
  };
  notifySettingsListeners();
  void persistSettings();
};

void hydrateAppSettings();
