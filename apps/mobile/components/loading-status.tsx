import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { type AppPaletteShape } from "@/constants/app-palette";
import { type AppShape } from "@/constants/app-shape";
import { useAppPalette, useAppShape } from "@/lib/app-theme";

type LoadingStatusProps = {
  messages: string[];
};

export function LoadingStatus({ messages }: LoadingStatusProps) {
  const palette = useAppPalette();
  const shape = useAppShape();
  const styles = useMemo(() => createStyles(palette, shape), [palette, shape]);
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
      <ActivityIndicator size="large" color={palette.primaryStrong} />
      <Text style={styles.message}>{safeMessages[messageIndex]}</Text>
    </View>
  );
}

const createStyles = (palette: AppPaletteShape, shape: AppShape) => StyleSheet.create({
  card: {
    marginTop: 20,
    backgroundColor: palette.surface,
    borderWidth: shape.cardBorderWidth,
    borderColor: palette.borderStrong,
    borderRadius: shape.cardRadius,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 12,
  },
  message: {
    fontSize: 14,
    fontWeight: "600",
    color: palette.textMuted,
  },
});
