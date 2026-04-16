import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import { useMemory } from "../hooks/useMemory";
import { format } from "date-fns";

const MEMORY_TYPES = [
  { key: "all", label: "All" },
  { key: "semantic", label: "Facts" },
  { key: "episodic", label: "Events" },
  { key: "procedural", label: "Patterns" },
  { key: "working", label: "Active" },
] as const;

interface MemoryItem {
  id: string;
  content: string;
  type: string;
  importance: number;
  timestamp: string;
  topics: string[];
  source: string;
}

export function MemoryScreen() {
  const { memories, isLoading, profile, searchMemories, listMemories, loadProfile } =
    useMemory();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState("all");

  useEffect(() => {
    listMemories();
    loadProfile();
  }, [listMemories, loadProfile]);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      searchMemories(
        searchQuery,
        activeType === "all" ? undefined : activeType
      );
    } else {
      listMemories(activeType === "all" ? undefined : activeType);
    }
  }, [searchQuery, activeType, searchMemories, listMemories]);

  const handleTypeFilter = useCallback(
    (type: string) => {
      setActiveType(type);
      if (searchQuery.trim()) {
        searchMemories(searchQuery, type === "all" ? undefined : type);
      } else {
        listMemories(type === "all" ? undefined : type);
      }
    },
    [searchQuery, searchMemories, listMemories]
  );

  const renderMemory = useCallback(({ item }: { item: MemoryItem }) => {
    const typeColors: Record<string, string> = {
      semantic: colors.primary,
      episodic: colors.secondary,
      procedural: colors.accent,
      working: colors.warning,
    };

    return (
      <View style={styles.memoryCard}>
        <View style={styles.memoryHeader}>
          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: `${typeColors[item.type] || colors.textMuted}20`,
              },
            ]}
          >
            <Text
              style={[
                styles.typeText,
                { color: typeColors[item.type] || colors.textMuted },
              ]}
            >
              {item.type}
            </Text>
          </View>
          <View style={styles.importanceBadge}>
            <Text style={styles.importanceText}>{item.importance}/10</Text>
          </View>
        </View>

        <Text style={styles.memoryContent}>{item.content}</Text>

        <View style={styles.memoryFooter}>
          <Text style={styles.memoryDate}>
            {format(new Date(item.timestamp), "MMM d, yyyy")}
          </Text>
          {item.topics?.length > 0 && (
            <View style={styles.topicRow}>
              {item.topics.slice(0, 3).map((topic, i) => (
                <Text key={i} style={styles.topicTag}>
                  {topic}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memory</Text>
        <Text style={styles.headerSubtitle}>
          {memories.length} memories stored
        </Text>
      </View>

      {/* Profile Summary */}
      {profile && (
        <View style={styles.profileCard}>
          <Text style={styles.profileTitle}>What Aurora Knows About You</Text>
          <Text style={styles.profileText} numberOfLines={4}>
            {profile}
          </Text>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search memories..."
          placeholderTextColor={colors.textDim}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
      </View>

      {/* Type Filters */}
      <View style={styles.filterRow}>
        {MEMORY_TYPES.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.filterChip,
              activeType === key && styles.filterChipActive,
            ]}
            onPress={() => handleTypeFilter(key)}
          >
            <Text
              style={[
                styles.filterText,
                activeType === key && styles.filterTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Memory List */}
      <FlatList
        data={memories}
        renderItem={renderMemory}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {isLoading
                ? "Loading memories..."
                : "No memories yet. Start talking to Aurora."}
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
  profileCard: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  profileTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginBottom: 8,
  },
  profileText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  filterTextActive: {
    color: "#000",
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  memoryCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  importanceBadge: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  importanceText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  memoryContent: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  memoryFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  memoryDate: {
    fontSize: 11,
    color: colors.textDim,
  },
  topicRow: {
    flexDirection: "row",
    gap: 4,
  },
  topicTag: {
    fontSize: 10,
    color: colors.textMuted,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
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
