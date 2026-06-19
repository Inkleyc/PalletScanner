import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  clearRuntimeBearerToken,
  setRuntimeBearerToken,
} from "@/lib/app-auth";
import {
  deleteWebStorage,
  readWebStorage,
  writeWebStorage,
} from "@/lib/web-storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseStorageKey = "supabase-auth";
const supabaseStorageFile = `${FileSystem.documentDirectory}supabase-auth.json`;

type SupabaseAuthSnapshot = {
  configured: boolean;
  email: string | null;
  userId: string | null;
  signedIn: boolean;
};

type SupabaseAuthListener = () => void;

const listeners = new Set<SupabaseAuthListener>();
let client: SupabaseClient | null = null;
let currentSession: Session | null = null;
let initialized = false;
let authSnapshot: SupabaseAuthSnapshot = {
  configured: Boolean(SUPABASE_URL.trim() && SUPABASE_ANON_KEY.trim()),
  email: null,
  userId: null,
  signedIn: false,
};

const notify = () => listeners.forEach((listener) => listener());

const nativeStorage = {
  getItem: async () => {
    try {
      const info = await FileSystem.getInfoAsync(supabaseStorageFile);
      if (!info.exists) {
        return null;
      }
      return await FileSystem.readAsStringAsync(supabaseStorageFile, {
        encoding: "utf8",
      });
    } catch {
      return null;
    }
  },
  setItem: async (_key: string, value: string) => {
    await FileSystem.writeAsStringAsync(supabaseStorageFile, value, {
      encoding: "utf8",
    });
  },
  removeItem: async () => {
    try {
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
    userId: currentSession?.user.id ?? null,
    signedIn: Boolean(currentSession?.access_token),
  };
  if (session?.access_token) {
    setRuntimeBearerToken(session.access_token);
  } else {
    clearRuntimeBearerToken();
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
  if (initialized) {
    return;
  }

  initialized = true;
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const { data } = await supabase.auth.getSession();
  syncSession(data.session);
};

export const getSupabaseAuthSnapshot = (): SupabaseAuthSnapshot => authSnapshot;

export const subscribeSupabaseAuth = (listener: SupabaseAuthListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const sendSupabaseMagicLink = async (email: string) => {
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
    options: {
      emailRedirectTo: Linking.createURL("/settings"),
    },
  });
  if (error) {
    throw error;
  }
};

export const signOutSupabase = async () => {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  syncSession(null);
};

export const handleSupabaseCallbackUrl = async (url: string | null) => {
  if (!url) {
    return false;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return false;
  }

  const parsedUrl = Linking.parse(url);
  const rawCode = parsedUrl.queryParams?.code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  if (!code || typeof code !== "string") {
    return false;
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    throw error;
  }

  syncSession(data.session);
  return true;
};

void hydrateSupabaseAuth();
