import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import api from "../services/api";

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  targetDate?: string;
  completedDate?: string;
}

interface Goal {
  id: string;
  domain: string;
  title: string;
  description: string;
  targetDate?: string;
  successMetrics: string[];
  currentProgress: number;
  milestones: Milestone[];
  priority: 1 | 2 | 3;
}

const DOMAIN_LABELS: Record<string, { label: string; color: string }> = {
  health: { label: "Health", color: "#10B981" },
  family: { label: "Family", color: "#F59E0B" },
  financial: { label: "Financial", color: "#06B6D4" },
  career: { label: "Career", color: "#7C3AED" },
  business: { label: "Business", color: "#3B82F6" },
  personal_growth: { label: "Growth", color: "#EC4899" },
  legacy: { label: "Legacy", color: "#F97316" },
};

const DOMAINS = Object.keys(DOMAIN_LABELS);

export function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // New goal form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDomain, setNewDomain] = useState("personal_growth");

  const fetchGoals = useCallback(async () => {
    try {
      const params = filter ? { domain: filter } : {};
      const response = await api.get("/goals", { params });
      setGoals(response.data.goals);
    } catch (err) {
      console.error("Failed to fetch goals:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const createGoal = async () => {
    if (!newTitle.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    try {
      await api.post("/goals", {
        domain: newDomain,
        title: newTitle.trim(),
        description: newDescription.trim(),
      });
      setNewTitle("");
      setNewDescription("");
      setShowAddModal(false);
      fetchGoals();
    } catch (err) {
      console.error("Failed to create goal:", err);
      Alert.alert("Error", "Failed to create goal");
    }
  };

  const toggleMilestone = async (
    goalId: string,
    milestoneId: string,
    completed: boolean
  ) => {
    try {
      await api.put(`/goals/${goalId}/milestones/${milestoneId}`, {
        completed: !completed,
      });
      fetchGoals();
    } catch (err) {
      console.error("Failed to toggle milestone:", err);
    }
  };

  const deleteGoal = (goalId: string, title: string) => {
    Alert.alert("Delete Goal", `Delete "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.delete(`/goals/${goalId}`);
          fetchGoals();
        },
      },
    ]);
  };

  const renderGoal = ({ item }: { item: Goal }) => {
    const domainInfo = DOMAIN_LABELS[item.domain] || {
      label: item.domain,
      color: colors.textMuted,
    };

    return (
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View
            style={[styles.domainBadge, { backgroundColor: domainInfo.color + "20" }]}
          >
            <Text style={[styles.domainText, { color: domainInfo.color }]}>
              {domainInfo.label}
            </Text>
          </View>
          <Text style={styles.priorityText}>P{item.priority}</Text>
        </View>

        <Text style={styles.goalTitle}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.goalDescription}>{item.description}</Text>
        ) : null}

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${item.currentProgress}%`,
                  backgroundColor: domainInfo.color,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{item.currentProgress}%</Text>
        </View>

        {/* Milestones */}
        {item.milestones.length > 0 && (
          <View style={styles.milestonesContainer}>
            {item.milestones.map((ms) => (
              <TouchableOpacity
                key={ms.id}
                style={styles.milestoneRow}
                onPress={() => toggleMilestone(item.id, ms.id, ms.completed)}
              >
                <View
                  style={[
                    styles.checkbox,
                    ms.completed && styles.checkboxChecked,
                  ]}
                >
                  {ms.completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text
                  style={[
                    styles.milestoneText,
                    ms.completed && styles.milestoneCompleted,
                  ]}
                >
                  {ms.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteGoal(item.id, item.title)}
        >
          <Text style={styles.deleteText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Goals</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Domain filter chips */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !filter && styles.filterChipActive]}
          onPress={() => setFilter(null)}
        >
          <Text
            style={[
              styles.filterChipText,
              !filter && styles.filterChipTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        {DOMAINS.map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.filterChip, filter === d && styles.filterChipActive]}
            onPress={() => setFilter(filter === d ? null : d)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === d && styles.filterChipTextActive,
              ]}
            >
              {DOMAIN_LABELS[d].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={goals}
          renderItem={renderGoal}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No goals yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap + Add or tell Aurora about your goals in chat
              </Text>
            </View>
          }
        />
      )}

      {/* Add Goal Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Goal</Text>

            <Text style={styles.inputLabel}>Domain</Text>
            <View style={styles.domainPicker}>
              {DOMAINS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.domainOption,
                    newDomain === d && {
                      backgroundColor: DOMAIN_LABELS[d].color + "30",
                      borderColor: DOMAIN_LABELS[d].color,
                    },
                  ]}
                  onPress={() => setNewDomain(d)}
                >
                  <Text
                    style={[
                      styles.domainOptionText,
                      newDomain === d && { color: DOMAIN_LABELS[d].color },
                    ]}
                  >
                    {DOMAIN_LABELS[d].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="What do you want to achieve?"
              placeholderTextColor={colors.textDim}
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Details, motivation, success criteria..."
              placeholderTextColor={colors.textDim}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={createGoal}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary + "20",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addButtonText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary + "20",
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  loader: {
    marginTop: 60,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  domainBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  domainText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  priorityText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  goalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  goalDescription: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 20,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
    minWidth: 36,
    textAlign: "right",
  },
  milestonesContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textDim,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
  },
  milestoneText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  milestoneCompleted: {
    color: colors.textDim,
    textDecorationLine: "line-through",
  },
  deleteButton: {
    marginTop: 10,
    alignSelf: "flex-end",
  },
  deleteText: {
    fontSize: 12,
    color: colors.error,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },
  domainPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  domainOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  domainOptionText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: "600",
  },
  createButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  createButtonText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "700",
  },
});
