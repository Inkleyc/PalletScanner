import { useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AppPalette } from "@/constants/app-palette";
import {
  dismissAppAlert,
  getAppAlert,
  subscribeAppAlert,
} from "@/lib/app-alert";

export function AppAlertHost() {
  const alert = useSyncExternalStore(
    subscribeAppAlert,
    getAppAlert,
    getAppAlert,
  );

  return (
    <Modal
      transparent
      visible={Boolean(alert)}
      animationType="fade"
      onRequestClose={dismissAppAlert}
    >
      <Pressable style={styles.backdrop} onPress={dismissAppAlert}>
        <Pressable
          accessibilityRole="alert"
          style={styles.dialog}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={styles.title}>{alert?.title}</Text>
          {alert?.message ? (
            <Text style={styles.message}>{alert.message}</Text>
          ) : null}
          <View style={styles.actions}>
            {alert?.buttons.map((button, index) => (
              <TouchableOpacity
                key={`${button.text ?? "OK"}-${index}`}
                style={[
                  styles.button,
                  button.style === "destructive" && styles.destructiveButton,
                  button.style === "cancel" && styles.cancelButton,
                ]}
                onPress={() => {
                  dismissAppAlert();
                  button.onPress?.();
                }}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === "destructive" &&
                      styles.destructiveButtonText,
                    button.style === "cancel" && styles.cancelButtonText,
                  ]}
                >
                  {button.text ?? "OK"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 18, 28, 0.56)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: AppPalette.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppPalette.border,
    padding: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 12,
  },
  title: {
    color: AppPalette.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  message: {
    color: AppPalette.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  actions: {
    gap: 8,
  },
  button: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: AppPalette.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: AppPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: AppPalette.border,
  },
  destructiveButton: {
    backgroundColor: AppPalette.dangerSoft,
    borderWidth: 1,
    borderColor: AppPalette.dangerStrong,
  },
  buttonText: {
    color: AppPalette.primaryOn,
    fontSize: 14,
    fontWeight: "700",
  },
  cancelButtonText: {
    color: AppPalette.text,
  },
  destructiveButtonText: {
    color: AppPalette.dangerStrong,
  },
});
