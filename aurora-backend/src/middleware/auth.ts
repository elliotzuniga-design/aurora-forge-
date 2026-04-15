import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import admin from "firebase-admin";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

let firebaseInitialized = false;

export function initFirebase(): void {
  if (firebaseInitialized) return;

  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "./firebase-service-account.json";
  const resolvedPath = path.resolve(serviceAccountPath);

  if (existsSync(resolvedPath)) {
    const serviceAccount = JSON.parse(readFileSync(resolvedPath, "utf-8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Fall back to application default credentials (e.g. in GCP environments)
    admin.initializeApp();
  }

  firebaseInitialized = true;
}

export function getFirestore(): admin.firestore.Firestore {
  return admin.firestore();
}

export function registerAuthHook(app: FastifyInstance): void {
  app.decorateRequest("uid", "");

  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip auth for health-check endpoints
      if (request.url === "/health" || request.url === "/") {
        return;
      }

      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid authorization header" });
      }

      const token = authHeader.slice(7);

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        (request as FastifyRequest & { uid: string }).uid = decoded.uid;
      } catch (err) {
        request.log.error({ err }, "Firebase token verification failed");
        return reply.status(401).send({ error: "Invalid or expired token" });
      }
    }
  );
}
