import cron from "node-cron";
import { getFirestore } from "../middleware/auth.js";
import { callClaude } from "./claude.js";
import { searchMemories, listMemories, storeMemory } from "./memory.js";
import { sendPushNotification } from "./push.js";
import type { MemoryEntry } from "../types/index.js";

// ─── Notification Rate Limiting ───────────────────────────────

const notificationCounts = new Map<string, { count: number; date: string }>();

function canSendProactiveNotification(uid: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  const entry = notificationCounts.get(uid);

  if (!entry || entry.date !== today) {
    notificationCounts.set(uid, { count: 0, date: today });
    return true;
  }

  return entry.count < 3;
}

function recordProactiveNotification(uid: string): void {
  const today = new Date().toISOString().split("T")[0];
  const entry = notificationCounts.get(uid);

  if (!entry || entry.date !== today) {
    notificationCounts.set(uid, { count: 1, date: today });
  } else {
    entry.count++;
  }
}

// ─── Relevance Filter ─────────────────────────────────────────

interface RelevanceScore {
  urgency: number; // 1-10
  importance: number; // 1-10
  novelty: number; // 1-10
  total: number;
}

async function scoreNotification(
  uid: string,
  title: string,
  body: string
): Promise<RelevanceScore> {
  try {
    const result = await callClaude(
      "You are a notification relevance scoring system. Score each dimension 1-10. Return ONLY a JSON object with urgency, importance, and novelty fields as numbers.",
      `Score this proactive notification for relevance:
Title: ${title}
Body: ${body}

Score each dimension 1-10:
- urgency: How time-sensitive is this? (10 = must act now, 1 = no time pressure)
- importance: How significant is this to the user's life/goals? (10 = critical, 1 = trivial)
- novelty: How surprising/new is this information? (10 = completely new insight, 1 = user already knows this)

Return ONLY: {"urgency": N, "importance": N, "novelty": N}`
    );

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { urgency: 5, importance: 5, novelty: 5, total: 15 };
    }

    const scores = JSON.parse(jsonMatch[0]);
    const urgency = Math.min(10, Math.max(1, scores.urgency || 5));
    const importance = Math.min(10, Math.max(1, scores.importance || 5));
    const novelty = Math.min(10, Math.max(1, scores.novelty || 5));

    return {
      urgency,
      importance,
      novelty,
      total: urgency + importance + novelty,
    };
  } catch {
    return { urgency: 5, importance: 5, novelty: 5, total: 15 };
  }
}

async function sendScoredNotification(
  uid: string,
  title: string,
  body: string,
  source: string
): Promise<boolean> {
  if (!canSendProactiveNotification(uid)) {
    console.log(
      `[PredictiveEngine] Notification limit reached for ${uid} today, skipping: ${title}`
    );
    return false;
  }

  const score = await scoreNotification(uid, title, body);

  if (score.total < 18) {
    console.log(
      `[PredictiveEngine] Notification scored ${score.total}/30 (threshold 18), skipping: ${title}`
    );
    return false;
  }

  const sent = await sendPushNotification(uid, {
    title,
    body,
    data: {
      type: "proactive",
      source,
      relevanceScore: score.total,
    },
  });

  if (sent) {
    recordProactiveNotification(uid);
    console.log(
      `[PredictiveEngine] Sent proactive notification (score ${score.total}/30): ${title}`
    );
  }

  return sent;
}

// ─── Pattern Learner (1am daily) ──────────────────────────────

async function learnPatterns(uid: string): Promise<void> {
  const recentEpisodic = await listMemories(uid, "episodic", undefined, 100);

  if (recentEpisodic.length < 10) {
    console.log(
      `[PredictiveEngine] Not enough episodic memories (${recentEpisodic.length}) to learn patterns for ${uid}`
    );
    return;
  }

  const memorySummary = recentEpisodic
    .map(
      (m) =>
        `[${m.timestamp.toISOString()} | topics: ${m.topics.join(",")}] ${m.content}`
    )
    .join("\n");

  const patternPrompt = `Analyze these episodic memories to find behavioral patterns, routines, and recurring activities. Look for:

1. Daily routines (morning, evening patterns)
2. Weekly patterns (certain activities on certain days)
3. Monthly or recurring patterns
4. Behavioral triggers (e.g., "usually checks email after coffee")
5. Decision-making patterns

Output a JSON array of patterns found. Each pattern:
- content: description of the pattern (clear, standalone)
- frequency: "daily", "weekly", "monthly", or "contextual"
- dayOfWeek: number 0-6 (Sunday=0) if weekly, or null
- dayOfMonth: number 1-31 if monthly, or null
- confidence: 1-10 (how confident you are this is a real pattern)
- topics: topic tags

If no clear patterns are found, return an empty array: []
Return ONLY the JSON array.

Memories:
${memorySummary}`;

  try {
    const result = await callClaude(
      "You are a behavioral pattern analysis system. Extract recurring patterns from personal event data.",
      patternPrompt
    );

    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const patterns: Array<{
      content: string;
      frequency: string;
      dayOfWeek: number | null;
      dayOfMonth: number | null;
      confidence: number;
      topics: string[];
    }> = JSON.parse(jsonMatch[0]);

    for (const pattern of patterns) {
      if (pattern.confidence < 5) continue;

      // Check for duplicate patterns
      const existing = await searchMemories(uid, pattern.content, "procedural");
      const isDuplicate = existing.some((m) => {
        const score = (m.metadata._score as number) || 0;
        return score > 0.8;
      });

      if (!isDuplicate) {
        await storeMemory(uid, {
          content: pattern.content,
          type: "procedural",
          importance: Math.min(8, Math.max(3, pattern.confidence)),
          timestamp: new Date(),
          source: "conversation",
          topics: pattern.topics || [],
          metadata: {
            frequency: pattern.frequency,
            dayOfWeek: pattern.dayOfWeek,
            dayOfMonth: pattern.dayOfMonth,
            confidence: pattern.confidence,
            learnedAt: new Date().toISOString(),
          },
        });
      }
    }

    console.log(
      `[PredictiveEngine] Learned ${patterns.filter((p) => p.confidence >= 5).length} patterns for ${uid}`
    );
  } catch (err) {
    console.error("[PredictiveEngine] Pattern learning failed:", err);
  }
}

async function runPatternLearner(): Promise<void> {
  const db = getFirestore();
  try {
    const usersSnapshot = await db.collection("users").get();
    for (const doc of usersSnapshot.docs) {
      await learnPatterns(doc.id);
    }
  } catch (err) {
    console.error("[PredictiveEngine] Pattern learner error:", err);
  }
}

// ─── Pre-Meeting Briefs (every 5 minutes) ─────────────────────

async function checkUpcomingMeetings(): Promise<void> {
  const db = getFirestore();

  try {
    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;

      // Look for meeting/calendar events in working memory
      const workingMemories = await searchMemories(
        uid,
        "meeting calendar event appointment call",
        "working"
      );

      if (workingMemories.length === 0) continue;

      const now = new Date();
      const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      for (const memory of workingMemories) {
        // Check if the memory mentions a time that's 10-15 minutes away
        const metadata = memory.metadata;
        const eventTime = metadata.eventTime
          ? new Date(metadata.eventTime as string)
          : null;

        if (!eventTime) continue;

        // Only brief if event is 5-15 minutes from now
        if (eventTime <= fiveMinutesFromNow || eventTime > fifteenMinutesFromNow) {
          continue;
        }

        // Check if we already briefed for this event
        const briefKey = `briefed_${memory.id}`;
        const briefDoc = await db
          .collection("users")
          .doc(uid)
          .collection("preBriefs")
          .doc(briefKey)
          .get();

        if (briefDoc.exists) continue;

        // Search for relevant context about the meeting topic/attendees
        const relevantMemories = await searchMemories(
          uid,
          memory.content,
          undefined
        );

        const contextSummary = relevantMemories
          .filter((m) => m.id !== memory.id)
          .slice(0, 5)
          .map((m) => `- ${m.content}`)
          .join("\n");

        let briefBody: string;
        try {
          briefBody = await callClaude(
            "You are a pre-meeting briefing assistant. Be concise and actionable.",
            `Create a brief pre-meeting notification (2-3 sentences max) for this upcoming event:

Event: ${memory.content}
Time: ${eventTime.toLocaleTimeString()}

Relevant context from memory:
${contextSummary || "No additional context found."}

Focus on: who/what is this about, any relevant history, and one thing to prepare.`
          );
        } catch {
          briefBody = `Upcoming: ${memory.content} at ${eventTime.toLocaleTimeString()}`;
        }

        await sendScoredNotification(
          uid,
          "Pre-Meeting Brief",
          briefBody,
          "pre-meeting"
        );

        // Mark as briefed
        await db
          .collection("users")
          .doc(uid)
          .collection("preBriefs")
          .doc(briefKey)
          .set({ briefedAt: new Date(), eventTime });
      }
    }
  } catch (err) {
    console.error("[PredictiveEngine] Pre-meeting check error:", err);
  }
}

// ─── Recurring Task Predictor (8am daily) ─────────────────────

async function predictRecurringTasks(): Promise<void> {
  const db = getFirestore();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const dayOfMonth = now.getDate();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });

  try {
    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;

      const proceduralMemories = await listMemories(
        uid,
        "procedural",
        undefined,
        100
      );

      if (proceduralMemories.length === 0) continue;

      const matchingPatterns: MemoryEntry[] = [];

      for (const memory of proceduralMemories) {
        const metadata = memory.metadata;
        const frequency = metadata.frequency as string | undefined;

        if (frequency === "daily") {
          matchingPatterns.push(memory);
        } else if (
          frequency === "weekly" &&
          metadata.dayOfWeek === dayOfWeek
        ) {
          matchingPatterns.push(memory);
        } else if (
          frequency === "monthly" &&
          metadata.dayOfMonth === dayOfMonth
        ) {
          matchingPatterns.push(memory);
        }
      }

      if (matchingPatterns.length === 0) continue;

      const patternsList = matchingPatterns
        .map((m) => `- ${m.content}`)
        .join("\n");

      let reminderBody: string;
      try {
        reminderBody = await callClaude(
          "You are a proactive personal assistant. Be concise.",
          `Based on learned behavioral patterns, these activities typically happen today (${dayName}):

${patternsList}

Write a brief, friendly reminder (2-3 sentences) highlighting the most relevant items. Don't list everything — prioritize what's most actionable or time-sensitive.`
        );
      } catch {
        reminderBody = `Based on your patterns, today's typical activities include: ${matchingPatterns
          .slice(0, 3)
          .map((m) => m.content)
          .join("; ")}`;
      }

      await sendScoredNotification(
        uid,
        `${dayName} Patterns`,
        reminderBody,
        "recurring-task"
      );
    }
  } catch (err) {
    console.error("[PredictiveEngine] Recurring task predictor error:", err);
  }
}

// ─── Decision Context ─────────────────────────────────────────

export async function getDecisionContext(
  uid: string,
  description: string
): Promise<{
  pastDecisions: MemoryEntry[];
  relevantFacts: MemoryEntry[];
  context: string;
}> {
  // Search for past similar decisions
  const pastDecisions = await searchMemories(
    uid,
    `decision about ${description}`,
    "episodic"
  );

  // Search for relevant facts
  const relevantFacts = await searchMemories(
    uid,
    description,
    "semantic"
  );

  // Also check procedural memories for relevant patterns
  const patterns = await searchMemories(
    uid,
    description,
    "procedural"
  );

  const allContext = [
    ...pastDecisions.slice(0, 5),
    ...relevantFacts.slice(0, 5),
    ...patterns.slice(0, 3),
  ];

  let context = "No relevant context found for this decision.";

  if (allContext.length > 0) {
    const contextSummary = allContext
      .map(
        (m) =>
          `[${m.type}] ${m.content}`
      )
      .join("\n");

    try {
      context = await callClaude(
        "You are a decision support system for a personal AI. Synthesize relevant context to help with decision-making. Be concise and objective.",
        `The user is making a decision about: ${description}

Here is relevant context from their memory:
${contextSummary}

Provide a brief synthesis (3-5 sentences) of what's relevant to this decision: past similar decisions and their outcomes, relevant facts, and any patterns to consider.`
      );
    } catch {
      context = allContext
        .slice(0, 5)
        .map((m) => `- [${m.type}] ${m.content}`)
        .join("\n");
    }
  }

  return {
    pastDecisions: pastDecisions.slice(0, 5),
    relevantFacts: relevantFacts.slice(0, 5),
    context,
  };
}

// ─── Start All Predictive Services ────────────────────────────

export function startPredictiveEngine(): void {
  // Pattern learner: runs at 1:00 AM daily
  cron.schedule("0 1 * * *", () => {
    runPatternLearner().catch((err) =>
      console.error("[PredictiveEngine] Pattern learner cron error:", err)
    );
  });
  console.log("[PredictiveEngine] Pattern learner scheduled at 1:00 AM");

  // Pre-meeting briefs: runs every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    checkUpcomingMeetings().catch((err) =>
      console.error("[PredictiveEngine] Pre-meeting check cron error:", err)
    );
  });
  console.log("[PredictiveEngine] Pre-meeting briefs scheduled every 5 minutes");

  // Recurring task predictor: runs at 8:00 AM daily
  cron.schedule("0 8 * * *", () => {
    predictRecurringTasks().catch((err) =>
      console.error("[PredictiveEngine] Recurring task cron error:", err)
    );
  });
  console.log("[PredictiveEngine] Recurring task predictor scheduled at 8:00 AM");
}
