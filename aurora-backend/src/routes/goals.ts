import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getFirestore } from "../middleware/auth.js";
import type { LifeGoal, Milestone } from "../types/index.js";
import { v4 as uuid } from "uuid";

export async function goalRoutes(app: FastifyInstance): Promise<void> {
  // GET /goals — list all goals
  app.get(
    "/goals",
    async (
      request: FastifyRequest<{
        Querystring: { domain?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { domain } = request.query;
      const db = getFirestore();

      let query = db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .orderBy("priority", "asc");

      if (domain) {
        query = db
          .collection("users")
          .doc(uid)
          .collection("goals")
          .where("domain", "==", domain)
          .orderBy("priority", "asc");
      }

      const snapshot = await query.get();
      const goals = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return reply.send({ goals });
    }
  );

  // GET /goals/:id — get a single goal
  app.get(
    "/goals/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const db = getFirestore();

      const doc = await db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .doc(id)
        .get();

      if (!doc.exists) {
        return reply.status(404).send({ error: "Goal not found" });
      }

      return reply.send({ goal: { id: doc.id, ...doc.data() } });
    }
  );

  // POST /goals — create a new goal
  app.post(
    "/goals",
    async (
      request: FastifyRequest<{
        Body: {
          domain: LifeGoal["domain"];
          title: string;
          description: string;
          targetDate?: string;
          successMetrics?: string[];
          priority?: 1 | 2 | 3;
        };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { domain, title, description, targetDate, successMetrics, priority } =
        request.body;

      if (!domain || !title) {
        return reply.status(400).send({ error: "domain and title are required" });
      }

      const db = getFirestore();
      const id = uuid();

      const goal: LifeGoal = {
        id,
        domain,
        title,
        description: description || "",
        targetDate: targetDate ? new Date(targetDate) : undefined,
        successMetrics: successMetrics || [],
        currentProgress: 0,
        milestones: [],
        relatedMemories: [],
        lastReviewed: new Date(),
        priority: priority || 2,
      };

      await db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .doc(id)
        .set({
          ...goal,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      return reply.status(201).send({ goal });
    }
  );

  // PUT /goals/:id — update a goal
  app.put(
    "/goals/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<
          Pick<
            LifeGoal,
            | "title"
            | "description"
            | "domain"
            | "targetDate"
            | "successMetrics"
            | "currentProgress"
            | "priority"
          >
        >;
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const updates = request.body;
      const db = getFirestore();

      const docRef = db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .doc(id);

      const doc = await docRef.get();
      if (!doc.exists) {
        return reply.status(404).send({ error: "Goal not found" });
      }

      await docRef.update({
        ...updates,
        updatedAt: new Date(),
        lastReviewed: new Date(),
      });

      const updated = await docRef.get();
      return reply.send({ goal: { id: updated.id, ...updated.data() } });
    }
  );

  // POST /goals/:id/milestones — add a milestone
  app.post(
    "/goals/:id/milestones",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { title: string; targetDate?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const { title, targetDate } = request.body;

      if (!title) {
        return reply.status(400).send({ error: "title is required" });
      }

      const db = getFirestore();
      const docRef = db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .doc(id);

      const doc = await docRef.get();
      if (!doc.exists) {
        return reply.status(404).send({ error: "Goal not found" });
      }

      const milestone: Milestone = {
        id: uuid(),
        title,
        completed: false,
        targetDate: targetDate ? new Date(targetDate) : undefined,
      };

      const existing = doc.data()?.milestones || [];
      await docRef.update({
        milestones: [...existing, milestone],
        updatedAt: new Date(),
      });

      return reply.status(201).send({ milestone });
    }
  );

  // PUT /goals/:id/milestones/:milestoneId — toggle milestone completion
  app.put(
    "/goals/:id/milestones/:milestoneId",
    async (
      request: FastifyRequest<{
        Params: { id: string; milestoneId: string };
        Body: { completed: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id, milestoneId } = request.params;
      const { completed } = request.body;

      const db = getFirestore();
      const docRef = db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .doc(id);

      const doc = await docRef.get();
      if (!doc.exists) {
        return reply.status(404).send({ error: "Goal not found" });
      }

      const milestones: Milestone[] = doc.data()?.milestones || [];
      const updated = milestones.map((m) =>
        m.id === milestoneId
          ? {
              ...m,
              completed,
              completedDate: completed ? new Date() : undefined,
            }
          : m
      );

      // Auto-calculate progress based on milestones
      const completedCount = updated.filter((m) => m.completed).length;
      const progress =
        updated.length > 0
          ? Math.round((completedCount / updated.length) * 100)
          : 0;

      await docRef.update({
        milestones: updated,
        currentProgress: progress,
        updatedAt: new Date(),
      });

      return reply.send({ milestones: updated, currentProgress: progress });
    }
  );

  // DELETE /goals/:id — delete a goal
  app.delete(
    "/goals/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const db = getFirestore();

      await db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .doc(id)
        .delete();

      return reply.send({ status: "deleted" });
    }
  );
}
