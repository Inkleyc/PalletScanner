import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import {
  readWebStorage,
  writeWebStorage,
} from "@/lib/web-storage";

type AuthState = {
  bearerToken: string;
  updatedAt?: number;
};

type AuthListener = () => void;

const authFile = `${FileSystem.documentDirectory}app-auth.json`;
const authWebKey = "app-auth";
const authListeners = new Set<AuthListener>();

let authState: AuthState = {
  bearerToken: "",
};
let hydratePromise: Promise<void> | null = null;

const notifyAuthListeners = () => {
  authListeners.forEach((listener) => listener());
};

const normalizeAuthState = (value: unknown): AuthState => {
  if (!value || typeof value !== "object") {
    return { bearerToken: "" };
  }

  const candidate = value as Partial<AuthState>;
  return {
    bearerToken:
      typeof candidate.bearerToken === "string"
        ? candidate.bearerToken.trim()
        : "",
    updatedAt:
      typeof candidate.updatedAt === "number" &&
      !Number.isNaN(candidate.updatedAt)
        ? candidate.updatedAt
        : undefined,
  };
};

const persistAuthState = async () => {
  try {
    const payload = JSON.stringify(authState);
    if (Platform.OS === "web") {
      await writeWebStorage(authWebKey, payload);
      return;
    }

    await FileSystem.writeAsStringAsync(authFile, payload, {
      encoding: "utf8",
    });
  } catch {
    // Keep the in-memory token for this session even if persistence fails.
  }
};

export const hydrateAppAuth = async () => {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const raw =
        Platform.OS === "web"
          ? await readWebStorage(authWebKey)
          : (await FileSystem.getInfoAsync(authFile)).exists
            ? await FileSystem.readAsStringAsync(authFile, {
                encoding: "utf8",
              })
            : null;

      if (!raw) {
        return;
      }

      authState = normalizeAuthState(JSON.parse(raw));
      notifyAuthListeners();
    } catch {
      authState = { bearerToken: "" };
    }
  })();

  await hydratePromise;
};

export const subscribeAppAuth = (listener: AuthListener) => {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
};

export const getAppAuth = () => authState;

export const getRuntimeBearerToken = async () => {
  await hydrateAppAuth();
  return authState.bearerToken;
};

export const setRuntimeBearerToken = (token: string) => {
  authState = {
    bearerToken: token.trim(),
    updatedAt: Date.now(),
  };
  notifyAuthListeners();
  void persistAuthState();
};

export const clearRuntimeBearerToken = () => {
  authState = {
    bearerToken: "",
    updatedAt: Date.now(),
  };
  notifyAuthListeners();
  void persistAuthState();
};

void hydrateAppAuth();
