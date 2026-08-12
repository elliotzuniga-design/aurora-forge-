import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/colors";
import api from "../services/api";

interface DomainScore {
  domain: string;
  score: number;
  trend: "up" | "down" | "stable";
  notes: string;
}

interface Goal {
  id: string;
  domain: string;
  title: string;
  description: string;
  currentProgress: number;
  priority: 1 | 2 | 3;
}

interface Decision {
  id: string;
  context: string;
  chosen: string;
  reasoning: string;
  madeAt: string;
  domain: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  health: "Health",
  family: "Family",
  financial: "Financial",
  career: "Career",
  business: "Business",
  personal_growth: "Growth",
  legacy: "Legacy",
};

const DOMAIN_COLORS: Record<string, string> = {
  health: "#10B981",
  family: "#F59E0B",
  financial: "#06B6D4",
  career: "#7C3AED",
  business: "#00D4AA",
  personal_growth: "#EC4899",
  legacy: "#8B5CF6",
};

function ScoreBar({ domain, score, trend, notes }: DomainScore) {
  const color = DOMAIN_COLORS[domain] || colors.primary;
  const trendIcon = trend === "up" ? "+" : trend === "down" ? "-" : "=";

  return (
    <View style={styles.scoreBarContainer}>
      <View style={styles.scoreBarHeader}>
        <Text style={styles.scoreBarLabel}>
          {DOMAIN_LABELS[domain] || domain}
        </Text>
        <Text style={[styles.scoreBarTrend, { color }]}>
          {trendIcon} {score}/10
        </Text>
      </View>
      <View style={styles.scoreBarTrack}>
        <View
          style={[
            styles.scoreBarFill,
            { width: `${score * 10}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.scoreBarNotes}>{notes}</Text>
    </View>
  );
}

export function StrategyScreen() {
  const [domainScores, setDomainScores] = useState<DomainScore[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [weeklyReview, setWeeklyReview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scenarioInput, setScenarioInput] = useState("");
  const [scenarioResult, setScenarioResult] = useState<string | null>(null);
  const [isModeling, setIsModeling] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [dashboardRes, decisionsRes] = await Promise.all([
        api.get("/goals/dashboard"),
        api.get("/decisions?limit=10"),
      ]);
      setDomainScores(dashboardRes.data.domainScores || []);
      setGoals(dashboardRes.data.goals || []);
      setDecisions(decisionsRes.data.decisions || []);
    } catch (err) {
      console.error("Strategy load failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadWeeklyReview = useCallback(async () => {
    try {
      const { data } = await api.get("/goals/weekly-review");
      setWeeklyReview(data.review);
    } catch (err) {
      console.error("Weekly review failed:", err);
    }
  }, []);

  const handleModelScenario = useCallback(async () => {
    if (!scenarioInput.trim()) return;

    setIsModeling(true);
    try {
      const { data } = await api.post("/decisions/model-scenario", {
        decision: scenarioInput.trim(),
        timeframe: "6 months",
        factors: [],
      });
      setScenarioResult(data.analysis);
    } catch (err) {
      Alert.alert("Error", "Failed to model scenario.");
    } finally {
      setIsModeling(false);
    }
  }, [scenarioInput]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Strategy</Text>
        <TouchableOpacity onPress={loadWeeklyReview}>
          <Text style={styles.reviewButton}>Weekly Review</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Domain Scores */}
        <Text style={styles.sectionTitle}>LIFE DOMAIN SCORES</Text>
        <View style={styles.scoresCard}>
          {domainScores.map((ds) => (
            <ScoreBar key={ds.domain} {...ds} />
          ))}
        </View>

        {/* Goals */}
        <Text style={styles.sectionTitle}>ACTIVE GOALS</Text>
        {goals.length === 0 ? (
          <Text style={styles.emptyText}>No goals set yet. Start with Aurora.</Text>
        ) : (
          goals.map((goal) => (
            <View key={goal.id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View
                  style={[
                    styles.domainTag,
                    {
                      backgroundColor: `${DOMAIN_COLORS[goal.domain] || colors.primary}20`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.domainTagText,
                      { color: DOMAIN_COLORS[goal.domain] || colors.primary },
                    ]}
                  >
                    {DOMAIN_LABELS[goal.domain] || goal.domain}
                  </Text>
                </View>
                <Text style={styles.priorityBadge}>P{goal.priority}</Text>
              </View>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${goal.currentProgress}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{goal.currentProgress}%</Text>
            </View>
          ))
        )}

        {/* Weekly Review */}
        {weeklyReview && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Weekly Review</Text>
            <Text style={styles.reviewText}>{weeklyReview}</Text>
          </View>
        )}

        {/* Scenario Modeler */}
        <Text style={styles.sectionTitle}>DECISION MODELER</Text>
        <View style={styles.scenarioCard}>
          <TextInput
            style={styles.scenarioInput}
            value={scenarioInput}
            onChangeText={setScenarioInput}
            placeholder="What decision are you weighing?"
            placeholderTextColor={colors.textDim}
            multiline
          />
          <TouchableOpacity
            style={[styles.modelButton, isModeling && styles.modelButtonDisabled]}
            onPress={handleModelScenario}
            disabled={isModeling}
          >
            {isModeling ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.modelButtonText}>Model It</Text>
            )}
          </TouchableOpacity>
        </View>

        {scenarioResult && (
          <View style={styles.scenarioResult}>
            <Text style={styles.scenarioResultText}>{scenarioResult}</Text>
          </View>
        )}

        {/* Recent Decisions */}
        {decisions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>DECISION JOURNAL</Text>
            {decisions.slice(0, 5).map((d) => (
              <View key={d.id} style={styles.decisionCard}>
                <Text style={styles.decisionContext}>{d.context}</Text>
                <Text style={styles.decisionChosen}>Chose: {d.chosen}</Text>
                <Text style={styles.decisionDate}>
                  {new Date(d.madeAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  reviewButton: { fontSize: 14, color: colors.primary, fontWeight: "500" },
  content: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  scoresCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreBarContainer: { marginBottom: 12 },
  scoreBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  scoreBarLabel: { fontSize: 13, color: colors.text, fontWeight: "500" },
  scoreBarTrend: { fontSize: 13, fontWeight: "600" },
  scoreBarTrack: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreBarFill: { height: 6, borderRadius: 3 },
  scoreBarNotes: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  domainTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  domainTagText: { fontSize: 11, fontWeight: "600" },
  priorityBadge: { fontSize: 11, color: colors.textMuted, fontWeight: "500" },
  goalTitle: { fontSize: 15, color: colors.text, fontWeight: "600", marginBottom: 8 },
  progressBar: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  progressText: { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  reviewCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  reviewTitle: { fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 8 },
  reviewText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  scenarioCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scenarioInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  modelButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modelButtonDisabled: { opacity: 0.5 },
  modelButtonText: { color: "#000", fontWeight: "700", fontSize: 15 },
  scenarioResult: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scenarioResultText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  decisionCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  decisionContext: { fontSize: 14, color: colors.text, fontWeight: "500", marginBottom: 4 },
  decisionChosen: { fontSize: 13, color: colors.primary, marginBottom: 2 },
  decisionDate: { fontSize: 11, color: colors.textDim },
  emptyText: { fontSize: 14, color: colors.textMuted, paddingVertical: 12 },
  bottomSpacer: { height: 40 },
});
