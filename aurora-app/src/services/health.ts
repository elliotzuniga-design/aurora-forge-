import { Platform } from "react-native";
import api from "./api";

// ─── Apple HealthKit Integration ─────────────────────────────
// Uses react-native-health (iOS only) to read Apple Health data
// and sync to the AURORA backend via /health/sync

// Health categories to read
const HEALTH_PERMISSIONS = {
  read: [
    "HeartRate",
    "HeartRateVariability",
    "RestingHeartRate",
    "SleepAnalysis",
    "StepCount",
    "ActiveEnergyBurned",
    "AppleExerciseTime",
    "OxygenSaturation",
    "BodyMass",
    "RespiratoryRate",
    "MindfulSession",
  ],
};

let healthKit: typeof import("react-native-health") | null = null;

async function getHealthKit() {
  if (Platform.OS !== "ios") return null;
  if (healthKit) return healthKit;

  try {
    healthKit = require("react-native-health");
    return healthKit;
  } catch {
    console.log("[Health] react-native-health not available");
    return null;
  }
}

// ─── Initialize HealthKit ────────────────────────────────────

export async function initHealthKit(): Promise<boolean> {
  const hk = await getHealthKit();
  if (!hk) return false;

  return new Promise((resolve) => {
    hk.default.initHealthKit(
      { permissions: { read: HEALTH_PERMISSIONS.read.map((p) => (hk.default.Constants?.Permissions as Record<string, string>)?.[p] || p), write: [] } },
      (error: string | null) => {
        if (error) {
          console.error("[Health] HealthKit init failed:", error);
          resolve(false);
        } else {
          console.log("[Health] HealthKit initialized");
          resolve(true);
        }
      }
    );
  });
}

// ─── Read Today's Metrics ────────────────────────────────────

interface HealthMetrics {
  heartRate?: number;
  hrv?: number;
  restingHeartRate?: number;
  sleepHours?: number;
  steps?: number;
  activeEnergy?: number;
  exerciseMinutes?: number;
  bloodOxygen?: number;
  weight?: number;
  respiratoryRate?: number;
  mindfulMinutes?: number;
  timestamp: string;
}

export async function readTodayMetrics(): Promise<HealthMetrics | null> {
  const hk = await getHealthKit();
  if (!hk) return null;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const options = { startDate: startOfDay.toISOString(), endDate: now.toISOString() };

  const metrics: HealthMetrics = { timestamp: now.toISOString() };

  // Read each metric with individual error handling
  try {
    const steps = await new Promise<number>((resolve) => {
      hk.default.getStepCount(options, (err: string | null, result: { value: number }) => {
        resolve(err ? 0 : result?.value || 0);
      });
    });
    if (steps > 0) metrics.steps = Math.round(steps);
  } catch { /* skip */ }

  try {
    const samples = await new Promise<Array<{ value: number }>>((resolve) => {
      hk.default.getHeartRateSamples(options, (err: string | null, results: Array<{ value: number }>) => {
        resolve(err ? [] : results || []);
      });
    });
    if (samples.length > 0) {
      metrics.heartRate = Math.round(samples[samples.length - 1].value);
    }
  } catch { /* skip */ }

  try {
    const samples = await new Promise<Array<{ value: number }>>((resolve) => {
      hk.default.getHeartRateVariabilitySamples?.(options, (err: string | null, results: Array<{ value: number }>) => {
        resolve(err ? [] : results || []);
      });
    });
    if (samples.length > 0) {
      metrics.hrv = Math.round(samples[samples.length - 1].value * 1000);
    }
  } catch { /* skip */ }

  try {
    const samples = await new Promise<Array<{ value: number }>>((resolve) => {
      hk.default.getRestingHeartRateSamples?.(options, (err: string | null, results: Array<{ value: number }>) => {
        resolve(err ? [] : results || []);
      });
    });
    if (samples.length > 0) {
      metrics.restingHeartRate = Math.round(samples[samples.length - 1].value);
    }
  } catch { /* skip */ }

  try {
    const energy = await new Promise<number>((resolve) => {
      hk.default.getActiveEnergyBurned?.(options, (err: string | null, results: Array<{ value: number }>) => {
        const total = (results || []).reduce((sum: number, r: { value: number }) => sum + (r.value || 0), 0);
        resolve(err ? 0 : total);
      });
    });
    if (energy > 0) metrics.activeEnergy = Math.round(energy);
  } catch { /* skip */ }

  try {
    const exercise = await new Promise<number>((resolve) => {
      hk.default.getAppleExerciseTime?.(options, (err: string | null, results: Array<{ value: number }>) => {
        const total = (results || []).reduce((sum: number, r: { value: number }) => sum + (r.value || 0), 0);
        resolve(err ? 0 : total);
      });
    });
    if (exercise > 0) metrics.exerciseMinutes = Math.round(exercise);
  } catch { /* skip */ }

  try {
    const samples = await new Promise<Array<{ value: number }>>((resolve) => {
      hk.default.getOxygenSaturationSamples?.(options, (err: string | null, results: Array<{ value: number }>) => {
        resolve(err ? [] : results || []);
      });
    });
    if (samples.length > 0) {
      metrics.bloodOxygen = Math.round(samples[samples.length - 1].value * 100);
    }
  } catch { /* skip */ }

  try {
    const samples = await new Promise<Array<{ value: number }>>((resolve) => {
      hk.default.getLatestWeight?.(options, (err: string | null, result: { value: number }) => {
        resolve(err ? [] : result ? [result] : []);
      });
    });
    if (samples.length > 0) {
      metrics.weight = Math.round(samples[0].value * 10) / 10;
    }
  } catch { /* skip */ }

  return metrics;
}

// ─── Sync to Backend ─────────────────────────────────────────

export async function syncHealthData(): Promise<boolean> {
  const metrics = await readTodayMetrics();
  if (!metrics) return false;

  const today = new Date().toISOString().split("T")[0];

  try {
    await api.post("/health/sync", {
      metrics: [metrics],
      date: today,
    });
    console.log("[Health] Synced metrics to backend");
    return true;
  } catch (err) {
    console.error("[Health] Sync failed:", err);
    return false;
  }
}
