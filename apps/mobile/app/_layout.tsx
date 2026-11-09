import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AppAlertHost } from '@/components/app-alert-host';
import { AppThemeProvider, useAppTheme } from '@/lib/app-theme';
import { startCloudInventorySync } from '@/lib/cloud-inventory-sync';

export const unstable_settings = {
  anchor: '(tabs)',
};

function ThemedRoot() {
  const { mode, palette } = useAppTheme();

  const navigationTheme = useMemo<Theme>(() => {
    const base = mode === 'deep' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.primary,
        background: palette.background,
        card: palette.surface,
        text: palette.text,
        border: palette.border,
        notification: palette.danger,
      },
    };
  }, [mode, palette]);

  return (
    <ThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="capture" options={{ headerShown: false }} />
          <Stack.Screen name="scan-barcode" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <AppAlertHost />
      </View>
      <StatusBar style={mode === 'deep' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  void startCloudInventorySync();

  return (
    <AppThemeProvider>
      <ThemedRoot />
    </AppThemeProvider>
  );
}
