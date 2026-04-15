import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../constants/colors";
import { format } from "date-fns";
import type { Message } from "../store/conversationStore";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isUser ? styles.userText : styles.assistantText,
          ]}
          selectable
        >
          {message.content}
          {message.isStreaming && <Text style={styles.cursor}>|</Text>}
        </Text>

        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <View style={styles.toolChips}>
            {message.toolsUsed.map((tool, i) => (
              <View key={i} style={styles.toolChip}>
                <Text style={styles.toolChipText}>used {tool}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.timestamp}>
        {format(new Date(message.timestamp), "h:mm a")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
    maxWidth: "85%",
  },
  userContainer: {
    alignSelf: "flex-end",
  },
  assistantContainer: {
    alignSelf: "flex-start",
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: colors.messageBubbleUser,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.messageBubbleAssistant,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: "#000",
  },
  assistantText: {
    color: colors.text,
  },
  cursor: {
    color: colors.primary,
    fontWeight: "bold",
  },
  timestamp: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  toolChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 4,
  },
  toolChip: {
    backgroundColor: "rgba(0, 212, 170, 0.15)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  toolChipText: {
    fontSize: 11,
    color: colors.primary,
  },
});
