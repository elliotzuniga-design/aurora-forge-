import Fastify from "fastify";
import cors from "@fastify/cors";
import { initFirebase, registerAuthHook } from "./middleware/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { healthRoutes } from "./routes/health.js";
import { memoryRoutes } from "./routes/memory.js";
import { agentRoutes } from "./routes/agents.js";
import { calendarRoutes } from "./routes/calendar.js";
import { goalRoutes } from "./routes/goals.js";
import { registerPushToken } from "./services/push.js";
import { startScheduler } from "./services/scheduler.js";
import type { FastifyRequest, FastifyReply } from "fastify";

const PORT = parseInt(process.env.PORT || "3001", 10);

async function main(): Promise<void> {
  // Initialize Firebase Admin
  initFirebase();

  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // CORS — allow iPhone app
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Auth middleware — Firebase token verification on all routes except health check
  registerAuthHook(app);

  // ─── Health Check (unauthenticated) ────────────────────────

  app.get("/", async () => ({
    service: "AURORA Backend",
    version: "1.0.0",
    status: "operational",
    timestamp: new Date().toISOString(),
  }));

  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  }));

  // ─── Push Token Registration ───────────────────────────────

  app.post(
    "/push/register",
    async (
      request: FastifyRequest<{ Body: { token: string } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { token } = request.body;

      if (!token) {
        return reply.status(400).send({ error: "Push token is required" });
      }

      await registerPushToken(uid, token);
      return reply.send({ status: "registered" });
    }
  );

  // ─── Route Modules ────────────────────────────────────────

  await app.register(chatRoutes, { prefix: "/chat" });
  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(memoryRoutes, { prefix: "/memory" });
  await app.register(agentRoutes, { prefix: "/agents" });
  await app.register(calendarRoutes);
  await app.register(goalRoutes, { prefix: "/goals" });

  // ─── Start Server ─────────────────────────────────────────

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║   █████╗ ██╗   ██╗██████╗  ██████╗ ██████╗  █████╗  ║
║  ██╔══██╗██║   ██║██╔══██╗██╔═══██╗██╔══██╗██╔══██╗ ║
║  ███████║██║   ██║██████╔╝██║   ██║██████╔╝███████║ ║
║  ██╔══██║██║   ██║██╔══██╗██║   ██║██╔══██╗██╔══██║ ║
║  ██║  ██║╚██████╔╝██║  ██║╚██████╔╝██║  ██║██║  ██║ ║
║  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ║
║                                                  ║
║  Personal AI Backend — v1.0.0                    ║
║  Port: ${PORT}                                       ║
║  Status: OPERATIONAL                             ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    `);

    // Start the scheduler (agents + reminders)
    startScheduler();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
