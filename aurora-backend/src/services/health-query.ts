import { getFirestore } from "../middleware/auth.js";

// ─── Health Data Query Service ───────────────────────────────
// Reads health data synced from the iPhone app via /health/sync

export interface HealthDaySummary {
  date: string;
  metrics: {
    heartRate?: number;
    hrv?: number;
    restingHeartRate?: number;
    sleepHours?: number;
    sleepQuality?: string;
    steps?: number;
    activeEnergy?: number;
    exerciseMinutes?: number;
    bloodOxygen?: number;
    weight?: number;
    respiratoryRate?: number;
    mindfulMinutes?: number;
  };
}

export async function getHealthData(
  uid: string,
  date: string
): Promise<string> {
  const db = getFirestore();

  const doc = await db
    .collection("users")
    .doc(uid)
    .collection("health")
    .doc(date)
    .get();

  if (!doc.exists) {
    return JSON.stringify({
      data: null,
      note: `No health data for ${date}. The user may need to open the app to sync from Apple Health.`,
    });
  }

  const data = doc.data();
  return JSON.stringify({
    date,
    metrics: data?.metrics || [],
    syncedAt: data?.syncedAt,
  });
}

export async function getHealthRange(
  uid: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const db = getFirestore();

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("health")
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .orderBy("date", "asc")
    .get();

  if (snapshot.empty) {
    return JSON.stringify({
      data: [],
      note: `No health data found between ${startDate} and ${endDate}.`,
    });
  }

  const days: HealthDaySummary[] = snapshot.docs.map((doc) => {
    const d = doc.data();
    // Flatten metrics array to latest values per metric
    const metricsArray = d.metrics || [];
    const latest: Record<string, number | string> = {};
    for (const m of metricsArray) {
      for (const [key, val] of Object.entries(m)) {
        if (key !== "timestamp" && val != null) {
          latest[key] = val as number | string;
        }
      }
    }

    return {
      date: d.date,
      metrics: latest,
    };
  });

  return JSON.stringify({ data: days, count: days.length });
}

export async function getHealthTrend(
  uid: string,
  metric: string,
  days: number = 7
): Promise<string> {
  const db = getFirestore();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("health")
    .where("date", ">=", startStr)
    .where("date", "<=", endStr)
    .orderBy("date", "asc")
    .get();

  const dataPoints: { date: string; value: number | string | null }[] = [];

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const metricsArray = d.metrics || [];
    let value: number | string | null = null;

    for (const m of metricsArray) {
      if (m[metric] != null) {
        value = m[metric];
      }
    }

    dataPoints.push({ date: d.date, value });
  }

  // Calculate basic stats
  const numericValues = dataPoints
    .map((dp) => dp.value)
    .filter((v): v is number => typeof v === "number");

  const stats =
    numericValues.length > 0
      ? {
          avg: Math.round((numericValues.reduce((a, b) => a + b, 0) / numericValues.length) * 10) / 10,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          latest: numericValues[numericValues.length - 1],
          daysWithData: numericValues.length,
        }
      : null;

  return JSON.stringify({
    metric,
    period: `${days} days`,
    dataPoints,
    stats,
  });
}
