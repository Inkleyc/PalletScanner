import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import {
  readWebStorage,
  writeWebStorage,
} from "@/lib/web-storage";

type AuthState = {
  bearerToken: string;
  demoBearerToken: string;
  updatedAt?: number;
};

type AuthListener = () => void;

const authFile = `${FileSystem.documentDirectory}app-auth.json`;
const authWebKey = "app-auth";
const authListeners = new Set<AuthListener>();

let authState: AuthState = {
  bearerToken: "",
  demoBearerToken: "",
};
let hydratePromise: Promise<void> | null = null;

const notifyAuthListeners = () => {
  authListeners.forEach((listener) => listener());
};

const normalizeAuthState = (value: unknown): AuthState => {
  if (!value || typeof value !== "object") {
    return { bearerToken: "", demoBearerToken: "" };
  }

  const candidate = value as Partial<AuthState>;
  return {
    bearerToken:
      typeof candidate.bearerToken === "string"
        ? candidate.bearerToken.trim()
        : "",
    demoBearerToken:
      typeof candidate.demoBearerToken === "string"
        ? candidate.demoBearerToken.trim()
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
      authState = { bearerToken: "", demoBearerToken: "" };
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
  return authState.demoBearerToken || authState.bearerToken;
};

export const setRuntimeBearerToken = async (token: string) => {
  await hydrateAppAuth();
  authState = {
    ...authState,
    bearerToken: token.trim(),
    updatedAt: Date.now(),
  };
  notifyAuthListeners();
  await persistAuthState();
};

export const clearRuntimeBearerToken = async () => {
  await hydrateAppAuth();
  authState = {
    ...authState,
    bearerToken: "",
    updatedAt: Date.now(),
  };
  notifyAuthListeners();
  await persistAuthState();
};

export const setDemoBearerToken = async (token: string) => {
  await hydrateAppAuth();
  authState = {
    ...authState,
    demoBearerToken: token.trim(),
    updatedAt: Date.now(),
  };
  notifyAuthListeners();
  await persistAuthState();
};

export const clearDemoBearerToken = async () => {
  await hydrateAppAuth();
  authState = {
    ...authState,
    demoBearerToken: "",
    updatedAt: Date.now(),
  };
  notifyAuthListeners();
  await persistAuthState();
};

void hydrateAppAuth();
