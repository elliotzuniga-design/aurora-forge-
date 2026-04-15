import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  searchMemories,
  listMemories,
  addMemory,
  updateMemory,
  generateUserProfile,
} from "../services/memory.js";
import type { MemoryEntry } from "../types/index.js";

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // GET /memory/search?q={query}&type={type} — semantic search
  app.get(
    "/memory/search",
    async (
      request: FastifyRequest<{
        Querystring: { q: string; type?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { q, type } = request.query;

      if (!q) {
        return reply.status(400).send({ error: "Query parameter 'q' is required" });
      }

      const results = await searchMemories(uid, q, type);
      return reply.send({ results, count: results.length });
    }
  );

  // GET /memory/list?type={type}&topic={topic} — filtered list
  app.get(
    "/memory/list",
    async (
      request: FastifyRequest<{
        Querystring: { type?: string; topic?: string; limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { type, topic, limit: limitStr } = request.query;
      const limit = parseInt(limitStr || "50", 10);

      const results = await listMemories(uid, type, topic, limit);
      return reply.send({ results, count: results.length });
    }
  );

  // POST /memory/add — manually add a memory
  app.post(
    "/memory/add",
    async (
      request: FastifyRequest<{
        Body: {
          content: string;
          type: MemoryEntry["type"];
          importance: number;
          topics: string[];
          source?: MemoryEntry["source"];
        };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { content, type, importance, topics, source } = request.body;

      if (!content || !type || importance === undefined) {
        return reply
          .status(400)
          .send({ error: "content, type, and importance are required" });
      }

      const id = await addMemory(uid, content, type, importance, topics || [], source);
      return reply.send({ id, status: "stored" });
    }
  );

  // PUT /memory/:id — update a memory
  app.put(
    "/memory/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          type: MemoryEntry["type"];
          importance?: number;
          content?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { type, importance, content } = request.body;

      if (!type) {
        return reply.status(400).send({ error: "type is required to locate memory" });
      }

      await updateMemory(id, type, { importance, content });
      return reply.send({ id, status: "updated" });
    }
  );

  // GET /memory/profile — user profile summary from memories
  app.get(
    "/memory/profile",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const profile = await generateUserProfile(uid);
      return reply.send({ profile });
    }
  );
}
