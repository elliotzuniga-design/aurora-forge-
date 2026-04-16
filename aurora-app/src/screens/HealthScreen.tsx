import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import api from "../services/api";

interface MetricDisplay {
  key: string;
  label: string;
  unit: string;
  color: string;
  icon: string;
}

const METRIC_CONFIG: MetricDisplay[] = [
  { key: "steps", label: "Steps", unit: "", color: "#10B981", icon: "👟" },
  { key: "sleepHours", label: "Sleep", unit: "hrs", color: "#7C3AED", icon: "😴" },
  { key: "heartRate", label: "Heart Rate", unit: "bpm", color: "#EF4444", icon: "❤️" },
  { key: "restingHeartRate", label: "Resting HR", unit: "bpm", color: "#F59E0B", icon: "💛" },
  { key: "hrv", label: "HRV", unit: "ms", color: "#06B6D4", icon: "📊" },
  { key: "activeEnergy", label: "Active Cal", unit: "kcal", color: "#F97316", icon: "🔥" },
  { key: "exerciseMinutes", label: "Exercise", unit: "min", color: "#3B82F6", icon: "💪" },
  { key: "bloodOxygen", label: "SpO2", unit: "%", color: "#EC4899", icon: "🫁" },
  { key: "weight", label: "Weight", unit: "lbs", color: "#8B5CF6", icon: "⚖️" },
  { key: "mindfulMinutes", label: "Mindful", unit: "min", color: "#14B8A6", icon: "🧘" },
];

interface DayData {
  date: string;
  metrics: Record<string, number | string | undefined>[];
  syncedAt?: string;
}

export function HealthScreen() {
  const [todayData, setTodayData] = useState<DayData | null>(null);
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<{
    stats: { avg: number; min: number; max: number; latest: number; daysWithData: number } | null;
  } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const fetchData = useCallback(async () => {
    try {
      const [todayRes, rangeRes] = await Promise.all([
        api.get("/health/latest"),
        api.get("/health/range", {
          params: {
            start: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
            end: today,
          },
        }),
      ]);

      setTodayData(todayRes.data.data);
      setWeekData(rangeRes.data.data || []);
    } catch (err) {
      console.error("Failed to fetch health data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectMetricTrend = useCallback(async (metric: string) => {
    if (selectedMetric === metric) {
      setSelectedMetric(null);
      setTrendData(null);
      return;
    }

    setSelectedMetric(metric);
    try {
      // Build a local trend from weekData
      const values: number[] = [];
      for (const day of weekData) {
        const metricsArray = Array.isArray(day.metrics) ? day.metrics : [day.metrics];
        for (const m of metricsArray) {
          if (m[metric] != null && typeof m[metric] === "number") {
            values.push(m[metric] as number);
          }
        }
      }

      if (values.length > 0) {
        setTrendData({
          stats: {
            avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
            min: Math.min(...values),
            max: Math.max(...values),
            latest: values[values.length - 1],
            daysWithData: values.length,
          },
        });
      } else {
        setTrendData({ stats: null });
      }
    } catch {
      setTrendData({ stats: null });
    }
  }, [selectedMetric, weekData]);

  // Extract latest metrics from today's data
  const latestMetrics: Record<string, number | string> = {};
  if (todayData) {
    const metricsArray = Array.isArray(todayData.metrics)
      ? todayData.metrics
      : [todayData.metrics];
    for (const m of metricsArray) {
      for (const [key, val] of Object.entries(m || {})) {
        if (key !== "timestamp" && val != null) {
          latestMetrics[key] = val;
        }
      }
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Health</Text>
        </View>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.loader}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Health</Text>
        <Text style={styles.dateText}>{today}</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {!todayData && (
          <View style={styles.noDataBanner}>
            <Text style={styles.noDataTitle}>No health data yet</Text>
            <Text style={styles.noDataSubtitle}>
              Health data syncs automatically from Apple Health when you open the
              app. Make sure Health access is enabled in Settings.
            </Text>
          </View>
        )}

        {/* Metric Cards Grid */}
        <View style={styles.metricsGrid}>
          {METRIC_CONFIG.map((mc) => {
            const value = latestMetrics[mc.key];
            const isSelected = selectedMetric === mc.key;

            return (
              <TouchableOpacity
                key={mc.key}
                style={[
                  styles.metricCard,
                  isSelected && { borderColor: mc.color },
                ]}
                onPress={() => selectMetricTrend(mc.key)}
              >
                <Text style={styles.metricIcon}>{mc.icon}</Text>
                <Text style={styles.metricLabel}>{mc.label}</Text>
                <Text
                  style={[
                    styles.metricValue,
                    value != null ? { color: mc.color } : {},
                  ]}
                >
                  {value != null ? `${value}` : "—"}
                </Text>
                {value != null && mc.unit ? (
                  <Text style={styles.metricUnit}>{mc.unit}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Trend Card */}
        {selectedMetric && trendData && (
          <View style={styles.trendCard}>
            <Text style={styles.trendTitle}>
              7-Day Trend:{" "}
              {METRIC_CONFIG.find((m) => m.key === selectedMetric)?.label}
            </Text>
            {trendData.stats ? (
              <View style={styles.trendStats}>
                <View style={styles.trendStat}>
                  <Text style={styles.trendStatLabel}>Avg</Text>
                  <Text style={styles.trendStatValue}>{trendData.stats.avg}</Text>
                </View>
                <View style={styles.trendStat}>
                  <Text style={styles.trendStatLabel}>Min</Text>
                  <Text style={styles.trendStatValue}>{trendData.stats.min}</Text>
                </View>
                <View style={styles.trendStat}>
                  <Text style={styles.trendStatLabel}>Max</Text>
                  <Text style={styles.trendStatValue}>{trendData.stats.max}</Text>
                </View>
                <View style={styles.trendStat}>
                  <Text style={styles.trendStatLabel}>Latest</Text>
                  <Text style={styles.trendStatValue}>
                    {trendData.stats.latest}
                  </Text>
                </View>
                <View style={styles.trendStat}>
                  <Text style={styles.trendStatLabel}>Days</Text>
                  <Text style={styles.trendStatValue}>
                    {trendData.stats.daysWithData}/7
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noTrendText}>
                No data for this metric in the past 7 days
              </Text>
            )}
          </View>
        )}

        {/* Week Overview */}
        {weekData.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>THIS WEEK</Text>
            {weekData.map((day) => {
              const dayMetrics: Record<string, number | string> = {};
              const arr = Array.isArray(day.metrics)
                ? day.metrics
                : [day.metrics];
              for (const m of arr) {
                for (const [key, val] of Object.entries(m || {})) {
                  if (key !== "timestamp" && val != null) {
                    dayMetrics[key] = val;
                  }
                }
              }

              const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString(
                "en-US",
                { weekday: "short", month: "short", day: "numeric" }
              );

              return (
                <View key={day.date} style={styles.dayRow}>
                  <Text style={styles.dayDate}>{dateLabel}</Text>
                  <View style={styles.dayMetrics}>
                    {dayMetrics.steps != null && (
                      <Text style={styles.dayMetricText}>
                        {dayMetrics.steps} steps
                      </Text>
                    )}
                    {dayMetrics.sleepHours != null && (
                      <Text style={styles.dayMetricText}>
                        {dayMetrics.sleepHours}h sleep
                      </Text>
                    )}
                    {dayMetrics.exerciseMinutes != null && (
                      <Text style={styles.dayMetricText}>
                        {dayMetrics.exerciseMinutes}m exercise
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  dateText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  loader: {
    marginTop: 60,
  },
  content: {
    flex: 1,
  },
  noDataBanner: {
    margin: 16,
    padding: 20,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  noDataTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 8,
  },
  noDataSubtitle: {
    fontSize: 13,
    color: colors.textDim,
    textAlign: "center",
    lineHeight: 18,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 10,
  },
  metricCard: {
    width: "30%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: "center",
    minWidth: 100,
  },
  metricIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textDim,
  },
  metricUnit: {
    fontSize: 10,
    color: colors.textDim,
    marginTop: 2,
  },
  trendCard: {
    margin: 16,
    marginTop: 4,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trendTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
  },
  trendStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  trendStat: {
    alignItems: "center",
  },
  trendStatLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  trendStatValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  noTrendText: {
    fontSize: 13,
    color: colors.textDim,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayDate: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
    width: 100,
  },
  dayMetrics: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flex: 1,
  },
  dayMetricText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  bottomSpacer: {
    height: 40,
  },
});
