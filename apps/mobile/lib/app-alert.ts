export type AppAlertButton = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
  inputSubmit?: boolean;
};

type AlertState = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  onDismiss?: () => void;
  input?: { initialValue?: string; placeholder?: string; options?: string[]; onSubmit: (value: string) => void };
};

const listeners = new Set<() => void>();
let alertState: AlertState | null = null;

const notify = () => listeners.forEach((listener) => listener());

export const subscribeAppAlert = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getAppAlert = () => alertState;

export const dismissAppAlert = (notifyDismiss = true) => {
  const onDismiss = alertState?.onDismiss;
  alertState = null;
  notify();
  if (notifyDismiss) {
    onDismiss?.();
  }
};

export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AppAlertButton[],
    onDismiss?: () => void,
  ) {
    alertState = {
      title,
      message,
      buttons:
        buttons && buttons.length > 0
          ? buttons
          : [{ text: "OK", style: "cancel" }],
      onDismiss,
    };
    notify();
  },
  confirm(title: string, message: string, confirmText = "Continue") {
    return new Promise<boolean>((resolve) => {
      AppAlert.alert(
        title,
        message,
        [
          { text: "Not yet", style: "cancel", onPress: () => resolve(false) },
          { text: confirmText, onPress: () => resolve(true) },
        ],
        () => resolve(false),
      );
    });
  },
  prompt(title: string, message: string, initialValue = "", placeholder = "", options: string[] = []) {
    return new Promise<string | null>((resolve) => {
      alertState = {
        title,
        message,
        input: { initialValue, placeholder, options, onSubmit: resolve },
        buttons: [
          { text: "Finish later", style: "cancel", onPress: () => resolve(null) },
          { text: "Continue", inputSubmit: true },
        ],
        onDismiss: () => resolve(null),
      };
      notify();
    });
  },
};
