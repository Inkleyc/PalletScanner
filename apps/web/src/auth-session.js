import { isSupabaseConfigured, supabase } from "./supabase.js";
import {
  getRepositoryMode,
  useCloudRepository,
  useLocalRepository,
} from "./repository-router.js";

// Single owner of the Supabase auth subscription and the repository
// switch that follows it (PF-SCOPE-020). Before this module existed the
// subscription lived inside the Settings-only account card, so a session
// established from anywhere else never switched the app to cloud data.
// The header account control and the Settings card both read this store.

let state = {
  session: null,
  loading: true,
  repositoryMode: getRepositoryMode(),
  error: "",
};
const listeners = new Set();
let started = false;

const emit = () => {
  const snapshot = { ...state };
  listeners.forEach((listener) => listener(snapshot));
};

const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

const applySession = async (nextSession) => {
  setState({ session: nextSession, loading: true });
  try {
    if (nextSession) {
      await useCloudRepository();
      setState({ repositoryMode: "cloud", error: "" });
    } else {
      await useLocalRepository();
      setState({ repositoryMode: "local", error: "" });
    }
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : "Could not load inventory.",
    });
  } finally {
    setState({ loading: false });
  }
};

export const startAuthSession = () => {
  if (started) return;
  started = true;
  if (!supabase) {
    setState({ loading: false });
    return;
  }
  supabase.auth.getSession().then(({ data }) => {
    void applySession(data.session);
  });
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    window.setTimeout(() => {
      void applySession(nextSession);
    }, 0);
  });
};

export const subscribeAuthSession = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getAuthSessionState = () => ({ ...state });

// Re-read the router's mode after flows that switch repositories outside
// the auth subscription (e.g. the Settings card's cloud self-test).
export const syncRepositoryMode = () => {
  setState({ repositoryMode: getRepositoryMode() });
};

export const sendMagicLink = async (email) => {
  if (!supabase) return "Supabase is not configured.";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? error.message : null;
};

export const signOut = async () => {
  setState({ loading: true });
  await supabase?.auth.signOut();
  await useLocalRepository();
  setState({ session: null, repositoryMode: "local", loading: false });
};

export { isSupabaseConfigured };
