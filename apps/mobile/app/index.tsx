import { useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAppPalette } from "@/lib/app-theme";
import { getAppMeta, hydrateAppMeta, subscribeAppMeta } from "@/lib/app-meta";
import {
  getSupabaseAuthSnapshot,
  hydrateSupabaseAuth,
  subscribeSupabaseAuth,
} from "@/lib/supabase-auth";

export default function AppEntryScreen() {
  const router = useRouter();
  const palette = useAppPalette();
  const { hasSeenOnboarding } = useSyncExternalStore(
    subscribeAppMeta,
    getAppMeta,
    getAppMeta,
  );
  const auth = useSyncExternalStore(
    subscribeSupabaseAuth,
    getSupabaseAuthSnapshot,
    getSupabaseAuthSnapshot,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.all([hydrateAppMeta(), hydrateSupabaseAuth()]).then(() => {
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!hasSeenOnboarding) {
      router.replace("/onboarding");
      return;
    }

    router.replace(auth.signedIn || auth.testMode ? "/(tabs)" : "/login");
  }, [auth.signedIn, auth.testMode, hasSeenOnboarding, ready, router]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ActivityIndicator size="large" color={palette.primaryStrong} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
