import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { type AppPaletteShape } from "@/constants/app-palette";
import { useAppPalette } from "@/lib/app-theme";
import {
  dismissAppAlert,
  getAppAlert,
  subscribeAppAlert,
} from "@/lib/app-alert";

export function AppAlertHost() {
  const palette = useAppPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const alert = useSyncExternalStore(
    subscribeAppAlert,
    getAppAlert,
    getAppAlert,
  );
  const [inputValue, setInputValue] = useState("");
  useEffect(() => {
    setInputValue(alert?.input?.initialValue ?? "");
  }, [alert]);
  const options = alert?.input?.options ?? [];
  const normalizedInput = inputValue.trim().toLowerCase();
  const filteredOptions = options.filter((option) =>
    normalizedInput.length === 0 || option.toLowerCase().includes(normalizedInput),
  );
  const hasValidSelection = options.length === 0 || options.includes(inputValue.trim());
  const hasSingleExactMatch = hasValidSelection && filteredOptions.length === 1;

  return (
    <Modal
      transparent
      visible={Boolean(alert)}
      animationType="fade"
      onRequestClose={() => dismissAppAlert()}
    >
      <Pressable style={styles.backdrop} onPress={() => dismissAppAlert()}>
        <Pressable
          accessibilityRole="alert"
          style={styles.dialog}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={styles.title}>{alert?.title}</Text>
          {alert?.message ? (
            <Text style={styles.message}>{alert.message}</Text>
          ) : null}
          {alert?.input ? (
            <>
              <TextInput
                autoFocus
                style={styles.input}
                value={inputValue}
                placeholder={options.length > 0 ? "Search available choices" : alert.input.placeholder}
                placeholderTextColor={palette.textSoft}
                onChangeText={setInputValue}
              />
              {options.length > 0 && !hasSingleExactMatch ? (
                <ScrollView style={styles.optionList} keyboardShouldPersistTaps="handled">
                  {filteredOptions.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.option, option === inputValue.trim() && styles.selectedOption]}
                      onPress={() => setInputValue(option)}
                    >
                      <Text style={styles.optionText}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                  {filteredOptions.length === 0 ? <Text style={styles.noOptions}>No matching eBay value. Finish later and review the category.</Text> : null}
                </ScrollView>
              ) : null}
            </>
          ) : null}
          <View style={styles.actions}>
            {alert?.buttons.map((button, index) => (
              <TouchableOpacity
                key={`${button.text ?? "OK"}-${index}`}
                style={[
                  styles.button,
                  button.inputSubmit && !hasValidSelection && styles.disabledButton,
                  button.style === "destructive" && styles.destructiveButton,
                  button.style === "cancel" && styles.cancelButton,
                ]}
                disabled={button.inputSubmit && !hasValidSelection}
                onPress={() => {
                  const input = alert?.input;
                  dismissAppAlert(false);
                  if (button.inputSubmit && input) input.onSubmit(inputValue.trim());
                  else button.onPress?.();
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

const createStyles = (palette: AppPaletteShape) => StyleSheet.create({
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
    backgroundColor: palette.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 12,
  },
  title: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  message: {
    color: palette.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  actions: {
    gap: 8,
  },
  input: {
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    color: palette.text,
    fontSize: 16,
    marginBottom: 14,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  optionList: {
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    maxHeight: 220,
  },
  option: {
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  selectedOption: { backgroundColor: palette.infoSoft },
  optionText: { color: palette.text, fontSize: 15 },
  noOptions: { color: palette.textMuted, fontSize: 13, lineHeight: 18, padding: 12 },
  disabledButton: { opacity: 0.45 },
  button: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: palette.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  destructiveButton: {
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: palette.dangerStrong,
  },
  buttonText: {
    color: palette.primaryOn,
    fontSize: 14,
    fontWeight: "700",
  },
  cancelButtonText: {
    color: palette.text,
  },
  destructiveButtonText: {
    color: palette.dangerStrong,
  },
});
