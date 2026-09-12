import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getFirestore } from "../middleware/auth.js";
import { getAgentDefinitions, triggerAgent } from "../services/agentRunner.js";

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // GET /agents — list all agents with status
  app.get(
    "/agents",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const db = getFirestore();

      const agents = getAgentDefinitions();

      const stateSnapshot = await db
        .collection("users")
        .doc(uid)
        .collection("agentState")
        .get();

      const stateMap = new Map<string, Record<string, unknown>>();
      for (const doc of stateSnapshot.docs) {
        stateMap.set(doc.id, doc.data());
      }

      const agentsWithState = agents.map((agent) => {
        const state = stateMap.get(agent.id) || {};
        return {
          ...agent,
          enabled: (state.enabled as boolean) ?? agent.enabled,
          lastRun: state.lastRun || null,
          lastResult: state.lastResult || null,
          lastDurationMs: state.lastDurationMs || null,
        };
      });

      return reply.send({ agents: agentsWithState });
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

      try {
        const log = await triggerAgent(id, uid);
        return reply.send({
          status: log.success ? "completed" : "failed",
          agentId: log.agentId,
          agentName: log.agentName,
          summary: log.summary,
          actionsCount: log.actions.length,
          timestamp: log.timestamp,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(404).send({ error: message });
      }
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
