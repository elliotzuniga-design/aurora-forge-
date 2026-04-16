import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { colors } from "../constants/colors";
import { format } from "date-fns";

interface Agent {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string | null;
  lastResult?: string | null;
}

interface AgentStatusCardProps {
  agent: Agent;
  onToggle: (id: string, enabled: boolean) => void;
  onTrigger: (id: string) => void;
}

export function AgentStatusCard({
  agent,
  onToggle,
  onTrigger,
}: AgentStatusCardProps) {
  return (
    <View style={[styles.card, !agent.enabled && styles.cardDisabled]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: agent.enabled ? colors.success : colors.textDim },
            ]}
          />
          <Text style={styles.name}>{agent.name}</Text>
        </View>
        <Switch
          value={agent.enabled}
          onValueChange={(val) => onToggle(agent.id, val)}
          trackColor={{ false: colors.surface, true: colors.primaryDim }}
          thumbColor={agent.enabled ? colors.primary : colors.textMuted}
        />
      </View>

      <Text style={styles.description}>{agent.description}</Text>

      {agent.schedule && (
        <Text style={styles.schedule}>Schedule: {agent.schedule}</Text>
      )}

      {agent.lastRun && (
        <Text style={styles.lastRun}>
          Last run: {format(new Date(agent.lastRun), "MMM d, h:mm a")}
        </Text>
      )}

      {agent.lastResult && (
        <Text style={styles.lastResult} numberOfLines={2}>
          {agent.lastResult}
        </Text>
      )}

      <TouchableOpacity
        style={styles.triggerButton}
        onPress={() => onTrigger(agent.id)}
      >
        <Text style={styles.triggerText}>Run Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  description: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 8,
  },
  schedule: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 4,
  },
  lastRun: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 4,
  },
  lastResult: {
    fontSize: 12,
    color: colors.primary,
    marginBottom: 8,
  },
  triggerButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  triggerText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "500",
  },
});
