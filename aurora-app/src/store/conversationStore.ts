import { create } from "zustand";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  lastMessage: string;
  lastMessageAt: Date;
}

interface ConversationState {
  // Current active conversation
  conversationId: string | null;
  messages: Message[];
  isThinking: boolean;
  activeToolName: string | null;
  statusMessage: string | null;

  // Conversation list
  conversations: Conversation[];

  // Actions
  setConversationId: (id: string | null) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  setThinking: (thinking: boolean) => void;
  setActiveTool: (toolName: string | null) => void;
  setStatusMessage: (message: string | null) => void;
  setMessages: (messages: Message[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  clearConversation: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversationId: null,
  messages: [],
  isThinking: false,
  activeToolName: null,
  statusMessage: null,
  conversations: [],

  setConversationId: (conversationId) => set({ conversationId }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        messages[messages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + content,
        };
      }
      return { messages };
    }),

  setThinking: (isThinking) => set({ isThinking }),

  setActiveTool: (activeToolName) =>
    set({
      activeToolName,
      statusMessage: activeToolName
        ? `Aurora is using ${activeToolName}...`
        : null,
    }),

  setStatusMessage: (statusMessage) => set({ statusMessage }),

  setMessages: (messages) => set({ messages }),

  setConversations: (conversations) => set({ conversations }),

  clearConversation: () =>
    set({
      conversationId: null,
      messages: [],
      isThinking: false,
      activeToolName: null,
      statusMessage: null,
    }),
}));
