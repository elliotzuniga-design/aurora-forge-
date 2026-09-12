import { ChromaClient, type Collection } from "chromadb";
import { v4 as uuid } from "uuid";
import { callClaude } from "./claude.js";
import type { MemoryEntry } from "../types/index.js";

const CHROMA_HOST = process.env.CHROMA_HOST || "http://localhost:8000";

let client: ChromaClient | null = null;

function getClient(): ChromaClient {
  if (!client) {
    client = new ChromaClient({ path: CHROMA_HOST });
  }
  return client;
}

// ─── Collection Management ─────────────────────────────────────

const COLLECTIONS = [
  "aurora_episodic", // specific events and experiences
  "aurora_semantic", // facts and knowledge about the user
  "aurora_procedural", // patterns and preferences
  "aurora_working", // current active context (ephemeral)
] as const;

type CollectionName = (typeof COLLECTIONS)[number];

const MEMORY_TYPE_TO_COLLECTION: Record<MemoryEntry["type"], CollectionName> = {
  episodic: "aurora_episodic",
  semantic: "aurora_semantic",
  procedural: "aurora_procedural",
  working: "aurora_working",
};

async function getCollection(name: CollectionName): Promise<Collection> {
  const chroma = getClient();
  return chroma.getOrCreateCollection({ name });
}

// ─── Store Memory ──────────────────────────────────────────────

export async function storeMemory(
  uid: string,
  entry: Omit<MemoryEntry, "id">
): Promise<string> {
  const collectionName = MEMORY_TYPE_TO_COLLECTION[entry.type];
  const collection = await getCollection(collectionName);
  const id = uuid();

  await collection.add({
    ids: [id],
    documents: [entry.content],
    metadatas: [
      {
        uid,
        importance: entry.importance,
        timestamp: entry.timestamp.toISOString(),
        source: entry.source,
        topics: JSON.stringify(entry.topics),
        emotionalValence: entry.emotionalValence ?? 0,
        ...entry.metadata,
      },
    ],
  });

  return id;
}

// ─── Search Memories ───────────────────────────────────────────

export async function searchMemories(
  uid: string,
  query: string,
  type?: string,
  limit: number = 12
): Promise<MemoryEntry[]> {
  const collectionsToSearch: CollectionName[] = type
    ? [MEMORY_TYPE_TO_COLLECTION[type as MemoryEntry["type"]]]
    : [...COLLECTIONS];

  const allResults: MemoryEntry[] = [];
  const perCollectionLimit = type ? limit : Math.ceil(limit / 4) + 1;

  for (const collectionName of collectionsToSearch) {
    try {
      const collection = await getCollection(collectionName);
      const results = await collection.query({
        queryTexts: [query],
        nResults: perCollectionLimit,
        where: { uid: { $eq: uid } },
      });

      if (results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const metadata = results.metadatas?.[0]?.[i] || {};
          const distance = results.distances?.[0]?.[i] ?? 1;
          const importance = (metadata.importance as number) || 5;

          // Score: similarity (inverted distance) * importance * recency decay
          const timestamp = new Date(
            (metadata.timestamp as string) || Date.now()
          );
          const daysSince =
            (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
          const recencyDecay = Math.exp(-daysSince / 90); // halves every ~62 days

          const score = (1 / (1 + distance)) * (importance / 10) * recencyDecay;

          const memoryType = Object.entries(MEMORY_TYPE_TO_COLLECTION).find(
            ([, v]) => v === collectionName
          )?.[0] as MemoryEntry["type"];

          allResults.push({
            id: results.ids[0][i],
            content: results.documents[0]?.[i] || "",
            type: memoryType,
            importance,
            timestamp,
            source: (metadata.source as MemoryEntry["source"]) || "conversation",
            topics: JSON.parse((metadata.topics as string) || "[]"),
            emotionalValence: (metadata.emotionalValence as number) || 0,
            metadata: { ...metadata, _score: score },
          });
        }
      }
    } catch (err) {
      // Collection may not exist yet — that's ok
      console.warn(`Failed to search ${collectionName}:`, err);
    }
  }

  // Sort by composite score descending
  allResults.sort(
    (a, b) =>
      ((b.metadata._score as number) || 0) -
      ((a.metadata._score as number) || 0)
  );

  return allResults.slice(0, limit);
}

// ─── Extract Memories from Conversation ────────────────────────

export async function extractMemories(
  uid: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  const extractionPrompt = `You are a memory extraction system for a personal AI called AURORA.

Given this conversation exchange, extract any facts, events, decisions, preferences, or goals worth remembering long-term.

Output a JSON array of objects, each with:
- content: the memory to store (clear, standalone sentence)
- type: "episodic" (events/experiences), "semantic" (facts/knowledge), "procedural" (patterns/preferences), or "working" (current context)
- importance: 1-10 (personal info = 9, goals = 8, preferences = 6, events = 5, trivial = 1)
- topics: array of topic strings from: ["health", "family", "work", "finances", "goals", "projects", "sports", "home", "personal"]
- source: "conversation"

If the exchange is trivial small talk with nothing worth remembering, return an empty array: []

Return ONLY the JSON array. No other text.`;

  const conversationText = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;

  try {
    const result = await callClaude(extractionPrompt, conversationText);

    // Parse the JSON array from the response
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const memories: Array<{
      content: string;
      type: MemoryEntry["type"];
      importance: number;
      topics: string[];
      source: MemoryEntry["source"];
    }> = JSON.parse(jsonMatch[0]);

    // Store each extracted memory
    for (const mem of memories) {
      if (mem.importance >= 3) {
        await storeMemory(uid, {
          content: mem.content,
          type: mem.type,
          importance: mem.importance,
          timestamp: new Date(),
          source: mem.source || "conversation",
          topics: mem.topics || [],
          metadata: {},
        });
      }
    }
  } catch (err) {
    console.error("Memory extraction failed:", err);
    // Non-critical — don't break the conversation flow
  }
}

// ─── List Memories ─────────────────────────────────────────────

export async function listMemories(
  uid: string,
  type?: string,
  topic?: string,
  limit: number = 50
): Promise<MemoryEntry[]> {
  const collectionsToSearch: CollectionName[] = type
    ? [MEMORY_TYPE_TO_COLLECTION[type as MemoryEntry["type"]]]
    : [...COLLECTIONS];

  const allResults: MemoryEntry[] = [];

  for (const collectionName of collectionsToSearch) {
    try {
      const collection = await getCollection(collectionName);

      const where: Record<string, unknown> = { uid: { $eq: uid } };

      const results = await collection.get({
        where: where as any,
        limit,
      });

      const memoryType = Object.entries(MEMORY_TYPE_TO_COLLECTION).find(
        ([, v]) => v === collectionName
      )?.[0] as MemoryEntry["type"];

      for (let i = 0; i < results.ids.length; i++) {
        const metadata = results.metadatas?.[i] || {};
        const topics: string[] = JSON.parse(
          (metadata.topics as string) || "[]"
        );

        // Filter by topic if specified
        if (topic && !topics.includes(topic)) continue;

        allResults.push({
          id: results.ids[i],
          content: results.documents[i] || "",
          type: memoryType,
          importance: (metadata.importance as number) || 5,
          timestamp: new Date(
            (metadata.timestamp as string) || Date.now()
          ),
          source: (metadata.source as MemoryEntry["source"]) || "conversation",
          topics,
          emotionalValence: (metadata.emotionalValence as number) || 0,
          metadata,
        });
      }
    } catch (err) {
      console.warn(`Failed to list ${collectionName}:`, err);
    }
  }

  // Sort by timestamp descending
  allResults.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  return allResults.slice(0, limit);
}

// ─── Add Memory Manually ───────────────────────────────────────

export async function addMemory(
  uid: string,
  content: string,
  type: MemoryEntry["type"],
  importance: number,
  topics: string[],
  source: MemoryEntry["source"] = "user_stated"
): Promise<string> {
  return storeMemory(uid, {
    content,
    type,
    importance,
    timestamp: new Date(),
    source,
    topics,
    metadata: {},
  });
}

// ─── Update Memory ─────────────────────────────────────────────

export async function updateMemory(
  memoryId: string,
  type: MemoryEntry["type"],
  updates: { importance?: number; content?: string }
): Promise<void> {
  const collectionName = MEMORY_TYPE_TO_COLLECTION[type];
  const collection = await getCollection(collectionName);

  const updatePayload: {
    documents?: string[];
    metadatas?: Array<Record<string, string | number | boolean>>;
  } = {};

  if (updates.content) {
    updatePayload.documents = [updates.content];
  }

  if (updates.importance !== undefined) {
    updatePayload.metadatas = [{ importance: updates.importance }];
  }

  await collection.update({
    ids: [memoryId],
    ...updatePayload,
  });
}

// ─── Generate User Profile from Memories ───────────────────────

export async function generateUserProfile(uid: string): Promise<string> {
  const semanticMemories = await listMemories(uid, "semantic", undefined, 100);

  if (semanticMemories.length === 0) {
    return "No profile data collected yet.";
  }

  const memorySummary = semanticMemories
    .map((m) => `- ${m.content}`)
    .join("\n");

  const profilePrompt = `Given these facts about a person, generate a structured profile summary.
Be concise — one or two sentences per category. Only include categories where information exists.

Categories: Name, Location, Family, Work, Health, Goals, Preferences, Current Projects, Financial, Personality

Facts:
${memorySummary}`;

  return callClaude(
    "You are a profile synthesis system. Output a clean, structured profile.",
    profilePrompt
  );
}
