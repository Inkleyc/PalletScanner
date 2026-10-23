import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { clearRuntimeBearerToken, setRuntimeBearerToken } from "@/lib/app-auth";
import {
  deleteWebStorage,
  readWebStorage,
  writeWebStorage,
} from "@/lib/web-storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const TEST_MODE_AVAILABLE =
  process.env.EXPO_PUBLIC_ENABLE_TEST_MODE === "true";
const supabaseStorageKey = "supabase-auth";
const supabaseStorageFile = `${FileSystem.documentDirectory}supabase-auth.json`;
const supabaseSecureStorageKey = "palletflip.supabase-auth";
const testModeStorageKey = "palletflip-test-mode";
const testModeStorageFile = `${FileSystem.documentDirectory}palletflip-test-mode`;

type SupabaseAuthSnapshot = {
  configured: boolean;
  email: string | null;
  ready: boolean;
  userId: string | null;
  signedIn: boolean;
  testMode: boolean;
  testModeAvailable: boolean;
};

type SupabaseAuthListener = () => void;

const listeners = new Set<SupabaseAuthListener>();
let client: SupabaseClient | null = null;
let currentSession: Session | null = null;
let initializationPromise: Promise<void> | null = null;
let authSnapshot: SupabaseAuthSnapshot = {
  configured: Boolean(SUPABASE_URL.trim() && SUPABASE_ANON_KEY.trim()),
  email: null,
  ready: false,
  userId: null,
  signedIn: false,
  testMode: false,
  testModeAvailable: TEST_MODE_AVAILABLE,
};

const notify = () => listeners.forEach((listener) => listener());

const nativeStorage = {
  getItem: async () => {
    try {
      const securelyStoredSession = await SecureStore.getItemAsync(
        supabaseSecureStorageKey,
      );
      if (securelyStoredSession) {
        return securelyStoredSession;
      }

      const info = await FileSystem.getInfoAsync(supabaseStorageFile);
      if (!info.exists) {
        return null;
      }
      const legacySession = await FileSystem.readAsStringAsync(supabaseStorageFile, {
        encoding: "utf8",
      });
      await SecureStore.setItemAsync(supabaseSecureStorageKey, legacySession);
      await FileSystem.deleteAsync(supabaseStorageFile, { idempotent: true });
      return legacySession;
    } catch {
      return null;
    }
  },
  setItem: async (_key: string, value: string) => {
    await SecureStore.setItemAsync(supabaseSecureStorageKey, value);
    await FileSystem.deleteAsync(supabaseStorageFile, { idempotent: true });
  },
  removeItem: async () => {
    try {
      await SecureStore.deleteItemAsync(supabaseSecureStorageKey);
      await FileSystem.deleteAsync(supabaseStorageFile, {
        idempotent: true,
      });
    } catch {
      // Sign out should still clear in-memory app auth if file removal fails.
    }
  },
};

const webStorage = {
  getItem: (_key: string) => readWebStorage(supabaseStorageKey),
  setItem: (_key: string, value: string) =>
    writeWebStorage(supabaseStorageKey, value),
  removeItem: (_key: string) => deleteWebStorage(supabaseStorageKey),
};

export const isSupabaseConfigured = () =>
  Boolean(SUPABASE_URL.trim() && SUPABASE_ANON_KEY.trim());

const syncSession = (session: Session | null) => {
  currentSession = session;
  authSnapshot = {
    configured: isSupabaseConfigured(),
    email: currentSession?.user.email ?? null,
    ready: true,
    userId: currentSession?.user.id ?? null,
    signedIn: Boolean(currentSession?.access_token),
    testMode: session ? false : authSnapshot.testMode,
    testModeAvailable: TEST_MODE_AVAILABLE,
  };
  if (session?.access_token) {
    void setRuntimeBearerToken(session.access_token);
  } else {
    void clearRuntimeBearerToken();
  }
  notify();
};

export const getSupabaseClient = () => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === "web",
        persistSession: true,
        storage: Platform.OS === "web" ? webStorage : nativeStorage,
      },
    });
    client.auth.onAuthStateChange((_event, session) => {
      syncSession(session);
    });
  }

  return client;
};

export const hydrateSupabaseAuth = async () => {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (TEST_MODE_AVAILABLE) {
        try {
          const storedTestMode =
            Platform.OS === "web"
              ? await readWebStorage(testModeStorageKey)
              : (await FileSystem.getInfoAsync(testModeStorageFile)).exists
                ? await FileSystem.readAsStringAsync(testModeStorageFile)
                : null;
          authSnapshot = {
            ...authSnapshot,
            testMode: storedTestMode === "enabled",
          };
        } catch {
          authSnapshot = { ...authSnapshot, testMode: false };
        }
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        authSnapshot = { ...authSnapshot, ready: true };
        notify();
        return;
      }

      const { data } = await supabase.auth.getSession();
      syncSession(data.session);
    })();
  }

  await initializationPromise;
};

export const getSupabaseAuthSnapshot = (): SupabaseAuthSnapshot => authSnapshot;

export const subscribeSupabaseAuth = (listener: SupabaseAuthListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const enableTestMode = async () => {
  if (!TEST_MODE_AVAILABLE) {
    throw new Error("Test mode is not enabled in this build.");
  }

  authSnapshot = { ...authSnapshot, ready: true, testMode: true };
  notify();
  try {
    if (Platform.OS === "web") {
      await writeWebStorage(testModeStorageKey, "enabled");
    } else {
      await FileSystem.writeAsStringAsync(testModeStorageFile, "enabled");
    }
  } catch {
    // Test mode still works for the current session if persistence is unavailable.
  }
};

export const disableTestMode = async () => {
  authSnapshot = { ...authSnapshot, testMode: false };
  notify();
  try {
    if (Platform.OS === "web") {
      await deleteWebStorage(testModeStorageKey);
    } else {
      await FileSystem.deleteAsync(testModeStorageFile, { idempotent: true });
    }
  } catch {
    // The in-memory test session is already cleared.
  }
};

export const sendSupabaseOtp = async (email: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY first.",
    );
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    throw new Error("Enter an email address.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
  });
  if (error) {
    throw error;
  }
};

export const verifySupabaseOtp = async (email: string, token: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY first.",
    );
  }

  const trimmedEmail = email.trim();
  const trimmedToken = token.replace(/\s/g, "");
  if (!trimmedEmail || !trimmedToken) {
    throw new Error("Enter your email and verification code.");
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token: trimmedToken,
    type: "email",
  });
  if (error) {
    throw error;
  }

  syncSession(data.session);
};

export const signOutSupabase = async () => {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  syncSession(null);
};

void hydrateSupabaseAuth();
