import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getFirestore } from "../middleware/auth.js";
import type { UserProfile } from "../types/index.js";

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // GET /profile — get user profile
  app.get(
    "/profile",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const db = getFirestore();

      const doc = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("current")
        .get();

      if (!doc.exists) {
        return reply.send({
          profile: {
            name: "",
            location: "",
            family: [],
            work: "",
            goals: [],
            currentProjects: [],
          },
        });
      }

      return reply.send({ profile: doc.data() });
    }
  );

  // PUT /profile — update user profile
  app.put(
    "/profile",
    async (
      request: FastifyRequest<{ Body: Partial<UserProfile> }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const updates = request.body;
      const db = getFirestore();

      await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("current")
        .set(
          {
            ...updates,
            updatedAt: new Date(),
          },
          { merge: true }
        );

      const updated = await db
        .collection("users")
        .doc(uid)
        .collection("profile")
        .doc("current")
        .get();

      return reply.send({ profile: updated.data() });
    }
  );

  // POST /profile/contacts — add a contact (for send_message resolution)
  app.post(
    "/profile/contacts",
    async (
      request: FastifyRequest<{
        Body: { name: string; phone: string; email?: string };
      }>,
      reply: FastifyReply
    ) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const { name, phone, email } = request.body;

      if (!name || !phone) {
        return reply.status(400).send({ error: "name and phone are required" });
      }

      const db = getFirestore();
      const docRef = await db
        .collection("users")
        .doc(uid)
        .collection("contacts")
        .add({
          name,
          nameLower: name.toLowerCase(),
          phone,
          email: email || null,
          addedAt: new Date(),
        });

      return reply.status(201).send({ id: docRef.id, name, phone });
    }
  );

  // GET /profile/contacts — list contacts
  app.get(
    "/profile/contacts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const uid = (request as FastifyRequest & { uid: string }).uid;
      const db = getFirestore();

      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection("contacts")
        .orderBy("name", "asc")
        .get();

      const contacts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return reply.send({ contacts });
    }
  );
}
