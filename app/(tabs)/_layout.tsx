import { Tabs } from "expo-router";
import React from "react";
import { Platform, Text, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AppPalette } from "@/constants/app-palette";

export default function TabLayout() {
  const activeTint = AppPalette.primaryStrong;
  const inactiveTint = AppPalette.textMuted;
  const isTablet = Platform.OS === "ios" && Platform.isPad;
  const createTabIcon = (
    name: React.ComponentProps<typeof IconSymbol>["name"],
    displayName: string,
  ) => {
    const TabIcon = ({ color, focused }: { color: string; focused: boolean }) => (
      <View
        style={{
          minWidth: isTablet ? 48 : 44,
          height: isTablet ? 36 : 34,
          borderRadius: isTablet ? 18 : 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? activeTint : "transparent",
        }}
      >
        <IconSymbol
          size={focused ? (isTablet ? 30 : 28) : isTablet ? 26 : 24}
          name={name}
          color={focused ? "#ffffff" : color}
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
          backgroundColor: AppPalette.surface,
          borderTopColor: AppPalette.border,
          borderTopWidth: 1,
          height: isTablet ? 86 : 74,
          paddingTop: isTablet ? 10 : 8,
          paddingBottom: isTablet ? 10 : 8,
          shadowColor: AppPalette.shadow,
          shadowOpacity: 1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarItemStyle: {
          paddingVertical: isTablet ? 4 : 3,
        },
        tabBarActiveBackgroundColor: "transparent",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: createTabIcon("house.fill", "HomeTabIcon"),
          tabBarLabel: createTabLabel("Home", "HomeTabLabel"),
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
          tabBarIcon: createTabIcon("chart.bar.fill", "StatsTabIcon"),
          tabBarLabel: createTabLabel("Stats", "StatsTabLabel"),
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
