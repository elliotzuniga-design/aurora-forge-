import admin from "firebase-admin";
import { getFirestore } from "../middleware/auth.js";
import { callClaude } from "./claude.js";
import { storeMemory, searchMemories } from "./memory.js";
import { v4 as uuid } from "uuid";

// ─── Types ────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  name: string;
  category: string;
  subcategory?: string;
  accountContext: "personal" | "pen_factory" | "nea_construction";
  isRecurring?: boolean;
  taxFlag?: string;
  projectId?: string;
}

export interface Invoice {
  id: string;
  vendorOrClient: string;
  amount: number;
  dateSent: string;
  dueDate: string;
  status: "draft" | "sent" | "paid" | "overdue" | "disputed";
  context: "pen_factory" | "nea_construction";
  projectName?: string;
  notes?: string;
}

export interface SubscriptionEntry {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  nextChargeDate: string;
  category: string;
  active: boolean;
}

export interface FinancialSummary {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  net: number;
  byCategory: Record<string, number>;
  byContext: Record<string, number>;
  unusualTransactions: Transaction[];
  overdueInvoices: Invoice[];
}

// ─── Sync Transactions ───────────────────────────────────────

export async function syncTransactions(
  uid: string,
  transactions: Transaction[]
): Promise<{ synced: number }> {
  const db = getFirestore();

  // Group transactions by YYYY-MM
  const byMonth = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const month = tx.date.slice(0, 7); // YYYY-MM
    const existing = byMonth.get(month) || [];
    existing.push(tx);
    byMonth.set(month, existing);
  }

  let synced = 0;

  for (const [month, monthTransactions] of byMonth) {
    const docRef = db
      .collection("users")
      .doc(uid)
      .collection("transactions")
      .doc(month);

    const existing = await docRef.get();
    const existingItems: Transaction[] =
      (existing.data()?.items as Transaction[]) || [];

    // Merge by id, replacing existing with same id
    const mergedMap = new Map<string, Transaction>();
    for (const item of existingItems) {
      mergedMap.set(item.id, item);
    }
    for (const item of monthTransactions) {
      if (!item.id) {
        item.id = uuid();
      }
      mergedMap.set(item.id, item);
    }

    const items = Array.from(mergedMap.values());

    await docRef.set(
      {
        items,
        updatedAt: new Date().toISOString(),
        count: items.length,
      },
      { merge: true }
    );

    synced += monthTransactions.length;
  }

  return { synced };
}

// ─── Categorize Transaction ──────────────────────────────────

export async function categorizeTransaction(
  uid: string,
  transaction: Transaction
): Promise<Transaction> {
  const prompt = `You are a financial categorization system for a person who runs two businesses:
1. A pen factory business (pen_factory)
2. N.E.A. Construction (nea_construction)
They also have personal finances (personal).

Given this transaction, determine:
- accountContext: "personal", "pen_factory", or "nea_construction"
- category: a broad category (e.g. "supplies", "payroll", "utilities", "food", "entertainment", "equipment", "subcontractor", "materials", "insurance", "fuel", "rent", "software", "marketing", "health", "savings", "income")
- subcategory: a more specific sub-category if applicable
- taxFlag: if tax-relevant, one of "deductible", "revenue", "estimated_tax", "mileage", "depreciation", or null
- isRecurring: true/false based on the name

Transaction:
- Name: ${transaction.name}
- Amount: $${transaction.amount}
- Date: ${transaction.date}

Output ONLY a JSON object with: { "accountContext", "category", "subcategory", "taxFlag", "isRecurring" }`;

  try {
    const result = await callClaude(
      "You are a financial categorization engine. Output only valid JSON.",
      prompt
    );

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...transaction,
        accountContext: parsed.accountContext || transaction.accountContext,
        category: parsed.category || transaction.category,
        subcategory: parsed.subcategory || transaction.subcategory,
        taxFlag: parsed.taxFlag || transaction.taxFlag,
        isRecurring: parsed.isRecurring ?? transaction.isRecurring,
      };
    }
  } catch (err) {
    console.error("[FinancialAnalysis] Categorization failed:", err);
  }

  return transaction;
}

// ─── Generate Monthly Summary ────────────────────────────────

export async function generateMonthlySummary(
  uid: string,
  month: string // YYYY-MM
): Promise<FinancialSummary> {
  const db = getFirestore();

  // Fetch transactions for the month
  const txDoc = await db
    .collection("users")
    .doc(uid)
    .collection("transactions")
    .doc(month)
    .get();

  const transactions: Transaction[] =
    (txDoc.data()?.items as Transaction[]) || [];

  // Calculate totals
  let totalIncome = 0;
  let totalExpenses = 0;
  const byCategory: Record<string, number> = {};
  const byContext: Record<string, number> = {};

  for (const tx of transactions) {
    if (tx.amount >= 0) {
      totalIncome += tx.amount;
    } else {
      totalExpenses += Math.abs(tx.amount);
    }

    const cat = tx.category || "uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + tx.amount;

    const ctx = tx.accountContext || "personal";
    byContext[ctx] = (byContext[ctx] || 0) + tx.amount;
  }

  // Detect unusual transactions (>2x category average)
  const categoryAverages: Record<string, { total: number; count: number }> = {};
  for (const tx of transactions) {
    const cat = tx.category || "uncategorized";
    if (!categoryAverages[cat]) {
      categoryAverages[cat] = { total: 0, count: 0 };
    }
    categoryAverages[cat].total += Math.abs(tx.amount);
    categoryAverages[cat].count += 1;
  }

  const unusualTransactions = transactions.filter((tx) => {
    const cat = tx.category || "uncategorized";
    const avg = categoryAverages[cat];
    if (!avg || avg.count < 2) return false;
    const mean = avg.total / avg.count;
    return Math.abs(tx.amount) > mean * 2;
  });

  // Get overdue invoices
  const overdueInvoices = await getOverdueInvoices(uid);

  return {
    month,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    byCategory,
    byContext,
    unusualTransactions,
    overdueInvoices,
  };
}

// ─── Invoice Management ──────────────────────────────────────

export async function upsertInvoice(
  uid: string,
  invoice: Invoice
): Promise<Invoice> {
  const db = getFirestore();

  if (!invoice.id) {
    invoice.id = uuid();
  }

  await db
    .collection("users")
    .doc(uid)
    .collection("invoices")
    .doc(invoice.id)
    .set(
      {
        ...invoice,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  return invoice;
}

export async function getOverdueInvoices(uid: string): Promise<Invoice[]> {
  const db = getFirestore();
  const today = new Date().toISOString().split("T")[0];

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("invoices")
    .where("status", "in", ["sent", "overdue"])
    .where("dueDate", "<", today)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      vendorOrClient: data.vendorOrClient,
      amount: data.amount,
      dateSent: data.dateSent,
      dueDate: data.dueDate,
      status: data.status,
      context: data.context,
      projectName: data.projectName,
      notes: data.notes,
    } as Invoice;
  });
}

export async function getInvoices(
  uid: string,
  status?: string,
  context?: string
): Promise<Invoice[]> {
  const db = getFirestore();

  let query: admin.firestore.Query = db
    .collection("users")
    .doc(uid)
    .collection("invoices");

  if (status) {
    query = query.where("status", "==", status);
  }

  if (context) {
    query = query.where("context", "==", context);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      vendorOrClient: data.vendorOrClient,
      amount: data.amount,
      dateSent: data.dateSent,
      dueDate: data.dueDate,
      status: data.status,
      context: data.context,
      projectName: data.projectName,
      notes: data.notes,
    } as Invoice;
  });
}

// ─── Subscription Management ─────────────────────────────────

export async function getSubscriptions(
  uid: string
): Promise<SubscriptionEntry[]> {
  const db = getFirestore();

  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("subscriptions")
    .where("active", "==", true)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      nextChargeDate: data.nextChargeDate,
      category: data.category,
      active: data.active,
    } as SubscriptionEntry;
  });
}

export async function upsertSubscription(
  uid: string,
  sub: SubscriptionEntry
): Promise<SubscriptionEntry> {
  const db = getFirestore();

  if (!sub.id) {
    sub.id = uuid();
  }

  await db
    .collection("users")
    .doc(uid)
    .collection("subscriptions")
    .doc(sub.id)
    .set(
      {
        ...sub,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  return sub;
}

// ─── Tax Summary ─────────────────────────────────────────────

export async function generateTaxSummary(
  uid: string,
  year: number | string
): Promise<Record<string, unknown>> {
  // Accept string or number for convenience (routes pass string from query params)
  const yearNum = typeof year === "string" ? parseInt(year, 10) : year;
  const db = getFirestore();

  // Fetch all monthly transaction docs for the year
  const allTransactions: Transaction[] = [];

  for (let m = 1; m <= 12; m++) {
    const month = `${yearNum}-${String(m).padStart(2, "0")}`;
    const txDoc = await db
      .collection("users")
      .doc(uid)
      .collection("transactions")
      .doc(month)
      .get();

    const items = (txDoc.data()?.items as Transaction[]) || [];
    allTransactions.push(...items);
  }

  // Group by tax flag
  const byTaxFlag: Record<string, { total: number; count: number; items: Transaction[] }> = {};
  for (const tx of allTransactions) {
    if (tx.taxFlag) {
      if (!byTaxFlag[tx.taxFlag]) {
        byTaxFlag[tx.taxFlag] = { total: 0, count: 0, items: [] };
      }
      byTaxFlag[tx.taxFlag].total += tx.amount;
      byTaxFlag[tx.taxFlag].count += 1;
      byTaxFlag[tx.taxFlag].items.push(tx);
    }
  }

  // Track N.E.A. Construction revenue and expenses
  const neaTransactions = allTransactions.filter(
    (tx) => tx.accountContext === "nea_construction"
  );
  const neaRevenue = neaTransactions
    .filter((tx) => tx.amount >= 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const neaExpenses = neaTransactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Track pen factory revenue and expenses
  const penTransactions = allTransactions.filter(
    (tx) => tx.accountContext === "pen_factory"
  );
  const penRevenue = penTransactions
    .filter((tx) => tx.amount >= 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const penExpenses = penTransactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const taxSummary: Record<string, unknown> = {
    year: yearNum,
    totalTransactions: allTransactions.length,
    flaggedTransactions: Object.values(byTaxFlag).reduce(
      (sum, group) => sum + group.count,
      0
    ),
    byTaxFlag: Object.fromEntries(
      Object.entries(byTaxFlag).map(([flag, data]) => [
        flag,
        { total: data.total, count: data.count },
      ])
    ),
    neaConstruction: {
      revenue: neaRevenue,
      expenses: neaExpenses,
      net: neaRevenue - neaExpenses,
    },
    penFactory: {
      revenue: penRevenue,
      expenses: penExpenses,
      net: penRevenue - penExpenses,
    },
    totalDeductible:
      byTaxFlag["deductible"]?.total
        ? Math.abs(byTaxFlag["deductible"].total)
        : 0,
    generatedAt: new Date().toISOString(),
  };

  // Store tax summary in memory for future reference
  try {
    await storeMemory(uid, {
      content: `${yearNum} Tax Summary: N.E.A. Construction net $${(neaRevenue - neaExpenses).toFixed(2)}, Pen Factory net $${(penRevenue - penExpenses).toFixed(2)}. Total deductible: $${taxSummary.totalDeductible}. ${allTransactions.length} transactions, ${taxSummary.flaggedTransactions} tax-flagged.`,
      type: "semantic",
      importance: 8,
      timestamp: new Date(),
      source: "financial",
      topics: ["finances"],
      metadata: {
        year: yearNum,
        type: "tax_summary",
        neaNet: neaRevenue - neaExpenses,
        penNet: penRevenue - penExpenses,
      },
    });
  } catch (err) {
    console.error("[FinancialAnalysis] Failed to store tax summary in memory:", err);
  }

  return taxSummary;
}
