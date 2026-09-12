import cron from "node-cron";
import { getFirestore } from "../middleware/auth.js";
import { callClaude } from "./claude.js";
import {
  searchMemories,
  listMemories,
  storeMemory,
  updateMemory,
} from "./memory.js";
import type { MemoryEntry, UserProfile } from "../types/index.js";

// ─── Consolidate Episodic -> Semantic ─────────────────────────

async function consolidateEpisodicMemories(uid: string): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const episodicMemories = await listMemories(uid, "episodic", undefined, 200);

  const recentEpisodic = episodicMemories.filter(
    (m) => m.timestamp >= sevenDaysAgo
  );

  if (recentEpisodic.length < 3) {
    console.log(
      `[MemoryConsolidation] Only ${recentEpisodic.length} recent episodic memories for ${uid} — skipping consolidation`
    );
    return;
  }

  const memorySummary = recentEpisodic
    .map(
      (m) =>
        `[${m.timestamp.toISOString()}] (importance: ${m.importance}) ${m.content}`
    )
    .join("\n");

  const consolidationPrompt = `You are a memory consolidation system. Given these episodic memories (events and experiences) from the last 7 days, extract lasting semantic facts — things that are true about this person, their life, relationships, preferences, or situation.

Only extract facts that are durable (likely still true weeks from now). Do NOT repeat the event itself — distill the underlying fact.

Output a JSON array of objects:
- content: the semantic fact (clear, standalone sentence)
- importance: 1-10 (how important this fact is to understanding this person)
- topics: array of topic strings

If no durable facts can be extracted, return an empty array: []

Return ONLY the JSON array. No other text.

Episodic memories:
${memorySummary}`;

  try {
    const result = await callClaude(
      "You are a memory consolidation system for a personal AI. Extract lasting facts from recent events.",
      consolidationPrompt
    );

    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const facts: Array<{
      content: string;
      importance: number;
      topics: string[];
    }> = JSON.parse(jsonMatch[0]);

    for (const fact of facts) {
      // Check for duplicates before storing
      const existing = await searchMemories(uid, fact.content, "semantic");
      const isDuplicate = existing.some((m) => {
        const score = (m.metadata._score as number) || 0;
        return score > 0.85;
      });

      if (!isDuplicate) {
        await storeMemory(uid, {
          content: fact.content,
          type: "semantic",
          importance: fact.importance,
          timestamp: new Date(),
          source: "conversation",
          topics: fact.topics || [],
          metadata: { consolidatedFrom: "episodic", consolidatedAt: new Date().toISOString() },
        });
      }
    }

    console.log(
      `[MemoryConsolidation] Consolidated ${recentEpisodic.length} episodic memories into ${facts.length} semantic facts for ${uid}`
    );
  } catch (err) {
    console.error("[MemoryConsolidation] Consolidation failed:", err);
  }
}

// ─── Decay Old Memories ───────────────────────────────────────

async function decayOldMemories(uid: string): Promise<void> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const allTypes: Array<MemoryEntry["type"]> = [
    "episodic",
    "semantic",
    "procedural",
  ];

  for (const type of allTypes) {
    const memories = await listMemories(uid, type, undefined, 200);

    const staleMemories = memories.filter(
      (m) => m.timestamp < ninetyDaysAgo && m.importance > 1
    );

    for (const memory of staleMemories) {
      const decayedImportance = Math.max(1, memory.importance - 1);
      try {
        await updateMemory(memory.id, memory.type, {
          importance: decayedImportance,
        });
      } catch (err) {
        console.warn(
          `[MemoryConsolidation] Failed to decay memory ${memory.id}:`,
          err
        );
      }
    }

    if (staleMemories.length > 0) {
      console.log(
        `[MemoryConsolidation] Decayed ${staleMemories.length} ${type} memories for ${uid}`
      );
    }
  }
}

// ─── Clear Old Working Memory ─────────────────────────────────

async function clearOldWorkingMemory(uid: string): Promise<void> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const workingMemories = await listMemories(uid, "working", undefined, 200);

  const expired = workingMemories.filter(
    (m) => m.timestamp < twentyFourHoursAgo
  );

  for (const memory of expired) {
    // Demote to episodic before clearing
    if (memory.importance >= 4) {
      await storeMemory(uid, {
        content: memory.content,
        type: "episodic",
        importance: Math.max(3, memory.importance - 2),
        timestamp: memory.timestamp,
        source: memory.source,
        topics: memory.topics,
        metadata: { demotedFrom: "working", demotedAt: new Date().toISOString() },
      });
    }

    // Decay the working memory importance to effectively remove it from relevance
    try {
      await updateMemory(memory.id, "working", { importance: 0 });
    } catch (err) {
      console.warn(
        `[MemoryConsolidation] Failed to clear working memory ${memory.id}:`,
        err
      );
    }
  }

  if (expired.length > 0) {
    console.log(
      `[MemoryConsolidation] Cleared ${expired.length} working memories for ${uid} (${expired.filter((m) => m.importance >= 4).length} demoted to episodic)`
    );
  }
}

// ─── Rebuild User Profile ─────────────────────────────────────

export async function rebuildUserProfile(uid: string): Promise<UserProfile> {
  const semanticMemories = await listMemories(uid, "semantic", undefined, 200);

  if (semanticMemories.length === 0) {
    const defaultProfile: UserProfile = { name: "Unknown" };
    return defaultProfile;
  }

  const memorySummary = semanticMemories
    .sort((a, b) => b.importance - a.importance)
    .map((m) => `- [importance: ${m.importance}] ${m.content}`)
    .join("\n");

  const profilePrompt = `Given these semantic facts about a person, synthesize a structured user profile as a JSON object.

Output ONLY a JSON object matching this schema:
{
  "name": "string",
  "location": "string or omit",
  "family": ["string array or omit"],
  "work": "string or omit",
  "healthConditions": ["string array or omit"],
  "goals": ["string array or omit"],
  "preferences": {"key": "value object or omit"},
  "communicationStyle": "string or omit",
  "currentProjects": ["string array or omit"],
  "financialSummary": "string or omit",
  "personalityTraits": ["string array or omit"],
  "knownStressors": ["string array or omit"],
  "motivators": ["string array or omit"]
}

Only include fields where the facts support them. Return ONLY the JSON object.

Facts:
${memorySummary}`;

  try {
    const result = await callClaude(
      "You are a profile synthesis system for a personal AI. Produce a clean JSON user profile from known facts.",
      profilePrompt
    );

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[MemoryConsolidation] Failed to parse profile JSON");
      return { name: "Unknown" };
    }

    const profile: UserProfile = JSON.parse(jsonMatch[0]);

    // Store in Firestore
    const db = getFirestore();
    await db
      .collection("users")
      .doc(uid)
      .collection("profile")
      .doc("current")
      .set(
        {
          ...profile,
          updatedAt: new Date(),
          memoryCount: semanticMemories.length,
        },
        { merge: true }
      );

    console.log(
      `[MemoryConsolidation] Rebuilt profile for ${uid} from ${semanticMemories.length} semantic memories`
    );
    return profile;
  } catch (err) {
    console.error("[MemoryConsolidation] Profile rebuild failed:", err);
    return { name: "Unknown" };
  }
}

// ─── Nightly Consolidation Runner ─────────────────────────────

async function runNightlyConsolidation(): Promise<void> {
  console.log("[MemoryConsolidation] Starting nightly consolidation...");

  const db = getFirestore();

  try {
    // Get all users with data
    const usersSnapshot = await db.collection("users").get();
    const uids = usersSnapshot.docs.map((doc) => doc.id);

    for (const uid of uids) {
      try {
        await clearOldWorkingMemory(uid);
        await consolidateEpisodicMemories(uid);
        await decayOldMemories(uid);
        await rebuildUserProfile(uid);
        console.log(
          `[MemoryConsolidation] Completed consolidation for user ${uid}`
        );
      } catch (err) {
        console.error(
          `[MemoryConsolidation] Failed for user ${uid}:`,
          err
        );
      }
    }

    console.log("[MemoryConsolidation] Nightly consolidation complete.");
  } catch (err) {
    console.error("[MemoryConsolidation] Nightly consolidation failed:", err);
  }
}

// ─── Start Cron ───────────────────────────────────────────────

export function startMemoryConsolidation(): void {
  // Run nightly at 2:00 AM
  cron.schedule("0 2 * * *", () => {
    runNightlyConsolidation().catch((err) =>
      console.error("[MemoryConsolidation] Cron job error:", err)
    );
  });

  console.log("[MemoryConsolidation] Scheduled nightly consolidation at 2:00 AM");
}
