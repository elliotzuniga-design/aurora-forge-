import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import { AgentStatusCard } from "../components/AgentStatusCard";
import api from "../services/api";

interface Agent {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string | null;
  lastResult?: string | null;
}

export function AgentsScreen() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get("/agents");
      setAgents(data.agents);
    } catch (err) {
      console.error("Failed to load agents:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await api.put(`/agents/${id}/toggle`, { enabled });
        setAgents((prev) =>
          prev.map((a) => (a.id === id ? { ...a, enabled } : a))
        );
      } catch (err) {
        console.error("Failed to toggle agent:", err);
      }
    },
    []
  );

  const handleTrigger = useCallback(
    async (id: string) => {
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;

      Alert.alert(
        `Run ${agent.name}?`,
        "This will trigger the agent to run immediately.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Run",
            onPress: async () => {
              try {
                const { data } = await api.post(`/agents/${id}/run`);
                Alert.alert("Agent Triggered", data.note || "Agent is running.");
                loadAgents(); // Refresh state
              } catch (err) {
                console.error("Failed to trigger agent:", err);
                Alert.alert("Error", "Failed to trigger agent.");
              }
            },
          },
        ]
      );
    },
    [agents, loadAgents]
  );

  const enabledCount = agents.filter((a) => a.enabled).length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Agents</Text>
        <Text style={styles.headerSubtitle}>
          {enabledCount}/{agents.length} active
        </Text>
      </View>

      <FlatList
        data={agents}
        renderItem={({ item }) => (
          <AgentStatusCard
            agent={item}
            onToggle={handleToggle}
            onTrigger={handleTrigger}
          />
        )}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {isLoading ? "Loading agents..." : "No agents configured."}
            </Text>
          </View>
        }
      />
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
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
