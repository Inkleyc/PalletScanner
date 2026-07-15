import * as Haptics from "expo-haptics";

const runHaptic = async (
  callback: () => Promise<void>,
) => {
  try {
    await callback();
  } catch {
    // Haptics are a nice-to-have; never block the main flow.
  }
};

export const triggerAnalysisCompleteFeedback = () =>
  runHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );

export const triggerInventorySaveFeedback = () =>
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

export const triggerCopyFeedback = () =>
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
