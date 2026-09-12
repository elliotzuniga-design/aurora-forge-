import { getFirestore } from "../middleware/auth.js";
import { callClaude } from "./claude.js";
import { searchMemories, storeMemory, listMemories } from "./memory.js";
import type { LifeGoal, Milestone } from "../types/index.js";
import { v4 as uuid } from "uuid";

// ─── Types ────────────────────────────────────────────────────

export interface DomainScore {
  domain:
    | "health"
    | "family"
    | "financial"
    | "career"
    | "business"
    | "personal_growth"
    | "legacy";
  score: number; // 1-10
  trend: "improving" | "stable" | "declining";
  notes: string;
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  options: string[];
  chosenOption: string;
  reasoning: string;
  domain: string;
  madeAt: Date;
  reviewDates: {
    thirtyDay: string;
    sixtyDay: string;
    ninetyDay: string;
  };
  reviews: DecisionReview[];
  relatedGoalIds: string[];
}

interface DecisionReview {
  reviewDate: string;
  dayMark: 30 | 60 | 90;
  outcome: string;
  satisfaction: number; // 1-10
  lessonsLearned: string;
}

// ─── Goal CRUD ───────────────────────────────────────────────

export async function createGoal(
  uid: string,
  goal: Omit<LifeGoal, "id" | "milestones" | "relatedMemories" | "lastReviewed" | "currentProgress">
): Promise<LifeGoal> {
  const db = getFirestore();
  const id = uuid();

  const newGoal: LifeGoal = {
    id,
    domain: goal.domain,
    title: goal.title,
    description: goal.description,
    targetDate: goal.targetDate,
    successMetrics: goal.successMetrics,
    currentProgress: 0,
    milestones: [],
    relatedMemories: [],
    lastReviewed: new Date(),
    priority: goal.priority,
  };

  await db
    .collection("users")
    .doc(uid)
    .collection("goals")
    .doc(id)
    .set({
      ...newGoal,
      targetDate: newGoal.targetDate?.toISOString() || null,
      lastReviewed: newGoal.lastReviewed.toISOString(),
      createdAt: new Date().toISOString(),
    });

  // Store as a high-importance semantic memory
  try {
    const memoryId = await storeMemory(uid, {
      content: `New life goal set in ${goal.domain}: "${goal.title}" — ${goal.description}. Success metrics: ${goal.successMetrics.join(", ")}.`,
      type: "semantic",
      importance: 9,
      timestamp: new Date(),
      source: "user_stated",
      topics: ["goals", goal.domain],
      metadata: { goalId: id, domain: goal.domain },
    });

    // Update goal with memory reference
    await db
      .collection("users")
      .doc(uid)
      .collection("goals")
      .doc(id)
      .update({
        relatedMemories: [memoryId],
      });

    newGoal.relatedMemories = [memoryId];
  } catch (err) {
    console.error("[Goals] Failed to store goal as memory:", err);
  }

  return newGoal;
}

export async function getGoals(uid: string): Promise<LifeGoal[]> {
  const db = getFirestore();

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("goals")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      domain: data.domain,
      title: data.title,
      description: data.description,
      targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
      successMetrics: data.successMetrics || [],
      currentProgress: data.currentProgress || 0,
      milestones: (data.milestones || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        title: m.title as string,
        completed: m.completed as boolean,
        targetDate: m.targetDate ? new Date(m.targetDate as string) : undefined,
        completedDate: m.completedDate
          ? new Date(m.completedDate as string)
          : undefined,
      })),
      relatedMemories: data.relatedMemories || [],
      lastReviewed: new Date(data.lastReviewed || data.createdAt),
      priority: data.priority || 2,
    } as LifeGoal;
  });
}

export async function updateGoalProgress(
  uid: string,
  goalId: string,
  progress: number
): Promise<LifeGoal> {
  const db = getFirestore();
  const goalRef = db
    .collection("users")
    .doc(uid)
    .collection("goals")
    .doc(goalId);

  await goalRef.update({
    currentProgress: Math.max(0, Math.min(100, progress)),
    lastReviewed: new Date().toISOString(),
  });

  const updated = await goalRef.get();
  const data = updated.data()!;

  return {
    id: goalId,
    domain: data.domain,
    title: data.title,
    description: data.description,
    targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
    successMetrics: data.successMetrics || [],
    currentProgress: data.currentProgress,
    milestones: data.milestones || [],
    relatedMemories: data.relatedMemories || [],
    lastReviewed: new Date(data.lastReviewed),
    priority: data.priority || 2,
  } as LifeGoal;
}

export async function addMilestone(
  uid: string,
  goalId: string,
  milestone: Omit<Milestone, "id" | "completed" | "completedDate">
): Promise<Milestone> {
  const db = getFirestore();
  const goalRef = db
    .collection("users")
    .doc(uid)
    .collection("goals")
    .doc(goalId);

  const id = uuid();
  const newMilestone: Milestone = {
    id,
    title: milestone.title,
    completed: false,
    targetDate: milestone.targetDate,
    completedDate: undefined,
  };

  const goalDoc = await goalRef.get();
  const milestones: Milestone[] = goalDoc.data()?.milestones || [];
  milestones.push({
    ...newMilestone,
    targetDate: milestone.targetDate || undefined,
  });

  await goalRef.update({
    milestones: milestones.map((m) => ({
      ...m,
      targetDate: m.targetDate
        ? m.targetDate instanceof Date
          ? m.targetDate.toISOString()
          : m.targetDate
        : null,
      completedDate: m.completedDate
        ? m.completedDate instanceof Date
          ? m.completedDate.toISOString()
          : m.completedDate
        : null,
    })),
  });

  return newMilestone;
}

export async function completeMilestone(
  uid: string,
  goalId: string,
  milestoneId: string
): Promise<LifeGoal> {
  const db = getFirestore();
  const goalRef = db
    .collection("users")
    .doc(uid)
    .collection("goals")
    .doc(goalId);

  const goalDoc = await goalRef.get();
  const data = goalDoc.data();
  if (!data) throw new Error(`Goal ${goalId} not found`);

  const milestones: Array<Record<string, unknown>> = data.milestones || [];

  // Mark the milestone as completed
  const updatedMilestones = milestones.map((m) => {
    if (m.id === milestoneId) {
      return {
        ...m,
        completed: true,
        completedDate: new Date().toISOString(),
      };
    }
    return m;
  });

  // Auto-calculate progress from milestone completion ratio
  const totalMilestones = updatedMilestones.length;
  const completedMilestones = updatedMilestones.filter(
    (m) => m.completed
  ).length;
  const progress =
    totalMilestones > 0
      ? Math.round((completedMilestones / totalMilestones) * 100)
      : data.currentProgress;

  await goalRef.update({
    milestones: updatedMilestones,
    currentProgress: progress,
    lastReviewed: new Date().toISOString(),
  });

  return {
    id: goalId,
    domain: data.domain,
    title: data.title,
    description: data.description,
    targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
    successMetrics: data.successMetrics || [],
    currentProgress: progress,
    milestones: updatedMilestones.map((m) => ({
      id: m.id as string,
      title: m.title as string,
      completed: m.completed as boolean,
      targetDate: m.targetDate ? new Date(m.targetDate as string) : undefined,
      completedDate: m.completedDate
        ? new Date(m.completedDate as string)
        : undefined,
    })),
    relatedMemories: data.relatedMemories || [],
    lastReviewed: new Date(),
    priority: data.priority || 2,
  } as LifeGoal;
}

// ─── Domain Scoring ───────────────────────────────────────────

export async function generateDomainScores(
  uid: string
): Promise<DomainScore[]> {
  const goals = await getGoals(uid);
  const recentMemories = await listMemories(uid, undefined, undefined, 50);

  const goalsText = goals
    .map(
      (g) =>
        `[${g.domain}] "${g.title}" — progress: ${g.currentProgress}%, priority: ${g.priority}, milestones: ${g.milestones.filter((m) => m.completed).length}/${g.milestones.length}`
    )
    .join("\n");

  const memoriesText = recentMemories
    .slice(0, 30)
    .map((m) => `- ${m.content}`)
    .join("\n");

  const prompt = `You are a strategic life assessment system. Score the following 7 life domains on a 1-10 scale based on the user's goals and recent life data.

Domains: health, family, financial, career, business, personal_growth, legacy

For each domain, provide:
- score: 1-10 (1 = critical concern, 5 = neutral, 10 = thriving)
- trend: "improving", "stable", or "declining"
- notes: one sentence explaining the score

Goals:
${goalsText || "No goals set yet."}

Recent life context:
${memoriesText || "No recent context available."}

Output ONLY a JSON array of objects: [{ "domain", "score", "trend", "notes" }]
Include all 7 domains even if no data exists (score them 5 with "stable" and note the lack of data).`;

  try {
    const result = await callClaude(
      "You are a strategic life assessment engine. Output only valid JSON.",
      prompt
    );

    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const scores: DomainScore[] = JSON.parse(jsonMatch[0]);
      return scores;
    }
  } catch (err) {
    console.error("[Goals] Domain score generation failed:", err);
  }

  // Fallback: return neutral scores for all domains
  const domains: DomainScore["domain"][] = [
    "health",
    "family",
    "financial",
    "career",
    "business",
    "personal_growth",
    "legacy",
  ];
  return domains.map((domain) => ({
    domain,
    score: 5,
    trend: "stable" as const,
    notes: "Insufficient data to score this domain.",
  }));
}

// ─── Decision Journal ──────────────────────────────────────────

export async function logDecision(
  uid: string,
  decision: Omit<Decision, "id" | "madeAt" | "reviewDates" | "reviews">
): Promise<Decision> {
  const db = getFirestore();
  const id = uuid();
  const madeAt = new Date();

  // Calculate review dates
  const thirtyDay = new Date(madeAt);
  thirtyDay.setDate(thirtyDay.getDate() + 30);
  const sixtyDay = new Date(madeAt);
  sixtyDay.setDate(sixtyDay.getDate() + 60);
  const ninetyDay = new Date(madeAt);
  ninetyDay.setDate(ninetyDay.getDate() + 90);

  const newDecision: Decision = {
    id,
    title: decision.title,
    description: decision.description,
    options: decision.options,
    chosenOption: decision.chosenOption,
    reasoning: decision.reasoning,
    domain: decision.domain,
    madeAt,
    reviewDates: {
      thirtyDay: thirtyDay.toISOString().split("T")[0],
      sixtyDay: sixtyDay.toISOString().split("T")[0],
      ninetyDay: ninetyDay.toISOString().split("T")[0],
    },
    reviews: [],
    relatedGoalIds: decision.relatedGoalIds || [],
  };

  await db
    .collection("users")
    .doc(uid)
    .collection("decisions")
    .doc(id)
    .set({
      ...newDecision,
      madeAt: madeAt.toISOString(),
    });

  // Store as episodic memory
  try {
    await storeMemory(uid, {
      content: `Decision made: "${decision.title}" — chose "${decision.chosenOption}" because: ${decision.reasoning}. Other options considered: ${decision.options.filter((o) => o !== decision.chosenOption).join(", ")}.`,
      type: "episodic",
      importance: 7,
      timestamp: madeAt,
      source: "user_stated",
      topics: ["goals", decision.domain],
      metadata: { decisionId: id, domain: decision.domain },
    });
  } catch (err) {
    console.error("[Goals] Failed to store decision as memory:", err);
  }

  return newDecision;
}

export async function getDecisions(
  uid: string,
  limit: number = 50
): Promise<Decision[]> {
  const db = getFirestore();

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("decisions")
    .orderBy("madeAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title,
      description: data.description,
      options: data.options || [],
      chosenOption: data.chosenOption,
      reasoning: data.reasoning,
      domain: data.domain,
      madeAt: new Date(data.madeAt),
      reviewDates: data.reviewDates || {},
      reviews: data.reviews || [],
      relatedGoalIds: data.relatedGoalIds || [],
    } as Decision;
  });
}

export async function reviewDecision(
  uid: string,
  decisionId: string,
  outcome: string,
  dayMark: 30 | 60 | 90,
  satisfaction: number = 5,
  lessonsLearned: string = ""
): Promise<Decision> {
  const db = getFirestore();
  const decisionRef = db
    .collection("users")
    .doc(uid)
    .collection("decisions")
    .doc(decisionId);

  const decisionDoc = await decisionRef.get();
  const data = decisionDoc.data();
  if (!data) throw new Error(`Decision ${decisionId} not found`);

  const review: DecisionReview = {
    reviewDate: new Date().toISOString().split("T")[0],
    dayMark,
    outcome,
    satisfaction: Math.max(1, Math.min(10, satisfaction)),
    lessonsLearned,
  };

  const reviews: DecisionReview[] = data.reviews || [];
  reviews.push(review);

  await decisionRef.update({ reviews });

  // Store review in memory
  try {
    await storeMemory(uid, {
      content: `${dayMark}-day review of decision "${data.title}": ${outcome}. Satisfaction: ${satisfaction}/10. Lessons: ${lessonsLearned}`,
      type: "episodic",
      importance: 6,
      timestamp: new Date(),
      source: "user_stated",
      topics: ["goals", data.domain],
      metadata: { decisionId, dayMark },
    });
  } catch (err) {
    console.error("[Goals] Failed to store decision review as memory:", err);
  }

  return {
    id: decisionId,
    title: data.title,
    description: data.description,
    options: data.options || [],
    chosenOption: data.chosenOption,
    reasoning: data.reasoning,
    domain: data.domain,
    madeAt: new Date(data.madeAt),
    reviewDates: data.reviewDates || {},
    reviews,
    relatedGoalIds: data.relatedGoalIds || [],
  } as Decision;
}

// ─── Scenario Modeling ─────────────────────────────────────────

export async function modelScenario(
  uid: string,
  decision: string,
  timeframe: string,
  factors: string[]
): Promise<Record<string, unknown>> {
  // Gather full context
  const [goals, memories, pastDecisions] = await Promise.all([
    getGoals(uid),
    listMemories(uid, undefined, undefined, 40),
    getDecisions(uid),
  ]);

  const goalsText = goals
    .map(
      (g) =>
        `[${g.domain}, priority ${g.priority}] "${g.title}" — ${g.currentProgress}% complete`
    )
    .join("\n");

  const memoriesText = memories
    .slice(0, 20)
    .map((m) => `- ${m.content}`)
    .join("\n");

  const pastDecisionsText = pastDecisions
    .slice(0, 10)
    .map(
      (d) =>
        `- "${d.title}" (${d.domain}): chose "${d.chosenOption}" — ${d.reviews.length > 0 ? `satisfaction: ${d.reviews[d.reviews.length - 1].satisfaction}/10` : "not yet reviewed"}`
    )
    .join("\n");

  const prompt = `You are a strategic scenario modeling system. Model the following decision for a person, considering their life context.

DECISION: ${decision}
TIMEFRAME: ${timeframe}
KEY FACTORS TO CONSIDER: ${factors.join(", ")}

THEIR CURRENT GOALS:
${goalsText || "No goals set."}

THEIR LIFE CONTEXT:
${memoriesText || "Limited context available."}

PAST DECISIONS:
${pastDecisionsText || "No past decisions recorded."}

Model two scenarios and provide a recommendation. Output ONLY a JSON object:
{
  "ifYes": {
    "summary": "2-3 sentence scenario if they proceed",
    "pros": ["list of benefits"],
    "cons": ["list of risks"],
    "impactOnGoals": "how it affects their current goals",
    "probabilityOfSuccess": 0.0-1.0,
    "timelineEffects": "what changes in the given timeframe"
  },
  "ifNo": {
    "summary": "2-3 sentence scenario if they don't proceed",
    "pros": ["list of benefits of not proceeding"],
    "cons": ["list of missed opportunities"],
    "impactOnGoals": "how it affects their current goals",
    "statusQuoRisk": "risks of maintaining current path"
  },
  "recommendation": {
    "action": "proceed" or "hold" or "decline",
    "confidence": 0.0-1.0,
    "reasoning": "2-3 sentences explaining the recommendation",
    "keyConditions": ["conditions that should be true for this recommendation to hold"]
  }
}`;

  try {
    const result = await callClaude(
      "You are a strategic scenario modeling engine for a personal AI. Provide balanced, thoughtful analysis. Output only valid JSON.",
      prompt
    );

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error("[Goals] Scenario modeling failed:", err);
  }

  return {
    error: "Scenario modeling failed",
    decision,
    timeframe,
    factors,
  };
}

// ─── Weekly Review ─────────────────────────────────────────────

export async function generateWeeklyReview(
  uid: string
): Promise<string> {
  const [goals, memories, decisions, domainScores] = await Promise.all([
    getGoals(uid),
    listMemories(uid, undefined, undefined, 50),
    getDecisions(uid),
    generateDomainScores(uid),
  ]);

  // Filter to recent memories (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentMemories = memories.filter(
    (m) => m.timestamp >= sevenDaysAgo
  );

  const goalsText = goals
    .map(
      (g) =>
        `[${g.domain}] "${g.title}" — ${g.currentProgress}% (${g.milestones.filter((m) => m.completed).length}/${g.milestones.length} milestones)`
    )
    .join("\n");

  const memoriesText = recentMemories
    .map((m) => `- [${m.type}] ${m.content}`)
    .join("\n");

  const scoresText = domainScores
    .map((s) => `${s.domain}: ${s.score}/10 (${s.trend}) — ${s.notes}`)
    .join("\n");

  const recentDecisions = decisions
    .filter((d) => d.madeAt >= sevenDaysAgo)
    .map((d) => `- "${d.title}" in ${d.domain}: chose "${d.chosenOption}"`)
    .join("\n");

  // Check for decisions due for review
  const todayStr = new Date().toISOString().split("T")[0];
  const dueForReview = decisions.filter(
    (d) =>
      (d.reviewDates.thirtyDay === todayStr ||
        d.reviewDates.sixtyDay === todayStr ||
        d.reviewDates.ninetyDay === todayStr) &&
      !d.reviews.some(
        (r) =>
          r.reviewDate === todayStr
      )
  );

  const prompt = `You are AURORA's weekly review system. Generate a comprehensive but concise weekly review for your user. Be direct and personal — you know this person well.

DOMAIN SCORES:
${scoresText}

GOALS STATUS:
${goalsText || "No active goals."}

THIS WEEK'S EVENTS & CONTEXT:
${memoriesText || "Quiet week — no notable events recorded."}

DECISIONS MADE THIS WEEK:
${recentDecisions || "No major decisions this week."}

${dueForReview.length > 0 ? `DECISIONS DUE FOR REVIEW:\n${dueForReview.map((d) => `- "${d.title}" (made ${Math.round((Date.now() - d.madeAt.getTime()) / (1000 * 60 * 60 * 24))} days ago)`).join("\n")}` : ""}

Write the weekly review covering:
1. Overall state (2 sentences)
2. Wins this week
3. Areas needing attention
4. Goal progress highlights
5. Upcoming: decisions to revisit, milestones approaching
6. One strategic recommendation for next week

Keep it under 400 words. Be direct, not generic.`;

  try {
    const review = await callClaude(
      "You are AURORA, a personal AI generating a weekly strategic review. Be concise, direct, and personal.",
      prompt
    );

    // Store the review in memory
    await storeMemory(uid, {
      content: `Weekly review (${new Date().toISOString().split("T")[0]}): ${review.slice(0, 500)}`,
      type: "episodic",
      importance: 7,
      timestamp: new Date(),
      source: "conversation",
      topics: ["goals"],
      metadata: {
        type: "weekly_review",
        domainScores: domainScores.map((s) => ({
          domain: s.domain,
          score: s.score,
          trend: s.trend,
        })),
      },
    });

    return review;
  } catch (err) {
    console.error("[Goals] Weekly review generation failed:", err);
    return "Weekly review generation failed. Will retry on next cycle.";
  }
}
