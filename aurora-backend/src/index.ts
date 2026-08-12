import Fastify from "fastify";
import cors from "@fastify/cors";
import { initFirebase, registerAuthHook } from "./middleware/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { healthRoutes } from "./routes/health.js";
import { memoryRoutes } from "./routes/memory.js";
import { agentRoutes } from "./routes/agents.js";
import { financialRoutes } from "./routes/financial.js";
import { homeRoutes } from "./routes/home.js";
import { goalRoutes } from "./routes/goals.js";
import { registerPushToken } from "./services/push.js";
import { startMemoryConsolidation } from "./services/memoryConsolidation.js";
import { startAgentScheduler } from "./services/agentRunner.js";
import { startPredictiveEngine } from "./services/predictiveEngine.js";
import { startMqttBridge } from "./services/mqttBridge.js";
import type { FastifyRequest, FastifyReply } from "fastify";

const PORT = parseInt(process.env.PORT || "3001", 10);
const DEFAULT_UID = process.env.DEFAULT_USER_UID || "";

async function main(): Promise<void> {
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

  await app.register(cors, { origin: true, credentials: true });
  registerAuthHook(app);

  // ─── Health Check (unauthenticated) ────────────────────────

  app.get("/", async () => ({
    service: "AURORA Backend",
    version: "2.0.0",
    status: "operational",
    timestamp: new Date().toISOString(),
    phases: [
      "1A: Backend Foundation",
      "1B: iPhone App",
      "2: Memory System",
      "3: Health Layer",
      "4: Autonomous Agents",
      "5: Predictive Brain",
      "6: Financial Intelligence",
      "7: Home Integration",
      "8: Strategic Mind",
    ],
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
  await app.register(financialRoutes, { prefix: "/financial" });
  await app.register(homeRoutes, { prefix: "/home" });
  await app.register(goalRoutes, { prefix: "/goals" });

  // ─── Start Server ─────────────────────────────────────────

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });

    console.log(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║    █████╗ ██╗   ██╗██████╗  ██████╗ ██████╗  █████╗  ║
║   ██╔══██╗██║   ██║██╔══██╗██╔═══██╗██╔══██╗██╔══██╗ ║
║   ███████║██║   ██║██████╔╝██║   ██║██████╔╝███████║ ║
║   ██╔══██║██║   ██║██╔══██╗██║   ██║██╔══██╗██╔══██║ ║
║   ██║  ██║╚██████╔╝██║  ██║╚██████╔╝██║  ██║██║  ██║ ║
║   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ║
║                                                      ║
║   Personal AI Backend — v2.0.0 (All 8 Phases)       ║
║   Port: ${PORT}                                          ║
║   Status: FULLY OPERATIONAL                          ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);

    // ─── Start Background Services ──────────────────────────

    startMemoryConsolidation();
    console.log("[Boot] Memory consolidation scheduler started");

    if (DEFAULT_UID) {
      startAgentScheduler(DEFAULT_UID);
      console.log("[Boot] Agent scheduler started");
    } else {
      console.log("[Boot] Agent scheduler skipped — set DEFAULT_USER_UID in .env");
    }

    startPredictiveEngine();
    console.log("[Boot] Predictive engine started");

    if (process.env.MQTT_BROKER_URL && DEFAULT_UID) {
      startMqttBridge(DEFAULT_UID);
      console.log("[Boot] MQTT bridge started");
    } else {
      console.log("[Boot] MQTT bridge skipped — set MQTT_BROKER_URL in .env");
    }

    console.log("[Boot] All systems operational.\n");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
