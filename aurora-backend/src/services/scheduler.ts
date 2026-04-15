import cron from "node-cron";
import { getFirestore } from "../middleware/auth.js";
import { runAgent } from "./agent-runner.js";
import { sendPushNotification } from "./push.js";
import type { Agent } from "../types/index.js";

// ─── Agent Definitions (imported from routes for shared access) ──

const DEFAULT_AGENTS: Omit<Agent, "lastRun" | "lastResult">[] = [
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    description:
      "Pulls today's calendar, weather, pending tasks, and health data into a morning brief.",
    schedule: "0 6 * * *",
    tools: ["get_calendar_events", "get_weather", "search_memory", "add_memory"],
    systemPrompt: "Generate a concise morning briefing for Elliot.",
    enabled: true,
  },
  {
    id: "communication-monitor",
    name: "Communication Monitor",
    description: "Scans for emails and messages that need response or action.",
    schedule: "*/30 8-20 * * *",
    tools: ["search_web", "search_memory", "add_memory"],
    systemPrompt: "Monitor communications and alert on important items.",
    enabled: true,
  },
  {
    id: "financial-watch",
    name: "Financial Watch",
    description:
      "Monitors transactions, upcoming bills, and financial anomalies.",
    schedule: "0 8 * * *",
    tools: ["search_web", "search_memory", "add_memory"],
    systemPrompt: "Monitor financial activity and alert on important items.",
    enabled: true,
  },
  {
    id: "pen-factory-ops",
    name: "Pen Factory Operations",
    description:
      "Reviews open work orders, vendor responses, and project deadlines.",
    schedule: "0 7 * * MON",
    tools: ["search_web", "search_memory", "get_calendar_events", "add_memory"],
    systemPrompt: "Generate a weekly operations summary for Pen Factory work.",
    enabled: true,
  },
  {
    id: "sports-coaching",
    name: "Sports Coaching",
    description:
      "Checks game schedules, pulls game notes, suggests practice focus areas.",
    schedule: "0 17 * * FRI",
    tools: ["search_memory", "search_web", "get_calendar_events"],
    systemPrompt: "Prepare weekend game and practice briefing.",
    enabled: true,
  },
  {
    id: "health-insight",
    name: "Health Insight",
    description:
      "Reviews daily health data and provides end-of-day health insights.",
    schedule: "0 21 * * *",
    tools: ["search_memory", "add_memory"],
    systemPrompt: "Analyze today's health data and provide insights.",
    enabled: true,
  },
  {
    id: "contractor-ops",
    name: "N.E.A. Construction Ops",
    description:
      "Monitors bid opportunities, project deadlines, license renewals, insurance.",
    schedule: "0 8 * * MON,WED,FRI",
    tools: ["search_web", "search_memory", "add_memory"],
    systemPrompt: "Monitor N.E.A. Construction operations and compliance.",
    enabled: true,
  },
  {
    id: "deep-research",
    name: "Deep Research",
    description: "On-demand multi-step research on any topic.",
    schedule: "",
    tools: ["search_web", "search_memory", "add_memory"],
    systemPrompt: "Conduct thorough research and return a structured briefing.",
    enabled: true,
  },
];

export function getDefaultAgents(): Omit<Agent, "lastRun" | "lastResult">[] {
  return DEFAULT_AGENTS;
}

// ─── Reminder Checker ─────────────────────────────────────────

async function checkReminders(): Promise<void> {
  const db = getFirestore();
  const now = new Date();

  // Get all users (in a single-user system this is simple)
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;

    // Find unsent reminders that are due
    const remindersSnapshot = await db
      .collection("users")
      .doc(uid)
      .collection("reminders")
      .where("sent", "==", false)
      .get();

    for (const reminderDoc of remindersSnapshot.docs) {
      const reminder = reminderDoc.data();
      const dueDate = new Date(reminder.datetime);

      if (dueDate <= now) {
        // Send the reminder as a push notification
        const sent = await sendPushNotification(uid, {
          title: "Reminder",
          body: reminder.message,
          data: { type: "reminder", reminderId: reminderDoc.id },
        });

        if (sent) {
          await reminderDoc.ref.update({ sent: true, sentAt: new Date() });
          console.log(`[Scheduler] Sent reminder: ${reminder.message}`);
        }
      }
    }
  }
}

// ─── Agent Scheduler ──────────────────────────────────────────

async function runScheduledAgent(agentDef: Omit<Agent, "lastRun" | "lastResult">): Promise<void> {
  const db = getFirestore();
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;

    // Check if the agent is enabled for this user
    const stateDoc = await db
      .collection("users")
      .doc(uid)
      .collection("agentState")
      .doc(agentDef.id)
      .get();

    const state = stateDoc.data();
    const isEnabled = state?.enabled ?? agentDef.enabled;

    if (!isEnabled) {
      console.log(`[Scheduler] Agent ${agentDef.name} disabled for user ${uid}, skipping`);
      return;
    }

    console.log(`[Scheduler] Running agent: ${agentDef.name} for user ${uid}`);

    const agent: Agent = {
      ...agentDef,
      lastRun: state?.lastRun?.toDate?.() || undefined,
      lastResult: state?.lastResult || undefined,
    };

    try {
      const log = await runAgent(uid, agent);
      console.log(
        `[Scheduler] Agent ${agentDef.name} completed: ${log.success ? "success" : "failed"} (${log.actions.length} actions)`
      );
    } catch (err) {
      console.error(`[Scheduler] Agent ${agentDef.name} error:`, err);
    }
  }
}

// ─── Start All Schedules ──────────────────────────────────────

const activeJobs: cron.ScheduledTask[] = [];

export function startScheduler(): void {
  console.log("[Scheduler] Starting AURORA scheduler...");

  // Schedule reminder checks every minute
  const reminderJob = cron.schedule("* * * * *", async () => {
    try {
      await checkReminders();
    } catch (err) {
      console.error("[Scheduler] Reminder check failed:", err);
    }
  });
  activeJobs.push(reminderJob);
  console.log("[Scheduler] Reminder checker: every minute");

  // Schedule each agent with a cron expression
  for (const agent of DEFAULT_AGENTS) {
    if (!agent.schedule) continue; // on-demand only (e.g. deep-research)

    if (!cron.validate(agent.schedule)) {
      console.warn(`[Scheduler] Invalid cron for ${agent.name}: ${agent.schedule}`);
      continue;
    }

    const job = cron.schedule(agent.schedule, () => {
      runScheduledAgent(agent).catch((err) =>
        console.error(`[Scheduler] Failed to run ${agent.name}:`, err)
      );
    });

    activeJobs.push(job);
    console.log(`[Scheduler] ${agent.name}: ${agent.schedule}`);
  }

  console.log(
    `[Scheduler] Started ${activeJobs.length} scheduled jobs (${DEFAULT_AGENTS.filter((a) => a.schedule).length} agents + 1 reminder checker)`
  );
}

export function stopScheduler(): void {
  for (const job of activeJobs) {
    job.stop();
  }
  activeJobs.length = 0;
  console.log("[Scheduler] All jobs stopped");
}
