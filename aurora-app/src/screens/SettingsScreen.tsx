import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import { signOut } from "../services/auth";
import { useUserStore } from "../store/userStore";
import { API_BASE_URL } from "../constants/api";

export function SettingsScreen() {
  const { user } = useUserStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [proactiveAlerts, setProactiveAlerts] = useState(true);

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of Aurora?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Account Section */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user?.email || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>User ID</Text>
            <Text style={styles.valueMono}>{user?.uid?.slice(0, 12)}...</Text>
          </View>
        </View>

        {/* Server Section */}
        <Text style={styles.sectionTitle}>SERVER</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Backend URL</Text>
            <Text style={styles.valueMono}>{API_BASE_URL}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Connected</Text>
            </View>
          </View>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionTitle}>PREFERENCES</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.label}>Push Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.surface, true: colors.primaryDim }}
              thumbColor={
                notificationsEnabled ? colors.primary : colors.textMuted
              }
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.label}>Voice Input</Text>
            <Switch
              value={voiceEnabled}
              onValueChange={setVoiceEnabled}
              trackColor={{ false: colors.surface, true: colors.primaryDim }}
              thumbColor={voiceEnabled ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.label}>Proactive Alerts</Text>
            <Switch
              value={proactiveAlerts}
              onValueChange={setProactiveAlerts}
              trackColor={{ false: colors.surface, true: colors.primaryDim }}
              thumbColor={
                proactiveAlerts ? colors.primary : colors.textMuted
              }
            />
          </View>
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>1.0.0</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>AI Model</Text>
            <Text style={styles.value}>Claude Sonnet 4</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Memory Backend</Text>
            <Text style={styles.value}>ChromaDB</Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: 15,
    color: colors.text,
  },
  value: {
    fontSize: 15,
    color: colors.textMuted,
  },
  valueMono: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: 14,
    color: colors.success,
  },
  signOutButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 32,
    borderWidth: 1,
    borderColor: colors.error,
  },
  signOutText: {
    fontSize: 16,
    color: colors.error,
    fontWeight: "600",
  },
  bottomSpacer: {
    height: 40,
  },
});

