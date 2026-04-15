import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getFirestore } from "../middleware/auth.js";
import { getDefaultAgents } from "../services/scheduler.js";
import { runAgent } from "../services/agent-runner.js";
import type { Agent } from "../types/index.js";

const DEFAULT_AGENTS = getDefaultAgents();

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

      // Run the agent asynchronously — respond immediately
      const fullAgent: Agent = {
        ...agent,
        lastRun: undefined,
        lastResult: undefined,
      };

      runAgent(uid, fullAgent).catch((err) =>
        console.error(`Manual agent run failed for ${id}:`, err)
      );

      return reply.send({
        status: "triggered",
        agentId: id,
        agentName: agent.name,
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
