import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { BRAND_STATUS_BAR_COLOR, WEB_APP_URL } from "@/lib/web-app-config";

export default function WebAppScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>enV Mobile</Text>
      <Text style={styles.body}>The mobile shell targets Android and iOS. Use the full enV web application in your browser.</Text>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(WEB_APP_URL)} style={styles.button}>
        <Text style={styles.buttonText}>Open enV</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, backgroundColor: "#F7F7F4" },
  title: { color: "#202523", fontSize: 28, fontWeight: "800" },
  body: { color: "#5E6763", fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 12, marginBottom: 24 },
  button: { borderRadius: 14, paddingHorizontal: 24, minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: BRAND_STATUS_BAR_COLOR },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
