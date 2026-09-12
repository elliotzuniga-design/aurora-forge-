import { useState, useCallback } from "react";
import api from "../services/api";

interface MemoryEntry {
  id: string;
  content: string;
  type: "episodic" | "semantic" | "procedural" | "working";
  importance: number;
  timestamp: string;
  source: string;
  topics: string[];
}

export function useMemory() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);

  const searchMemories = useCallback(
    async (query: string, type?: string) => {
      setIsLoading(true);
      try {
        const params: Record<string, string> = { q: query };
        if (type) params.type = type;
        const { data } = await api.get("/memory/search", { params });
        setMemories(data.results);
        return data.results;
      } catch (err) {
        console.error("Memory search failed:", err);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const listMemories = useCallback(
    async (type?: string, topic?: string) => {
      setIsLoading(true);
      try {
        const params: Record<string, string> = {};
        if (type) params.type = type;
        if (topic) params.topic = topic;
        const { data } = await api.get("/memory/list", { params });
        setMemories(data.results);
        return data.results;
      } catch (err) {
        console.error("Memory list failed:", err);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const addMemory = useCallback(
    async (
      content: string,
      type: MemoryEntry["type"],
      importance: number,
      topics: string[]
    ) => {
      try {
        const { data } = await api.post("/memory/add", {
          content,
          type,
          importance,
          topics,
        });
        return data.id;
      } catch (err) {
        console.error("Add memory failed:", err);
        return null;
      }
    },
    []
  );

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get("/memory/profile");
      setProfile(data.profile);
      return data.profile;
    } catch (err) {
      console.error("Profile load failed:", err);
      return null;
    }
  }, []);

  return {
    memories,
    isLoading,
    profile,
    searchMemories,
    listMemories,
    addMemory,
    loadProfile,
  };
}
