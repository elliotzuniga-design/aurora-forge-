import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  generateMonthlySummary,
  getInvoices,
  upsertInvoice,
  getSubscriptions,
  generateTaxSummary,
  syncTransactions,
  categorizeTransaction,
  type Transaction,
  type Invoice,
} from "../services/financialAnalysis.js";

export async function financialRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/financial/summary",
    async (
      request: FastifyRequest<{ Querystring: { month: string } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const month = request.query.month || new Date().toISOString().slice(0, 7);
      const summary = await generateMonthlySummary(uid, month);
      return reply.send(summary);
    }
  );

  app.get(
    "/financial/invoices",
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; context?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const invoices = await getInvoices(uid, request.query.status, request.query.context);
      return reply.send({ invoices });
    }
  );

  app.post(
    "/financial/invoice",
    async (
      request: FastifyRequest<{ Body: Invoice }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      await upsertInvoice(uid, request.body);
      return reply.send({ status: "saved", id: request.body.id });
    }
  );

  app.get(
    "/financial/subscriptions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const subscriptions = await getSubscriptions(uid);
      return reply.send({ subscriptions });
    }
  );

  app.get(
    "/financial/tax-summary",
    async (
      request: FastifyRequest<{ Querystring: { year: string } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const year = request.query.year || new Date().getFullYear().toString();
      const summary = await generateTaxSummary(uid, year);
      return reply.send({ summary });
    }
  );

  app.post(
    "/financial/transactions/sync",
    async (
      request: FastifyRequest<{ Body: { transactions: Transaction[] } }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      await syncTransactions(uid, request.body.transactions);
      return reply.send({ status: "synced", count: request.body.transactions.length });
    }
  );

  app.post(
    "/financial/transaction/categorize",
    async (
      request: FastifyRequest<{ Body: Transaction }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const categorized = await categorizeTransaction(uid, request.body);
      return reply.send(categorized);
    }
  );
}
