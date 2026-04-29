import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppPalette } from "@/constants/app-palette";
import { markOnboardingSeen } from "@/lib/app-meta";

const slides = [
  {
    icon: "photo-camera",
    title: "Scan any item from a pallet or lot",
    copy: "Use photos or barcodes to capture items quickly while you sort through a pallet.",
  },
  {
    icon: "auto-awesome",
    title: "Get instant pricing and listing content",
    copy: "Claude helps estimate value, write listing copy, and keep your workflow moving.",
  },
  {
    icon: "share",
    title: "Move from scan to listing faster",
    copy: "Keep inventory organized and move into your current listing workflow without rewriting everything by hand.",
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = useMemo(() => slides[slideIndex], [slideIndex]);
  const isLastSlide = slideIndex === slides.length - 1;

  const completeOnboarding = () => {
    markOnboardingSeen();
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <MaterialIcons
              name={slide.icon}
              size={48}
              color={AppPalette.primaryOn}
            />
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.copy}>{slide.copy}</Text>
        </View>

        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === slideIndex && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {!isLastSlide ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setSlideIndex((current) => current + 1)}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={completeOnboarding}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppPalette.background,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: AppPalette.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: AppPalette.text,
    textAlign: "center",
    marginBottom: 14,
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: AppPalette.textMuted,
    textAlign: "center",
    maxWidth: 340,
  },
  pagination: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppPalette.borderStrong,
  },
  dotActive: {
    width: 28,
    backgroundColor: AppPalette.primaryStrong,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryButtonText: {
    color: AppPalette.primaryOn,
    fontSize: 16,
    fontWeight: "700",
  },
});
