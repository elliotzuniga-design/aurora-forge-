import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  isCalendarConnected,
} from "../services/calendar.js";

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  // GET /calendar/auth — start Google OAuth flow
  app.get(
    "/calendar/auth",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const url = getAuthUrl(uid);
      return reply.send({ authUrl: url });
    }
  );

  // GET /calendar/callback — OAuth callback from Google
  app.get(
    "/calendar/callback",
    async (
      request: FastifyRequest<{
        Querystring: { code: string; state: string; error?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { code, state: uid, error } = request.query;

      if (error) {
        return reply.type("text/html").send(
          `<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh">
            <div style="text-align:center">
              <h1 style="color:#ff6b6b">Connection Failed</h1>
              <p>Google denied access: ${error}</p>
              <p>You can close this window.</p>
            </div>
          </body></html>`
        );
      }

      if (!code || !uid) {
        return reply.status(400).send({ error: "Missing code or state" });
      }

      try {
        await exchangeCodeForTokens(code, uid);

        return reply.type("text/html").send(
          `<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh">
            <div style="text-align:center">
              <h1 style="color:#7c3aed">Connected!</h1>
              <p>Google Calendar & Gmail are now linked to AURORA.</p>
              <p>You can close this window and return to the app.</p>
            </div>
          </body></html>`
        );
      } catch (err) {
        console.error("[Calendar] OAuth callback error:", err);
        return reply.status(500).type("text/html").send(
          `<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh">
            <div style="text-align:center">
              <h1 style="color:#ff6b6b">Error</h1>
              <p>Something went wrong connecting your account.</p>
              <p>Please try again from the app.</p>
            </div>
          </body></html>`
        );
      }
    }
  );

  // GET /calendar/status — check if Google is connected
  app.get(
    "/calendar/status",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const connected = await isCalendarConnected(uid);
      return reply.send({ connected });
    }
  );

  // DELETE /calendar/disconnect — remove Google integration
  app.delete(
    "/calendar/disconnect",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { getFirestore } = await import("../middleware/auth.js");
      const db = getFirestore();

      await db
        .collection("users")
        .doc(uid)
        .collection("integrations")
        .doc("google")
        .delete();

      return reply.send({ status: "disconnected" });
    }
  );
}
