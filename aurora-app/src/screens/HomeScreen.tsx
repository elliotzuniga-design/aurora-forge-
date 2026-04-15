import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import { MessageBubble } from "../components/MessageBubble";
import { VoiceButton } from "../components/VoiceButton";
import { ThinkingIndicator } from "../components/ThinkingIndicator";
import { useConversation } from "../hooks/useConversation";
import { useVoice } from "../hooks/useVoice";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { Message } from "../store/conversationStore";
import type { RootStackParamList } from "../../App";

export function HomeScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {
    messages,
    isThinking,
    activeToolName,
    statusMessage,
    sendMessage,
    startNewConversation,
  } = useConversation();

  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList<Message>>(null);

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText("");
  }, [inputText, sendMessage]);

  const handleVoiceResult = useCallback(
    (text: string) => {
      if (text.trim()) {
        sendMessage(text);
      }
    },
    [sendMessage]
  );

  const {
    isListening,
    isAlwaysListening,
    partialTranscript,
    startRecording,
    stopRecording,
    toggleAlwaysListening,
  } = useVoice(handleVoiceResult);

  const handleVoicePressIn = useCallback(() => {
    startRecording();
  }, [startRecording]);

  const handleVoicePressOut = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} />,
    []
  );

  const keyExtractor = useCallback(
    (item: Message) => item.id,
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate("Conversations")}
          style={styles.historyButton}
        >
          <Text style={styles.historyText}>History</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AURORA</Text>
        <TouchableOpacity
          onPress={startNewConversation}
          style={styles.newChatButton}
        >
          <Text style={styles.newChatText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Status pill */}
      {statusMessage && (
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      )}

      {/* Thinking indicator */}
      {isThinking && (
        <ThinkingIndicator message={statusMessage} toolName={activeToolName} />
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>AURORA</Text>
            <Text style={styles.emptySubtitle}>
              Your personal AI. Say something.
            </Text>
          </View>
        }
      />

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Talk to Aurora..."
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={4000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />

          {inputText.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          ) : (
            <VoiceButton
              isListening={isListening}
              isAlwaysListening={isAlwaysListening}
              onPressIn={handleVoicePressIn}
              onPressOut={handleVoicePressOut}
              onDoubleTap={toggleAlwaysListening}
              partialTranscript={partialTranscript}
            />
          )}
        </View>
      </KeyboardAvoidingView>
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
    color: colors.primary,
    letterSpacing: 3,
  },
  historyButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  newChatButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  newChatText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  statusPill: {
    alignSelf: "center",
    backgroundColor: colors.surfaceLight,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: {
    fontSize: 12,
    color: colors.primary,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: 16,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 100,
  },
  emptyTitle: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 8,
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textMuted,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: "center",
  },
  sendButtonText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 15,
  },
});
