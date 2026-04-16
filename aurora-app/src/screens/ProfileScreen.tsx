import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../constants/colors";
import api from "../services/api";

interface Profile {
  name: string;
  location: string;
  work: string;
  family: string[];
  goals: string[];
  currentProjects: string[];
  healthConditions: string[];
  communicationStyle: string;
}

const EMPTY_PROFILE: Profile = {
  name: "",
  location: "",
  work: "",
  family: [],
  goals: [],
  currentProjects: [],
  healthConditions: [],
  communicationStyle: "",
};

export function ProfileScreen() {
  const navigation = useNavigation();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Editable list temp values
  const [newFamily, setNewFamily] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newProject, setNewProject] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.get("/profile");
      const p = res.data.profile || {};
      setProfile({
        name: p.name || "",
        location: p.location || "",
        work: p.work || "",
        family: p.family || [],
        goals: p.goals || [],
        currentProjects: p.currentProjects || [],
        healthConditions: p.healthConditions || [],
        communicationStyle: p.communicationStyle || "",
      });
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateField = (field: keyof Profile, value: string | string[]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const addToList = (
    field: "family" | "goals" | "currentProjects",
    value: string,
    setter: (v: string) => void
  ) => {
    if (!value.trim()) return;
    updateField(field, [...profile[field], value.trim()]);
    setter("");
  };

  const removeFromList = (
    field: "family" | "goals" | "currentProjects",
    index: number
  ) => {
    updateField(
      field,
      profile[field].filter((_, i) => i !== index)
    );
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put("/profile", profile);
      setDirty(false);
      Alert.alert("Saved", "Profile updated. Aurora will use this context in conversations.");
    } catch (err) {
      Alert.alert("Error", "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 50 }} />
        </View>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.loader}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        {dirty ? (
          <TouchableOpacity onPress={saveProfile} disabled={saving}>
            <Text style={styles.saveText}>
              {saving ? "Saving..." : "Save"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>BASICS</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={profile.name}
              onChangeText={(v) => updateField("name", v)}
              placeholder="Your name"
              placeholderTextColor={colors.textDim}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={styles.fieldInput}
              value={profile.location}
              onChangeText={(v) => updateField("location", v)}
              placeholder="City, State"
              placeholderTextColor={colors.textDim}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Work</Text>
            <TextInput
              style={styles.fieldInput}
              value={profile.work}
              onChangeText={(v) => updateField("work", v)}
              placeholder="What do you do?"
              placeholderTextColor={colors.textDim}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>FAMILY</Text>
        <View style={styles.card}>
          {profile.family.map((member, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listText}>{member}</Text>
              <TouchableOpacity onPress={() => removeFromList("family", i)}>
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newFamily}
              onChangeText={setNewFamily}
              placeholder="Add family member (e.g. 'Sarah - wife')"
              placeholderTextColor={colors.textDim}
              onSubmitEditing={() =>
                addToList("family", newFamily, setNewFamily)
              }
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={() => addToList("family", newFamily, setNewFamily)}
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>GOALS</Text>
        <View style={styles.card}>
          {profile.goals.map((goal, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listText}>{goal}</Text>
              <TouchableOpacity onPress={() => removeFromList("goals", i)}>
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newGoal}
              onChangeText={setNewGoal}
              placeholder="Add a life goal"
              placeholderTextColor={colors.textDim}
              onSubmitEditing={() => addToList("goals", newGoal, setNewGoal)}
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={() => addToList("goals", newGoal, setNewGoal)}
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>CURRENT PROJECTS</Text>
        <View style={styles.card}>
          {profile.currentProjects.map((proj, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listText}>{proj}</Text>
              <TouchableOpacity
                onPress={() => removeFromList("currentProjects", i)}
              >
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newProject}
              onChangeText={setNewProject}
              placeholder="Add a project"
              placeholderTextColor={colors.textDim}
              onSubmitEditing={() =>
                addToList("currentProjects", newProject, setNewProject)
              }
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={() =>
                addToList("currentProjects", newProject, setNewProject)
              }
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>COMMUNICATION STYLE</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.multilineInput}
            value={profile.communicationStyle}
            onChangeText={(v) => updateField("communicationStyle", v)}
            placeholder="How should Aurora talk to you? (e.g. 'Direct, no fluff, action-oriented')"
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
          />
        </View>

        <Text style={styles.hint}>
          This info helps Aurora personalize conversations, morning briefings,
          and proactive alerts. It's stored in your private Firestore database.
        </Text>

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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  backText: {
    fontSize: 15,
    color: colors.primary,
  },
  saveText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: "700",
  },
  loader: {
    marginTop: 60,
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
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    fontSize: 15,
    color: colors.textMuted,
    width: 80,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    textAlign: "right",
    padding: 0,
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listText: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  removeText: {
    fontSize: 20,
    color: colors.error,
    paddingLeft: 12,
    fontWeight: "700",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  addInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  addButtonText: {
    fontSize: 22,
    color: colors.primary,
    fontWeight: "700",
  },
  multilineInput: {
    fontSize: 15,
    color: colors.text,
    padding: 16,
    minHeight: 80,
    textAlignVertical: "top",
  },
  hint: {
    fontSize: 12,
    color: colors.textDim,
    textAlign: "center",
    marginTop: 20,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  bottomSpacer: {
    height: 40,
  },
});
