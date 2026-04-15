import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getFirestore } from "../middleware/auth.js";
import type { HealthSyncPayload } from "../types/index.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // POST /health/sync — receive health data from iPhone
  app.post(
    "/health/sync",
    async (
      request: FastifyRequest<{ Body: HealthSyncPayload }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { metrics, date } = request.body;

      if (!metrics || !date) {
        return reply
          .status(400)
          .send({ error: "metrics and date are required" });
      }

      const db = getFirestore();

      // Store metrics under /users/{uid}/health/{date}/metrics
      await db
        .collection("users")
        .doc(uid)
        .collection("health")
        .doc(date)
        .set(
          {
            metrics,
            syncedAt: new Date(),
            date,
          },
          { merge: true }
        );

      return reply.send({ status: "synced", date, metricsCount: metrics.length });
    }
  );

  // GET /health/latest — get most recent health data
  app.get(
    "/health/latest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const db = getFirestore();

      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection("health")
        .orderBy("date", "desc")
        .limit(1)
        .get();

      if (snapshot.empty) {
        return reply.send({ data: null });
      }

      return reply.send({ data: snapshot.docs[0].data() });
    }
  );

  // GET /health/range?start=YYYY-MM-DD&end=YYYY-MM-DD — range query
  app.get(
    "/health/range",
    async (
      request: FastifyRequest<{
        Querystring: { start: string; end: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { start, end } = request.query;

      if (!start || !end) {
        return reply
          .status(400)
          .send({ error: "start and end dates required" });
      }

      const db = getFirestore();
      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection("health")
        .where("date", ">=", start)
        .where("date", "<=", end)
        .orderBy("date", "asc")
        .get();

      const data = snapshot.docs.map((doc) => doc.data());
      return reply.send({ data });
    }
  );
}
