import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getHomeState, getSensorHistory } from "../services/mqttBridge.js";

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/home/state",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const state = getHomeState();
      return reply.send(state);
    }
  );

  app.get(
    "/home/sensor/:id/history",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { hours?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { id } = request.params;
      const hours = parseInt(request.query.hours || "24", 10);
      const history = await getSensorHistory(uid, id, hours);
      return reply.send({ deviceId: id, history });
    }
  );

  app.get(
    "/home/sensors",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const state = getHomeState();
      const sensors = Object.entries(state.sensors).map(([id, reading]) => ({
        id,
        name: reading.deviceName,
        type: reading.type,
        lastValue: reading.value,
        unit: reading.unit,
        lastUpdate: reading.timestamp,
        battery: reading.battery,
      }));
      return reply.send({ sensors });
    }
  );

  app.get(
    "/home/security",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const state = getHomeState();
      return reply.send(state.security);
    }
  );
}
