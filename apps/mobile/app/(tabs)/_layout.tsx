import { Redirect, Tabs } from "expo-router";
import React, { useSyncExternalStore } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AppLayout } from "@/constants/app-palette";
import { useAppPalette } from "@/lib/app-theme";
import {
  getSupabaseAuthSnapshot,
  subscribeSupabaseAuth,
} from "@/lib/supabase-auth";

export default function TabLayout() {
  const palette = useAppPalette();
  const auth = useSyncExternalStore(
    subscribeSupabaseAuth,
    getSupabaseAuthSnapshot,
    getSupabaseAuthSnapshot,
  );
  const activeTint = palette.primary;
  const inactiveTint = palette.textMuted;
  const isTablet = Platform.OS === "ios" && Platform.isPad;
  const createTabIcon = (
    name: React.ComponentProps<typeof IconSymbol>["name"],
    displayName: string,
  ) => {
    const TabIcon = ({ color, focused }: { color: string; focused: boolean }) => (
      <View
        style={{
          minWidth: isTablet ? 56 : 52,
          height: isTablet ? 40 : 38,
          borderRadius: isTablet ? 20 : 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? activeTint : "transparent",
        }}
      >
        <IconSymbol
          size={focused ? (isTablet ? 30 : 28) : isTablet ? 26 : 24}
          name={name}
          color={focused ? palette.primaryOn : color}
        />
      </View>
    );

    TabIcon.displayName = displayName;
    return TabIcon;
  };

  const createTabLabel = (label: string, displayName: string) => {
    const TabLabel = ({ focused, color }: { focused: boolean; color: string }) => (
      <Text
        style={{
          fontSize: isTablet ? 12 : 11,
          fontWeight: focused ? "700" : "600",
          color: focused ? activeTint : color,
          marginTop: isTablet ? 4 : 2,
        }}
      >
        {label}
      </Text>
    );

    TabLabel.displayName = displayName;
    return TabLabel;
  };

  if (!auth.ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!auth.signedIn && !auth.testMode) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          height: isTablet ? 98 : 86,
          paddingTop: isTablet ? 12 : 10,
          paddingBottom: isTablet ? 14 : 12,
          shadowColor: palette.shadow,
          shadowOpacity: 1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarItemStyle: {
          minHeight: AppLayout.touchTargetMin,
          paddingVertical: isTablet ? 4 : 3,
        },
        tabBarActiveBackgroundColor: "transparent",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Scan",
          tabBarIcon: createTabIcon("barcode.viewfinder", "ScanTabIcon"),
          tabBarLabel: createTabLabel("Scan", "ScanTabLabel"),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Inventory",
          tabBarIcon: createTabIcon("list.bullet", "InventoryTabIcon"),
          tabBarLabel: createTabLabel("Inventory", "InventoryTabLabel"),
        }}
      />
      <Tabs.Screen
        name="facebook"
        options={{
          title: "Facebook",
          href: null,
          tabBarIcon: createTabIcon("tag.fill", "FacebookTabIcon"),
          tabBarLabel: createTabLabel("Facebook", "FacebookTabLabel"),
        }}
      />
      <Tabs.Screen
        name="pallets"
        options={{
          title: "Pallets",
          tabBarIcon: createTabIcon("archivebox.fill", "PalletsTabIcon"),
          tabBarLabel: createTabLabel("Pallets", "PalletsTabLabel"),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Stats",
          href: null,
          tabBarIcon: createTabIcon("chart.bar.fill", "StatsTabIcon"),
          tabBarLabel: createTabLabel("Stats", "StatsTabLabel"),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: createTabIcon("rectangle.3.group.fill", "DashboardTabIcon"),
          tabBarLabel: createTabLabel("Dashboard", "DashboardTabLabel"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: createTabIcon("gearshape.fill", "SettingsTabIcon"),
          tabBarLabel: createTabLabel("Settings", "SettingsTabLabel"),
        }}
      />
    </Tabs>
  );
}
