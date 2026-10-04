import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BRAND_STATUS_BAR_COLOR } from "@/lib/web-app-config";

type Props = {
  onRetry: () => void;
  reason: "connection" | "renderer";
};

export function ConnectionErrorView({ onRetry, reason }: Props) {
  const rendererStopped = reason === "renderer";
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.markText}>enV</Text>
        </View>
        <Text style={styles.title}>
          {rendererStopped ? "enV stopped unexpectedly" : "Can’t connect to enV"}
        </Text>
        <Text style={styles.body}>
          {rendererStopped
            ? "The app page closed unexpectedly. Try reloading it; changes that were not saved may be lost."
            : "Check your internet connection and try again. Your in-progress changes may not be available until the page loads again."}
        </Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F7F4" },
  container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  mark: { width: 72, height: 72, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginBottom: 22, borderWidth: 1, borderColor: "#E2E4E1" },
  markText: { color: BRAND_STATUS_BAR_COLOR, fontSize: 24, fontWeight: "800", letterSpacing: -1 },
  title: { color: "#202523", fontSize: 23, fontWeight: "700", textAlign: "center" },
  body: { color: "#5E6763", fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 10, marginBottom: 26 },
  primaryButton: { minHeight: 48, paddingHorizontal: 24, borderRadius: 14, backgroundColor: BRAND_STATUS_BAR_COLOR, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.75 },
});
