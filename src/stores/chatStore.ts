import { create } from "zustand";
import type { ChatMessage } from "@/types";

interface ChatStoreState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  updateMessageContent: (id: string, content: string) => void;
  appendMessageContent: (id: string, delta: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useChatStore = create<ChatStoreState>((set) => ({
  messages: [],
  loading: false,
  error: null,
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessageContent: (id, content) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id
          ? {
              ...message,
              content
            }
          : message
      )
    })),
  appendMessageContent: (id, delta) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id
          ? {
              ...message,
              content: `${message.content}${delta}`
            }
          : message
      )
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clear: () => set({ messages: [], error: null })
}));
