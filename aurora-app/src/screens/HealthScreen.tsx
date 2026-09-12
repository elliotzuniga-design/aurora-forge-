import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import api from "../services/api";
import { format } from "date-fns";

interface HealthData {
  baseline: {
    restingHeartRate: { mean: number; stdDev: number };
    hrv: { mean: number; stdDev: number };
    sleepHours: { mean: number; stdDev: number };
    steps: { mean: number; stdDev: number };
  };
  recoveryScore: number;
  anomalies: Array<{
    metric: string;
    value: number;
    baseline: number;
    severity: "info" | "warning" | "alert";
    message: string;
  }>;
  weeklySummary: string;
}

function ScoreRing({ score }: { score: number }) {
  const scoreColor =
    score >= 70 ? colors.success : score >= 40 ? colors.warning : colors.error;

  return (
    <View style={styles.scoreRing}>
      <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
        <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
        <Text style={styles.scoreLabel}>Recovery</Text>
      </View>
    </View>
  );
}

function MetricCard({
  label,
  value,
  unit,
  baseline,
}: {
  label: string;
  value: string;
  unit: string;
  baseline?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
      {baseline && (
        <Text style={styles.metricBaseline}>Baseline: {baseline}</Text>
      )}
    </View>
  );
}

export function HealthScreen() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get("/health/analysis");
      setHealthData(data);
    } catch (err) {
      console.error("Health load failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading health data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Health</Text>
        <Text style={styles.headerSubtitle}>
          {format(new Date(), "EEEE, MMMM d")}
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Recovery Score */}
        <ScoreRing score={healthData?.recoveryScore ?? 0} />

        {/* Anomaly Alerts */}
        {healthData?.anomalies && healthData.anomalies.length > 0 && (
          <View style={styles.section}>
            {healthData.anomalies.map((anomaly, i) => (
              <View
                key={i}
                style={[
                  styles.alertCard,
                  anomaly.severity === "alert"
                    ? styles.alertCardCritical
                    : styles.alertCardWarning,
                ]}
              >
                <Text style={styles.alertTitle}>
                  {anomaly.severity === "alert" ? "ALERT" : "NOTE"}: {anomaly.metric}
                </Text>
                <Text style={styles.alertMessage}>{anomaly.message}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <MetricCard
            label="Resting HR"
            value={String(Math.round(healthData?.baseline?.restingHeartRate?.mean ?? 0))}
            unit="bpm"
            baseline={`${Math.round(healthData?.baseline?.restingHeartRate?.mean ?? 0)} avg`}
          />
          <MetricCard
            label="HRV"
            value={String(Math.round(healthData?.baseline?.hrv?.mean ?? 0))}
            unit="ms"
            baseline={`${Math.round(healthData?.baseline?.hrv?.mean ?? 0)} avg`}
          />
          <MetricCard
            label="Sleep"
            value={(healthData?.baseline?.sleepHours?.mean ?? 0).toFixed(1)}
            unit="hrs"
            baseline={`${(healthData?.baseline?.sleepHours?.mean ?? 0).toFixed(1)} avg`}
          />
          <MetricCard
            label="Steps"
            value={String(Math.round(healthData?.baseline?.steps?.mean ?? 0))}
            unit="daily"
            baseline={`${Math.round(healthData?.baseline?.steps?.mean ?? 0)} avg`}
          />
        </View>

        {/* Weekly Summary */}
        {healthData?.weeklySummary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Weekly Health Summary</Text>
            <Text style={styles.summaryText}>{healthData.weeklySummary}</Text>
          </View>
        )}

        {/* Ask Aurora */}
        <TouchableOpacity style={styles.askButton}>
          <Text style={styles.askButtonText}>
            Ask Aurora about your health
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 14 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  content: { flex: 1, paddingHorizontal: 16 },
  scoreRing: { alignItems: "center", paddingVertical: 24 },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  scoreNumber: { fontSize: 36, fontWeight: "700" },
  scoreLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  section: { marginBottom: 16 },
  alertCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  alertCardCritical: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: colors.error,
  },
  alertCardWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: colors.warning,
  },
  alertTitle: { fontSize: 13, fontWeight: "600", color: colors.warning, marginBottom: 4 },
  alertMessage: { fontSize: 14, color: colors.text, lineHeight: 20 },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  metricValue: { fontSize: 24, fontWeight: "700", color: colors.text },
  metricUnit: { fontSize: 13, color: colors.textMuted },
  metricBaseline: { fontSize: 11, color: colors.textDim, marginTop: 4 },
  summaryCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 8 },
  summaryText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  askButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 16,
  },
  askButtonText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  bottomSpacer: { height: 40 },
});
