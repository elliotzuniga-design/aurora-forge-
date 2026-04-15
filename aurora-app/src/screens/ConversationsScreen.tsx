import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { colors } from "../constants/colors";
import { useConversationStore } from "../store/conversationStore";
import type { Conversation } from "../store/conversationStore";
import api from "../services/api";
import type { RootStackParamList } from "../../App";

type NavigationProp = StackNavigationProp<RootStackParamList, "Conversations">;

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ConversationsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { setConversationId, setMessages } = useConversationStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get("/chat/conversations");
      const convos: Conversation[] = (res.data.conversations || []).map(
        (c: { id: string; lastMessage?: string; lastMessageAt?: string }) => ({
          id: c.id,
          lastMessage: c.lastMessage || "",
          lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : new Date(),
        })
      );
      setConversations(convos);
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchConversations().finally(() => setIsLoading(false));
  }, [fetchConversations]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchConversations();
    setIsRefreshing(false);
  }, [fetchConversations]);

  const handleSelectConversation = useCallback(
    async (convo: Conversation) => {
      try {
        // Fetch messages for the selected conversation
        const res = await api.get(`/chat/conversations/${convo.id}/messages`);
        const msgs = (res.data.messages || []).map(
          (m: {
            id: string;
            role: "user" | "assistant";
            content: string;
            timestamp: string;
            toolsUsed?: Array<{ toolName: string }>;
          }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
            toolsUsed: m.toolsUsed?.map((t) => t.toolName),
          })
        );

        setConversationId(convo.id);
        setMessages(msgs);
        navigation.navigate("Home");
      } catch (err) {
        console.error("Failed to load conversation:", err);
      }
    },
    [navigation, setConversationId, setMessages]
  );

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => (
      <TouchableOpacity
        style={styles.conversationCard}
        onPress={() => handleSelectConversation(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <Text style={styles.lastMessage} numberOfLines={2}>
            {item.lastMessage || "New conversation"}
          </Text>
          <Text style={styles.timestamp}>
            {formatRelativeTime(item.lastMessageAt)}
          </Text>
        </View>
        <View style={styles.chevron}>
          <Text style={styles.chevronText}>&gt;</Text>
        </View>
      </TouchableOpacity>
    ),
    [handleSelectConversation]
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conversations</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>
                Start chatting with Aurora to see your history here
              </Text>
            </View>
          }
        />
      )}
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
  backButton: {
    fontSize: 16,
    color: colors.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardContent: {
    flex: 1,
  },
  lastMessage: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 4,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 12,
    color: colors.textDim,
  },
  chevron: {
    marginLeft: 12,
  },
  chevronText: {
    fontSize: 18,
    color: colors.textDim,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 60,
  },
  emptyText: {
    fontSize: 18,
    color: colors.textMuted,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
