import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getFirestore } from "../middleware/auth.js";
import type { Agent } from "../types/index.js";

// Default agent definitions — Phase 4 adds full implementation
const DEFAULT_AGENTS: Omit<Agent, "lastRun" | "lastResult">[] = [
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    description:
      "Pulls today's calendar, weather, pending tasks, and health data into a morning brief.",
    schedule: "0 6 * * *",
    tools: [
      "get_calendar_events",
      "get_weather",
      "search_memory",
      "send_push_notification",
    ],
    systemPrompt: "Generate a concise morning briefing for Elliot.",
    enabled: true,
  },
  {
    id: "communication-monitor",
    name: "Communication Monitor",
    description: "Scans for emails and messages that need response or action.",
    schedule: "*/30 8-20 * * *",
    tools: ["search_emails", "search_memory", "send_push_notification", "add_memory"],
    systemPrompt: "Monitor communications and alert on important items.",
    enabled: true,
  },
  {
    id: "financial-watch",
    name: "Financial Watch",
    description:
      "Monitors transactions, upcoming bills, and financial anomalies.",
    schedule: "0 8 * * *",
    tools: ["search_web", "search_memory", "add_memory", "send_push_notification"],
    systemPrompt: "Monitor financial activity and alert on important items.",
    enabled: true,
  },
  {
    id: "pen-factory-ops",
    name: "Pen Factory Operations",
    description:
      "Reviews open work orders, vendor responses, and project deadlines.",
    schedule: "0 7 * * MON",
    tools: [
      "search_emails",
      "search_memory",
      "get_calendar_events",
      "add_memory",
      "send_push_notification",
    ],
    systemPrompt: "Generate a weekly operations summary for Pen Factory work.",
    enabled: true,
  },
  {
    id: "sports-coaching",
    name: "Sports Coaching",
    description:
      "Checks game schedules, pulls game notes, suggests practice focus areas.",
    schedule: "0 17 * * FRI",
    tools: [
      "search_memory",
      "search_web",
      "get_calendar_events",
      "send_push_notification",
    ],
    systemPrompt: "Prepare weekend game and practice briefing.",
    enabled: true,
  },
  {
    id: "health-insight",
    name: "Health Insight",
    description:
      "Reviews daily health data and provides end-of-day health insights.",
    schedule: "0 21 * * *",
    tools: ["search_memory", "add_memory", "send_push_notification"],
    systemPrompt: "Analyze today's health data and provide insights.",
    enabled: true,
  },
  {
    id: "contractor-ops",
    name: "N.E.A. Construction Ops",
    description:
      "Monitors bid opportunities, project deadlines, license renewals, insurance.",
    schedule: "0 8 * * MON,WED,FRI",
    tools: [
      "search_emails",
      "search_memory",
      "add_memory",
      "send_push_notification",
    ],
    systemPrompt: "Monitor N.E.A. Construction operations and compliance.",
    enabled: true,
  },
  {
    id: "deep-research",
    name: "Deep Research",
    description: "On-demand multi-step research on any topic.",
    schedule: "", // on-demand only
    tools: ["search_web", "fetch_url", "search_memory", "add_memory"],
    systemPrompt: "Conduct thorough research and return a structured briefing.",
    enabled: true,
  },
];

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // GET /agents — list all agents with status
  app.get(
    "/agents",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const db = getFirestore();

      // Get agent state from Firestore (overrides + last run info)
      const stateSnapshot = await db
        .collection("users")
        .doc(uid)
        .collection("agentState")
        .get();

      const stateMap = new Map<string, Record<string, unknown>>();
      for (const doc of stateSnapshot.docs) {
        stateMap.set(doc.id, doc.data());
      }

      const agents = DEFAULT_AGENTS.map((agent) => {
        const state = stateMap.get(agent.id) || {};
        return {
          ...agent,
          enabled: (state.enabled as boolean) ?? agent.enabled,
          lastRun: state.lastRun || null,
          lastResult: state.lastResult || null,
        };
      });

      return reply.send({ agents });
    }
  );

  // PUT /agents/:id/toggle — enable/disable an agent
  app.put(
    "/agents/:id/toggle",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { enabled: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const { enabled } = request.body;

      const db = getFirestore();
      await db
        .collection("users")
        .doc(uid)
        .collection("agentState")
        .doc(id)
        .set({ enabled }, { merge: true });

      return reply.send({ id, enabled });
    }
  );

  // POST /agents/:id/run — manually trigger an agent
  app.post(
    "/agents/:id/run",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;

      const agent = DEFAULT_AGENTS.find((a) => a.id === id);
      if (!agent) {
        return reply.status(404).send({ error: `Agent '${id}' not found` });
      }

      // Mark as running
      const db = getFirestore();
      await db
        .collection("users")
        .doc(uid)
        .collection("agentState")
        .doc(id)
        .set({ lastRun: new Date(), lastResult: "Running..." }, { merge: true });

      // TODO: Phase 4 — actually run the agent via AgentRunner
      // For now, acknowledge the trigger
      return reply.send({
        status: "triggered",
        agentId: id,
        agentName: agent.name,
        note: "Full agent execution coming in Phase 4",
      });
    }
  );

  // GET /agents/:id/logs — get agent execution logs
  app.get(
    "/agents/:id/logs",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const limit = parseInt(request.query.limit || "20", 10);

      const db = getFirestore();
      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection("agentLogs")
        .where("agentId", "==", id)
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return reply.send({ logs });
    }
  );
}
