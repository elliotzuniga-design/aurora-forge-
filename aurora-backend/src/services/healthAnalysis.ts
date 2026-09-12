import { getFirestore } from "../middleware/auth.js";
import { callClaude } from "./claude.js";
import { storeMemory } from "./memory.js";
import { sendPushNotification } from "./push.js";
import type { HealthMetrics } from "../types/index.js";

// ─── Helper: Basic Statistics ─────────────────────────────────

interface Stats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
}

function calculateStats(values: number[]): Stats {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0 };
  }

  const count = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / count;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return { mean, stdDev, min, max, count };
}

// ─── Helper: Recovery Score ───────────────────────────────────

function calculateRecoveryScore(
  latestMetrics: HealthMetrics,
  baselines: Record<string, Stats>
): number {
  let score = 50; // Start at neutral

  // HRV is the biggest factor (up to +/- 30 points)
  if (latestMetrics.hrv !== undefined && baselines.hrv && baselines.hrv.mean > 0) {
    const hrvDeviation = (latestMetrics.hrv - baselines.hrv.mean) / Math.max(baselines.hrv.stdDev, 1);
    score += Math.max(-30, Math.min(30, hrvDeviation * 15));
  }

  // Resting heart rate (up to +/- 20 points, lower is better)
  if (
    latestMetrics.restingHeartRate !== undefined &&
    baselines.restingHeartRate &&
    baselines.restingHeartRate.mean > 0
  ) {
    const rhrDeviation =
      (baselines.restingHeartRate.mean - latestMetrics.restingHeartRate) /
      Math.max(baselines.restingHeartRate.stdDev, 1);
    score += Math.max(-20, Math.min(20, rhrDeviation * 10));
  }

  // Sleep hours (up to +/- 25 points)
  if (
    latestMetrics.sleepHours !== undefined &&
    baselines.sleepHours &&
    baselines.sleepHours.mean > 0
  ) {
    const sleepDeviation =
      (latestMetrics.sleepHours - baselines.sleepHours.mean) /
      Math.max(baselines.sleepHours.stdDev, 0.5);
    score += Math.max(-25, Math.min(25, sleepDeviation * 12));
  }

  // Exercise minutes (up to +/- 15 points)
  if (
    latestMetrics.exerciseMinutes !== undefined &&
    baselines.exerciseMinutes &&
    baselines.exerciseMinutes.mean > 0
  ) {
    const exerciseDeviation =
      (latestMetrics.exerciseMinutes - baselines.exerciseMinutes.mean) /
      Math.max(baselines.exerciseMinutes.stdDev, 5);
    score += Math.max(-15, Math.min(15, exerciseDeviation * 7));
  }

  // Clamp to 0-100
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── Helper: Anomaly Detection ────────────────────────────────

interface Anomaly {
  metric: string;
  value: number;
  baseline: number;
  stdDev: number;
  deviations: number;
  direction: "high" | "low";
}

function detectAnomalies(
  latestMetrics: HealthMetrics,
  baselines: Record<string, Stats>
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  const metricsToCheck: Array<{
    key: keyof HealthMetrics;
    label: string;
  }> = [
    { key: "heartRate", label: "Heart Rate" },
    { key: "hrv", label: "HRV" },
    { key: "restingHeartRate", label: "Resting Heart Rate" },
    { key: "sleepHours", label: "Sleep Hours" },
    { key: "steps", label: "Steps" },
    { key: "activeEnergy", label: "Active Energy" },
    { key: "exerciseMinutes", label: "Exercise Minutes" },
    { key: "bloodOxygen", label: "Blood Oxygen" },
    { key: "respiratoryRate", label: "Respiratory Rate" },
  ];

  for (const { key, label } of metricsToCheck) {
    const value = latestMetrics[key];
    if (value === undefined || typeof value !== "number") continue;

    const baseline = baselines[key];
    if (!baseline || baseline.count < 5 || baseline.stdDev === 0) continue;

    const deviations = Math.abs(value - baseline.mean) / baseline.stdDev;

    if (deviations > 2) {
      anomalies.push({
        metric: label,
        value,
        baseline: Math.round(baseline.mean * 10) / 10,
        stdDev: Math.round(baseline.stdDev * 10) / 10,
        deviations: Math.round(deviations * 10) / 10,
        direction: value > baseline.mean ? "high" : "low",
      });
    }
  }

  return anomalies;
}

// ─── Fetch Health Data from Firestore ─────────────────────────

async function fetchHealthData(
  uid: string,
  days: number
): Promise<HealthMetrics[]> {
  const db = getFirestore();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0];

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("health")
    .where("date", ">=", startDateStr)
    .orderBy("date", "asc")
    .get();

  const allMetrics: HealthMetrics[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const metrics = data.metrics as HealthMetrics[] | undefined;
    if (metrics && Array.isArray(metrics)) {
      allMetrics.push(...metrics);
    }
  }

  return allMetrics;
}

// ─── Build Baselines ──────────────────────────────────────────

function buildBaselines(
  metrics: HealthMetrics[]
): Record<string, Stats> {
  const buckets: Record<string, number[]> = {
    heartRate: [],
    hrv: [],
    restingHeartRate: [],
    sleepHours: [],
    steps: [],
    activeEnergy: [],
    exerciseMinutes: [],
    bloodOxygen: [],
    respiratoryRate: [],
    weight: [],
    mindfulMinutes: [],
  };

  for (const m of metrics) {
    if (m.heartRate !== undefined) buckets.heartRate.push(m.heartRate);
    if (m.hrv !== undefined) buckets.hrv.push(m.hrv);
    if (m.restingHeartRate !== undefined)
      buckets.restingHeartRate.push(m.restingHeartRate);
    if (m.sleepHours !== undefined) buckets.sleepHours.push(m.sleepHours);
    if (m.steps !== undefined) buckets.steps.push(m.steps);
    if (m.activeEnergy !== undefined) buckets.activeEnergy.push(m.activeEnergy);
    if (m.exerciseMinutes !== undefined)
      buckets.exerciseMinutes.push(m.exerciseMinutes);
    if (m.bloodOxygen !== undefined) buckets.bloodOxygen.push(m.bloodOxygen);
    if (m.respiratoryRate !== undefined)
      buckets.respiratoryRate.push(m.respiratoryRate);
    if (m.weight !== undefined) buckets.weight.push(m.weight);
    if (m.mindfulMinutes !== undefined)
      buckets.mindfulMinutes.push(m.mindfulMinutes);
  }

  const baselines: Record<string, Stats> = {};
  for (const [key, values] of Object.entries(buckets)) {
    baselines[key] = calculateStats(values);
  }

  return baselines;
}

// ─── Analyze Health Patterns ──────────────────────────────────

export async function analyzePatterns(
  uid: string,
  days: number = 30
): Promise<{
  baselines: Record<string, Stats>;
  recoveryScore: number;
  anomalies: Anomaly[];
  weeklySummary: string;
}> {
  const metrics = await fetchHealthData(uid, days);

  if (metrics.length === 0) {
    return {
      baselines: {},
      recoveryScore: 50,
      anomalies: [],
      weeklySummary: "No health data available for analysis.",
    };
  }

  const baselines = buildBaselines(metrics);

  // Use the most recent metrics for current state
  const latestMetrics = metrics[metrics.length - 1];
  const recoveryScore = calculateRecoveryScore(latestMetrics, baselines);
  const anomalies = detectAnomalies(latestMetrics, baselines);

  // Generate weekly summary using Claude
  const recentMetrics = metrics.slice(-7);
  const metricsText = recentMetrics
    .map((m) => {
      const parts: string[] = [];
      if (m.sleepHours !== undefined) parts.push(`sleep: ${m.sleepHours}h`);
      if (m.hrv !== undefined) parts.push(`HRV: ${m.hrv}`);
      if (m.restingHeartRate !== undefined) parts.push(`RHR: ${m.restingHeartRate}`);
      if (m.steps !== undefined) parts.push(`steps: ${m.steps}`);
      if (m.exerciseMinutes !== undefined) parts.push(`exercise: ${m.exerciseMinutes}min`);
      if (m.activeEnergy !== undefined) parts.push(`calories: ${m.activeEnergy}`);
      return `[${m.timestamp ? new Date(m.timestamp).toLocaleDateString() : "recent"}] ${parts.join(", ")}`;
    })
    .join("\n");

  let weeklySummary = "Unable to generate summary.";

  try {
    weeklySummary = await callClaude(
      "You are a health analytics system for a personal AI. Be concise and actionable. Speak directly to the user.",
      `Analyze this person's health data from the past week and provide a brief summary (3-5 sentences). Focus on trends, notable changes, and one actionable recommendation.

Recovery score: ${recoveryScore}/100
${anomalies.length > 0 ? `Anomalies detected: ${anomalies.map((a) => `${a.metric} is ${a.direction} (${a.deviations} std devs from baseline)`).join(", ")}` : "No anomalies detected."}

Recent data:
${metricsText}

Baselines (${days}-day):
${Object.entries(baselines)
  .filter(([, s]) => s.count > 0)
  .map(([key, s]) => `  ${key}: mean=${Math.round(s.mean * 10) / 10}, stdDev=${Math.round(s.stdDev * 10) / 10}`)
  .join("\n")}`
    );

    // Store summary as semantic memory
    await storeMemory(uid, {
      content: `Health analysis (${new Date().toISOString().split("T")[0]}): Recovery ${recoveryScore}/100. ${weeklySummary}`,
      type: "semantic",
      importance: 6,
      timestamp: new Date(),
      source: "health",
      topics: ["health"],
      metadata: {
        recoveryScore,
        anomalyCount: anomalies.length,
        analysisDate: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[HealthAnalysis] Weekly summary generation failed:", err);
  }

  return { baselines, recoveryScore, anomalies, weeklySummary };
}

// ─── Process Health Alerts ────────────────────────────────────

export async function processHealthAlerts(
  uid: string,
  metrics: HealthMetrics
): Promise<void> {
  const historicalMetrics = await fetchHealthData(uid, 30);

  if (historicalMetrics.length < 7) {
    // Not enough data for meaningful anomaly detection
    return;
  }

  const baselines = buildBaselines(historicalMetrics);
  const anomalies = detectAnomalies(metrics, baselines);

  for (const anomaly of anomalies) {
    const direction = anomaly.direction === "high" ? "above" : "below";

    await sendPushNotification(uid, {
      title: `Health Alert: ${anomaly.metric}`,
      body: `Your ${anomaly.metric} (${anomaly.value}) is ${anomaly.deviations}x standard deviations ${direction} your baseline (${anomaly.baseline}). Worth keeping an eye on.`,
      data: {
        type: "health_alert",
        metric: anomaly.metric,
        value: anomaly.value,
        baseline: anomaly.baseline,
        deviations: anomaly.deviations,
      },
    });

    // Store alert as working memory for context
    await storeMemory(uid, {
      content: `Health anomaly detected: ${anomaly.metric} is ${anomaly.direction} at ${anomaly.value} (baseline: ${anomaly.baseline}, ${anomaly.deviations} std devs)`,
      type: "working",
      importance: 7,
      timestamp: new Date(),
      source: "health",
      topics: ["health"],
      metadata: { anomaly },
    });
  }

  if (anomalies.length > 0) {
    console.log(
      `[HealthAnalysis] Sent ${anomalies.length} health alerts for ${uid}`
    );
  }
}

// ─── Daily Health Context for System Prompt ───────────────────

export async function getDailyHealthContext(uid: string): Promise<string> {
  try {
    const metrics = await fetchHealthData(uid, 2);

    if (metrics.length === 0) {
      return "No recent health data available.";
    }

    const latest = metrics[metrics.length - 1];
    const parts: string[] = [];

    if (latest.sleepHours !== undefined)
      parts.push(`${latest.sleepHours}h sleep`);
    if (latest.hrv !== undefined) parts.push(`HRV ${latest.hrv}`);
    if (latest.restingHeartRate !== undefined)
      parts.push(`RHR ${latest.restingHeartRate}`);
    if (latest.steps !== undefined)
      parts.push(`${latest.steps.toLocaleString()} steps`);
    if (latest.exerciseMinutes !== undefined)
      parts.push(`${latest.exerciseMinutes}min exercise`);

    // Calculate recovery score against recent baselines
    const allMetrics = await fetchHealthData(uid, 14);
    if (allMetrics.length >= 5) {
      const baselines = buildBaselines(allMetrics);
      const score = calculateRecoveryScore(latest, baselines);
      parts.push(`recovery ${score}/100`);
    }

    if (parts.length === 0) {
      return "Health data synced but no key metrics available today.";
    }

    return `Today's health: ${parts.join(", ")}.`;
  } catch (err) {
    console.error("[HealthAnalysis] getDailyHealthContext error:", err);
    return "Health data temporarily unavailable.";
  }
}
