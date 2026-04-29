import { useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppPalette } from "@/constants/app-palette";
import { getAppMeta, hydrateAppMeta, subscribeAppMeta } from "@/lib/app-meta";

export default function AppEntryScreen() {
  const router = useRouter();
  const { hasSeenOnboarding } = useSyncExternalStore(
    subscribeAppMeta,
    getAppMeta,
    getAppMeta,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void hydrateAppMeta().then(() => {
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    router.replace(hasSeenOnboarding ? "/(tabs)" : "/onboarding");
  }, [hasSeenOnboarding, ready, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={AppPalette.primaryStrong} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppPalette.background,
  },
});
