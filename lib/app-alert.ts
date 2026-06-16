import { Alert as NativeAlert, Platform } from "react-native";

export type AppAlertButton = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type AlertState = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
};

const listeners = new Set<() => void>();
let alertState: AlertState | null = null;

const notify = () => listeners.forEach((listener) => listener());

export const subscribeAppAlert = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getAppAlert = () => alertState;

export const dismissAppAlert = () => {
  alertState = null;
  notify();
};

export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AppAlertButton[],
  ) {
    if (Platform.OS !== "web") {
      NativeAlert.alert(title, message, buttons);
      return;
    }

    alertState = {
      title,
      message,
      buttons:
        buttons && buttons.length > 0
          ? buttons
          : [{ text: "OK", style: "cancel" }],
    };
    notify();
  },
};
