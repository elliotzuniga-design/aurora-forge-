import { useCallback, useRef } from "react";
import { useConversationStore, type Message } from "../store/conversationStore";
import { API_BASE_URL } from "../constants/api";
import * as SecureStore from "expo-secure-store";

export function useConversation() {
  const {
    conversationId,
    messages,
    isThinking,
    activeToolName,
    statusMessage,
    setConversationId,
    addMessage,
    updateLastMessage,
    setThinking,
    setActiveTool,
    setStatusMessage,
    clearConversation,
  } = useConversationStore();

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Add user message to the UI
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      addMessage(userMessage);
      setThinking(true);
      setStatusMessage("Aurora is thinking...");

      // Prepare streaming assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        toolsUsed: [],
      };
      addMessage(assistantMessage);

      try {
        const token = await SecureStore.getItemAsync("firebase_id_token");
        abortControllerRef.current = new AbortController();

        const response = await fetch(`${API_BASE_URL}/chat/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: text.trim(),
            conversationId: conversationId || undefined,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "conversation_id":
                  if (!conversationId) {
                    setConversationId(data.conversationId);
                  }
                  break;

                case "text":
                  updateLastMessage(data.content);
                  setStatusMessage(null);
                  break;

                case "tool_use":
                  setActiveTool(data.tool);
                  break;

                case "done":
                  setThinking(false);
                  setActiveTool(null);
                  setStatusMessage(null);
                  break;

                case "error":
                  setThinking(false);
                  setStatusMessage(null);
                  updateLastMessage(
                    `\n\n*Error: ${data.message}*`
                  );
                  break;
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setThinking(false);
        setStatusMessage(null);
        updateLastMessage(
          "\n\n*Connection error. Check your network and try again.*"
        );
      }
    },
    [
      conversationId,
      addMessage,
      updateLastMessage,
      setThinking,
      setActiveTool,
      setStatusMessage,
      setConversationId,
    ]
  );

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
    setThinking(false);
    setActiveTool(null);
    setStatusMessage(null);
  }, [setThinking, setActiveTool, setStatusMessage]);

  const startNewConversation = useCallback(() => {
    cancelStream();
    clearConversation();
  }, [cancelStream, clearConversation]);

  return {
    conversationId,
    messages,
    isThinking,
    activeToolName,
    statusMessage,
    sendMessage,
    cancelStream,
    startNewConversation,
  };
}
