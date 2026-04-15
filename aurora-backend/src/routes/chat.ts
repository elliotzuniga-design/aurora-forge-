import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { streamChat } from "../services/claude.js";
import { extractMemories } from "../services/memory.js";
import { v4 as uuid } from "uuid";
import type { ChatRequest } from "../types/index.js";

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  // POST /chat/message — SSE streaming chat
  app.post(
    "/chat/message",
    async (
      request: FastifyRequest<{ Body: ChatRequest }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { message, conversationId: providedConvoId } = request.body;

      if (!message?.trim()) {
        return reply.status(400).send({ error: "Message is required" });
      }

      const conversationId = providedConvoId || uuid();

      // Set SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Conversation-Id": conversationId,
      });

      // Send conversation ID as first event
      reply.raw.write(
        `data: ${JSON.stringify({ type: "conversation_id", conversationId })}\n\n`
      );

      let fullResponse = "";

      await streamChat(uid, message, conversationId, {
        onText: (text: string) => {
          reply.raw.write(
            `data: ${JSON.stringify({ type: "text", content: text })}\n\n`
          );
        },

        onToolUse: (toolName: string) => {
          reply.raw.write(
            `data: ${JSON.stringify({ type: "tool_use", tool: toolName })}\n\n`
          );
        },

        onDone: (text: string, toolsUsed) => {
          fullResponse = text;

          reply.raw.write(
            `data: ${JSON.stringify({
              type: "done",
              toolsUsed: toolsUsed.map((t) => t.toolName),
            })}\n\n`
          );
          reply.raw.end();

          // Extract memories in background (don't block response)
          extractMemories(uid, message, fullResponse).catch((err) =>
            console.error("Background memory extraction failed:", err)
          );
        },

        onError: (error: Error) => {
          reply.raw.write(
            `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
          );
          reply.raw.end();
        },
      });
    }
  );

  // GET /chat/conversations — list conversations
  app.get(
    "/chat/conversations",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { getFirestore } = await import("../middleware/auth.js");
      const db = getFirestore();

      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection("conversations")
        .orderBy("lastMessageAt", "desc")
        .limit(50)
        .get();

      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return reply.send({ conversations });
    }
  );

  // GET /chat/conversations/:id/messages — get conversation messages
  app.get(
    "/chat/conversations/:id/messages",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const limit = parseInt(request.query.limit || "50", 10);

      const { getFirestore } = await import("../middleware/auth.js");
      const db = getFirestore();

      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection("conversations")
        .doc(id)
        .collection("messages")
        .orderBy("timestamp", "asc")
        .limit(limit)
        .get();

      const messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return reply.send({ messages, conversationId: id });
    }
  );
}
