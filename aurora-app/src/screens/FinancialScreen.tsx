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

type TabKey = "personal" | "pen_factory" | "nea_construction";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "personal", label: "Personal" },
  { key: "pen_factory", label: "Pen Factory" },
  { key: "nea_construction", label: "N.E.A." },
];

interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  byCategory: Record<string, number>;
  byContext: Record<string, { income: number; expenses: number }>;
  unusualTransactions: Array<{ name: string; amount: number; date: string }>;
  overdueInvoices: Array<{
    vendorOrClient: string;
    amount: number;
    dueDate: string;
    status: string;
  }>;
}

interface Invoice {
  id: string;
  vendorOrClient: string;
  amount: number;
  dueDate: string;
  status: string;
  context: string;
}

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function FinancialScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentMonth = format(new Date(), "yyyy-MM");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [summaryRes, invoicesRes] = await Promise.all([
        api.get(`/financial/summary?month=${currentMonth}`),
        api.get("/financial/invoices"),
      ]);
      setSummary(summaryRes.data);
      setInvoices(invoicesRes.data.invoices || []);
    } catch (err) {
      console.error("Financial load failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const contextData = summary?.byContext?.[activeTab] || {
    income: 0,
    expenses: 0,
  };
  const contextInvoices = invoices.filter((i) => i.context === activeTab);
  const overdueInvoices = (summary?.overdueInvoices || []).filter(
    (i) => !activeTab || activeTab === "personal"
  );

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
        <Text style={styles.headerTitle}>Finances</Text>
        <Text style={styles.headerSubtitle}>
          {format(new Date(), "MMMM yyyy")}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === key && styles.tabTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, styles.incomeCard]}>
            <Text style={styles.summaryLabel}>Income</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {formatCurrency(contextData.income)}
            </Text>
          </View>
          <View style={[styles.summaryCard, styles.expenseCard]}>
            <Text style={styles.summaryLabel}>Expenses</Text>
            <Text style={[styles.summaryValue, { color: colors.error }]}>
              {formatCurrency(contextData.expenses)}
            </Text>
          </View>
        </View>

        <View style={styles.netCard}>
          <Text style={styles.netLabel}>Net</Text>
          <Text
            style={[
              styles.netValue,
              {
                color:
                  contextData.income - contextData.expenses >= 0
                    ? colors.success
                    : colors.error,
              },
            ]}
          >
            {contextData.income - contextData.expenses >= 0 ? "+" : "-"}
            {formatCurrency(contextData.income - contextData.expenses)}
          </Text>
        </View>

        {/* Overdue Invoices */}
        {overdueInvoices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OVERDUE INVOICES</Text>
            {overdueInvoices.map((inv, i) => (
              <View key={i} style={styles.invoiceCard}>
                <View style={styles.invoiceHeader}>
                  <Text style={styles.invoiceName}>{inv.vendorOrClient}</Text>
                  <View style={styles.overdueBadge}>
                    <Text style={styles.overdueText}>OVERDUE</Text>
                  </View>
                </View>
                <View style={styles.invoiceDetails}>
                  <Text style={styles.invoiceAmount}>
                    {formatCurrency(inv.amount)}
                  </Text>
                  <Text style={styles.invoiceDate}>
                    Due: {inv.dueDate}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Invoices for this context */}
        {activeTab !== "personal" && contextInvoices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>INVOICES</Text>
            {contextInvoices.map((inv) => (
              <View key={inv.id} style={styles.invoiceCard}>
                <View style={styles.invoiceHeader}>
                  <Text style={styles.invoiceName}>{inv.vendorOrClient}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          inv.status === "paid"
                            ? `${colors.success}20`
                            : inv.status === "overdue"
                              ? `${colors.error}20`
                              : `${colors.warning}20`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            inv.status === "paid"
                              ? colors.success
                              : inv.status === "overdue"
                                ? colors.error
                                : colors.warning,
                        },
                      ]}
                    >
                      {inv.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.invoiceAmount}>
                  {formatCurrency(inv.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Unusual Transactions */}
        {summary?.unusualTransactions && summary.unusualTransactions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>UNUSUAL TRANSACTIONS</Text>
            {summary.unusualTransactions.slice(0, 5).map((txn, i) => (
              <View key={i} style={styles.txnCard}>
                <Text style={styles.txnName}>{txn.name}</Text>
                <Text style={styles.txnAmount}>
                  {formatCurrency(txn.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Ask Aurora */}
        <TouchableOpacity style={styles.askButton}>
          <Text style={styles.askButtonText}>
            Ask Aurora about your finances
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
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  tabTextActive: { color: "#000", fontWeight: "700" },
  content: { flex: 1, paddingHorizontal: 16 },
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  incomeCard: {},
  expenseCard: {},
  summaryLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: "700" },
  netCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  netLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  netValue: { fontSize: 28, fontWeight: "700" },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  invoiceCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  invoiceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  invoiceName: { fontSize: 14, color: colors.text, fontWeight: "500", flex: 1 },
  invoiceDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  invoiceAmount: { fontSize: 15, color: colors.text, fontWeight: "600" },
  invoiceDate: { fontSize: 12, color: colors.textMuted },
  overdueBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  overdueText: { fontSize: 10, color: colors.error, fontWeight: "700" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: "700" },
  txnCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
  },
  txnName: { fontSize: 14, color: colors.text, flex: 1 },
  txnAmount: { fontSize: 14, color: colors.warning, fontWeight: "600" },
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
