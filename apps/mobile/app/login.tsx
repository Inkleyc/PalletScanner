import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { AppPalette } from "@/constants/app-palette";
import { AppAlert as Alert } from "@/lib/app-alert";
import {
  enableTestMode,
  getSupabaseAuthSnapshot,
  hydrateSupabaseAuth,
  sendSupabaseOtp,
  subscribeSupabaseAuth,
  verifySupabaseOtp,
} from "@/lib/supabase-auth";

export default function LoginScreen() {
  const router = useRouter();
  const auth = useSyncExternalStore(
    subscribeSupabaseAuth,
    getSupabaseAuthSnapshot,
    getSupabaseAuthSnapshot,
  );
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    void hydrateSupabaseAuth();
  }, []);

  useEffect(() => {
    if (auth.ready && (auth.signedIn || auth.testMode)) {
      router.replace("/(tabs)");
    }
  }, [auth.ready, auth.signedIn, auth.testMode, router]);

  const sendLoginCode = async () => {
    if (!email.trim()) {
      Alert.alert("Enter your email", "Type the email address you want to use.");
      return;
    }

    setIsSending(true);
    try {
      const normalizedEmail = email.trim();
      await sendSupabaseOtp(normalizedEmail);
      setPendingEmail(normalizedEmail);
      setVerificationCode("");
      Alert.alert(
        "Check your email",
        "Enter the verification code from your email.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to send login link",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const verifyLoginCode = async () => {
    if (!verificationCode.trim()) {
      Alert.alert("Enter your code", "Type the verification code from your email.");
      return;
    }

    setIsVerifying(true);
    try {
      await verifySupabaseOtp(pendingEmail, verificationCode);
    } catch (error) {
      Alert.alert(
        "Unable to verify code",
        error instanceof Error ? error.message : "Request a new code and try again.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  if (!auth.ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={AppPalette.primaryStrong} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <MaterialIcons name="inventory-2" size={42} color={AppPalette.primaryOn} />
        </View>
        <Text style={styles.title}>PalletFlip</Text>
        <Text style={styles.subtitle}>
          Sign in to keep your inventory synced across the app and dashboard.
        </Text>

        {!auth.configured ? (
          <Text style={styles.error}>App login is not configured.</Text>
        ) : (
          <>
            {!pendingEmail ? (
              <>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor={AppPalette.textSoft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (isSending || !email.trim()) && styles.disabledButton,
                  ]}
                  disabled={isSending || !email.trim()}
                  onPress={() => {
                    void sendLoginCode();
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSending ? "Sending..." : "Send Verification Code"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.codeSentText}>Code sent to {pendingEmail}</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  placeholder="Verification code"
                  placeholderTextColor={AppPalette.textSoft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={8}
                  textContentType="oneTimeCode"
                />
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (isVerifying || !verificationCode.trim()) &&
                      styles.disabledButton,
                  ]}
                  disabled={isVerifying || !verificationCode.trim()}
                  onPress={() => {
                    void verifyLoginCode();
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {isVerifying ? "Verifying..." : "Verify and Sign In"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.changeEmailButton}
                  onPress={() => {
                    setPendingEmail("");
                    setVerificationCode("");
                  }}
                >
                  <Text style={styles.changeEmailText}>Use a different email</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
        {auth.testModeAvailable ? (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.testButton}
              onPress={() => {
                void enableTestMode();
              }}
            >
              <Text style={styles.testButtonText}>Continue in Test Mode</Text>
            </TouchableOpacity>
            <Text style={styles.testHint}>
              Uses local test data. Cloud inventory stays disconnected.
            </Text>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppPalette.background },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppPalette.background,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    justifyContent: "center",
    padding: 24,
  },
  brandMark: {
    width: 76,
    height: 76,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppPalette.primaryStrong,
    marginBottom: 24,
  },
  title: {
    color: AppPalette.text,
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: AppPalette.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    backgroundColor: AppPalette.surface,
    color: AppPalette.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  codeInput: {
    fontSize: 20,
    letterSpacing: 4,
    textAlign: "center",
  },
  codeSentText: {
    color: AppPalette.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: AppPalette.primaryStrong,
    borderRadius: 8,
    marginTop: 12,
    paddingVertical: 14,
  },
  disabledButton: { opacity: 0.56 },
  primaryButtonText: {
    color: AppPalette.primaryOn,
    fontSize: 15,
    fontWeight: "700",
  },
  changeEmailButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  changeEmailText: {
    color: AppPalette.primaryStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: AppPalette.border,
    marginVertical: 22,
  },
  testButton: {
    alignItems: "center",
    borderColor: AppPalette.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 13,
  },
  testButtonText: {
    color: AppPalette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  testHint: {
    color: AppPalette.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  error: {
    color: AppPalette.dangerStrong,
    fontSize: 14,
    lineHeight: 20,
  },
});
