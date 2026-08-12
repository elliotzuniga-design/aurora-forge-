import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createGoal,
  getGoals,
  updateGoalProgress,
  addMilestone,
  completeMilestone,
  generateDomainScores,
  logDecision,
  getDecisions,
  reviewDecision,
  modelScenario,
  generateWeeklyReview,
  type Decision,
} from "../services/goals.js";
import type { LifeGoal, Milestone } from "../types/index.js";

export async function goalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/goals", async (request: FastifyRequest, reply: FastifyReply) => {
    const uid = (request as FastifyRequest & { uid: string }).uid;
    const goals = await getGoals(uid);
    return reply.send({ goals });
  });

  app.post(
    "/goals",
    async (
      request: FastifyRequest<{
        Body: Omit<LifeGoal, "id" | "milestones" | "relatedMemories" | "lastReviewed">;
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const goal = await createGoal(uid, request.body);
      return reply.send(goal);
    }
  );

  app.put(
    "/goals/:id/progress",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { progress: number };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      await updateGoalProgress(uid, request.params.id, request.body.progress);
      return reply.send({ status: "updated" });
    }
  );

  app.post(
    "/goals/:id/milestone",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Omit<Milestone, "id" | "completed" | "completedDate">;
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const milestone = await addMilestone(uid, request.params.id, request.body);
      return reply.send(milestone);
    }
  );

  app.put(
    "/goals/:id/milestone/:milestoneId/complete",
    async (
      request: FastifyRequest<{
        Params: { id: string; milestoneId: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      await completeMilestone(uid, request.params.id, request.params.milestoneId);
      return reply.send({ status: "completed" });
    }
  );

  app.get("/goals/dashboard", async (request: FastifyRequest, reply: FastifyReply) => {
    const uid = (request as FastifyRequest & { uid: string }).uid;
    const [goals, domainScores] = await Promise.all([
      getGoals(uid),
      generateDomainScores(uid),
    ]);
    return reply.send({ goals, domainScores });
  });

  app.get("/goals/weekly-review", async (request: FastifyRequest, reply: FastifyReply) => {
    const uid = (request as FastifyRequest & { uid: string }).uid;
    const review = await generateWeeklyReview(uid);
    return reply.send({ review });
  });

  // Decision Journal
  app.post(
    "/decisions",
    async (
      request: FastifyRequest<{ Body: Omit<Decision, "id" | "madeAt"> }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const decision = await logDecision(uid, request.body);
      return reply.send(decision);
    }
  );

  app.get(
    "/decisions",
    async (
      request: FastifyRequest<{ Querystring: { limit?: string } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const limit = parseInt(request.query.limit || "50", 10);
      const decisions = await getDecisions(uid, limit);
      return reply.send({ decisions });
    }
  );

  app.put(
    "/decisions/:id/review",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { outcome: string; dayMark: 30 | 60 | 90 };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      await reviewDecision(uid, request.params.id, request.body.outcome, request.body.dayMark);
      return reply.send({ status: "reviewed" });
    }
  );

  app.post(
    "/decisions/model-scenario",
    async (
      request: FastifyRequest<{
        Body: { decision: string; timeframe: string; factors: string[] };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { decision, timeframe, factors } = request.body;
      const analysis = await modelScenario(uid, decision, timeframe, factors);
      return reply.send({ analysis });
    }
  );
}
