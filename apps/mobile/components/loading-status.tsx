import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AppPalette } from "@/constants/app-palette";

type LoadingStatusProps = {
  messages: string[];
};

export function LoadingStatus({ messages }: LoadingStatusProps) {
  const safeMessages = messages.length > 0 ? messages : ["Working..."];
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    setMessageIndex(0);
    const intervalId = setInterval(() => {
      setMessageIndex((current) => (current + 1) % safeMessages.length);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [safeMessages.length]);

  return (
    <View style={styles.card}>
      <ActivityIndicator size="large" color={AppPalette.primaryStrong} />
      <Text style={styles.message}>{safeMessages[messageIndex]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: AppPalette.border,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 12,
  },
  message: {
    fontSize: 14,
    fontWeight: "600",
    color: AppPalette.textMuted,
  },
});
